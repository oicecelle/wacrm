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
  Megaphone,
  History,
  ArrowRightLeft,
  StickyNote,
  Heart,
  Radio,
  Brain,
  TrendingDown,
  Award,
  HelpCircle,
  ShieldAlert,
  Sprout,
} from "lucide-react";

interface LiaSummaryPanelProps {
  accountId: string;
  deals: Deal[];
  stages: PipelineStage[];
  greetingName?: string;
}

type Period = "today" | "7d" | "30d" | "this_month";

interface PendingItem {
  id: string;
  runAt: string;
  automationName: string;
  contactName: string | null;
}

interface DiaryEntry {
  id: string;
  at: string;
  kind: "automation" | "field_change" | "interest" | "note";
  text: string;
}

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
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [pendingQueue, setPendingQueue] = useState<PendingItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [recovered, setRecovered] = useState<{ count: number; value: number } | null>(null);
  const [atRisk, setAtRisk] = useState<{ count: number; value: number } | null>(null);

  const since = useMemo(() => periodStart(period), [period]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLia(true);
      const sinceIso = since.toISOString();
      const automationIds = (await supabase.from("automations").select("id").eq("account_id", accountId)).data?.map(
        (a) => a.id,
      ) ?? [];

      const [auto, hist, tags, diaryAuto, diaryHist, diaryInterests, diaryNotes] = await Promise.all([
        supabase
          .from("automation_logs")
          .select("id", { count: "exact", head: true })
          .eq("status", "success")
          .gte("created_at", sinceIso)
          .in("automation_id", automationIds),
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
        // Diário: as mesmas fontes acima, mas trazendo o conteúdo (não
        // só a contagem) pra montar uma linha do tempo legível — uma
        // junção simples de registros que já existiam, nada de log de
        // atividade dedicado construído do zero.
        supabase
          .from("automation_logs")
          .select("id, created_at, status, automations(name)")
          .gte("created_at", sinceIso)
          .in("automation_id", automationIds)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("deal_field_history")
          .select("id, changed_at, field, old_value, new_value, changed_by_automation_id, deals(title)")
          .eq("account_id", accountId)
          .gte("changed_at", sinceIso)
          .order("changed_at", { ascending: false })
          .limit(20),
        supabase
          .from("deal_interests")
          .select("id, created_at, value, created_by_automation_id, deals(title)")
          .eq("account_id", accountId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("deal_notes")
          .select("id, created_at, created_by_automation_id, deals(title)")
          .eq("account_id", accountId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      setAutomationCount(auto.count ?? 0);
      setReclassifiedCount(hist.count ?? 0);
      setTagsAddedCount(tags.count ?? 0);

      const FIELD_LABELS: Record<string, string> = { status: "Status", crm_stage: "Etapa", crm_status: "Fila de atendimento" };
      const entries: DiaryEntry[] = [
        ...(diaryAuto.data ?? []).map((r) => {
          const row = r as unknown as { id: string; created_at: string; status: string; automations: { name: string } | null };
          return {
            id: `a-${row.id}`,
            at: row.created_at,
            kind: "automation" as const,
            text: `Automação "${row.automations?.name ?? "—"}" ${row.status === "success" ? "concluída" : row.status}`,
          };
        }),
        ...(diaryHist.data ?? []).map((r) => {
          const row = r as unknown as {
            id: string; changed_at: string; field: string; old_value: string | null; new_value: string;
            changed_by_automation_id: string | null; deals: { title: string } | null;
          };
          return {
            id: `h-${row.id}`,
            at: row.changed_at,
            kind: "field_change" as const,
            text: `${row.deals?.title ?? "Negócio"}: ${FIELD_LABELS[row.field] ?? row.field} ${row.old_value ? `${row.old_value} → ${row.new_value}` : `definido como ${row.new_value}`}${row.changed_by_automation_id ? " (automático)" : ""}`,
          };
        }),
        ...(diaryInterests.data ?? []).map((r) => {
          const row = r as unknown as { id: string; created_at: string; value: string; created_by_automation_id: string | null; deals: { title: string } | null };
          return {
            id: `i-${row.id}`,
            at: row.created_at,
            kind: "interest" as const,
            text: `${row.deals?.title ?? "Negócio"}: interesse em "${row.value}" registrado${row.created_by_automation_id ? " automaticamente" : ""}`,
          };
        }),
        ...(diaryNotes.data ?? []).map((r) => {
          const row = r as unknown as { id: string; created_at: string; created_by_automation_id: string | null; deals: { title: string } | null };
          return {
            id: `n-${row.id}`,
            at: row.created_at,
            kind: "note" as const,
            text: `${row.deals?.title ?? "Negócio"}: nova observação${row.created_by_automation_id ? " automática" : ""}`,
          };
        }),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      setDiaryEntries(entries.slice(0, 15));
      setLoadingLia(false);

      // Critério decidido com o cliente: rigoroso (silêncio real →
      // automação agiu → cliente respondeu → venda), 3 dias de
      // silêncio. Funções no banco (migração 074) — a lógica de
      // "maior intervalo entre mensagens" precisa de window function,
      // não dá pra fazer isso limpo puxando tudo pro JS.
      const [rec, risk] = await Promise.all([
        supabase.rpc("recovered_revenue", { p_account_id: accountId, p_since: sinceIso, p_silence_days: 3 }),
        supabase.rpc("at_risk_revenue", { p_account_id: accountId, p_silence_days: 3 }),
      ]);
      if (cancelled) return;
      const recRow = (rec.data as { deal_count: number; total_value: number }[] | null)?.[0];
      const riskRow = (risk.data as { deal_count: number; total_value: number }[] | null)?.[0];
      setRecovered(recRow ? { count: recRow.deal_count, value: Number(recRow.total_value) } : null);
      setAtRisk(riskRow ? { count: riskRow.deal_count, value: Number(riskRow.total_value) } : null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, since]);

  // Operação automática: o que está de fato enfileirado agora (não é
  // histórico, não depende do período acima) — lê direto de
  // automation_pending_executions, a mesma fila que o passo "esperar"
  // e o ritmo entre envios usam de verdade.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("automation_pending_executions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("status", "pending");
      const { data } = await supabase
        .from("automation_pending_executions")
        .select("id, run_at, automations(name), contacts(name)")
        .eq("account_id", accountId)
        .eq("status", "pending")
        .order("run_at", { ascending: true })
        .limit(5);
      if (cancelled) return;
      setPendingCount(count ?? 0);
      setPendingQueue(
        (data ?? []).map((r) => {
          const row = r as unknown as { id: string; run_at: string; automations: { name: string } | null; contacts: { name: string } | null };
          return { id: row.id, runAt: row.run_at, automationName: row.automations?.name ?? "—", contactName: row.contacts?.name ?? null };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

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

  // Campanhas e origens: agrupamento real de deals.source, sem join
  // nenhum — leads, clientes (ganhos) e receita de cada origem, no
  // mesmo período selecionado acima.
  const bySource = useMemo(() => {
    const map = new Map<string, { leads: number; clients: number; revenue: number }>();
    for (const d of dealsInPeriod) {
      const key = d.source?.trim() || "Sem origem";
      const row = map.get(key) ?? { leads: 0, clients: 0, revenue: 0 };
      row.leads += 1;
      if (d.status === "won") {
        row.clients += 1;
        row.revenue += Number(d.value) || 0;
      }
      map.set(key, row);
    }
    return Array.from(map.entries())
      .map(([source, stats]) => ({
        source,
        ...stats,
        conversion: stats.leads > 0 ? Math.round((stats.clients / stats.leads) * 100) : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [dealsInPeriod]);

  // Melhor origem: a com mais leads no período que teve pelo menos 1
  // cliente — evita "origem com 1 lead e 100% de conversão" ganhar por
  // amostra pequena demais pra significar algo.
  const bestSource = useMemo(() => {
    const withClients = bySource.filter((s) => s.clients > 0);
    return withClients.length > 0 ? [...withClients].sort((a, b) => b.conversion - a.conversion)[0] : null;
  }, [bySource]);

  // Maior vazamento: maior queda absoluta entre duas etapas
  // consecutivas do funil configurado por essa clínica — real, não um
  // funil genérico inventado.
  const biggestLeak = useMemo(() => {
    let worst: { from: string; to: string; drop: number } | null = null;
    for (let i = 0; i < stageCounts.length - 1; i++) {
      const drop = stageCounts[i].count - stageCounts[i + 1].count;
      if (drop > 0 && (!worst || drop > worst.drop)) {
        worst = { from: stageCounts[i].stage.name, to: stageCounts[i + 1].stage.name, drop };
      }
    }
    return worst;
  }, [stageCounts]);

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

      {/* Receita recuperada / em risco */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <Sprout className="h-3.5 w-3.5" /> Receita recuperada pela LYA
          </div>
          {recovered === null ? (
            <div className="h-8 w-32 animate-pulse rounded bg-emerald-100" />
          ) : recovered.count === 0 ? (
            <p className="text-sm text-emerald-800">
              Nenhuma venda se encaixou no critério neste período ainda (cliente ficou 3+ dias em
              silêncio, uma automação agiu, o cliente respondeu depois, e a venda aconteceu).
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-900">
                {recovered.value > 0 ? money(recovered.value) : `${recovered.count} negócio${recovered.count === 1 ? "" : "s"}`}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {recovered.value > 0
                  ? `${recovered.count} oportunidade${recovered.count === 1 ? "" : "s"} recuperada${recovered.count === 1 ? "" : "s"} por ação automática.`
                  : "Valor do negócio não foi preenchido — contagem real, R$ ainda não disponível."}
              </p>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-red-700">
            <ShieldAlert className="h-3.5 w-3.5" /> Receita em risco
          </div>
          {atRisk === null ? (
            <div className="h-8 w-32 animate-pulse rounded bg-red-100" />
          ) : atRisk.count === 0 ? (
            <p className="text-sm text-red-800">Nenhum negócio aberto está há 3+ dias sem resposta do cliente agora.</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-red-900">
                {atRisk.value > 0 ? money(atRisk.value) : `${atRisk.count} negócio${atRisk.count === 1 ? "" : "s"}`}
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {atRisk.value > 0
                  ? `Negócios abertos há 3+ dias sem resposta do cliente.`
                  : "Valor do negócio não foi preenchido — contagem real, R$ ainda não disponível."}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Inteligência da LYA */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">Inteligência da LYA</p>
            <p className="text-[11px] text-muted-foreground">Padrões identificados nos seus dados.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {bestSource ? (
            <InsightCard
              icon={<Award className="h-3.5 w-3.5" />}
              tag="Melhor origem"
              title={bestSource.source}
              detail={`${bestSource.conversion}% de conversão no período, entre as origens com cliente.`}
            />
          ) : (
            <InsightCard
              icon={<Award className="h-3.5 w-3.5" />}
              tag="Melhor origem"
              title="Dados insuficientes"
              detail="Ainda não há vendas suficientes no período pra identificar qual origem converte melhor."
              muted
            />
          )}
          {biggestLeak ? (
            <InsightCard
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              tag="Maior vazamento"
              title={`${biggestLeak.from} → ${biggestLeak.to}`}
              detail={`${biggestLeak.drop} negócios não avançaram dessa etapa pra próxima.`}
            />
          ) : (
            <InsightCard
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              tag="Maior vazamento"
              title="Dados insuficientes"
              detail="Sem negócios suficientes nas etapas do funil pra identificar um ponto de perda."
              muted
            />
          )}
          <InsightCard
            icon={<HelpCircle className="h-3.5 w-3.5" />}
            tag="Principal objeção"
            title="Dados insuficientes"
            detail="Nenhuma objeção foi registrada nos negócios ainda — essa análise aparece aqui assim que houver dado real."
            muted
          />
        </div>
      </div>

      {/* Operação automática */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">Operação automática</p>
            <p className="text-[11px] text-muted-foreground">
              {pendingCount === null ? "Carregando…" : pendingCount === 0 ? "Nada na fila agora." : `${pendingCount} ação${pendingCount === 1 ? "" : "ões"} aguardando o momento certo pra sair.`}
            </p>
          </div>
        </div>
        {pendingQueue.length > 0 ? (
          <div className="space-y-1.5">
            {pendingQueue.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                <span className="text-foreground">
                  {item.automationName}
                  {item.contactName ? ` · ${item.contactName}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {new Date(item.runAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma ação automática programada no momento. Você não precisa fazer nada — a LYA continua monitorando.
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
      {/* Campanhas e origens */}
      {bySource.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-bold text-foreground">Campanhas e origens</p>
              <p className="text-[11px] text-muted-foreground">Quais canais estão gerando resultado no período.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="pb-2 font-bold">Origem</th>
                  <th className="pb-2 font-bold">Leads</th>
                  <th className="pb-2 font-bold">Clientes</th>
                  <th className="pb-2 font-bold">Receita</th>
                  <th className="pb-2 font-bold">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((row) => (
                  <tr key={row.source} className="border-t border-border">
                    <td className="py-2 font-semibold text-foreground">{row.source}</td>
                    <td className="py-2 text-muted-foreground">{row.leads}</td>
                    <td className="py-2 text-muted-foreground">{row.clients}</td>
                    <td className="py-2 text-muted-foreground">{money(row.revenue)}</td>
                    <td className="py-2 text-muted-foreground">{row.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diário da LYA */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">Diário da LYA</p>
            <p className="text-[11px] text-muted-foreground">O que aconteceu no período selecionado.</p>
          </div>
        </div>
        {loadingLia ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : diaryEntries.length > 0 ? (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {diaryEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2.5 rounded-lg bg-muted px-2.5 py-2">
                <DiaryIcon kind={entry.kind} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">{entry.text}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(entry.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma atividade registrada neste período ainda.
          </p>
        )}
      </div>
    </div>
  );
}

function DiaryIcon({ kind }: { kind: DiaryEntry["kind"] }) {
  const map = {
    automation: { Icon: Zap, className: "text-primary" },
    field_change: { Icon: ArrowRightLeft, className: "text-blue-500" },
    interest: { Icon: Heart, className: "text-pink-500" },
    note: { Icon: StickyNote, className: "text-yellow-600" },
  } as const;
  const { Icon, className } = map[kind];
  return <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} />;
}

function InsightCard({
  icon,
  tag,
  title,
  detail,
  muted,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  detail: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border p-3 ${muted ? "bg-muted/50" : "bg-primary-soft"}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold ${muted ? "text-muted-foreground" : "text-primary"}`}>
        {icon}
        {tag}
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
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
