"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, PipelineStage } from "@/types";
import {
  Sparkles,
  TrendingUp,
  Calendar,
  ShoppingBag,
  Wallet,
  MessageSquareText,
  RotateCcw,
  Tag as TagIcon,
  Zap,
  ChevronRight,
} from "lucide-react";

interface LiaSummaryPanelProps {
  accountId: string;
  deals: Deal[];
  stages: PipelineStage[];
  greetingName?: string;
}

type Period = "today" | "7d" | "30d" | "this_month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  this_month: "Este mês",
};

function periodStart(period: Period): Date {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "7d") return new Date(now.getTime() - 7 * 86_400_000);
  if (period === "this_month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getTime() - 30 * 86_400_000);
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Top-of-page summary for Pipelines/CRM — "o que está acontecendo" at
 * a glance, before the Kanban (which stays as the exploration layer,
 * per the product brief: this panel doesn't replace it, it sits above
 * it). Every number here reads from real rows (deals already loaded
 * by the page, plus automation_logs / deal_field_history for this
 * account) — no invented metrics. Sections the brief asks for that
 * need data this system doesn't compute yet (revenue attribution,
 * AI-generated insights, objection/question classification, an
 * activity log) are deliberately left out rather than faked; see the
 * component's own empty-state copy for what that means in practice.
 */
export function LiaSummaryPanel({ accountId, deals, stages, greetingName }: LiaSummaryPanelProps) {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("30d");
  const [automationCount, setAutomationCount] = useState<number | null>(null);
  const [reclassifiedCount, setReclassifiedCount] = useState<number | null>(null);
  const [tagsAddedCount, setTagsAddedCount] = useState<number | null>(null);
  const [loadingLia, setLoadingLia] = useState(true);

  const since = useMemo(() => periodStart(period), [period]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLia(true);
      const sinceIso = since.toISOString();
      const [auto, hist, tags] = await Promise.all([
        supabase
          .from("automation_logs")
          .select("id", { count: "exact", head: true })
          .eq("status", "success")
          .gte("created_at", sinceIso)
          .in(
            "automation_id",
            (await supabase.from("automations").select("id").eq("account_id", accountId)).data?.map((a) => a.id) ?? [],
          ),
        supabase
          .from("deal_field_history")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .not("changed_by_automation_id", "is", null)
          .gte("changed_at", sinceIso),
        supabase
          .from("deal_interests")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .not("created_by_automation_id", "is", null)
          .gte("created_at", sinceIso),
      ]);
      if (cancelled) return;
      setAutomationCount(auto.count ?? 0);
      setReclassifiedCount(hist.count ?? 0);
      setTagsAddedCount(tags.count ?? 0);
      setLoadingLia(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, since]);

  const dealsInPeriod = useMemo(() => deals.filter((d) => new Date(d.created_at) >= since), [deals, since]);
  const wonInPeriod = useMemo(() => dealsInPeriod.filter((d) => d.status === "won"), [dealsInPeriod]);
  const revenueInPeriod = useMemo(() => wonInPeriod.reduce((sum, d) => sum + (Number(d.value) || 0), 0), [wonInPeriod]);
  const conversionRate = dealsInPeriod.length > 0 ? Math.round((wonInPeriod.length / dealsInPeriod.length) * 100) : null;

  // Stage health: real counts per configured stage, in entry order —
  // no made-up funnel steps, exactly the pipeline this account built.
  const stageCounts = useMemo(
    () =>
      [...stages]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ stage: s, count: deals.filter((d) => d.stage_id === s.id && d.status !== "lost").length })),
    [stages, deals],
  );

  const liaActions = [
    { icon: Zap, label: "Automações concluídas", value: automationCount },
    { icon: RotateCcw, label: "Negócios reclassificados", value: reclassifiedCount },
    { icon: TagIcon, label: "Interesses registrados", value: tagsAddedCount },
  ];
  const hasAnyLiaAction = liaActions.some((a) => (a.value ?? 0) > 0);

  return (
    <div className="space-y-4">
      {/* Header: greeting + period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {greeting()}
              {greetingName ? `, ${greetingName.split(" ")[0]}` : ""}
            </h2>
            <p className="text-xs text-muted-foreground">A LYA acompanha sua operação comercial por você.</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo executivo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={<Calendar className="h-4 w-4" />} label={`Negócios criados · ${PERIOD_LABELS[period].toLowerCase()}`} value={String(dealsInPeriod.length)} />
        <SummaryCard icon={<ShoppingBag className="h-4 w-4" />} label="Vendas" value={String(wonInPeriod.length)} />
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Receita" value={money(revenueInPeriod)} />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversão"
          value={conversionRate === null ? "—" : `${conversionRate}%`}
        />
      </div>

      {/* O que a LYA fez */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">O que a LYA fez</p>
            <p className="text-[11px] text-muted-foreground">Ações automáticas no período selecionado.</p>
          </div>
        </div>
        {loadingLia ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : hasAnyLiaAction ? (
          <div className="grid grid-cols-3 gap-3">
            {liaActions.map((a) => (
              <div key={a.label} className="rounded-xl bg-primary-soft p-3">
                <a.icon className="mb-1.5 h-4 w-4 text-primary" />
                <p className="text-xl font-bold text-foreground">{a.value ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">{a.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma ação automática registrada neste período ainda.
          </p>
        )}
      </div>

      {/* Saúde do funil */}
      {stageCounts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-bold text-foreground">Saúde do funil</p>
          <div className="flex flex-wrap items-stretch gap-2">
            {stageCounts.map((sc, i) => (
              <div key={sc.stage.id} className="flex items-center gap-2">
                <div className="min-w-[88px] rounded-xl bg-muted px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">{sc.count}</p>
                  <p className="truncate text-[10px] text-muted-foreground" title={sc.stage.name}>
                    {sc.stage.name}
                  </p>
                </div>
                {i < stageCounts.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</div>
      <p className="text-xl font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
