"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CalendarCheck, CalendarX, Loader2, RefreshCcw, UserMinus, UserPlus, Wallet } from "lucide-react";

/**
 * "Meus Relatórios" — a professional's own performance: appointment
 * counts by outcome, commission earned, and simple client retention
 * (first-timers vs. people who stopped coming back).
 *
 * Every query below reads straight from `appointments` and
 * `commission_records` with no professional_id filter written here —
 * RLS (migration 069) already does that transparently. An account
 * with clinic_users.role = 'professional' only gets their own rows
 * back; everyone else (owner, admin, any other role) sees the whole
 * clinic. Same code, correct data either way — same pattern as
 * Minhas Comissões before this page absorbed it.
 */

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  start_time: string;
  status: string;
  was_rescheduled: boolean;
}

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

// A patient counts as "didn't come back" only once enough time has
// passed since their last visit to actually judge that — someone who
// came in last week hasn't had a fair chance to return yet.
const NO_RETURN_THRESHOLD_DAYS = 60;

function periodRange(period: Period): { start: Date | null; end: Date | null } {
  if (period === "all") return { start: null, end: null };
  const now = new Date();
  const monthOffset = period === "last_month" ? -1 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
  return { start, end };
}

export default function MeusRelatoriosPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [procedureNames, setProcedureNames] = useState<Record<string, string>>({});
  const [professionalNames, setProfessionalNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [isMultiProfessionalView, setIsMultiProfessionalView] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      setLoading(true);
      // Full history, not just the selected period: "first-timer" and
      // "didn't come back" both need to compare against a patient's
      // ENTIRE visit history with this professional, not just the
      // window currently being viewed.
      const [{ data: apptData }, { data: commData }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, patient_id, start_time, status, was_rescheduled")
          .eq("clinic_id", accountId)
          .order("start_time", { ascending: true }),
        supabase
          .from("commission_records")
          .select("id, amount, commission_type, commission_value, status, created_at, procedure_id, professional_id")
          .eq("clinic_id", accountId)
          .order("created_at", { ascending: false }),
      ]);

      const apptList = apptData || [];
      const commList = commData || [];
      setAppointments(apptList);
      setCommissions(commList);
      // Same signal as before: if RLS let more than one professional's
      // commission rows through, this account can see the whole clinic.
      setIsMultiProfessionalView(new Set(commList.map((r) => r.professional_id)).size > 1);

      const procIds = [...new Set(commList.map((r) => r.procedure_id).filter(Boolean))] as string[];
      const profIds = [...new Set(commList.map((r) => r.professional_id).filter(Boolean))];
      const [{ data: procs }, { data: profs }] = await Promise.all([
        procIds.length ? supabase.from("procedures").select("id, name").in("id", procIds) : Promise.resolve({ data: [] }),
        profIds.length ? supabase.from("clinic_users").select("id, name").in("id", profIds) : Promise.resolve({ data: [] }),
      ]);
      setProcedureNames(Object.fromEntries((procs || []).map((p: { id: string; name: string }) => [p.id, p.name])));
      setProfessionalNames(Object.fromEntries((profs || []).map((p: { id: string; name: string }) => [p.id, p.name])));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const { start, end } = useMemo(() => periodRange(period), [period]);
  const inPeriod = (iso: string) => {
    if (!start || !end) return true;
    const d = new Date(iso);
    return d >= start && d < end;
  };

  // ── Appointment outcome counts (by status, in the period) ──
  const apptStats = useMemo(() => {
    const inRange = appointments.filter((a) => inPeriod(a.start_time));
    return {
      attended: inRange.filter((a) => a.status === "attended").length,
      cancelled: inRange.filter((a) => a.status === "cancelled").length,
      noShow: inRange.filter((a) => a.status === "no_show").length,
      rescheduled: inRange.filter((a) => a.was_rescheduled).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, period]);

  // ── First-time vs. stopped-returning, per patient's FULL history ──
  const clientStats = useMemo(() => {
    const byPatient = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      if (!a.patient_id) continue;
      const list = byPatient.get(a.patient_id) ?? [];
      list.push(a);
      byPatient.set(a.patient_id, list);
    }

    let firstTimers = 0;
    let didNotReturn = 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - NO_RETURN_THRESHOLD_DAYS);

    for (const visits of byPatient.values()) {
      const attended = visits.filter((v) => v.status === "attended").sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (attended.length === 0) continue;

      const first = attended[0];
      if (inPeriod(first.start_time)) firstTimers++;

      const last = attended[attended.length - 1];
      const lastDate = new Date(last.start_time);
      if (inPeriod(last.start_time) && lastDate < cutoff) didNotReturn++;
    }
    return { firstTimers, didNotReturn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, period]);

  // ── Commission (same figures Minhas Comissões showed before) ──
  const filteredCommissions = useMemo(() => commissions.filter((c) => inPeriod(c.created_at)), [commissions, period]);
  const commissionTotal = filteredCommissions.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const commissionPaid = filteredCommissions.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const commissionPending = commissionTotal - commissionPaid;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
          <Wallet className="h-6 w-6 text-primary" /> Meus Relatórios
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMultiProfessionalView
            ? "Atendimentos e comissões de toda a equipe."
            : "Seus atendimentos e comissões."}
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Appointments */}
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Atendimentos</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-emerald-600" />
                  <p className="text-xl font-black text-emerald-700">{apptStats.attended}</p>
                </div>
                <p className="text-[10px] font-semibold text-emerald-800/70">Finalizados</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <CalendarX className="h-4 w-4 text-red-600" />
                  <p className="text-xl font-black text-red-700">{apptStats.cancelled}</p>
                </div>
                <p className="text-[10px] font-semibold text-red-800/70">Cancelados</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-amber-600" />
                  <p className="text-xl font-black text-amber-700">{apptStats.rescheduled}</p>
                </div>
                <p className="text-[10px] font-semibold text-amber-800/70">Remarcados</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <CalendarX className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xl font-black text-foreground">{apptStats.noShow}</p>
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground">Não compareceu</p>
              </div>
            </div>
          </div>

          {/* Clients */}
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Clientes</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <p className="text-xl font-black text-blue-700">{clientStats.firstTimers}</p>
                </div>
                <p className="text-[10px] font-semibold text-blue-800/70">Foram pela 1ª vez neste período</p>
              </div>
              <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-4 w-4 text-orange-600" />
                  <p className="text-xl font-black text-orange-700">{clientStats.didNotReturn}</p>
                </div>
                <p className="text-[10px] font-semibold text-orange-800/70">Última visita neste período, sem retorno</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              &quot;Sem retorno&quot; considera só quem já passou de {NO_RETURN_THRESHOLD_DAYS} dias desde a última visita — quem
              esteve há pouco tempo ainda não teve uma chance justa de voltar.
            </p>
          </div>

          {/* Commission */}
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Comissão</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                <p className="text-xl font-black text-foreground">{money(commissionTotal)}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Total no período</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
                <p className="text-xl font-black text-emerald-700">{money(commissionPaid)}</p>
                <p className="text-[10px] font-semibold text-emerald-800/70">Já pago</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
                <p className="text-xl font-black text-amber-700">{money(commissionPending)}</p>
                <p className="text-[10px] font-semibold text-amber-800/70">A pagar</p>
              </div>
            </div>
          </div>

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
                {filteredCommissions.map((r) => (
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
                {filteredCommissions.length === 0 && (
                  <tr>
                    <td colSpan={isMultiProfessionalView ? 6 : 5} className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                      Nenhuma comissão neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
