import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'

/**
 * Creates a scheduled broadcast. This route used to send every
 * message synchronously, inline in the request/response cycle —
 * meaning the browser tab had to stay open for the whole campaign
 * and there was no way to space messages out or pick a future send
 * time. It now only *schedules* the work:
 *
 *   1. Validates recipients and writes one `broadcasts` row.
 *   2. Bulk-inserts one `broadcast_recipients` row per recipient,
 *      each carrying its own resolved template variables in `params`.
 *   3. Returns immediately.
 *
 * The actual sending — via Meta or Uazapi, whichever the account has
 * configured, respecting `interval_seconds` between messages — is
 * done by the cron worker at /api/cron/broadcasts.
 */

interface IncomingRecipient {
  contact_id?: string | null
  phone: string
  name?: string | null
  /** Variable name -> resolved value, e.g. { nome: 'Maria', servico: 'Avaliação' }. */
  params?: Record<string, string>
}

const INSERT_BATCH_SIZE = 500

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Seu perfil não está vinculado a uma conta.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      name,
      recipients,
      template_name,
      template_language,
      scheduled_at,
      interval_seconds,
      audience_filter,
      template_variables,
    } = body as {
      name?: string
      recipients?: IncomingRecipient[]
      template_name?: string
      template_language?: string
      scheduled_at?: string
      interval_seconds?: number
      audience_filter?: unknown
      template_variables?: unknown
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'O modelo é obrigatório.' },
        { status: 400 },
      )
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'A lista de destinatários não pode estar vazia.' },
        { status: 400 },
      )
    }

    // Every account (= clinic/instance) has exactly one whatsapp_config
    // row, holding either Meta or Uazapi credentials. Fail fast here
    // rather than letting the cron worker discover it's missing later.
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, provider_type')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp não configurado. Conecte uma instância em Configurações primeiro.',
        },
        { status: 400 },
      )
    }

    // Validate + sanitize phones up front so a typo doesn't silently
    // eat one recipient at send time with no way to see why.
    const validRecipients: { phone: string; contactId?: string | null; params: Record<string, string> }[] = []
    const invalidRecipients: { phone: string; reason: string }[] = []

    for (const r of recipients) {
      const sanitized = sanitizePhoneForMeta(r.phone ?? '')
      if (!r.phone || !isValidE164(sanitized)) {
        invalidRecipients.push({
          phone: r.phone ?? '(empty)',
          reason: 'Invalid phone number format',
        })
        continue
      }
      validRecipients.push({
        phone: sanitized,
        // The caller (use-broadcast-sending.ts) already resolved this
        // recipient to a real contact — same lookup this route used
        // to redo below with a plain `.in('phone', phones)` raw
        // string match, which is why it kept failing: the ALREADY
        // -matched contact's own stored phone can be formatted
        // differently from this request's sanitized E.164 string
        // (missing "55", a stray trunk "0", etc — the account's
        // contact list has both old and new formats depending on how
        // each one was created), so the raw comparison found nothing,
        // treated an existing contact as brand new, and the insert
        // collided with the database's own duplicate-phone check.
        // Trusting the id the client already resolved skips that
        // redo entirely for every recipient that has one.
        contactId: r.contact_id ?? null,
        params: r.params && typeof r.params === 'object' ? r.params : {},
      })
    }

    if (validRecipients.length === 0) {
      return NextResponse.json(
        {
          error: 'Nenhum destinatário válido após a validação.',
          invalid: invalidRecipients,
        },
        { status: 400 },
      )
    }

    const intervalSeconds =
      typeof interval_seconds === 'number' && interval_seconds >= 1
        ? Math.floor(interval_seconds)
        : 5

    const scheduledAt = scheduled_at ? new Date(scheduled_at) : new Date()
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: 'Data/horário de agendamento inválidos.' },
        { status: 400 },
      )
    }

    // Contacts need a resolvable id for broadcast_recipients FK.
    // Recipients that already carry a contactId (the normal case —
    // use-broadcast-sending.ts resolves every recipient to a real
    // contact before calling this route) use it directly, no lookup
    // needed. Only recipients without one (any other caller of this
    // API) get matched by phone here — via the same fuzzy, shared
    // matcher the rest of the app uses (lib/contacts/dedupe.ts),
    // not a raw string comparison that a differently-formatted
    // stored phone would silently miss.
    const contactIdByPhone = new Map<string, string>()
    const needsPhoneLookup = validRecipients.filter((r) => !r.contactId)

    if (needsPhoneLookup.length > 0) {
      const { findExistingContactsBatch, normalizeKey } = await import('@/lib/contacts/dedupe')
      const existingByKey = await findExistingContactsBatch(
        supabase,
        accountId,
        needsPhoneLookup.map((r) => r.phone),
      )
      for (const r of needsPhoneLookup) {
        const match = existingByKey.get(normalizeKey(r.phone))
        if (match) contactIdByPhone.set(r.phone, match.id)
      }

      const stillMissing = needsPhoneLookup.filter((r) => !contactIdByPhone.has(r.phone))
      if (stillMissing.length > 0) {
        const inputByPhone = new Map(recipients.map((r) => [sanitizePhoneForMeta(r.phone ?? ''), r]))
        const newContactRows = stillMissing.map((r) => ({
          account_id: accountId,
          user_id: user.id,
          phone: r.phone,
          name: inputByPhone.get(r.phone)?.name || r.phone,
        }))
        const { data: createdContacts, error: createContactsError } = await supabase
          .from('contacts')
          .insert(newContactRows)
          .select('id, phone')

        if (createContactsError) {
          return NextResponse.json(
            { error: `Falha ao criar contatos para os novos destinatários: ${createContactsError.message}` },
            { status: 500 },
          )
        }
        for (const c of createdContacts ?? []) {
          if (c.phone) contactIdByPhone.set(c.phone, c.id)
        }
      }
    }

    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: name?.trim() || `Disparo ${new Date().toLocaleDateString('pt-BR')}`,
        template_name,
        template_language: template_language || 'pt_BR',
        template_variables: template_variables ?? null,
        audience_filter: audience_filter ?? null,
        status: 'scheduled',
        scheduled_at: scheduledAt.toISOString(),
        interval_seconds: intervalSeconds,
        total_recipients: validRecipients.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (broadcastError || !broadcast) {
      return NextResponse.json(
        { error: `Falha ao criar o disparo: ${broadcastError?.message ?? 'erro desconhecido'}` },
        { status: 500 },
      )
    }

    const recipientRows = validRecipients.map((r) => ({
      broadcast_id: broadcast.id,
      contact_id: r.contactId ?? contactIdByPhone.get(r.phone),
      status: 'pending' as const,
      params: r.params,
    }))

    for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
      const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE)
      const { error: recipientError } = await supabase
        .from('broadcast_recipients')
        .insert(batch)
      if (recipientError) {
        await supabase
          .from('broadcasts')
          .update({ status: 'failed', failed_count: validRecipients.length })
          .eq('id', broadcast.id)
        return NextResponse.json(
          { error: `Falha ao adicionar os destinatários: ${recipientError.message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      broadcast_id: broadcast.id,
      total_recipients: validRecipients.length,
      invalid_recipients: invalidRecipients,
      scheduled_at: scheduledAt.toISOString(),
      interval_seconds: intervalSeconds,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json(
      { error: 'Falha ao agendar o disparo.' },
      { status: 500 },
    )
  }
}
