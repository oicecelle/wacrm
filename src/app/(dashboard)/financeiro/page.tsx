"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  PlusIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  DollarSignIcon,
  AlertTriangleIcon,
  MessageSquareIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  Loader2Icon,
  XIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* ─── Types ──────────────────────────────────────────────────── */
type TxType = "receita" | "despesa" | "sinal";
type TxStatus = "paid" | "pending" | "overdue";
type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro" | "transferencia";

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  method: PaymentMethod;
  type: TxType;
  value: number;
  status: TxStatus;
  contactName?: string;
  installments?: { total: number; paid: number };
}

interface Package {
  id: string;
  contactName: string;
  procedure: string;
  totalSessions: number;
  remainingSessions: number;
  expiresAt: string;
  status: "active" | "completed" | "expired";
  warningDays?: number;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  credito: "Cartão Créd.",
  debito: "Cartão Déb.",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};

/* ─── KPI card ───────────────────────────────────────────────── */
function KpiCard({ label, value, sub, delta, icon: Icon, color }: {
  label: string; value: string; sub?: string; delta?: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {delta !== undefined && (
        <span className={`flex items-center gap-0.5 text-xs font-medium ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
          {delta >= 0 ? <ArrowUpRightIcon className="h-3 w-3" /> : <ArrowDownRightIcon className="h-3 w-3" />}
          {Math.abs(delta)}% vs mês anterior
        </span>
      )}
    </div>
  );
}

/* ─── Add transaction modal ───────────────────────────────────── */
function AddTransactionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient();
  const { profile, accountId } = useAuth();
  const [type, setType] = useState<TxType>("receita");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Procedimento");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [status, setStatus] = useState<TxStatus>("paid");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const fetchPatients = async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, name")
        .eq("clinic_id", accountId)
        .order("name");
      setPatients(data || []);
    };
    fetchPatients();
  }, [accountId, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !value || !description) return;

    setSaving(true);
    setError(null);
    const floatValue = parseFloat(value.replace(",", "."));

    try {
      const { error: insertErr } = await supabase
        .from("financial_transactions")
        .insert({
          clinic_id: accountId,
          patient_id: patientId || null,
          date: new Date().toISOString().slice(0, 10),
          description,
          category,
          method,
          type,
          value: floatValue,
          status,
        });

      if (insertErr) throw insertErr;

      // Add timeline log if associated with a patient
      if (patientId) {
        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "transaction_added",
          title: `Lançamento financeiro: R$ ${floatValue.toFixed(2)} (${type === 'receita' ? 'Entrada' : type === 'despesa' ? 'Saída' : 'Sinal'})`,
          payload: {
            description,
            recorded_by: profile?.full_name || "",
          },
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error inserting transaction:", err);
      setError(err.message || "Erro ao registrar lançamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Lançar Transação Financeira</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex rounded-xl border border-border overflow-hidden bg-muted/30">
          {(["receita", "despesa", "sinal"] as TxType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                if (t === "despesa") setCategory("Infraestrutura");
                else if (t === "sinal") setCategory("Sinal");
                else setCategory("Procedimento");
              }}
              className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "receita" ? "Receita" : t === "despesa" ? "Despesa" : "Sinal"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="tx-val" className="text-xs font-semibold">Valor (R$) *</Label>
            <Input
              id="tx-val"
              type="text"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              disabled={saving}
              className="text-lg font-bold"
            />
          </div>

          <div>
            <Label htmlFor="tx-desc" className="text-xs font-semibold">Descrição *</Label>
            <Input
              id="tx-desc"
              placeholder="Ex: Toxina Botulínica — Mariana"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-cat" className="text-xs font-semibold">Categoria</Label>
              <select
                id="tx-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {type === "receita" ? (
                  <>
                    <option value="Procedimento">Procedimento</option>
                    <option value="Consulta">Consulta</option>
                    <option value="Produto">Produto Estético</option>
                  </>
                ) : type === "despesa" ? (
                  <>
                    <option value="Insumos">Insumos Clínicos</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Salários">Salários/Comissão</option>
                    <option value="Marketing">Marketing</option>
                  </>
                ) : (
                  <option value="Sinal">Depósito Sinal</option>
                )}
              </select>
            </div>
            <div>
              <Label htmlFor="tx-method" className="text-xs font-semibold">Método</Label>
              <select
                id="tx-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="pix">Pix</option>
                <option value="credito">Cartão de Crédito</option>
                <option value="debito">Cartão de Débito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-pat" className="text-xs font-semibold">Associar Paciente</Label>
              <select
                id="tx-pat"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Nenhum (Geral)</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="tx-stat" className="text-xs font-semibold">Situação</Label>
              <select
                id="tx-stat"
                value={status}
                onChange={(e) => setStatus(e.target.value as TxStatus)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="paid">Pago / Compensado</option>
                <option value="pending">Pendente</option>
                <option value="overdue">Vencido / Atrasado</option>
              </select>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Registrar Lançamento"}
        </Button>
      </form>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────── */
export default function FinanceiroPage() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<"ledger" | "contas" | "pacotes" | "comissoes" | "previsibilidade" | "dre">("ledger");
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [futureReceivables, setFutureReceivables] = useState(0);
  const [professionals, setProfessionals] = useState<{ name: string; commission: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFinancialData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const clinicId = accountId;

      // 1. Fetch transactions
      const { data: txData, error: txErr } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("date", { ascending: false });

      if (txErr) throw txErr;

      // Fetch patient names
      const patientIds = (txData || [])
        .map((tx) => tx.patient_id)
        .filter((id): id is string => !!id);

      let patientsMap: Record<string, string> = {};
      if (patientIds.length > 0) {
        const { data: ptsData } = await supabase
          .from("patients")
          .select("id, name")
          .in("id", patientIds);
        (ptsData || []).forEach((p) => {
          patientsMap[p.id] = p.name;
        });
      }

      const formattedTx: Transaction[] = (txData || []).map((tx) => ({
        id: tx.id,
        date: tx.date ? new Date(tx.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—",
        description: tx.description,
        category: tx.category,
        method: tx.method as any,
        type: tx.type as any,
        value: Number(tx.value),
        status: tx.status as any,
        contactName: tx.patient_id ? patientsMap[tx.patient_id] : undefined,
        installments: tx.installments_total > 1 ? { total: tx.installments_total, paid: tx.installments_paid || 1 } : undefined,
      }));
      setTransactions(formattedTx);

      // 2. Fetch packages & patient packages
      const { data: pPkgsData, error: pPkgsErr } = await supabase
        .from("patient_packages")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("sold_at", { ascending: false });

      if (pPkgsErr) throw pPkgsErr;

      const ptPkgIds = (pPkgsData || []).map((p) => p.patient_id).filter((id): id is string => !!id);
      let pkgPatientsMap: Record<string, string> = {};
      if (ptPkgIds.length > 0) {
        const { data: ptsData } = await supabase
          .from("patients")
          .select("id, name")
          .in("id", ptPkgIds);
        (ptsData || []).forEach((p) => {
          pkgPatientsMap[p.id] = p.name;
        });
      }

      // Fetch package templates
      const { data: templData } = await supabase
        .from("packages")
        .select("id, name")
        .eq("clinic_id", clinicId);

      let templatesMap: Record<string, string> = {};
      (templData || []).forEach((t) => {
        templatesMap[t.id] = t.name;
      });

      const formattedPkgs: Package[] = (pPkgsData || []).map((pkg) => {
        const templName = templatesMap[pkg.package_id] || "Pacote de Sessões";
        const pctRemaining = pkg.sessions_total - pkg.sessions_used;

        let warningDays: number | undefined = undefined;
        if (pkg.expires_at) {
          const daysLeft = Math.ceil((new Date(pkg.expires_at).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
          if (daysLeft > 0 && daysLeft <= 30) {
            warningDays = daysLeft;
          }
        }

        return {
          id: pkg.id,
          contactName: pkg.patient_id ? pkgPatientsMap[pkg.patient_id] || "Paciente" : "Paciente",
          procedure: templName,
          totalSessions: pkg.sessions_total,
          remainingSessions: pctRemaining,
          expiresAt: pkg.expires_at ? new Date(pkg.expires_at).toLocaleDateString("pt-BR") : "—",
          status: pkg.status as any,
          warningDays,
        };
      });
      setPackages(formattedPkgs);

      // 3. Fetch future expected receivables (Previsão de Recebimentos Futuros)
      const { data: apptData } = await supabase
        .from("appointments")
        .select("start_time, type, status")
        .eq("clinic_id", clinicId)
        .gte("start_time", new Date().toISOString());

      const { data: procData } = await supabase
        .from("procedures")
        .select("name, price")
        .eq("clinic_id", clinicId);

      const procPrices: Record<string, number> = {};
      (procData || []).forEach((p) => {
        procPrices[p.name] = Number(p.price) || 0;
      });

      const calculatedFuture = (apptData || []).reduce((sum, appt) => {
        const price = procPrices[appt.type || ""] || 180; // default 180 se procedimento sem valor cadastrado
        return sum + price;
      }, 0);
      setFutureReceivables(calculatedFuture);

      // 4. Fetch clinic profiles to calculate professional commissions
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("account_id", clinicId);

      const computedReceita = (txData || [])
        .filter((t) => t.type === "receita" && t.status === "paid")
        .reduce((a, t) => a + Number(t.value), 0);

      const formattedCommissions = (teamMembers || []).map((m, idx) => {
        const seed = idx + 1;
        const share = teamMembers?.length ? seed / teamMembers.length : 1;
        const totalComm = (computedReceita * 0.15) * share; // comissão mockada baseada na receita real rateada
        return {
          name: m.full_name || "Profissional",
          commission: totalComm,
        };
      });
      setProfessionals(formattedCommissions);

    } catch (err) {
      console.error("Error loading financial stats:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  // Handle session decrement directly
  const handleConsumeSession = async (pkgId: string, total: number, remaining: number) => {
    if (remaining <= 0) return;
    const newUsed = total - remaining + 1;
    
    try {
      const { error } = await supabase
        .from("patient_packages")
        .update({
          sessions_used: newUsed,
          status: newUsed >= total ? "completed" : "active",
        })
        .eq("id", pkgId);

      if (error) throw error;
      
      // Refresh
      loadFinancialData();
    } catch (err) {
      console.error("Error decrementing session:", err);
      alert("Erro ao debitar sessão.");
    }
  };

  const receita = transactions.filter((t) => t.type === "receita" && t.status === "paid").reduce((a, t) => a + t.value, 0);
  const despesa = transactions.filter((t) => t.type === "despesa" && t.status === "paid").reduce((a, t) => a + t.value, 0);
  const sinais = transactions.filter((t) => t.type === "sinal" && t.status === "paid").reduce((a, t) => a + t.value, 0);
  const inadimplentes = transactions.filter((t) => t.status === "overdue");

  const filteredTx = typeFilter === "all" ? transactions : transactions.filter((t) => t.type === typeFilter);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const statusCls = {
    paid: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    pending: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    overdue: "text-destructive bg-destructive/10 border-destructive/30",
  };
  const statusLabel = { paid: "Pago", pending: "Pendente", overdue: "Vencido" };

  // Dynamic DRE metrics
  const totalFaturamento = receita + sinais;
  const mc = totalFaturamento - (receita * 0.05) - (receita * 0.15); // mock mc formula
  const lucro = mc - despesa;

  const dreRows = [
    { label: "Faturamento Bruto", value: totalFaturamento, type: "result" as const },
    { label: "Receita de Procedimentos", value: receita, indent: true },
    { label: "Sinais (Depósitos)", value: sinais, indent: true },
    { label: "(-) Custos Variáveis (taxas, impostos)", value: -(receita * 0.05), type: "cost" as const },
    { label: "(-) Comissões Profissionais", value: -(receita * 0.15), type: "cost" as const },
    { label: "Margem de Contribuição", value: mc, type: "result" as const },
    { label: "(-) Custos Fixos (aluguel, salários)", value: -despesa, type: "cost" as const },
    { label: "Lucro Líquido", value: lucro, type: "result" as const },
  ];

  return (
    <div className="space-y-6">
      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} onSuccess={loadFinancialData} />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Caixa, pacotes, parcelamentos e DRE em tempo real da clínica.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity cursor-pointer"
        >
          <PlusIcon className="h-4 w-4" />
          Lançar Transação
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Receita total" value={fmt(receita)} icon={TrendingUpIcon} color="text-emerald-600" />
            <KpiCard label="Despesas" value={fmt(despesa)} icon={TrendingDownIcon} color="text-destructive" />
            <KpiCard label="Caixa de Sinais" value={fmt(sinais)} sub="Depósitos de garantia" icon={DollarSignIcon} color="text-blue-500" />
            <KpiCard
              label="Inadimplência"
              value={`${inadimplentes.length} caso(s)`}
              sub="Parcelamentos vencidos"
              icon={AlertTriangleIcon}
              color="text-amber-500"
            />
          </div>

          {/* Overdue alerts */}
          {inadimplentes.length > 0 && (
            <div className="space-y-2">
              {inadimplentes.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <AlertTriangleIcon className="h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="font-semibold">{t.contactName || "Geral"}</span>
                    <span className="text-muted-foreground"> — {t.description} · {fmt(t.value)}</span>
                  </div>
                  <button className="shrink-0 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer">
                    <MessageSquareIcon className="h-3.5 w-3.5" />
                    Cobrar no WhatsApp
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {(["ledger", "contas", "pacotes", "comissoes", "previsibilidade", "dre"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px cursor-pointer shrink-0 ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "ledger"
                  ? "Fluxo de Caixa"
                  : tab === "contas"
                  ? "Contas a Pagar/Receber"
                  : tab === "pacotes"
                  ? "Sessões Pacotes"
                  : tab === "comissoes"
                  ? "Comissões"
                  : tab === "previsibilidade"
                  ? "Previsibilidade"
                  : "DRE (Resultado)"}
              </button>
            ))}
          </div>

          {/* ── Tab: Ledger ── */}
          {activeTab === "ledger" && (
            <div className="space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "receita", "despesa", "sinal"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      typeFilter === f ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {f === "all" ? "Todos" : f === "receita" ? "Receitas" : f === "despesa" ? "Despesas" : "Sinais"}
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Método</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredTx.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-xs text-muted-foreground italic">
                          Nenhum lançamento financeiro registrado.
                        </td>
                      </tr>
                    ) : (
                      filteredTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tx.date}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">{tx.description}</p>
                            {tx.contactName && (
                              <p className="text-xs text-muted-foreground">Paciente: {tx.contactName}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell capitalize">{tx.category}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{PAYMENT_LABELS[tx.method]}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusCls[tx.status]}`}>
                              {statusLabel[tx.status]}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${tx.type === "despesa" ? "text-rose-500" : "text-emerald-500"}`}>
                             {tx.type === "despesa" ? "-" : "+"}{fmt(tx.value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab: Contas a Pagar/Receber ── */}
          {activeTab === "contas" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contas a Receber (Receitas pendentes/atrasadas) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider">Contas a Receber</h3>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="px-4 py-2.5 text-left text-muted-foreground font-semibold">Vencimento/Descrição</th>
                        <th className="px-4 py-2.5 text-right text-muted-foreground font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {transactions.filter(t => (t.type === "receita" || t.type === "sinal") && t.status !== "paid").length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-center py-8 text-xs text-muted-foreground italic">
                            Nenhuma receita pendente.
                          </td>
                        </tr>
                      ) : (
                        transactions.filter(t => (t.type === "receita" || t.type === "sinal") && t.status !== "paid").map(t => (
                          <tr key={t.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground">{t.description}</p>
                              <p className="text-[10px] text-muted-foreground">Vencimento: {t.date} • {t.contactName ? `Paciente: ${t.contactName}` : "Geral"}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{fmt(t.value)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Contas a Pagar (Despesas pendentes/atrasadas) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-rose-500 uppercase tracking-wider">Contas a Pagar</h3>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="px-4 py-2.5 text-left text-muted-foreground font-semibold">Vencimento/Descrição</th>
                        <th className="px-4 py-2.5 text-right text-muted-foreground font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {transactions.filter(t => t.type === "despesa" && t.status !== "paid").length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-center py-8 text-xs text-muted-foreground italic">
                            Nenhuma despesa pendente.
                          </td>
                        </tr>
                      ) : (
                        transactions.filter(t => t.type === "despesa" && t.status !== "paid").map(t => (
                          <tr key={t.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground">{t.description}</p>
                              <p className="text-[10px] text-muted-foreground">Vencimento: {t.date}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-500">{fmt(t.value)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Pacotes ── */}
          {activeTab === "pacotes" && (
            <div className="space-y-3">
              {packages.length === 0 ? (
                <div className="text-center py-16 border border-dashed rounded-xl text-xs text-muted-foreground italic bg-card">
                  Nenhum pacote contratado por pacientes cadastrado ainda.
                </div>
              ) : (
                packages.map((pkg) => {
                  const pct = Math.round(((pkg.totalSessions - pkg.remainingSessions) / pkg.totalSessions) * 100);
                  return (
                    <div key={pkg.id} className={`rounded-xl border bg-card p-5 space-y-3 ${pkg.warningDays ? "border-amber-500/30" : "border-border"}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground">{pkg.procedure}</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              pkg.status === "active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" :
                              pkg.status === "completed" ? "border-border text-muted-foreground bg-muted" :
                              "border-destructive/30 text-destructive bg-destructive/10"
                            }`}>
                              {pkg.status === "active" ? "Ativo" : pkg.status === "completed" ? "Concluído" : "Vencido"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Paciente: {pkg.contactName} • Expira: {pkg.expiresAt}</p>
                        </div>
                        {pkg.status === "active" && pkg.remainingSessions > 0 && (
                          <button
                            onClick={() => handleConsumeSession(pkg.id, pkg.totalSessions, pkg.remainingSessions)}
                            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Consumir Sessão
                          </button>
                        )}
                      </div>
                      {pkg.warningDays && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600">
                          <AlertTriangleIcon className="h-3.5 w-3.5" />
                          Pacote vence em {pkg.warningDays} dias
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Sessões utilizadas</span>
                          <span className="font-bold text-foreground">
                            {pkg.totalSessions - pkg.remainingSessions}/{pkg.totalSessions}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct === 100 ? "bg-muted-foreground" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab: Comissões ── */}
          {activeTab === "comissoes" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="border-b border-border bg-muted/20 px-6 py-4">
                  <h2 className="text-sm font-bold text-foreground">Comissões Acumuladas</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Valores apurados para repasse profissional (calculado a 15% sobre procedimentos pagos)</p>
                </div>
                <div className="divide-y divide-border/50">
                  {professionals.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground italic">
                      Nenhum profissional cadastrado na clínica.
                    </div>
                  ) : (
                    professionals.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between px-6 py-4 text-xs hover:bg-muted/5 transition-colors">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">Taxa padrão: 15%</p>
                        </div>
                        <span className="font-mono font-bold text-sm text-foreground">{fmt(p.commission)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Previsibilidade ── */}
          {activeTab === "previsibilidade" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Previsão de Recebimentos Futuros</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Receita esperada baseada nos valores dos procedimentos de agendamentos futuros marcados</p>
                </div>
                <div className="flex items-center justify-between bg-primary/5 rounded-2xl border border-primary/20 p-5">
                  <div>
                    <p className="text-xs text-primary font-semibold uppercase tracking-wider">Faturamento Futuro Previsto</p>
                    <p className="text-3xl font-black text-primary mt-1">{fmt(futureReceivables)}</p>
                  </div>
                  <TrendingUpIcon className="h-10 w-10 text-primary opacity-60" />
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: DRE ── */}
          {activeTab === "dre" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border bg-muted/20 px-6 py-4">
                <h2 className="text-sm font-bold text-foreground">DRE — Mês Atual</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Demonstração de Resultado do Exercício consolidada</p>
              </div>
              <div className="divide-y divide-border/50 bg-card">
                {dreRows.map((row, i) => {
                  const isNeg = row.value < 0;
                  const isResult = row.type === "result";
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-6 py-3 text-xs ${isResult ? "bg-muted/10 font-bold text-foreground" : "text-foreground"}`}
                    >
                      <span className={`${(row as { indent?: boolean }).indent ? "pl-4 text-muted-foreground font-normal" : "font-medium"}`}>
                        {row.label}
                      </span>
                      {row.value !== 0 && (
                        <span className={`font-mono font-semibold ${
                          isResult ? (row.value >= 0 ? "text-emerald-600" : "text-destructive") : isNeg ? "text-destructive font-medium" : "text-foreground"
                        }`}>
                          {fmt(row.value)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
