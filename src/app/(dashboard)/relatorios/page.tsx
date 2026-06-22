"use client";

import {
  TrendingUpIcon,
  UsersIcon,
  DollarSignIcon,
  CalendarIcon,
  BarChart2Icon,
  PieChartIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  StarIcon,
} from "lucide-react";

/* ─── Tiny bar chart ──────────────────────────────────────────── */
function MiniBarChart({ data, color = "bg-emerald-500" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-sm ${color} opacity-80`}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

/* ─── Mock data ──────────────────────────────────────────────── */
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

const REVENUE_DATA = [8400, 11200, 13600, 10800, 15400, 18200];
const LEADS_DATA = [34, 42, 58, 47, 61, 73];
const APPTS_DATA = [82, 95, 110, 88, 124, 148];

const TOP_PROCEDURES = [
  { name: "Toxina Botulínica", count: 48, revenue: 28800, pct: 38 },
  { name: "Preenchimento Labial", count: 31, revenue: 18600, pct: 24 },
  { name: "Laser Lavieen", count: 24, revenue: 14400, pct: 19 },
  { name: "Bioestimulador", count: 18, revenue: 10800, pct: 14 },
  { name: "Outros", count: 7, revenue: 4200, pct: 5 },
];

const TOP_SOURCES = [
  { name: "Instagram", leads: 41, pct: 56 },
  { name: "Google Ads", leads: 18, pct: 25 },
  { name: "Indicação", leads: 9, pct: 12 },
  { name: "TikTok", leads: 5, pct: 7 },
];

const KPIS = [
  {
    label: "Faturamento (mês)",
    value: "R$ 18.200",
    delta: 18.2,
    sub: "vs mai/2026",
    icon: DollarSignIcon,
    color: "text-emerald-600",
    chart: REVENUE_DATA,
    chartColor: "bg-emerald-500",
  },
  {
    label: "Novos leads",
    value: "73",
    delta: 19.7,
    sub: "vs mai/2026",
    icon: UsersIcon,
    color: "text-blue-500",
    chart: LEADS_DATA,
    chartColor: "bg-blue-500",
  },
  {
    label: "Agendamentos",
    value: "148",
    delta: 19.4,
    sub: "vs mai/2026",
    icon: CalendarIcon,
    color: "text-amber-500",
    chart: APPTS_DATA,
    chartColor: "bg-amber-400",
  },
  {
    label: "Ticket médio",
    value: "R$ 1.250",
    delta: -3.1,
    sub: "vs mai/2026",
    icon: BarChart2Icon,
    color: "text-muted-foreground",
    chart: [1100, 1320, 1140, 1280, 1290, 1250],
    chartColor: "bg-slate-400",
  },
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function RelatoriosPage() {
  return (
    <div className="space-y-8 text-left">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Visão executiva de faturamento, leads e procedimentos.
        </p>
      </div>

      {/* KPI grid with charts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => {
          const Icon = k.icon;
          const positive = k.delta >= 0;
          return (
            <div key={k.label} className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                <Icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold tracking-tight">{k.value}</p>
              <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-600" : "text-destructive"}`}>
                {positive ? <ArrowUpRightIcon className="h-3 w-3" /> : <ArrowDownRightIcon className="h-3 w-3" />}
                {Math.abs(k.delta)}% {k.sub}
              </span>
              <MiniBarChart data={k.chart} color={k.chartColor} />
              <div className="flex justify-between text-[10px] text-muted-foreground/50">
                {MONTHS.map((m) => <span key={m}>{m}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top procedures + sources */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <BarChart2Icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Top procedimentos (mês)</h2>
          </div>
          <div className="space-y-3">
            {TOP_PROCEDURES.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex gap-3 text-muted-foreground">
                    <span>{p.count}x</span>
                    <span className="font-bold text-foreground">{fmt(p.revenue)}</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Origem dos leads (mês)</h2>
          </div>
          <div className="space-y-3">
            {TOP_SOURCES.map((s) => (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <div className="flex gap-3 text-muted-foreground">
                    <span>{s.leads} leads</span>
                    <span className="font-bold text-foreground">{s.pct}%</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUpIcon className="h-3.5 w-3.5 text-emerald-600" />
              <span>Instagram + Google respondem por <strong className="text-foreground">81%</strong> dos leads este mês.</span>
            </div>
          </div>
        </div>
      </div>

      {/* NPS strip */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <StarIcon className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold">NPS — Satisfação de Pacientes</h2>
          <span className="ml-auto text-xs text-muted-foreground">Últimos 30 dias · 38 respondentes</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Promotores (9-10)", value: 26, pct: 68, color: "text-emerald-600 bg-emerald-500" },
            { label: "Neutros (7-8)", value: 8, pct: 21, color: "text-amber-600 bg-amber-400" },
            { label: "Detratores (0-6)", value: 4, pct: 11, color: "text-destructive bg-destructive" },
          ].map((g) => (
            <div key={g.label} className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-2xl font-bold">{g.value}</p>
              <p className="text-xs text-muted-foreground">{g.label}</p>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${g.color.split(" ")[1]}`} style={{ width: `${g.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-muted/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">Score NPS</p>
          <p className="text-3xl font-bold text-emerald-600">+57</p>
          <p className="text-xs text-muted-foreground">(68% - 11% = 57) · Classificação: Excelente</p>
        </div>
      </div>
    </div>
  );
}
