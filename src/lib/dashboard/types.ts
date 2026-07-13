// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

export interface ClinicPriorityLead {
  dealId: string
  title: string
  value: number
  score: number
  temperature: 'hot' | 'warm' | 'cold'
  contactName: string
  contactPhone: string
  nextAction: string | null
  objection: string | null
  waitingSince: string | null
  waitingSide: string | null
}

export interface ClinicAIInsight {
  id: string
  type: 'opportunity' | 'warning' | 'info' | 'success'
  title: string
  description: string
}

export interface ClinicDashboardMetrics {
  leadsNovosHoje: number
  leadsNovosOntem: number
  atendimentosHoje: number
  atendimentosOntem: number
  faturamentoRealizadoMes: number
  faturamentoRealizadoMesAnterior: number
  faturamentoPrevisto: number
  faturamentoPrevistoQuantidade: number

  leadsSemRespostaCount: number
  leadsSemRespostaValue: number
  cancellationsCount: number
  cancellationsValue: number
  noShowsCount: number
  noShowsValue: number
  receitaPerdidaTotal: number
  receitaPerdidaLostDealsValue: number

  priorities: ClinicPriorityLead[]
  aiInsights: ClinicAIInsight[]
}

