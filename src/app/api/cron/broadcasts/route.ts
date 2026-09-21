import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { getEnv } from '@/lib/env'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import { sendOneBroadcastRecipient } from '@/lib/whatsapp/broadcast-sender'
import { GET as automationsCronGET } from '@/app/api/automations/cron/route'
import { GET as flowsCronGET } from '@/app/api/flows/cron/route'
import { GET as followupsCronGET } from '@/app/api/cron/followups/route'
import { GET as notificationsCronGET } from '@/app/api/cron/notifications/route'
import { GET as appointmentRemindersCronGET } from '@/app/api/cron/appointment-reminders/route'

// GET /api/cron/broadcasts
// Protected by x-cron-secret header. Call this on a schedule (e.g. every
// 1 minute via cron-job.org, matching the pattern used by the other
// cron routes in this codebase) — it activates due "scheduled"
// broadcasts and advances every "sending" broadcast by however many
// recipients are due given each broadcast's own interval_seconds.
//
// Pacing model: each broadcast tracks `last_sent_at`. On every tick we
// compute how many interval windows have elapsed since the last send
// and release that many recipients (capped, see MAX_RECIPIENTS_PER_TICK).
// Within a tick we also sleep between individual sends when the
// interval is short enough to fit in the remaining time budget, so a
// 1-minute cron tick with a 5s interval still sends ~12 messages
// visibly spaced out rather than as one instant burst.
//
// Time budget: Vercel functions have a max execution time depending on
// plan (`maxDuration` below asks for up to 60s). We stop picking up new
// work with ~10s of headroom so the function has time to finish the
// in-flight request and return cleanly instead of being killed mid-send.
export const maxDuration = 60

const TIME_BUDGET_MS = 50_000
const MAX_RECIPIENTS_PER_TICK = 200
const MAX_BROADCASTS_PER_TICK = 20

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  const expected =
    getEnv('BROADCAST_CRON_SECRET', '') || getEnv('AUTOMATION_CRON_SECRET', '')

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const startedAt = Date.now()
  const nowIso = new Date().toISOString()
  const summary = { activated: 0, sent: 0, failed: 0, completed: 0 }

  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt)

  // ── 1. Activate any scheduled broadcasts whose time has come ──────
  const { data: due } = await admin
    .from('broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(50)

  if (due && due.length > 0) {
    await admin
      .from('broadcasts')
      .update({ status: 'sending' })
      .in(
        'id',
        due.map((b) => b.id),
      )
    summary.activated = due.length
  }

  // ── 2. Advance every broadcast currently in flight ─────────────────
  const { data: active } = await admin
    .from('broadcasts')
    .select(
      'id, account_id, template_name, template_language, interval_seconds, last_sent_at, scheduled_at',
    )
    .eq('status', 'sending')
    .limit(MAX_BROADCASTS_PER_TICK)

  for (const broadcast of active ?? []) {
    if (timeLeft() <= 0) break

    const { data: config } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', broadcast.account_id)
      .maybeSingle()

    if (!config) {
      await admin
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', broadcast.id)
      continue
    }

    const intervalMs = Math.max(1, broadcast.interval_seconds ?? 5) * 1000
    const anchorMs = broadcast.last_sent_at
      ? new Date(broadcast.last_sent_at).getTime()
      : new Date(broadcast.scheduled_at ?? nowIso).getTime() - intervalMs
    const elapsedMs = Date.now() - anchorMs
    // When the configured interval is longer than we can safely sleep
    // for within one invocation (see timeLeft() below), there's no
    // way to space multiple sends apart inside a single tick — so cap
    // at 1 per tick regardless of how large a backlog `elapsedMs`
    // implies. The alternative (computed here before this fix) was
    // releasing the whole backlog at once with no pause between them,
    // since the per-message sleep got silently skipped whenever it
    // didn't fit the time budget — defeating the whole point of a
    // configured interval. Spacing between ticks (driven by the cron
    // schedule itself) takes over instead; slower than requested is
    // safe, faster than requested is not.
    const canPaceWithinTick = intervalMs < TIME_BUDGET_MS
    const dueCount = canPaceWithinTick
      ? Math.min(Math.max(1, Math.floor(elapsedMs / intervalMs)), MAX_RECIPIENTS_PER_TICK)
      : elapsedMs >= intervalMs
        ? 1
        : 0

    if (dueCount === 0) continue

    const { data: pending } = await admin
      .from('broadcast_recipients')
      .select('id, params, contact:contacts(id, phone)')
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(dueCount)

    if (!pending || pending.length === 0) {
      // No pending recipients left — this broadcast is done. Decide
      // final status from how many ended up failed vs. sent.
      const { count: failedCount } = await admin
        .from('broadcast_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', broadcast.id)
        .eq('status', 'failed')
      const { count: totalCount } = await admin
        .from('broadcast_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', broadcast.id)

      const finalStatus =
        totalCount && failedCount === totalCount ? 'failed' : 'sent'
      await admin
        .from('broadcasts')
        .update({ status: finalStatus })
        .eq('id', broadcast.id)
      summary.completed++
      continue
    }

    const { data: rawTemplateRow } = await admin
      .from('message_templates')
      .select('*')
      .eq('account_id', broadcast.account_id)
      .eq('name', broadcast.template_name)
      .eq('language', broadcast.template_language || 'pt_BR')
      .maybeSingle()
    const templateRow =
      rawTemplateRow && isMessageTemplate(rawTemplateRow) ? rawTemplateRow : null

    for (let i = 0; i < pending.length; i++) {
      if (timeLeft() <= 0) break
      const recipient = pending[i] as unknown as {
        id: string
        params: Record<string, string>
        contact: { id: string; phone: string | null } | null
      }

      const result = await sendOneBroadcastRecipient(
        admin,
        broadcast,
        {
          id: recipient.id,
          params: recipient.params,
          phone: recipient.contact?.phone ?? null,
        },
        config,
        templateRow,
      )
      if (result.success) summary.sent++
      else summary.failed++

      const isLastInBatch = i === pending.length - 1
      if (!isLastInBatch && intervalMs < timeLeft()) {
        await sleep(intervalMs)
      }
    }
  }

  // ─── Fold in every other cron job ──────────────────────────────
  // This is the ONLY cron entry actually registered in cron-job.org
  // (runs every minute) — rather than asking for five more entries
  // to be registered separately, each other cron's own route handler
  // is called directly, in-process, right here. No network hop, no
  // change needed to any of those files; each keeps its own auth
  // check, just satisfied with a locally-built Request carrying the
  // right secret. Wrapped individually so one slow/failing job never
  // blocks the others or this route's own broadcast work above.
  const automationSecret = getEnv('AUTOMATION_CRON_SECRET', '')
  const legacyCronSecret = getEnv('CRON_SECRET', 'leadpluz_cron_secret_key_123')
  const otherCrons: { name: string; run: () => Promise<Response> }[] = [
    {
      name: 'automations',
      run: () =>
        automationsCronGET(
          new Request(request.url, { headers: { 'x-cron-secret': automationSecret } }),
        ),
    },
    {
      name: 'flows',
      run: () =>
        flowsCronGET(new Request(request.url, { headers: { 'x-cron-secret': automationSecret } })),
    },
    {
      name: 'followups',
      run: () =>
        followupsCronGET(
          new Request(request.url, { headers: { 'x-cron-secret': automationSecret } }),
        ),
    },
    {
      name: 'notifications',
      run: () =>
        notificationsCronGET(
          new Request(request.url, { headers: { 'x-cron-secret': automationSecret } }),
        ),
    },
    {
      name: 'appointment_reminders',
      run: () =>
        appointmentRemindersCronGET(
          new Request(request.url, { headers: { 'x-cron-secret': legacyCronSecret } }),
        ),
    },
  ]

  const otherResults: Record<string, unknown> = {}
  for (const job of otherCrons) {
    if (timeLeft() <= 0) {
      otherResults[job.name] = { skipped: 'out of time budget' }
      continue
    }
    try {
      const res = await job.run()
      otherResults[job.name] = await res.json().catch(() => ({ ok: res.ok }))
    } catch (err) {
      console.error(`[cron/broadcasts] sub-cron "${job.name}" failed:`, err)
      otherResults[job.name] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({ success: true, ...summary, other_crons: otherResults })
}
