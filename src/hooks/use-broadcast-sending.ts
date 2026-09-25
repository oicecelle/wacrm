'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, MessageTemplate } from '@/types';
import { dedupeByPhone, findExistingContactsBatch, normalizeKey } from '@/lib/contacts/dedupe';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface ManualContact {
  phone: string;
  name?: string;
  /** Per-contact variable values, e.g. { servico: 'Avaliação' }. Takes
   *  precedence over the campaign-wide `variables` mapping for
   *  whichever keys it sets — this is how manually-added, pasted, and
   *  imported contacts carry data that isn't stored on the contact
   *  record itself. */
  variables?: Record<string, string>;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'filters' | 'csv';
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: ManualContact[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
  filters?: {
    contact_type?: 'all' | 'lead' | 'client';
    gender?: 'all' | 'male' | 'female' | 'other';
    temperature?: 'all' | 'hot' | 'warm' | 'cold';
    interest?: string;
    source?: string;
    minScore?: number;
  };
}

/**
 * Variable mapping — each template placeholder (by key, usually "1",
 * "2", …) is resolved at send time. `field` maps to a built-in contact
 * field (name/phone/email/company); `custom_field` maps to a
 * contact_custom_values.value row keyed by the custom_fields.id stored
 * in `value`.
 */
export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /** ISO string. Omit to send as soon as the cron worker picks it up. */
  scheduledAt?: string;
  /** Seconds between each message within this broadcast. Default: 5. */
  intervalSeconds?: number;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Per-contact resolution of placeholders — one value per variable
 * *name* (e.g. `{ nome: 'Maria', servico: 'Avaliação' }`), not a
 * positional array. Static and built-in-field mappings resolve
 * synchronously; custom fields read from a pre-built index to avoid
 * N+1 queries.
 *
 * For legacy Meta templates, keys are conventionally "1", "2", … and
 * the cron worker sorts them back into positional order before
 * calling Meta's API — nothing about that flow changes here, this
 * function just stopped throwing the names away.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, v] of Object.entries(variables)) {
    if (v.type === 'static') {
      resolved[key] = v.value;
      continue;
    }

    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      resolved[key] = fieldMap[v.value] ?? '';
      continue;
    }

    // custom_field
    resolved[key] = customValues?.get(v.value) ?? '';
  }

  return resolved;
}

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Supabase PostgREST caps the .in(...) IN-clause roughly at 1000
  // values. Page through to stay safe.
  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(
    audience: AudienceConfig,
  ): Promise<{ contacts: Contact[]; csvVariablesByContactId: Map<string, Record<string, string>> }> {
    const supabase = createClient();

    let contacts: Contact[] = [];
    let csvVariablesByContactId = new Map<string, Record<string, string>>();

    if (audience.type === 'all') {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId);
      if (error) throw new Error(`Falha ao buscar contatos: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id, contacts!inner(account_id)')
        .eq('contacts.account_id', accountId)
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Falha ao buscar tags dos contatos: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .in('id', uniqueContactIds);
        if (error) throw new Error(`Falha ao buscar contatos: ${error.message}`);
        contacts = data ?? [];
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField, accountId);
    } else if (audience.type === 'filters' && audience.filters) {
      const { contact_type, gender, temperature, interest, source, minScore } = audience.filters;
      let query = supabase.from('contacts').select('*').eq('account_id', accountId);
      
      if (contact_type && contact_type !== 'all') {
        query = query.eq('contact_type', contact_type);
      }
      if (gender && gender !== 'all') {
        query = query.eq('gender', gender);
      }

      const filterByDeals = (temperature && temperature !== 'all') || interest || source || (minScore !== undefined && minScore !== null && minScore !== 0);
      if (filterByDeals) {
        let dealsQuery = supabase.from('deals').select('contact_id').eq('account_id', accountId);
        if (temperature && temperature !== 'all') {
          dealsQuery = dealsQuery.eq('temperature', temperature);
        }
        if (interest) {
          dealsQuery = dealsQuery.ilike('interest', `%${interest}%`);
        }
        if (source) {
          dealsQuery = dealsQuery.ilike('source', `%${source}%`);
        }
        if (minScore !== undefined && minScore !== null && minScore !== 0) {
          dealsQuery = dealsQuery.gte('score', minScore);
        }
        const { data: matchedDeals } = await dealsQuery;
        const matchedContactIds = [...new Set((matchedDeals ?? []).map((d) => d.contact_id))];
        if (matchedContactIds.length === 0) {
          return { contacts: [], csvVariablesByContactId: new Map() };
        }
        query = query.in('id', matchedContactIds);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Falha ao buscar contatos filtrados: ${error.message}`);
      contacts = data ?? [];
    } else if (audience.type === 'csv' && audience.csvContacts) {
      const result = await upsertCsvContacts(supabase, audience.csvContacts);
      contacts = result.contacts;
      csvVariablesByContactId = result.variablesByContactId;
    }

    // Apply exclude tags (works across all contact-derived audience
    // types). CSV contacts are synthetic so exclusion doesn't apply.
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    return { contacts, csvVariablesByContactId };
  }

  /**
   * CSV uploads arrive as raw phone/name pairs, not DB rows. Before we
   * can insert broadcast_recipients (whose contact_id FKs contacts.id),
   * we need real contacts.id UUIDs. So: look up each CSV phone in the
   * caller's contacts table; insert any that don't exist; return the
   * resolved set.
   *
   * Pre-existing implementation synthesized `csv-N` strings as
   * contact_id, which failed the UUID cast on insert — every CSV
   * broadcast silently created zero recipients.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: ManualContact[],
  ): Promise<{ contacts: Contact[]; variablesByContactId: Map<string, Record<string, string>> }> {
    if (csvRows.length === 0) return { contacts: [], variablesByContactId: new Map() };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('Sua sessão não está autenticada.');
    }
    if (!accountId) {
      throw new Error('Seu perfil não está vinculado a uma conta.');
    }

    // De-dup within the pasted list, and match against existing
    // contacts, using the exact same helpers the WhatsApp webhook,
    // the manual contact form, and CSV import already use (see
    // lib/contacts/dedupe.ts) — one shared definition of "same
    // number" everywhere in the app, formatting differences and
    // trunk-prefix "0" variants included, instead of a broadcast-only
    // copy that could drift from the others over time.
    const { unique } = dedupeByPhone(csvRows);
    const existingByKey = await findExistingContactsBatch(
      supabase as unknown as SupabaseClient,
      accountId,
      unique.map((r) => r.phone),
    );

    // Insert only missing contacts, in one batch per 200 rows (PostgREST
    // has a default payload cap — 200 keeps individual requests small).
    const missingRows = unique.filter((r) => !existingByKey.has(normalizeKey(r.phone)));
    const missing = missingRows.map((row) => ({
      user_id: user.id,
      account_id: accountId,
      phone: row.phone,
      name: row.name ?? null,
    }));

    const resultByKey = new Map<string, Contact>(existingByKey as unknown as Map<string, Contact>);
    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        // A duplicate can still slip through here in a genuine race
        // (two people pasting overlapping lists at the same moment) —
        // that's a real conflict, not a normalization gap, so it's
        // still surfaced, but distinctly so it's not confused with
        // the (now fixed) systematic cause.
        throw new Error(`Falha ao criar contatos da lista: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        if (c.phone) resultByKey.set(normalizeKey(c.phone), c);
      }
    }

    // Build the per-contact variable overrides HERE, while each row's
    // resolved Contact is still known from the SAME lookup that found
    // it (resultByKey, keyed by the row's OWN normalized phone) —
    // rather than re-matching by phone a second time later. That
    // second match used to compare normalizeKey(theContactsStoredPhone)
    // against normalizeKey(thePastedPhone): fine when they're digit
    // -for-digit identical, but findExistingContactsBatch's own match
    // is deliberately fuzzier than that (phonesMatch tolerates a
    // missing/extra "55" country code or trunk "0") — so a contact
    // found via that fuzzier rule could still fail this second,
    // stricter re-comparison and silently lose its row's variables,
    // landing back on the campaign-wide default (often the contact's
    // own saved name). Keying by contact_id instead removes the
    // chance of the two matching passes disagreeing.
    const variablesByContactId = new Map<string, Record<string, string>>();
    const contacts: Contact[] = [];
    for (const row of unique) {
      const contact = resultByKey.get(normalizeKey(row.phone));
      if (!contact) continue;
      contacts.push(contact);
      if (row.variables && Object.keys(row.variables).length > 0) {
        variablesByContactId.set(contact.id, row.variables);
      }
    }

    return { contacts, variablesByContactId };
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
    accountId: string | null,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id, contacts!inner(account_id)')
      .eq('contacts.account_id', accountId)
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Falha no filtro de campo personalizado: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .in('id', contactIds);
    if (error) throw new Error(`Falha ao buscar contatos: ${error.message}`);
    return data ?? [];
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // ── Step 0: Resolve current user ──────────────────────────────
      // broadcasts.user_id is NOT NULL + guarded by RLS
      // (auth.uid() = user_id). Without this, the INSERT below was
      // silently failing with 23502 / 42501 — the wizard would
      // no-op with no feedback.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('Sua sessão não está autenticada.');
      }
      if (!accountId) {
        throw new Error('Seu perfil não está vinculado a uma conta.');
      }

      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const { contacts, csvVariablesByContactId } = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('Nenhum contato encontrado para essa audiência.');
      }

      // ── Step 2: Resolve per-contact variables + custom fields ──────
      // Done client-side (same logic as before) because `variables`
      // can reference custom fields, which only the browser's already
      // -loaded contact/field context knows how to map. The resolved
      // params travel to the server as plain strings from here on.
      setProgress(15);
      const contactIds = contacts.map((c) => c.id);
      const customValueIndex = await fetchCustomValueIndex(supabase, contactIds);

      // Manually-added / pasted / imported contacts (audience.type
      // === 'csv') can carry their own per-contact variable values —
      // things like "serviço" or "profissional" that live on the
      // campaign list, not on the contact record. Those values win
      // over the campaign-wide mapping for whichever keys they set.
      //
      // csvVariablesByContactId comes straight from resolveAudience,
      // already keyed by contact.id — not re-matched by phone here.
      // An earlier version re-compared phone strings at this point
      // (normalizeKey(c.phone) against the pasted row's own
      // normalizeKey), which looked safe but wasn't: the CONTACT was
      // found via findExistingContactsBatch's deliberately fuzzier
      // phonesMatch (tolerant of a missing/extra "55" country code or
      // trunk "0"), so a contact matched that way could still fail
      // this second, stricter re-comparison — silently losing its
      // row's variables and falling back to the campaign-wide default
      // (often the contact's own saved name, e.g. their WhatsApp push
      // name, not what was typed in the list). Carrying the
      // association forward as contact_id, decided once during that
      // same original match, removes the chance of the two passes
      // disagreeing.
      const apiRecipients = contacts
        .filter((c) => c.phone)
        .map((c) => ({
          contact_id: c.id,
          phone: c.phone as string,
          name: c.name ?? undefined,
          params: {
            ...resolveVariables(payload.variables, c, customValueIndex.get(c.id)),
            ...csvVariablesByContactId.get(c.id),
          },
        }));

      if (apiRecipients.length === 0) {
        throw new Error('Nenhum dos contatos selecionados tem número de telefone.');
      }

      // ── Step 3: Hand everything to the backend in one call ─────────
      // The server writes the `broadcasts` + `broadcast_recipients`
      // rows and returns immediately — actual sending happens on the
      // server via the cron worker (/api/cron/broadcasts), respecting
      // scheduledAt and intervalSeconds. No more client-side send loop,
      // so the browser tab no longer needs to stay open for a campaign
      // to finish.
      setProgress(40);
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          recipients: apiRecipients,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'pt_BR',
          template_variables: payload.variables,
          audience_filter: {
            type: payload.audience.type,
            tagIds: payload.audience.tagIds,
            customField: payload.audience.customField,
            excludeTagIds: payload.audience.excludeTagIds,
          },
          scheduled_at: payload.scheduledAt,
          interval_seconds: payload.intervalSeconds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao agendar o disparo');
      }

      setProgress(100);
      return data.broadcast_id as string;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}
