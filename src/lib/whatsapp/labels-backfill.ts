import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingContactsBatch, normalizeKey } from "@/lib/contacts/dedupe";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { uazapiFindChats } from "./uazapi-api";
import { normalizeWaLabelIds, phoneFromChatId } from "./uazapi-events";

export interface ContactLabelSet {
  contactId: string;
  labelIds: string[];
}

/**
 * Makes each contact's stored labels equal the given set, for MANY
 * contacts at once: existing pairs are read in a few batched queries,
 * the diff is computed in memory, and the changes are written in bulk.
 * (Per-contact select+write was ~3 queries × 200 chats per page — too
 * slow for a request that has to finish within the function limit.)
 */
export async function applyLabelSetsBatch(
  db: SupabaseClient,
  accountId: string,
  sets: ContactLabelSet[],
): Promise<{ added: number; removed: number; contactsChanged: number }> {
  if (sets.length === 0) return { added: 0, removed: 0, contactsChanged: 0 };

  const wanted = new Map<string, Set<string>>();
  for (const s of sets) wanted.set(s.contactId, new Set(s.labelIds));
  const contactIds = [...wanted.keys()];

  const existing = new Map<string, Set<string>>();
  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100);
    const rows = await fetchAllRows<{ contact_id: string; wa_label_id: string }>((from, to) =>
      db
        .from("contact_whatsapp_labels")
        .select("contact_id, wa_label_id")
        .in("contact_id", chunk)
        .order("contact_id")
        .order("wa_label_id")
        .range(from, to) as never,
    );
    for (const r of rows) {
      if (!existing.has(r.contact_id)) existing.set(r.contact_id, new Set());
      existing.get(r.contact_id)!.add(r.wa_label_id);
    }
  }

  const toAdd: Array<{ contact_id: string; account_id: string; wa_label_id: string }> = [];
  const toRemove = new Map<string, string[]>();
  for (const [contactId, want] of wanted) {
    const have = existing.get(contactId) ?? new Set<string>();
    for (const id of want) if (!have.has(id)) toAdd.push({ contact_id: contactId, account_id: accountId, wa_label_id: id });
    const gone = [...have].filter((id) => !want.has(id));
    if (gone.length > 0) toRemove.set(contactId, gone);
  }

  for (let i = 0; i < toAdd.length; i += 500) {
    await db
      .from("contact_whatsapp_labels")
      .upsert(toAdd.slice(i, i + 500), { onConflict: "contact_id,wa_label_id", ignoreDuplicates: true });
  }
  for (const [contactId, ids] of toRemove) {
    await db.from("contact_whatsapp_labels").delete().eq("contact_id", contactId).in("wa_label_id", ids);
  }

  const changed = new Set<string>([...toAdd.map((r) => r.contact_id), ...toRemove.keys()]);
  return {
    added: toAdd.length,
    removed: [...toRemove.values()].reduce((n, ids) => n + ids.length, 0),
    contactsChanged: changed.size,
  };
}

export interface BackfillPageResult {
  scanned: number;
  withLabels: number;
  matchedContacts: number;
  /** Matched CRM contacts that actually carry at least one label. */
  matchedWithLabels: number;
  contactsChanged: number;
  hasMore: boolean;
  nextOffset: number | null;
  total: number | null;
}

/**
 * Loads label assignments for one page of the instance's chats.
 *
 * Why this exists: the `history` label batch only carries label
 * DEFINITIONS (confirmed on a real batch), and `chat_labels` events only
 * fire when a label CHANGES — so anyone who already had a label before
 * we started listening would never appear. `POST /chat/find` returns
 * every chat with its `wa_label` list, which fills that gap.
 *
 * Safety rules:
 *  - a chat whose `wa_label` field is ABSENT is skipped — only an
 *    explicit (possibly empty) list is treated as the truth, otherwise a
 *    server that omits the field would wipe every stored label;
 *  - contacts are matched, never created (a labelled chat that isn't in
 *    the CRM is not a reason to add it);
 *  - groups and LID-only chats are skipped (no phone to match).
 */
export async function backfillLabelsPage(
  db: SupabaseClient,
  accountId: string,
  baseUrl: string,
  token: string,
  offset: number,
  limit = 200,
): Promise<BackfillPageResult> {
  const page = await uazapiFindChats(baseUrl, token, { offset, limit });

  const items: Array<{ phone: string; labelIds: string[] }> = [];
  for (const chat of page.chats) {
    if (!Array.isArray(chat.wa_label)) continue; // absent ≠ "no labels"
    const phone = phoneFromChatId(chat.wa_chatid ?? "") ?? (chat.phone ? chat.phone.replace(/\D/g, "") : null);
    if (!phone) continue;
    items.push({ phone, labelIds: normalizeWaLabelIds(chat.wa_label) });
  }

  const found = items.length > 0 ? await findExistingContactsBatch(db, accountId, items.map((i) => i.phone)) : new Map();
  const sets: ContactLabelSet[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const contact = found.get(normalizeKey(item.phone));
    if (!contact || seen.has(contact.id)) continue;
    seen.add(contact.id);
    sets.push({ contactId: contact.id, labelIds: item.labelIds });
  }

  const applied = await applyLabelSetsBatch(db, accountId, sets);
  return {
    scanned: page.chats.length,
    withLabels: items.filter((i) => i.labelIds.length > 0).length,
    matchedContacts: sets.length,
    matchedWithLabels: sets.filter((x) => x.labelIds.length > 0).length,
    contactsChanged: applied.contactsChanged,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    total: page.total,
  };
}
