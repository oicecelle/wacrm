"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Wallet } from "lucide-react";

/**
 * "Minhas Comissões" — a professional's own commission forecast.
 * Deliberately outside the `financeiro` permission gate: seeing your
 * own earnings isn't the same as seeing the clinic's whole revenue,
 * and every account (owner, admin, professional) should reach it.
 *
 * The query itself never filters by professional — RLS on
 * commission_records (migration 069) already does that transparently:
 * an account with clinic_users.role = 'professional' only gets their
 * own rows back; everyone else gets the whole clinic's. Same code,
 * correct data either way.
 */

interface CommissionRow {
  id: string;
  amount: number;
  commission_type: string;
  commission_value: number;
  status: string;
  created_at: string;
  procedure_id: string | null;
  professional_id: string;
}

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Period = "month" | "last_month" | "all";

export default function MinhasComissoesPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [procedureNames, setProcedureNames] = useState<Record<string, string>>({});
  const [professionalNames, setProfessionalNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [isMultiProfessionalView, setIsMultiProfessionalView] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("commission_records")
        .select("id, amount, commission_type, commission_value, status, created_at, procedure_id, professional_id")
        .eq("clinic_id", accountId)
        .order("created_at", { ascending: false });

      const list = data || [];
      setRows(list);
      // If RLS let more than one professional's rows through, this
      // account can see the whole clinic (owner/admin/etc) — worth
      // showing whose commission is whose in that case.
      setIsMultiProfessionalView(new Set(list.map((r) => r.professional_id)).size > 1);

      const procIds = [...new Set(list.map((r) => r.procedure_id).filter(Boolean))] as string[];
      const profIds = [...new Set(list.map((r) => r.professional_id).filter(Boolean))];
      const [{ data: procs }, { data: profs }] = await Promise.all([
        procIds.length ? supabase.from("procedures").select("id, name").in("id", procIds) : Promise.resolve({ data: [] }),
        profIds.length ? supabase.from("clinic_users").select("id, name").in("id", profIds) : Promise.resolve({ data: [] }),
      ]);
      setProcedureNames(Object.fromEntries((procs || []).map((p: { id: string; name: string }) => [p.id, p.name])));
      setProfessionalNames(Object.fromEntries((profs || []).map((p: { id: string; name: string }) => [p.id, p.name])));
      setLoading(false);
    })();
  }, [accountId]);

  const filteredRows = useMemo(() => {
    if (period === "all") return rows;
    const now = new Date();
    const target = period === "month" ? now.getMonth() : (now.getMonth() + 11) % 12;
    const targetYear = period === "last_month" && now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      return d.getMonth() === target && d.getFullYear() === targetYear;
    });
  }, [rows, period]);

  const total = filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalPaid = filteredRows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalPending = total - totalPaid;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
          <Wallet className="h-6 w-6 text-primary" /> Minhas Comissões
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMultiProfessionalView
            ? "Comissões de toda a equipe, calculadas a cada venda fechada."
            : "Suas comissões, calculadas a cada venda fechada."}
        </p>
      </div>

      <div className="flex gap-1.5">
        {([
          ["month", "Este mês"],
          ["last_month", "Mês passado"],
          ["all", "Tudo"],
        ] as [Period, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
              period === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-neutral-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xl font-black text-foreground">{money(total)}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Total no período</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <p className="text-xl font-black text-emerald-700">{money(totalPaid)}</p>
          <p className="text-[10px] font-semibold text-emerald-800/70">Já pago</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <p className="text-xl font-black text-amber-700">{money(totalPending)}</p>
          <p className="text-[10px] font-semibold text-amber-800/70">A pagar</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Data</th>
                {isMultiProfessionalView && (
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Profissional</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Procedimento</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Regra</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                  {isMultiProfessionalView && (
                    <td className="px-4 py-3 text-foreground">{professionalNames[r.professional_id] || "—"}</td>
                  )}
                  <td className="px-4 py-3 text-foreground">{r.procedure_id ? procedureNames[r.procedure_id] || "—" : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.commission_type === "percentage" ? `${r.commission_value}%` : money(r.commission_value) + " fixo"}
                  </td>
                  <td className="px-4 py-3 font-bold text-foreground">{money(Number(r.amount))}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.status === "paid" ? "Pago" : "Pendente"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={isMultiProfessionalView ? 6 : 5} className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                    Nenhuma comissão neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
