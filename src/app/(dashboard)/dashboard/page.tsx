"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  Users,
  Calendar,
  TrendingUp,
  MessageSquareOff,
  UserX,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Flame,
  Zap,
} from 'lucide-react'

import { loadClinicDashboardMetrics } from '@/lib/dashboard/queries'
import type { ClinicDashboardMetrics } from '@/lib/dashboard/types'
import {
  loadActivity,
  loadConversationsSeries,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<ClinicDashboardMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<7 | 30 | 90>(30)
  const [series, setSeries] = useState<Record<7 | 30 | 90, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadClinicDashboardMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] clinic metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleRangeChange = useCallback(
    (r: 7 | 30 | 90) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const fmt = (v: number) => formatCurrency(v, defaultCurrency)

  // Calculations for deltas
  const leadsDelta = metrics ? metrics.leadsNovosHoje - metrics.leadsNovosOntem : 0
  const apptsDelta = metrics ? metrics.atendimentosHoje - metrics.atendimentosOntem : 0
  const revDelta = metrics ? metrics.faturamentoRealizadoMes - metrics.faturamentoRealizadoMesAnterior : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão gerencial e insights de inteligência artificial sobre a operação da clínica.
        </p>
      </div>

      {/* Seção 1: Saúde da Clínica */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Saúde da Clínica
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricsLoading || !metrics ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                title="Leads Novos (Hoje)"
                value={metrics.leadsNovosHoje.toLocaleString()}
                icon={Users}
                variant="info"
                delta={{
                  sign: leadsDelta,
                  label: `${leadsDelta >= 0 ? '+' : ''}${leadsDelta} vs ontem`,
                }}
              />
              <MetricCard
                title="Atendimentos (Hoje)"
                value={metrics.atendimentosHoje.toLocaleString()}
                icon={Calendar}
                variant="success"
                delta={{
                  sign: apptsDelta,
                  label: `${apptsDelta >= 0 ? '+' : ''}${apptsDelta} vs ontem`,
                }}
              />
              <MetricCard
                title="Faturamento Realizado (Mês)"
                value={fmt(metrics.faturamentoRealizadoMes)}
                icon={DollarSign}
                variant="success"
                delta={{
                  sign: revDelta,
                  label: `${revDelta >= 0 ? '+' : ''}${fmt(Math.abs(revDelta))} vs mês anterior`,
                }}
              />
              <MetricCard
                title="Faturamento Previsto (Funil)"
                value={fmt(metrics.faturamentoPrevisto)}
                icon={TrendingUp}
                variant="default"
                subtitle={`${metrics.faturamentoPrevistoQuantidade} negócios ativos`}
              />
            </>
          )}
        </div>
      </div>

      {/* Seção 2: Vazamento de Oportunidades */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-red-500">
          Vazamento de Oportunidades
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricsLoading || !metrics ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                title="Leads Sem Resposta"
                value={metrics.leadsSemRespostaCount.toString()}
                icon={MessageSquareOff}
                variant="warning"
                subtitle={`R$ ${metrics.leadsSemRespostaValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} parado`}
              />
              <MetricCard
                title="Cancelamentos (30 dias)"
                value={metrics.cancellationsCount.toString()}
                icon={UserX}
                variant="error"
                subtitle={`R$ ${metrics.cancellationsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} não faturado`}
              />
              <MetricCard
                title="Pacientes Ausentes (No-Show)"
                value={metrics.noShowsCount.toString()}
                icon={AlertCircle}
                variant="error"
                subtitle={`R$ ${metrics.noShowsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} perdido`}
              />
            </>
          )}
        </div>
      </div>

      {/* Seção 3: Priorities e AI Insights */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Prioridades e Recomendações */}
        <div className="space-y-6 lg:col-span-3">
          {/* O que preciso fazer hoje */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Zap className="h-4.5 w-4.5 text-amber-500 fill-amber-500/20" />
                  O que preciso fazer hoje?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Oportunidades quentes priorizadas pelo score de engajamento
                </p>
              </div>
            </div>

            {metricsLoading || !metrics ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : metrics.priorities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold text-foreground">Tudo limpo por aqui!</p>
                <p className="text-xs text-muted-foreground">Nenhum lead quente pendente no momento.</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {metrics.priorities.map((item) => {
                  const tempColors = {
                    hot: "bg-red-500/10 text-red-600 border-red-500/20",
                    warm: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                    cold: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                  };
                  return (
                    <div
                      key={item.dealId}
                      className="group relative rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/10 p-4 transition-all hover:border-neutral-200 dark:hover:border-neutral-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {item.contactName}
                          </span>
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${tempColors[item.temperature]}`}>
                            <Flame className="h-2.5 w-2.5 fill-current" />
                            {item.temperature}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-[9px] font-bold border border-blue-100/30">
                            {item.score}% engajamento
                          </span>
                        </div>
                        <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                          {fmt(item.value)}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-muted-foreground truncate mb-2">
                        Interesse: {item.title}
                      </p>

                      {item.objection && (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-red-500/[0.03] border border-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 w-full">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Objeção: {item.objection}</span>
                        </div>
                      )}

                      {item.nextAction && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/[0.03] border border-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 w-full">
                          <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">IA: {item.nextAction}</span>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {item.waitingSince && item.waitingSide === 'lead' ? (
                            `Sem resposta há ${Math.floor((new Date().getTime() - new Date(item.waitingSince).getTime()) / 3600000)}h`
                          ) : (
                            'Aguardando contato'
                          )}
                        </span>
                        <a
                          href={`https://wa.me/${item.contactPhone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                        >
                          Falar no WhatsApp
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI Insights & Recomendações */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-indigo-500 fill-indigo-500/10" />
                AI Insights & Recomendações
              </h2>
              <p className="text-xs text-muted-foreground">
                A IA analisa o financeiro e o funil para gerar sugestões comerciais táticas
              </p>
            </div>

            {metricsLoading || !metrics ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : metrics.aiInsights.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum insight disponível no momento.</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {metrics.aiInsights.map((insight) => {
                  const types = {
                    opportunity: {
                      bullet: "bg-indigo-500 text-white",
                    },
                    warning: {
                      bullet: "bg-amber-500 text-white",
                    },
                    success: {
                      bullet: "bg-emerald-500 text-white",
                    },
                    info: {
                      bullet: "bg-blue-500 text-white",
                    },
                  }
                  const currentType = types[insight.type] || types.info
                  return (
                    <div key={insight.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black uppercase", currentType.bullet)}>
                        {insight.type === 'opportunity' ? 'IA' : '!'}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">{insight.title}</h4>
                        <p className="text-xs font-medium leading-relaxed text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito */}
        <div className="space-y-6 lg:col-span-2">
          <div>
            <PipelineDonut
              data={pipeline}
              loading={pipelineLoading}
              currency={defaultCurrency}
            />
          </div>
          <QuickActions />
        </div>
      </div>

      {/* Seção 4: Gráficos de Conversação e Tempos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
        </div>
      </div>

      {/* Feed de Atividades Recentes */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}
