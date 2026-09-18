import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
  ClinicDashboardMetrics,
  ClinicPriorityLead,
  ClinicAIInsight,
} from './types'

// ------------------------------------------------------------
// Every query here takes an explicit accountId and filters by it.
// This used to rely purely on RLS to scope results to the caller —
// correct back when a user's RLS access mapped to exactly one
// account, but RLS now legitimately grants access to every account a
// user belongs to (multi-clinic support), so without an explicit
// filter these dashboard numbers would silently sum every clinic the
// caller has access to instead of just the one being viewed. `deals`,
// `contacts`, `conversations`, `broadcasts` and `automation_logs`
// carry account_id directly; `appointments` and `procedures` use
// clinic_id (same id space, different generation of the schema);
// `messages` and `pipeline_stages` have neither and are scoped via an
// inner join on their parent (`conversations`, `pipelines`).
// ------------------------------------------------------------

type DB = SupabaseClient

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB, accountId: string): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('value, status').eq('account_id', accountId).eq('status', 'open'),
    db
      .from('messages')
      .select('id, conversations!inner(account_id)', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .eq('conversations.account_id', accountId)
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id, conversations!inner(account_id)', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .eq('conversations.account_id', accountId)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
  ])

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[]
  const openDealsValue = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
  accountId: string,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type, conversations!inner(account_id)')
    .eq('conversations.account_id', accountId)
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB, accountId: string): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db
      .from('pipeline_stages')
      .select('id, name, color, pipeline_id, position, pipelines!inner(account_id)')
      .eq('pipelines.account_id', accountId)
      .order('position'),
    db.from('deals').select('stage_id, value, status').eq('account_id', accountId).eq('status', 'open'),
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as { stage_id: string; value: number | null }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    // Hide empty stages from the ring (but we'd still show them in the
    // legend if the user wanted a full breakdown — trimming keeps the
    // visual clean for the common case).
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB, accountId: string): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at, conversations!inner(account_id)')
    .eq('conversations.account_id', accountId)
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, accountId: string, limit = 20): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations!inner(account_id, contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .eq('conversations.account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Desconhecido'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `Nova mensagem de ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Novo contato: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Negócio "${d.title}" em ${stage.name}`
        : `Negócio "${d.title}" atualizado`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `enviado para ${b.total_recipients} contatos`
        : `${b.status} (${b.total_recipients} destinatários)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Disparo "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'um contato'
    const autoName = automation?.name || 'Automação'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automação "${autoName}" ${l.status === 'failed' ? 'falhou para' : 'foi acionada para'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}

// --- 6. Clinic Gerencial Dashboard -------------------------------------

function startOfLocalMonth(d: Date = new Date()): Date {
  const out = new Date(d)
  out.setDate(1)
  out.setHours(0, 0, 0, 0)
  return out
}

function startOfLastMonth(d: Date = new Date()): Date {
  const out = startOfLocalMonth(d)
  out.setMonth(out.getMonth() - 1)
  return out
}

export async function loadClinicDashboardMetrics(db: DB, accountId: string): Promise<ClinicDashboardMetrics> {
  const todayStart = startOfLocalDay().toISOString()
  
  const tomorrowStart = new Date(startOfLocalDay())
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const tomorrowStartISO = tomorrowStart.toISOString()
  
  const yesterdayStart = daysAgoStart(1).toISOString()
  const thirtyDaysAgoStart = daysAgoStart(30).toISOString()
  const thisMonthStart = startOfLocalMonth().toISOString()
  const lastMonthStart = startOfLastMonth().toISOString()
  const lastMonthEnd = thisMonthStart

  const [
    contactsToday,
    contactsYesterday,
    appointmentsToday,
    appointmentsYesterday,
    wonDealsThisMonth,
    wonDealsLastMonth,
    openDeals,
    lostDealsThisMonth,
    openDealsNoResponse,
    appointmentsLast30Days,
    proceduresList,
  ] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', yesterdayStart).lt('created_at', todayStart),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).gte('start_time', todayStart).lt('start_time', tomorrowStartISO).neq('status', 'cancelled'),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).gte('start_time', yesterdayStart).lt('start_time', todayStart).neq('status', 'cancelled'),
    db.from('deals').select('value').eq('account_id', accountId).eq('status', 'won').gte('updated_at', thisMonthStart),
    db.from('deals').select('value').eq('account_id', accountId).eq('status', 'won').gte('updated_at', lastMonthStart).lt('updated_at', lastMonthEnd),
    db.from('deals').select('id, title, value, score, temperature, next_action, main_objection, waiting_since, waiting_side, contact:contacts(name, phone)').eq('account_id', accountId).eq('status', 'open'),
    db.from('deals').select('value').eq('account_id', accountId).eq('status', 'lost').gte('updated_at', thisMonthStart),
    db.from('deals').select('value').eq('account_id', accountId).eq('status', 'open').eq('waiting_side', 'lead'),
    db.from('appointments').select('status, type, start_time').eq('clinic_id', accountId).gte('start_time', thirtyDaysAgoStart),
    db.from('procedures').select('name, valor, price').eq('clinic_id', accountId),
  ])

  const leadsNovosHoje = contactsToday.count ?? 0
  const leadsNovosOntem = contactsYesterday.count ?? 0
  const atendimentosHoje = appointmentsToday.count ?? 0
  const atendimentosOntem = appointmentsYesterday.count ?? 0

  const wonThisMonthRows = (wonDealsThisMonth.data ?? []) as { value: number | null }[]
  const faturamentoRealizadoMes = wonThisMonthRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const wonLastMonthRows = (wonDealsLastMonth.data ?? []) as { value: number | null }[]
  const faturamentoRealizadoMesAnterior = wonLastMonthRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const openDealsRows = (openDeals.data ?? []) as any[]
  const faturamentoPrevisto = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const faturamentoPrevistoQuantidade = openDealsRows.length

  const lostThisMonthRows = (lostDealsThisMonth.data ?? []) as { value: number | null }[]
  const receitaPerdidaLostDealsValue = lostThisMonthRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const unansweredRows = (openDealsNoResponse.data ?? []) as { value: number | null }[]
  const leadsSemRespostaCount = unansweredRows.length
  const leadsSemRespostaValue = unansweredRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const procedurePriceMap = new Map<string, number>()
  for (const proc of (proceduresList.data || []) as any[]) {
    const price = proc.price ?? proc.valor ?? 0
    procedurePriceMap.set(proc.name, Number(price))
  }

  let cancellationsCount = 0
  let cancellationsValue = 0
  let noShowsCount = 0
  let noShowsValue = 0

  for (const appt of (appointmentsLast30Days.data || []) as any[]) {
    const price = appt.type ? (procedurePriceMap.get(appt.type) ?? 0) : 0
    if (appt.status === 'cancelled') {
      cancellationsCount++
      cancellationsValue += price
    } else if (appt.status === 'no_show') {
      noShowsCount++
      noShowsValue += price
    }
  }

  const receitaPerdidaTotal = receitaPerdidaLostDealsValue + cancellationsValue + noShowsValue

  const priorities: ClinicPriorityLead[] = openDealsRows
    .map(d => {
      const contact = Array.isArray(d.contact) ? d.contact[0] : d.contact
      return {
        dealId: d.id,
        title: d.title,
        value: d.value ?? 0,
        score: d.score ?? 50,
        temperature: (d.temperature ?? 'warm') as 'hot' | 'warm' | 'cold',
        contactName: contact?.name || contact?.phone || 'Sem nome',
        contactPhone: contact?.phone || '',
        nextAction: d.next_action || null,
        objection: d.main_objection || null,
        waitingSince: d.waiting_since || null,
        waitingSide: d.waiting_side || null,
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.value - a.value
    })
    .slice(0, 5)

  const aiInsights: ClinicAIInsight[] = []
  
  if (cancellationsCount > 0) {
    aiInsights.push({
      id: 'cxl-rate',
      type: 'warning',
      title: 'Vazamento por Cancelamento',
      description: `${cancellationsCount} consultas canceladas nos últimos 30 dias representam R$ ${cancellationsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} não faturados. Sugerimos ativar lembretes no WhatsApp.`
    })
  }

  if (noShowsCount > 0) {
    aiInsights.push({
      id: 'noshow-rate',
      type: 'warning',
      title: 'Ausências de Pacientes (No-Show)',
      description: `${noShowsCount} ausências registradas nos últimos 30 dias representam R$ ${noShowsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} perdidos. Sugerimos enviar mensagens de reengajamento automático.`
    })
  }

  if (leadsSemRespostaCount > 0) {
    aiInsights.push({
      id: 'no-reply',
      type: 'opportunity',
      title: 'Leads Sem Resposta no Funil',
      description: `${leadsSemRespostaCount} leads aguardando retorno, representando R$ ${leadsSemRespostaValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Acesse a fila de prioridades abaixo para interagir.`
    })
  }

  if (faturamentoRealizadoMes > faturamentoRealizadoMesAnterior) {
    aiInsights.push({
      id: 'rev-up',
      type: 'success',
      title: 'Faturamento Comercial em Alta',
      description: `O faturamento fechado deste mês (R$ ${faturamentoRealizadoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) superou o mês anterior (R$ ${faturamentoRealizadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
    })
  } else if (faturamentoRealizadoMes < faturamentoRealizadoMesAnterior && faturamentoRealizadoMesAnterior > 0) {
    aiInsights.push({
      id: 'rev-down',
      type: 'info',
      title: 'Alinhamento de Metas de Faturamento',
      description: `Faturamento atual está R$ ${(faturamentoRealizadoMesAnterior - faturamentoRealizadoMes).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} abaixo do mês anterior. Revise a lista de 'O que fazer hoje' para reverter.`
    })
  }

  const hotLeads = openDealsRows.filter(d => d.temperature === 'hot')
  if (hotLeads.length > 0) {
    aiInsights.push({
      id: 'hot-leads-alert',
      type: 'opportunity',
      title: 'Oportunidades Quentes (Hot)',
      description: `Temos ${hotLeads.length} leads classificados como 'Hot' com score de engajamento acima de 80. Agende uma avaliação estática e faça o fechamento.`
    })
  }

  return {
    leadsNovosHoje,
    leadsNovosOntem,
    atendimentosHoje,
    atendimentosOntem,
    faturamentoRealizadoMes,
    faturamentoRealizadoMesAnterior,
    faturamentoPrevisto,
    faturamentoPrevistoQuantidade,
    leadsSemRespostaCount,
    leadsSemRespostaValue,
    cancellationsCount,
    cancellationsValue,
    noShowsCount,
    noShowsValue,
    receitaPerdidaTotal,
    receitaPerdidaLostDealsValue,
    priorities,
    aiInsights
  }
}

