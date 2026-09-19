"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
  Loader2Icon,
  FilterIcon,
  PlusIcon,
  Trash2Icon,
  RefreshCwIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  FileTextIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SourceRule {
  keyword: string;
  source: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function RelatoriosPage() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab State: "dashboard" | "rules" | "reports"
  const [activeTab, setActiveTab] = useState<"dashboard" | "rules" | "reports">("dashboard");

  // Filters State
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sourceFilter, setSourceFilter] = useState("all");
  const [procedureFilter, setProcedureFilter] = useState("all");

  // Raw Database Data
  const [contacts, setContacts] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);

  // Unique sources & procedures lists for filters
  const [allSources, setAllSources] = useState<string[]>([]);
  const [allProcedures, setAllProcedures] = useState<string[]>([]);

  // Source Rules Configuration State
  const [sourceRules, setSourceRules] = useState<SourceRule[]>([]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [newSource, setNewSource] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  // Metrics Reports Configuration State
  const [metricReportsConfig, setMetricReportsConfig] = useState<any>({
    enabled: false,
    time: "17:00",
    recipient_phone: "",
    frequency: ["daily"],
  });

  // Load Data function
  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch raw datasets for processing
      const [conRes, appRes, procRes, dealsRes, timelineRes, profsRes, configRes, quotesRes] = await Promise.all([
        supabase.from("contacts").select("*").eq("account_id", accountId),
        supabase.from("appointments").select("*").eq("clinic_id", accountId),
        supabase.from("procedures").select("*").eq("clinic_id", accountId),
        supabase.from("deals").select("*").eq("account_id", accountId),
        supabase.from("contact_timeline").select("*").eq("account_id", accountId),
        supabase.from("profiles").select("user_id, full_name").eq("account_id", accountId),
        supabase.from("whatsapp_config").select("id, source_rules, metric_reports_config").limit(1).maybeSingle(),
        supabase.from("quotes").select("*").eq("account_id", accountId),
      ]);

      if (conRes.error) throw conRes.error;
      if (appRes.error) throw appRes.error;
      if (procRes.error) throw procRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (timelineRes.error) throw timelineRes.error;
      if (profsRes.error) throw profsRes.error;

      setContacts(conRes.data || []);
      setAppointments(appRes.data || []);
      setProcedures(procRes.data || []);
      setDeals(dealsRes.data || []);
      setTimelineEvents(timelineRes.data || []);
      setProfessionals(profsRes.data || []);
      setQuotes(quotesRes.data || []);

      // Config & Source rules settings
      if (configRes.data) {
        setConfigId(configRes.data.id);
        const rules = configRes.data.source_rules;
        setSourceRules(Array.isArray(rules) ? rules : []);
        
        const repConf = configRes.data.metric_reports_config;
        if (repConf) {
          setMetricReportsConfig({
            enabled: !!repConf.enabled,
            time: repConf.time || "17:00",
            recipient_phone: repConf.recipient_phone || "",
            frequency: Array.isArray(repConf.frequency) ? repConf.frequency : ["daily"],
          });
        }
      }

      // Populate filter option lists
      const sourcesSet = new Set<string>();
      (conRes.data || []).forEach((c) => {
        if (c.source) sourcesSet.add(c.source);
      });
      setAllSources(Array.from(sourcesSet));

      const proceduresSet = new Set<string>();
      (procRes.data || []).forEach((p) => {
        if (p.name) proceduresSet.add(p.name);
      });
      setAllProcedures(Array.from(proceduresSet));

    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar dados do dashboard de indicadores: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Source Rules Save
  const handleSaveRules = async (rulesToSave = sourceRules) => {
    if (!configId) {
      // Find user id to insert a whatsapp config if none exists
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      
      setSavingRules(true);
      const { data: newConf, error: insErr } = await supabase
        .from("whatsapp_config")
        .insert({
          user_id: userData.user.id,
          phone_number_id: "auto-setup",
          access_token: "auto-setup",
          source_rules: rulesToSave,
        })
        .select("id")
        .single();
      
      setSavingRules(false);
      if (insErr) {
        toast.error("Erro ao registrar automação de origens: " + insErr.message);
      } else {
        setConfigId(newConf.id);
        toast.success("Automação de origens salva com sucesso!");
      }
      return;
    }

    setSavingRules(true);
    const { error: updErr } = await supabase
      .from("whatsapp_config")
      .update({ source_rules: rulesToSave })
      .eq("id", configId);

    setSavingRules(false);
    if (updErr) {
      toast.error("Erro ao atualizar regras: " + updErr.message);
    } else {
      toast.success("Regras de origens salvas com sucesso!");
    }
  };

  const handleAddRule = () => {
    if (!newKeyword.trim() || !newSource.trim()) {
      toast.error("Preencha a palavra-chave e a origem correspondente!");
      return;
    }
    const updated = [...sourceRules, { keyword: newKeyword.trim(), source: newSource.trim() }];
    setSourceRules(updated);
    setNewKeyword("");
    setNewSource("");
    handleSaveRules(updated);
  };

  const handleRemoveRule = (index: number) => {
    const updated = sourceRules.filter((_, idx) => idx !== index);
    setSourceRules(updated);
    handleSaveRules(updated);
  };

  const handleSaveReportConfig = async () => {
    if (!configId) {
      toast.error("Configuração do WhatsApp não encontrada.");
      return;
    }
    setSavingRules(true);
    const { error: updErr } = await supabase
      .from("whatsapp_config")
      .update({ metric_reports_config: metricReportsConfig })
      .eq("id", configId);

    setSavingRules(false);
    if (updErr) {
      toast.error("Erro ao atualizar configurações de relatórios: " + updErr.message);
    } else {
      toast.success("Configurações de relatórios salvas com sucesso!");
    }
  };

  // Processing indicators based on date filters and properties
  const getFilteredMetrics = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // include last day

    // Filter contacts/leads created in the period
    const filteredLeads = contacts.filter((c) => {
      const cDate = new Date(c.created_at);
      const dateOk = cDate >= start && cDate <= end;
      const typeOk = c.contact_type === "lead";
      const sourceOk = sourceFilter === "all" || c.source === sourceFilter;
      return dateOk && typeOk && sourceOk;
    });

    // Filter appointments in date range
    const filteredAppts = appointments.filter((a) => {
      const aDate = new Date(a.start_time);
      const dateOk = aDate >= start && aDate <= end;
      const procOk = procedureFilter === "all" || a.type === procedureFilter;
      // If contact source matches source filter
      let sourceOk = true;
      if (sourceFilter !== "all" && a.patient_id) {
        const contact = contacts.find((c) => c.id === a.patient_id);
        sourceOk = contact?.source === sourceFilter;
      }
      return dateOk && procOk && sourceOk;
    });

    // Sub-status of appointments
    const comparecimentos = filteredAppts.filter((a) => a.status === "completed" || a.status === "confirmed").length;
    const cancelamentos = filteredAppts.filter((a) => a.status === "cancelled" || a.status === "no_show").length;
    const reagendamentos = filteredAppts.filter((a) => a.status === "provisional").length;

    // Resgates Concluídos (timeline payments within date range)
    const rescues = timelineEvents.filter((e) => {
      const eDate = new Date(e.created_at);
      const inDate = eDate >= start && eDate <= end;
      const isRescue = e.event_type === "payment" || e.event_type === "appointment_confirmed";
      return inDate && isRescue;
    }).length;

    // Objeções do Período (deals created in date range)
    const objectionsMap: Record<string, number> = {};
    deals.forEach((d) => {
      const dDate = new Date(d.created_at);
      if (dDate >= start && dDate <= end && d.main_objection) {
        objectionsMap[d.main_objection] = (objectionsMap[d.main_objection] || 0) + 1;
      }
    });
    const topObjections = Object.entries(objectionsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Bookings per Professional
    const profsMap: Record<string, string> = {};
    professionals.forEach((p) => {
      profsMap[p.user_id] = p.full_name;
    });

    const profBookingsMap: Record<string, number> = {};
    filteredAppts.forEach((a) => {
      if (a.professional_id) {
        const name = profsMap[a.professional_id] || "Profissional Clínico";
        profBookingsMap[name] = (profBookingsMap[name] || 0) + 1;
      }
    });
    const bookingsByProf = Object.entries(profBookingsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Bookings per Procedure/Service
    const procBookingsMap: Record<string, number> = {};
    filteredAppts.forEach((a) => {
      if (a.type) {
        procBookingsMap[a.type] = (procBookingsMap[a.type] || 0) + 1;
      }
    });
    const bookingsByProc = Object.entries(procBookingsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Desempenho de Origens/Campanhas (leads count in current period vs previous period of same duration)
    const durationMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - durationMs);
    const prevEnd = new Date(start.getTime() - 1);

    const currentSourceMap: Record<string, number> = {};
    contacts.forEach((c) => {
      const cDate = new Date(c.created_at);
      if (cDate >= start && cDate <= end && c.contact_type === "lead" && c.source) {
        currentSourceMap[c.source] = (currentSourceMap[c.source] || 0) + 1;
      }
    });

    const prevSourceMap: Record<string, number> = {};
    contacts.forEach((c) => {
      const cDate = new Date(c.created_at);
      if (cDate >= prevStart && cDate <= prevEnd && c.contact_type === "lead" && c.source) {
        prevSourceMap[c.source] = (prevSourceMap[c.source] || 0) + 1;
      }
    });

    const allDetectedSources = Array.from(new Set([...Object.keys(currentSourceMap), ...Object.keys(prevSourceMap)]));
    const campaignsPerformance = allDetectedSources.map((name) => {
      const curr = currentSourceMap[name] || 0;
      const prev = prevSourceMap[name] || 0;
      const delta = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
      return { name, current: curr, previous: prev, delta };
    }).sort((a, b) => b.current - a.current);

    // Follow-ups de Resgates Concluídos (timeline audits)
    const successFollowups = timelineEvents
      .filter((e) => {
        const eDate = new Date(e.created_at);
        return eDate >= start && eDate <= end && e.event_type === "payment";
      })
      .map((e) => {
        const contact = contacts.find((c) => c.id === e.contact_id);
        return {
          id: e.id,
          contactName: contact?.name || "Paciente",
          description: e.description || "Pagamento recebido",
          date: new Date(e.created_at).toLocaleDateString("pt-BR"),
        };
      })
      .slice(0, 5);

    // Quotes (Orçamentos) sent/accepted in the filtered period — same
    // date range as everything else on this page, via sent_at.
    const filteredQuotes = quotes.filter((q) => {
      if (!q.sent_at) return false;
      const qDate = new Date(q.sent_at);
      return qDate >= start && qDate <= end;
    });
    const quotesSent = filteredQuotes.length;
    const quotesAccepted = filteredQuotes.filter((q) => q.status === "accepted").length;
    const quotesRejected = filteredQuotes.filter((q) => q.status === "rejected").length;
    const quotesPotentialValue = filteredQuotes.reduce((s, q) => s + (Number(q.total_value) || 0), 0);
    const quotesAcceptedValue = filteredQuotes
      .filter((q) => q.status === "accepted")
      .reduce((s, q) => s + (Number(q.total_value) || 0), 0);
    const quotesConversionRate = quotesSent > 0 ? Math.round((quotesAccepted / quotesSent) * 100) : 0;

    return {
      leadCount: filteredLeads.length,
      apptCount: filteredAppts.length,
      comparecimentos,
      cancelamentos,
      reagendamentos,
      rescues,
      topObjections,
      bookingsByProf,
      bookingsByProc,
      campaignsPerformance,
      successFollowups,
      quotesSent,
      quotesAccepted,
      quotesRejected,
      quotesPotentialValue,
      quotesAcceptedValue,
      quotesConversionRate,
    };
  };

  const metrics = getFilteredMetrics();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[300px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicadores & Métricas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o desempenho de captação, agendamentos por profissional e origens de leads.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-1 border-b border-border self-start md:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Métricas & Indicadores
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === "rules" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cadastro de Origens (WhatsApp)
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === "reports" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Relatórios Automáticos (WhatsApp)
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Tab Content: Dashboard ── */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-card border border-border rounded-xl p-4 items-end">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Data Início</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Data Fim</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Origem (Source)</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs cursor-pointer"
              >
                <option value="all">Todas as Origens</option>
                {allSources.map((src) => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Procedimento</label>
              <select
                value={procedureFilter}
                onChange={(e) => setProcedureFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs cursor-pointer"
              >
                <option value="all">Todos Procedimentos</option>
                {allProcedures.map((proc) => (
                  <option key={proc} value={proc}>{proc}</option>
                ))}
              </select>
            </div>
            <button
              onClick={loadData}
              className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-foreground text-background font-semibold hover:opacity-90 transition-opacity text-xs cursor-pointer w-full"
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
              Sincronizar Dados
            </button>
          </div>

          {/* Primary KPI Strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider">Número de Leads</span>
                <UsersIcon className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-black text-foreground">{metrics.leadCount}</p>
              <p className="text-[10px] text-muted-foreground">Novos no período</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider">Agendamentos</span>
                <CalendarIcon className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-black text-foreground">{metrics.apptCount}</p>
              <p className="text-[10px] text-muted-foreground">Agendados no período</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider">Comparecimentos</span>
                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-foreground">{metrics.comparecimentos}</p>
              <p className="text-[10px] text-muted-foreground">Atendimentos concluídos</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider">Cancelamentos</span>
                <XCircleIcon className="h-4 w-4 text-rose-500" />
              </div>
              <p className="text-2xl font-black text-foreground">{metrics.cancelamentos}</p>
              <p className="text-[10px] text-muted-foreground">Consultas desmarcadas</p>
            </div>
          </div>

          {/* Secondary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reagendamentos (Provisórios)</span>
                <p className="text-xl font-bold mt-1 text-amber-500">{metrics.reagendamentos} consultas</p>
              </div>
              <RefreshCwIcon className="h-7 w-7 text-amber-500/25" />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Resgates Concluídos (Timeline)</span>
                <p className="text-xl font-bold mt-1 text-emerald-500">{metrics.rescues} resgates</p>
              </div>
              <TrendingUpIcon className="h-7 w-7 text-emerald-500/25" />
            </div>
          </div>

          {/* Orçamentos */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Orçamentos</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Enviados</span>
                  <FileTextIcon className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-2xl font-black text-foreground">{metrics.quotesSent}</p>
                <p className="text-[10px] text-muted-foreground">No período</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Aceitos</span>
                  <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-2xl font-black text-foreground">{metrics.quotesAccepted}</p>
                <p className="text-[10px] text-muted-foreground">{metrics.quotesConversionRate}% de conversão</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Recusados</span>
                  <XCircleIcon className="h-4 w-4 text-rose-500" />
                </div>
                <p className="text-2xl font-black text-foreground">{metrics.quotesRejected}</p>
                <p className="text-[10px] text-muted-foreground">No período</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Valor Potencial</span>
                  <DollarSignIcon className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-lg font-black text-foreground">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metrics.quotesPotentialValue)}
                </p>
                <p className="text-[10px] text-emerald-600">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metrics.quotesAcceptedValue)} aceito
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Lists */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bookings by Professional */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Agendamentos por Profissional</h3>
              <div className="divide-y divide-border/50">
                {metrics.bookingsByProf.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum profissional com agendamentos no período.</p>
                ) : (
                  metrics.bookingsByProf.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="font-mono font-bold">{p.count} agendamento(s)</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bookings by Procedure */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Agendamentos por Procedimento / Serviço</h3>
              <div className="divide-y divide-border/50">
                {metrics.bookingsByProc.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum procedimento agendado no período.</p>
                ) : (
                  metrics.bookingsByProc.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="font-mono font-bold">{p.count} consulta(s)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Objections + Source Performance */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Top Objections */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 lg:col-span-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-500">Principais Objeções do Período</h3>
              <div className="divide-y divide-border/50">
                {metrics.topObjections.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">Nenhuma objeção mapeada pela IA.</p>
                ) : (
                  metrics.topObjections.map((obj, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="font-medium text-foreground capitalize">{obj.name}</span>
                      <span className="font-mono font-bold text-rose-500">{obj.count} lead(s)</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Source/Campaign Performance */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 lg:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Desempenho de Origens / Campanhas</h3>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                      <th className="px-4 py-2 font-bold">Origem/Campanha</th>
                      <th className="px-4 py-2 text-center font-bold">Período Atual</th>
                      <th className="px-4 py-2 text-center font-bold">Período Anterior</th>
                      <th className="px-4 py-2 text-right font-bold">Crescimento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {metrics.campaignsPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-xs text-muted-foreground italic">Nenhuma campanha cadastrada trouxe leads no período.</td>
                      </tr>
                    ) : (
                      metrics.campaignsPerformance.map((src, idx) => {
                        const positive = src.delta >= 0;
                        return (
                          <tr key={idx} className="hover:bg-muted/10">
                            <td className="px-4 py-2.5 font-semibold text-foreground">{src.name}</td>
                            <td className="px-4 py-2.5 text-center font-mono">{src.current} leads</td>
                            <td className="px-4 py-2.5 text-center font-mono">{src.previous} leads</td>
                            <td className={`px-4 py-2.5 text-right font-bold font-mono ${positive ? "text-emerald-500" : "text-rose-500"}`}>
                              {positive ? "+" : ""}{src.delta}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Success Followups (Resgates) */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Follow-ups de Resgates Bem Sucedidos</h3>
            <div className="divide-y divide-border/50">
              {metrics.successFollowups.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum pagamento/resgate registrado no período.</p>
              ) : (
                metrics.successFollowups.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{f.contactName}</p>
                      <p className="text-[10px] text-muted-foreground">{f.description}</p>
                    </div>
                    <span className="font-mono text-muted-foreground">{f.date}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Rules ── */}
      {activeTab === "rules" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">Regras de Origem por Palavra-Chave (WhatsApp)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defina palavras-chave que novos leads costumam enviar ao iniciar o contato para atribuir automaticamente a origem/campanha correspondente.
            </p>
          </div>

          {/* Existing Rules List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Automações Ativas</h4>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                    <th className="px-6 py-3 font-bold">Se a mensagem inicial contiver:</th>
                    <th className="px-6 py-3 font-bold">Definir origem para:</th>
                    <th className="px-6 py-3 text-right font-bold">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sourceRules.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-xs text-muted-foreground italic">
                        Nenhuma automação de origem configurada.
                      </td>
                    </tr>
                  ) : (
                    sourceRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-6 py-3 font-mono font-semibold text-foreground">"{rule.keyword}"</td>
                        <td className="px-6 py-3 text-blue-500 font-bold">{rule.source}</td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleRemoveRule(idx)}
                            className="rounded-lg text-rose-500 hover:bg-rose-500/10 p-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* New Rule Creation Form */}
          <div className="border-t border-border pt-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Adicionar Nova Automação</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Se a mensagem contiver (Palavra-Chave)</label>
                <Input
                  placeholder="ex: 'Oi Campanha X'"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  className="bg-background text-xs focus-visible:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Origem do Lead</label>
                <Input
                  placeholder="ex: 'Campanha X'"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="bg-background text-xs focus-visible:border-primary"
                />
              </div>
            </div>
            <button
              onClick={handleAddRule}
              disabled={savingRules}
              className="flex items-center justify-center gap-1.5 px-4 h-9 rounded-lg bg-foreground text-background font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity text-xs cursor-pointer"
            >
              {savingRules ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusIcon className="h-3.5 w-3.5" />
              )}
              Adicionar Automação
            </button>
          </div>
        </div>
      )}

      {/* ── Tab Content: Reports ── */}
      {activeTab === "reports" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">Relatórios de Métricas Automáticos via WhatsApp</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receba resumos diários, quinzenais ou mensais de leads capturados, agendamentos, conversões e atendimentos diretamente no WhatsApp da gerência.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-bold text-foreground">Ativar Relatórios Automáticos</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Habilita o envio automático de relatórios com as métricas da clínica.</p>
              </div>
              <input
                type="checkbox"
                checked={metricReportsConfig.enabled}
                onChange={(e) => setMetricReportsConfig({ ...metricReportsConfig, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            {/* Recipient Phone */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Telefone Destinatário (WhatsApp com DDI + DDD)</label>
              <Input
                placeholder="ex: 5521999999999"
                value={metricReportsConfig.recipient_phone}
                onChange={(e) => setMetricReportsConfig({ ...metricReportsConfig, recipient_phone: e.target.value.replace(/\D/g, "") })}
                className="bg-background text-xs focus-visible:border-primary"
              />
            </div>

            {/* Time selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Horário do Disparo</label>
              <select
                value={metricReportsConfig.time}
                onChange={(e) => setMetricReportsConfig({ ...metricReportsConfig, time: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs cursor-pointer focus-visible:border-primary"
              >
                {Array.from({ length: 24 }).map((_, idx) => {
                  const hr = String(idx).padStart(2, "0") + ":00";
                  return <option key={hr} value={hr}>{hr}</option>;
                })}
              </select>
            </div>

            {/* Frequencies checkboxes */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Frequências de Envio</label>
              <div className="flex gap-4">
                {[
                  { key: "daily", label: "Diário" },
                  { key: "biweekly", label: "Quinzenal (dias 15 e 30)" },
                  { key: "monthly", label: "Mensal (dia 01)" },
                ].map((freq) => {
                  const isChecked = metricReportsConfig.frequency?.includes(freq.key);
                  return (
                    <label key={freq.key} className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          let updated = [...(metricReportsConfig.frequency || [])];
                          if (e.target.checked) {
                            if (!updated.includes(freq.key)) updated.push(freq.key);
                          } else {
                            updated = updated.filter((k: string) => k !== freq.key);
                          }
                          setMetricReportsConfig({ ...metricReportsConfig, frequency: updated });
                        }}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                      {freq.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveReportConfig}
              disabled={savingRules}
              className="flex items-center justify-center gap-1.5 px-4 h-9 rounded-lg bg-foreground text-background font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity text-xs cursor-pointer"
            >
              {savingRules ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              )}
              Salvar Configuração
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
