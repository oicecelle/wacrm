import type {
  Automation,
  AutomationLogStepResult,
  AutomationStep,
  AutomationTriggerType,
  ConditionStepConfig,
  KeywordMatchTriggerConfig,
  SendMessageStepConfig,
  SendTemplateStepConfig,
  SendMediaStepConfig,
  SendWebhookStepConfig,
  TagStepConfig,
  UpdateContactFieldStepConfig,
  UpdateDealFieldStepConfig,
  WaitStepConfig,
  CreateDealStepConfig,
  CreateAppointmentStepConfig,
  UpdateAppointmentStatusStepConfig,
  RegisterPaymentStepConfig,
  AssignConversationStepConfig,
} from '@/types'
import { supabaseAdmin } from './admin-client'
import { engineSendText, engineSendTemplate, engineSendMedia } from './meta-send'
import { extractFromTemplate, combineDateAndTime } from './template-extract'

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface AutomationContext {
  /** Raw message text, for keyword_match + message_content conditions. */
  message_text?: string
  /** Which side sent the triggering message — 'lead' (the contact) or
   *  'us' (the clinic's own outbound message). Needed for keyword_match
   *  triggers configured with a `from` filter, and for the message
   *  {{placeholders}} extraction used by create_appointment /
   *  update_appointment_status / register_payment steps. */
  message_direction?: 'lead' | 'us'
  /** Conversation the event belongs to, if any. */
  conversation_id?: string
  /** Arbitrary variables accumulated during execution. */
  vars?: Record<string, unknown>
  /** The tag id that was added, for tag_added trigger. */
  tag_id?: string
  /** Agent the conversation was assigned to, for conversation_assigned. */
  agent_id?: string
}

export interface DispatchInput {
  /** Account-level tenancy key. Drives the lookup of which active
   *  automations to fire — `automations.account_id` is the tenant
   *  isolation after migration 017. Replaces the previous `userId`
   *  field; the per-automation user_id is read off each row when
   *  needed (sender identity for outbound messages, log audit). */
  accountId: string
  triggerType: AutomationTriggerType
  contactId?: string | null
  context?: AutomationContext
}

/**
 * Fire all active automations matching the given trigger for an
 * account.
 *
 * Must never throw — callers use fire-and-forget from the webhook.
 * All errors are caught and logged; per-automation failures are
 * recorded into automation_logs with status='failed'.
 */
export async function runAutomationsForTrigger(input: DispatchInput): Promise<void> {
  try {
    const db = supabaseAdmin()

    // Tenant isolation. `contactId` can be caller-supplied (the manual
    // POST /api/automations/engine entrypoint reads it straight from the
    // request body), and every step below runs through the service-role
    // client, which bypasses RLS. So before any step can touch the
    // contact, verify it actually belongs to this account. A foreign or
    // forged id is refused silently — callers are fire-and-forget, and a
    // distinct error would leak whether a given contact UUID exists.
    if (input.contactId) {
      const { data: owned, error: ownErr } = await db
        .from('contacts')
        .select('id')
        .eq('id', input.contactId)
        .eq('account_id', input.accountId)
        .maybeSingle()
      if (ownErr) {
        console.error('[automations] contact ownership check failed:', ownErr)
        return
      }
      if (!owned) {
        console.warn('[automations] contact not in account, refusing dispatch', input.contactId)
        return
      }
    }

    const { data: automations, error } = await db
      .from('automations')
      .select('*')
      .eq('account_id', input.accountId)
      .eq('trigger_type', input.triggerType)
      .eq('is_active', true)

    if (error) {
      console.error('[automations] fetch failed:', error)
      return
    }
    if (!automations || automations.length === 0) return

    for (const automation of automations as Automation[]) {
      if (!triggerMatches(automation, input.context)) continue
      try {
        await executeAutomation(automation, input)
      } catch (err) {
        console.error('[automations] execute failed:', automation.id, err)
      }
    }
  } catch (err) {
    console.error('[automations] dispatch failed:', err)
  }
}

/**
 * Resume a run that was parked at a wait step. Called from the cron
 * endpoint after it grabs a due `automation_pending_executions` row.
 */
export async function resumePendingExecution(pending: {
  id: string
  automation_id: string
  /** Audit-only; the automation row carries account_id for tenancy. */
  user_id: string
  /** Account-scoped lookups read from the automation row, so this
   *  field is just here to mirror the row shape and keep the cron's
   *  pass-through self-documenting. */
  account_id: string
  contact_id: string | null
  log_id: string | null
  parent_step_id: string | null
  branch: 'yes' | 'no' | null
  next_step_position: number
  context: AutomationContext
}): Promise<void> {
  const db = supabaseAdmin()
  const { data: automation, error } = await db
    .from('automations')
    .select('*')
    .eq('id', pending.automation_id)
    .single()

  if (error || !automation) {
    console.error('[automations] resume: missing automation', pending.automation_id, error)
    await markPending(pending.id, 'failed')
    return
  }

  try {
    await executeStepsFrom({
      automation: automation as Automation,
      contactId: pending.contact_id,
      context: pending.context ?? {},
      parentStepId: pending.parent_step_id,
      branch: pending.branch,
      startPosition: pending.next_step_position,
      logId: pending.log_id,
      triggerEvent: 'resumed_wait',
    })
    await markPending(pending.id, 'done')
  } catch (err) {
    console.error('[automations] resume failed:', err)
    await markPending(pending.id, 'failed')
  }
}

// ------------------------------------------------------------
// Internal execution
// ------------------------------------------------------------

async function executeAutomation(automation: Automation, input: DispatchInput) {
  const db = supabaseAdmin()

  const { data: log, error: logErr } = await db
    .from('automation_logs')
    .insert({
      automation_id: automation.id,
      // Tenancy: matches automation.account_id (NOT NULL post-017).
      account_id: automation.account_id,
      // Audit: keeps the historical "author of this automation"
      // pointer so logs still attribute to the right user even
      // after teammates join the account.
      user_id: automation.user_id,
      contact_id: input.contactId ?? null,
      trigger_event: input.triggerType,
      steps_executed: [],
      status: 'success',
    })
    .select()
    .single()

  if (logErr || !log) {
    console.error('[automations] cannot create log:', logErr)
    return
  }

  await executeStepsFrom({
    automation,
    contactId: input.contactId ?? null,
    // Anchors `no_reply_since` — evaluated by any later condition
    // step as "has a customer message arrived after this moment".
    // Carried through `context` across wait/resume, so it stays
    // fixed at the run's actual start rather than resetting on each
    // resume.
    context: {
      ...(input.context ?? {}),
      vars: { ...input.context?.vars, automation_started_at: new Date().toISOString() },
    },
    parentStepId: null,
    branch: null,
    startPosition: 0,
    logId: log.id,
    triggerEvent: input.triggerType,
  })

  // Atomic counter update via the SQL function from migration 007.
  // Doing this with a client-side read-modify-write raced when the
  // same automation fired for two contacts simultaneously — both
  // would read N and both write N+1, losing one count permanently.
  const { error: rpcErr } = await db.rpc('increment_automation_execution_count', {
    p_automation_id: automation.id,
  })
  if (rpcErr) {
    console.error('[automations] increment counter failed:', rpcErr)
  }
}

interface ExecuteArgs {
  automation: Automation
  contactId: string | null
  context: AutomationContext
  parentStepId: string | null
  branch: 'yes' | 'no' | null
  startPosition: number
  logId: string | null
  triggerEvent: string
}

async function executeStepsFrom(args: ExecuteArgs): Promise<void> {
  const db = supabaseAdmin()

  const baseQuery = db
    .from('automation_steps')
    .select('*')
    .eq('automation_id', args.automation.id)
    .gte('position', args.startPosition)
    .order('position', { ascending: true })

  const scoped =
    args.parentStepId === null
      ? baseQuery.is('parent_step_id', null)
      : baseQuery.eq('parent_step_id', args.parentStepId).eq('branch', args.branch ?? 'yes')

  const { data: steps, error: stepsErr } = await scoped

  if (stepsErr) {
    await finalizeLog(args.logId, 'failed', stepsErr.message)
    return
  }
  if (!steps || steps.length === 0) {
    if (args.parentStepId === null && args.logId) {
      await finalizeLog(args.logId, 'success', null)
    }
    return
  }

  const results: AutomationLogStepResult[] = []
  let status: 'success' | 'partial' | 'failed' = 'success'
  let errorMessage: string | null = null

  for (const step of steps as AutomationStep[]) {
    // `wait` is the suspension point: enqueue and stop processing this
    // scope. The cron endpoint will pick it up later.
    if (step.step_type === 'wait') {
      const cfg = step.step_config as WaitStepConfig
      const ms = waitMs(cfg)
      await db.from('automation_pending_executions').insert({
        automation_id: args.automation.id,
        // Tenancy: account_id required NOT NULL post-017.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        contact_id: args.contactId,
        log_id: args.logId,
        parent_step_id: args.parentStepId,
        branch: args.branch,
        next_step_position: step.position + 1,
        context: args.context,
        run_at: new Date(Date.now() + ms).toISOString(),
        status: 'pending',
      })
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail:
          cfg.mode === 'until_window' && cfg.window
            ? `waiting until window ${cfg.window}`
            : `waiting ${cfg.amount} ${cfg.unit}`,
      })
      status = 'partial'
      await appendResults(args.logId, results, status, errorMessage)
      return
    }

    try {
      if (step.step_type === 'condition') {
        const cfg = step.step_config as ConditionStepConfig
        const taken = await evaluateCondition(cfg, args)
        results.push({
          step_id: step.id,
          step_type: 'condition',
          status: 'success',
          detail: `branch=${taken ? 'yes' : 'no'}`,
        })
        // Recurse into the chosen branch at position 0 (children use their
        // own ordering within the branch scope).
        await executeStepsFrom({
          ...args,
          parentStepId: step.id,
          branch: taken ? 'yes' : 'no',
          startPosition: 0,
          logId: args.logId,
        })
        continue
      }

      const detail = await runStep(step, args)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'failed',
        detail: msg,
      })
      status = 'failed'
      errorMessage = msg
      break
    }
  }

  if (args.parentStepId === null) {
    await appendResults(args.logId, results, status, errorMessage)
  } else {
    // Nested branch — just append results; parent scope decides final status.
    await appendResults(args.logId, results, null, errorMessage)
  }
}

async function runStep(step: AutomationStep, args: ExecuteArgs): Promise<string> {
  const db = supabaseAdmin()

  switch (step.step_type) {
    case 'send_message': {
      const cfg = step.step_config as SendMessageStepConfig
      if (!args.contactId) throw new Error('send_message needs a contact')
      const text = interpolate(cfg.text, args)
      if (!text.trim()) throw new Error('send_message has empty text')
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendText({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        text,
      })
      return `sent (${whatsapp_message_id})`
    }

    case 'send_template': {
      const cfg = step.step_config as SendTemplateStepConfig
      if (!args.contactId) throw new Error('send_template needs a contact')
      if (!cfg.template_name) throw new Error('send_template needs template_name')
      const conversationId = await resolveConversationId(args)
      // Named Record<string,string> travels through as-is now —
      // meta-send.ts decides whether to keep it named (Uazapi) or
      // convert to Meta's positional {{1}}/{{2}} order, since that
      // decision depends on the account's configured provider, not
      // anything the engine knows about here.
      const { whatsapp_message_id } = await engineSendTemplate({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        templateName: cfg.template_name,
        language: cfg.language,
        variables: cfg.variables ?? {},
      })
      return `template sent (${whatsapp_message_id})`
    }

    case 'send_media': {
      const cfg = step.step_config as SendMediaStepConfig
      if (!args.contactId) throw new Error('send_media needs a contact')
      if (!cfg.media_url) throw new Error('send_media needs media_url')
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendMedia({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        mediaType: cfg.media_type ?? 'image',
        mediaUrl: cfg.media_url,
        filename: cfg.filename,
        caption: cfg.caption,
      })
      return `media sent (${whatsapp_message_id})`
    }

    case 'add_tag': {
      // contact_tags has no account_id column; cross-tenant protection for
      // the attacker-supplied contactId comes from the ownership guard in
      // runAutomationsForTrigger.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('add_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .upsert(
          { contact_id: args.contactId, tag_id: cfg.tag_id },
          { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
        )
      return `tag ${cfg.tag_id} added`
    }

    case 'remove_tag': {
      // See add_tag: tenant scoping relies on the runAutomationsForTrigger
      // ownership guard, since contact_tags carries no account_id.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('remove_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .delete()
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.tag_id)
      return `tag ${cfg.tag_id} removed`
    }

    case 'assign_conversation': {
      const cfg = step.step_config as AssignConversationStepConfig
      if (!args.contactId) throw new Error('assign_conversation needs a contact')
      let agentId = cfg.agent_id
      if (cfg.mode === 'round_robin') {
        // Pick any member of the account. The existing implementation
        // only ever returned the automation's author; preserving that
        // shape until a real round-robin algorithm replaces it.
        const { data: profiles } = await db
          .from('profiles')
          .select('user_id')
          .eq('account_id', args.automation.account_id)
          .limit(1)
        agentId = profiles?.[0]?.user_id
      }
      if (!agentId) return 'no agent resolved'
      await db
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('account_id', args.automation.account_id)
        .eq('contact_id', args.contactId)
      return `assigned to ${agentId}`
    }

    case 'update_contact_field': {
      const cfg = step.step_config as UpdateContactFieldStepConfig
      if (!args.contactId) throw new Error('update_contact_field needs a contact')
      // Resolve workflow variables ({{ vars.* }}, {{ message.text }}) so custom
      // values can be populated dynamically from the triggering context.
      const value = interpolate(cfg.value, args)

      // Custom fields are encoded as `custom:<custom_field_id>`; anything else
      // is a built-in contact column.
      if (cfg.field.startsWith('custom:')) {
        const customFieldId = cfg.field.slice('custom:'.length)
        if (!customFieldId) {
          return `field ${cfg.field} not writable from automations`
        }
        // Defense in depth: the service-role client bypasses RLS, so confirm
        // the field definition belongs to this account before writing.
        const { data: field } = await db
          .from('custom_fields')
          .select('id')
          .eq('id', customFieldId)
          .eq('account_id', args.automation.account_id)
          .maybeSingle()
        if (!field) {
          return `field ${cfg.field} not writable from automations`
        }
        // Upsert on the table's UNIQUE(contact_id, custom_field_id) so repeated
        // runs overwrite rather than duplicate. Tenancy is enforced above and,
        // for the contact side, by the entry-point ownership guard.
        await db
          .from('contact_custom_values')
          .upsert(
            { contact_id: args.contactId, custom_field_id: customFieldId, value },
            { onConflict: 'contact_id,custom_field_id' },
          )
        return `custom field updated`
      }

      // Real contacts columns only — source/interest/temperature/
      // main_objection/next_action/score/crm_stage live on `deals`,
      // not `contacts` (confirmed against the live schema after an
      // earlier version of this whitelist wrongly included them,
      // which would have failed with "column does not exist" the
      // moment anyone actually used it). Deal-side qualification
      // fields go through the separate update_deal_field step below.
      const allowed = new Set(['name', 'email', 'company', 'cpf', 'birthday', 'address', 'gender'])
      if (!allowed.has(cfg.field)) {
        return `field ${cfg.field} not writable from automations`
      }
      // Defense in depth: scope the service-role write to the account so
      // a future caller that skips the entry-point ownership guard still
      // cannot write across tenants.
      await db
        .from('contacts')
        .update({ [cfg.field]: value, updated_at: new Date().toISOString() })
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
      return `${cfg.field} updated`
    }

    case 'create_deal': {
      const cfg = step.step_config as CreateDealStepConfig
      if (!cfg.pipeline_id || !cfg.stage_id) throw new Error('create_deal needs pipeline + stage')
      // Match the account's configured default currency rather than
      // the static `deals.currency` DB default — keeps automation-
      // created deals consistent with the one-currency-per-account
      // rule (issue #218). Fall back to USD if the row is somehow
      // missing the value (pre-021 forks).
      const { data: acct } = await db
        .from('accounts')
        .select('default_currency')
        .eq('id', args.automation.account_id)
        .maybeSingle()
      await db.from('deals').insert({
        // Tenancy + audit, same split as automation_logs above.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        pipeline_id: cfg.pipeline_id,
        stage_id: cfg.stage_id,
        contact_id: args.contactId,
        title: interpolate(cfg.title, args),
        value: cfg.value ?? 0,
        currency: acct?.default_currency ?? 'USD',
        status: 'open',
      })
      return 'deal created'
    }

    case 'update_deal_field': {
      const cfg = step.step_config as UpdateDealFieldStepConfig
      if (!args.contactId) throw new Error('update_deal_field needs a contact')

      // These live on `deals`, not `contacts` — confirmed against the
      // live schema. update_contact_field's own whitelist used to
      // wrongly include them, which would have failed at write time
      // with "column does not exist" the moment anyone used it.
      const allowed = new Set(['source', 'interest', 'temperature', 'main_objection', 'next_action', 'crm_stage'])
      if (!allowed.has(cfg.field)) {
        return `field ${cfg.field} not writable from automations`
      }

      const { data: deal } = await db
        .from('deals')
        .select('id')
        .eq('contact_id', args.contactId)
        .eq('account_id', args.automation.account_id)
        .not('status', 'in', '(won,lost)')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!deal) return 'no open deal for this contact — skipped'

      const value = interpolate(cfg.value, args)
      await db
        .from('deals')
        .update({ [cfg.field]: value, updated_at: new Date().toISOString() })
        .eq('id', deal.id)
        .eq('account_id', args.automation.account_id)

      return `deal.${cfg.field} set to "${value}"`
    }

    case 'create_appointment': {
      const cfg = step.step_config as CreateAppointmentStepConfig
      if (!args.contactId) throw new Error('create_appointment needs a contact')
      if (!cfg.template) throw new Error('create_appointment needs a template')

      const messageText = args.context.message_text ?? ''
      const fields = extractFromTemplate(cfg.template, messageText)
      if (!fields) return 'message did not match the configured template — skipped'

      const startTime = combineDateAndTime(fields)
      if (!startTime) return 'could not parse a date from the message — skipped'

      const serviceName = fields.raw.servico || fields.raw.procedimento || 'Consulta'

      // Duration always comes from the matching service's own
      // configured length (Serviços), never a fixed number typed into
      // the automation — a clinic with a 90-minute procedure and a
      // 20-minute one shouldn't need two near-identical automations
      // just to get the right end_time.
      const { data: matchedProcedure } = await db
        .from('procedures')
        .select('duration_minutes')
        .eq('clinic_id', args.automation.account_id)
        .ilike('name', serviceName)
        .maybeSingle()
      const durationMs = (matchedProcedure?.duration_minutes ?? 60) * 60_000
      const endTime = new Date(startTime.getTime() + durationMs)

      const { data: newAppt, error: apptErr } = await db
        .from('appointments')
        .insert({
          clinic_id: args.automation.account_id,
          patient_id: args.contactId,
          professional_id: null,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'provisional',
          type: serviceName,
          notes: `Criado automaticamente a partir da mensagem: "${messageText}"`,
        })
        .select('id')
        .single()

      if (apptErr) throw new Error(`failed to create appointment: ${apptErr.message}`)

      await db.from('contact_timeline').insert({
        account_id: args.automation.account_id,
        contact_id: args.contactId,
        event_type: 'appointment',
        title: '⚙️ Automação — Agendamento criado',
        description: `${serviceName} agendado para ${startTime.toLocaleString('pt-BR')}`,
        metadata: { by: 'automation', automation_id: args.automation.id, appointment_id: newAppt.id },
      })

      return `appointment created for ${startTime.toLocaleString('pt-BR')}`
    }

    case 'update_appointment_status': {
      const cfg = step.step_config as UpdateAppointmentStatusStepConfig
      if (!args.contactId) throw new Error('update_appointment_status needs a contact')

      const selector = cfg.appointment_selector ?? 'next_upcoming'
      let query = db
        .from('appointments')
        .select('id, start_time')
        .eq('clinic_id', args.automation.account_id)
        .eq('patient_id', args.contactId)
        .neq('status', 'cancelled')

      query =
        selector === 'most_recent'
          ? query.order('created_at', { ascending: false })
          : query.gte('start_time', new Date().toISOString()).order('start_time', { ascending: true })

      const { data: targetAppt } = await query.limit(1).maybeSingle()
      if (!targetAppt) return 'no matching appointment found — skipped'

      if (cfg.action === 'confirm') {
        await db.from('appointments').update({ status: 'confirmed' }).eq('id', targetAppt.id)
        await db.from('contact_timeline').insert({
          account_id: args.automation.account_id,
          contact_id: args.contactId,
          event_type: 'appointment',
          title: '⚙️ Automação — Agendamento confirmado',
          description: 'Confirmado via WhatsApp.',
          metadata: { by: 'automation', automation_id: args.automation.id, appointment_id: targetAppt.id },
        })
        return `appointment ${targetAppt.id} confirmed`
      }

      if (cfg.action === 'cancel') {
        await db
          .from('appointments')
          .update({ status: 'cancelled', notes: 'Cancelado via WhatsApp (automação).' })
          .eq('id', targetAppt.id)
        await db.from('contact_timeline').insert({
          account_id: args.automation.account_id,
          contact_id: args.contactId,
          event_type: 'appointment_cancelled',
          title: '⚙️ Automação — Agendamento cancelado',
          description: 'Cancelado via WhatsApp.',
          metadata: { by: 'automation', automation_id: args.automation.id, appointment_id: targetAppt.id },
        })
        return `appointment ${targetAppt.id} cancelled`
      }

      if (cfg.action === 'no_show') {
        await db.from('appointments').update({ status: 'no_show' }).eq('id', targetAppt.id)
        await db.from('contact_timeline').insert({
          account_id: args.automation.account_id,
          contact_id: args.contactId,
          event_type: 'appointment',
          title: '⚙️ Automação — Sem retorno',
          description: 'O paciente não respondeu à confirmação dentro do prazo.',
          metadata: { by: 'automation', automation_id: args.automation.id, appointment_id: targetAppt.id },
        })
        return `appointment ${targetAppt.id} marked no_show`
      }

      // action === 'reschedule'
      if (!cfg.template) throw new Error('update_appointment_status (reschedule) needs a template')
      const messageText = args.context.message_text ?? ''
      const fields = extractFromTemplate(cfg.template, messageText)
      if (!fields) return 'message did not match the configured template — skipped'
      const newStart = combineDateAndTime(fields)
      if (!newStart) return 'could not parse a new date from the message — skipped'

      const originalDuration = targetAppt.start_time
        ? 60 * 60_000 // appointments row here only selected start_time; keep it simple at 1h
        : 60 * 60_000
      const newEnd = new Date(newStart.getTime() + originalDuration)

      await db
        .from('appointments')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          status: 'provisional',
        })
        .eq('id', targetAppt.id)

      await db.from('contact_timeline').insert({
        account_id: args.automation.account_id,
        contact_id: args.contactId,
        event_type: 'appointment_rescheduled',
        title: '⚙️ Automação — Agendamento remarcado',
        description: `Novo horário: ${newStart.toLocaleString('pt-BR')}`,
        metadata: { by: 'automation', automation_id: args.automation.id, appointment_id: targetAppt.id },
      })
      return `appointment ${targetAppt.id} rescheduled to ${newStart.toLocaleString('pt-BR')}`
    }

    case 'register_payment': {
      const cfg = step.step_config as RegisterPaymentStepConfig
      if (!args.contactId) throw new Error('register_payment needs a contact')
      if (!cfg.template) throw new Error('register_payment needs a template')

      const messageText = args.context.message_text ?? ''
      const fields = extractFromTemplate(cfg.template, messageText)
      if (!fields || fields.valor === undefined) {
        return 'message did not match the configured template, or no value found — skipped'
      }

      const { data: newTx, error: txErr } = await db
        .from('financial_transactions')
        .insert({
          clinic_id: args.automation.account_id,
          patient_id: args.contactId,
          date: new Date().toISOString().slice(0, 10),
          description: `${cfg.category || 'Pagamento'} via WhatsApp (automação)`,
          category: cfg.category || 'Sinal',
          method: 'pix',
          type: 'sinal',
          value: fields.valor,
          status: 'paid',
        })
        .select('id')
        .single()

      if (txErr) throw new Error(`failed to register payment: ${txErr.message}`)

      await db.from('contact_timeline').insert({
        account_id: args.automation.account_id,
        contact_id: args.contactId,
        event_type: 'payment',
        title: '⚙️ Automação — Pagamento registrado',
        description: `R$ ${fields.valor.toFixed(2)} registrado no caixa.`,
        metadata: { by: 'automation', automation_id: args.automation.id, transaction_id: newTx.id },
      })
      return `payment of ${fields.valor} registered`
    }

    case 'send_webhook': {
      const cfg = step.step_config as SendWebhookStepConfig
      if (!cfg.url) throw new Error('send_webhook needs url')
      const body = cfg.body_template ? interpolate(cfg.body_template, args) : JSON.stringify(args.context)
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body,
      })
      if (!res.ok) throw new Error(`webhook returned ${res.status}`)
      return `webhook ${res.status}`
    }

    case 'close_conversation': {
      if (!args.contactId) throw new Error('close_conversation needs a contact')
      await db
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('account_id', args.automation.account_id)
        .eq('contact_id', args.contactId)
      return 'conversation closed'
    }

    default:
      return `unknown step: ${step.step_type}`
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Pick the conversation a send-type step should use. Prefer the id the
 * webhook handed us (it's the one that just got the inbound message);
 * fall back to the contact's conversation for resumed/wait paths and
 * manual engine POSTs. Throws if none exists — send steps have
 * no meaningful target without a conversation.
 */
async function resolveConversationId(args: ExecuteArgs): Promise<string> {
  const fromCtx = args.context.conversation_id
  if (fromCtx) return fromCtx
  if (!args.contactId) throw new Error('cannot resolve conversation: no contact')
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('account_id', args.automation.account_id)
    .eq('contact_id', args.contactId)
    .maybeSingle()
  if (error) throw new Error(`conversation lookup failed: ${error.message}`)
  if (!data?.id) throw new Error('no conversation for contact')
  return data.id as string
}

function triggerMatches(automation: Automation, ctx: AutomationContext | undefined): boolean {
  if (automation.trigger_type !== 'keyword_match') return true
  const cfg = automation.trigger_config as KeywordMatchTriggerConfig
  if (!cfg?.keywords || cfg.keywords.length === 0) return false

  // 'from' defaults to 'lead' for automations saved before this field
  // existed — matches the only behavior this trigger had until now
  // (it only ever ran on inbound/customer messages).
  const wantedDirection = cfg.from ?? 'lead'
  if (wantedDirection !== 'any' && ctx?.message_direction && wantedDirection !== ctx.message_direction) {
    return false
  }

  const text = (ctx?.message_text ?? '').toString()
  if (!text) return false
  const haystack = cfg.case_sensitive ? text : text.toLowerCase()
  return cfg.keywords.some((raw) => {
    const k = cfg.case_sensitive ? raw : raw.toLowerCase()
    return cfg.match_type === 'exact' ? haystack === k : haystack.includes(k)
  })
}

async function evaluateCondition(cfg: ConditionStepConfig, args: ExecuteArgs): Promise<boolean> {
  const db = supabaseAdmin()
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!args.contactId || !cfg.operand) return false
      // contact_tags has no account_id column (its RLS keys off the parent
      // contact), so tenant scoping here relies on the contact-ownership
      // guard in runAutomationsForTrigger.
      const { count } = await db
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.operand)
      return (count ?? 0) > 0
    }
    case 'contact_field': {
      if (!args.contactId || !cfg.operand) return false
      // Scope to the account so the condition can't be turned into a
      // cross-tenant read oracle via the service-role client.
      const { data } = await db
        .from('contacts')
        .select(cfg.operand)
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
        .maybeSingle()
      const v = (data as Record<string, unknown> | null)?.[cfg.operand]
      return v != null && String(v) === String(cfg.value ?? '')
    }
    case 'message_content': {
      const text = (args.context.message_text ?? '').toString()
      return text.toLowerCase().includes((cfg.value ?? '').toLowerCase())
    }
    case 'time_of_day': {
      // operand form "HH:mm-HH:mm" — true if now is within that window
      // (supports over-midnight ranges like "18:00-09:00").
      return isWithinWindow(cfg.operand ?? '', new Date())
    }
    case 'no_reply_since': {
      // True = "still no reply" — i.e. no customer message has landed
      // in the conversation since this automation run started. Pairs
      // with a preceding `wait`: send a message, wait N hours, check
      // this condition, and only the "yes" (no reply) branch sends
      // the follow-up.
      if (!args.contactId) return true
      const anchor = args.context.vars?.automation_started_at as string | undefined
      if (!anchor) return true
      let conversationId: string
      try {
        conversationId = await resolveConversationId(args)
      } catch {
        return true // no conversation yet certainly means no reply
      }
      const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'customer')
        .gt('created_at', anchor)
      return (count ?? 0) === 0
    }
    default:
      return false
  }
}

/** Parses "HH:mm-HH:mm" into minutes-since-midnight bounds. Shared by
 *  the time_of_day condition and the wait step's 'until_window' mode
 *  — same window format and overnight-range handling either way. */
function parseWindow(window: string): { from: number; to: number } | null {
  const [from, to] = window.split('-')
  if (!from || !to) return null
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  return { from: parse(from), to: parse(to) }
}

function isWithinWindow(window: string, now: Date): boolean {
  const bounds = parseWindow(window)
  if (!bounds) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return bounds.from <= bounds.to
    ? mins >= bounds.from && mins < bounds.to
    : mins >= bounds.from || mins < bounds.to
}

/** Milliseconds until `now` next falls inside `window` — 0 if it's
 *  already inside. This is the "message arrived at 7am, hold the
 *  follow-up until 9am" case: a wait step in 'until_window' mode
 *  parks the run here instead of a fixed relative delay. */
function msUntilWindowOpens(window: string, now: Date): number {
  if (isWithinWindow(window, now)) return 0
  const bounds = parseWindow(window)
  if (!bounds) return 0
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  let deltaMins = bounds.from - nowMins
  if (deltaMins < 0) deltaMins += 24 * 60 // window opens tomorrow
  return Math.max(1_000, Math.round(deltaMins * 60_000))
}

function waitMs(cfg: WaitStepConfig): number {
  if (cfg.mode === 'until_window' && cfg.window) {
    return msUntilWindowOpens(cfg.window, new Date())
  }
  const unitMs = cfg.unit === 'days' ? 86_400_000 : cfg.unit === 'hours' ? 3_600_000 : 60_000
  return Math.max(1_000, (cfg.amount ?? 0) * unitMs)
}

function interpolate(s: string, args: ExecuteArgs): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.')
    if (ns === 'message' && prop === 'text') return String(args.context.message_text ?? '')
    if (ns === 'vars' && prop) return String(args.context.vars?.[prop] ?? '')
    return ''
  })
}

async function appendResults(
  logId: string | null,
  newItems: AutomationLogStepResult[],
  status: 'success' | 'partial' | 'failed' | null,
  errorMessage: string | null,
) {
  if (!logId) return
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('automation_logs')
    .select('steps_executed, status')
    .eq('id', logId)
    .single()
  const merged = [
    ...((existing?.steps_executed as AutomationLogStepResult[] | undefined) ?? []),
    ...newItems,
  ]
  const update: Record<string, unknown> = { steps_executed: merged }
  // Only overwrite status on the outermost scope — nested branches pass null.
  if (status !== null) {
    update.status = status
  }
  if (errorMessage) update.error_message = errorMessage
  await db.from('automation_logs').update(update).eq('id', logId)
}

async function finalizeLog(
  logId: string | null,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null,
) {
  if (!logId) return
  await supabaseAdmin()
    .from('automation_logs')
    .update({ status, error_message: errorMessage })
    .eq('id', logId)
}

async function markPending(id: string, status: 'done' | 'failed') {
  await supabaseAdmin()
    .from('automation_pending_executions')
    .update({ status })
    .eq('id', id)
}
