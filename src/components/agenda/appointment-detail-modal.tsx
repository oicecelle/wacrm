"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  XIcon,
  Loader2Icon,
  CalendarIcon,
  ClipboardIcon,
  ActivityIcon,
  DollarSignIcon,
  PackageIcon,
  FileTextIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircle2Icon,
  PlusIcon,
  SaveIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PackageProgressRing } from "@/components/ui/package-progress-ring";

/* ─── Types ──────────────────────────────────────────────── */
interface Appointment {
  id: string;
  patient_id: string;
  start_time: string;
  end_time: string;
  status: string;
  type: string | null;
  notes: string | null;
  professional_id: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface PatientPackage {
  id: string;
  package_name: string;
  sessions_total: number;
  sessions_used: number;
  expires_at: string | null;
  status: string;
  value_paid: number;
}

interface MedicalRecord {
  id: string;
  record_date: string;
  observations: string;
  procedure: string | null;
  professional_name: string | null;
}

interface EvolucaoEntry {
  id?: string;
  created_at: string;
  note_text: string;
  note_type: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  status: string;
}

interface AppointmentModalProps {
  open: boolean;
  appointmentId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}

type TabKey = "info" | "prontuario" | "evolucao" | "financeiro" | "pacotes";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "info", label: "Agendamento", icon: CalendarIcon },
  { key: "prontuario", label: "Prontuário", icon: ClipboardIcon },
  { key: "evolucao", label: "Evolução", icon: ActivityIcon },
  { key: "financeiro", label: "Financeiro", icon: DollarSignIcon },
  { key: "pacotes", label: "Pacotes", icon: PackageIcon },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Agendado", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  confirmed: { label: "Confirmado", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  attended: { label: "Realizado", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  cancelled: { label: "Cancelado", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  no_show: { label: "Faltou", cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/* ─── Component ──────────────────────────────────────────── */
export function AppointmentDetailModal({ open, appointmentId, onClose, onUpdated }: AppointmentModalProps) {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [loading, setLoading] = useState(true);

  // Data
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [packages, setPackages] = useState<PatientPackage[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [evolucoes, setEvolucoes] = useState<EvolucaoEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Editing states
  const [savingStatus, setSavingStatus] = useState(false);
  const [newEvolucao, setNewEvolucao] = useState("");
  const [savingEvolucao, setSavingEvolucao] = useState(false);
  const [newProntuario, setNewProntuario] = useState("");
  const [savingProntuario, setSavingProntuario] = useState(false);

  /* ─── Load all appointment data ─────────────────────────── */
  const loadData = useCallback(async () => {
    if (!appointmentId || !accountId) return;
    setLoading(true);
    try {
      // Appointment
      const { data: appt } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .single();

      if (!appt) return;
      setAppointment(appt);

      // Contact
      if (appt.patient_id) {
        const { data: c } = await supabase
          .from("contacts")
          .select("id, name, phone, email")
          .eq("id", appt.patient_id)
          .single();
        setContact(c);

        // Evolução (contact_notes with note_type)
        const { data: evo } = await supabase
          .from("contact_notes")
          .select("id, created_at, note_text, note_type")
          .eq("contact_id", appt.patient_id)
          .order("created_at", { ascending: false });
        setEvolucoes((evo || []).map(e => ({
          id: e.id,
          created_at: e.created_at,
          note_text: e.note_text,
          note_type: e.note_type || "note",
        })));

        // Packages
        const { data: pkgs } = await supabase
          .from("patient_packages")
          .select("*")
          .eq("contact_id", appt.patient_id)
          .eq("account_id", accountId);
        setPackages(pkgs || []);

        // Transactions tied to this contact
        const { data: txns } = await supabase
          .from("financial_transactions")
          .select("*")
          .eq("clinic_id", accountId)
          .eq("contact_id", appt.patient_id)
          .order("date", { ascending: false })
          .limit(10);
        setTransactions(txns || []);
      }
    } catch (err) {
      console.error("Error loading appointment data:", err);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, accountId, supabase]);

  useEffect(() => {
    if (open && appointmentId) {
      setActiveTab("info");
      loadData();
    }
  }, [open, appointmentId, loadData]);

  /* ─── Actions ────────────────────────────────────────────── */
  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    setSavingStatus(true);
    const { error } = await supabase.from("appointments").update({ status: newStatus }).eq("id", appointment.id);
    if (error) toast.error("Erro ao atualizar status: " + error.message);
    else {
      toast.success("Status atualizado!");
      setAppointment({ ...appointment, status: newStatus });
      onUpdated?.();

      // Trigger Google Calendar sync
      fetch("/api/integrations/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          appointmentId: appointment.id,
        }),
      }).catch((err) => console.error("Error syncing Google Calendar update:", err));
    }
    setSavingStatus(false);
  };

  const handleAddEvolucao = async () => {
    if (!newEvolucao.trim() || !contact) return;
    setSavingEvolucao(true);
    const { error } = await supabase.from("contact_notes").insert({
      contact_id: contact.id,
      account_id: accountId,
      note_text: newEvolucao.trim(),
      note_type: "evolucao",
    });
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Evolução registrada!");
      setNewEvolucao("");
      await loadData();
    }
    setSavingEvolucao(false);
  };

  const handleAddProntuario = async () => {
    if (!newProntuario.trim() || !contact) return;
    setSavingProntuario(true);
    const { error } = await supabase.from("contact_notes").insert({
      contact_id: contact.id,
      account_id: accountId,
      note_text: newProntuario.trim(),
      note_type: "prontuario",
    });
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Registro de prontuário salvo!");
      setNewProntuario("");
      await loadData();
    }
    setSavingProntuario(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50 shrink-0">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Detalhes do Agendamento</p>
            <h2 className="text-sm font-black text-foreground mt-0.5">
              {contact?.name || "Carregando..."}
              {appointment && (
                <span className="ml-2 text-muted-foreground font-normal text-xs">
                  {fmtDate(appointment.start_time)} às {fmtTime(appointment.start_time)}
                </span>
              )}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-neutral-700">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-0 border-b border-neutral-100 shrink-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
                  activeTab === tab.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : !appointment ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <AlertCircleIcon className="h-6 w-6 mr-2" />
              <p className="text-sm">Agendamento não encontrado.</p>
            </div>
          ) : (
            <>
              {/* ── INFO TAB ────────────────────────────────── */}
              {activeTab === "info" && (
                <div className="p-6 space-y-5">
                  {/* Status selector */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Status do Atendimento</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => handleStatusChange(key)}
                          disabled={savingStatus}
                          className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                            appointment.status === key
                              ? cfg.cls + " shadow-sm scale-105"
                              : "bg-neutral-50 text-muted-foreground border-border hover:border-neutral-400"
                          }`}
                        >
                          {appointment.status === key && <CheckCircle2Icon className="h-3 w-3 inline mr-1" />}
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Appointment details grid */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">Paciente</p>
                      <p className="font-bold text-foreground">{contact?.name}</p>
                      <p className="text-muted-foreground text-xs">{contact?.phone}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">Procedimento</p>
                      <p className="font-bold text-foreground">{appointment.type || "Não especificado"}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">Data & Hora</p>
                      <p className="font-bold text-foreground">{fmtDate(appointment.start_time)}</p>
                      <p className="text-muted-foreground text-xs">{fmtTime(appointment.start_time)} — {fmtTime(appointment.end_time)}</p>
                    </div>
                    {appointment.notes && (
                      <div className="space-y-0.5 col-span-2">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Observações</p>
                        <p className="text-neutral-600 bg-neutral-50 rounded-lg p-3 text-xs leading-relaxed">{appointment.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PRONTUÁRIO TAB ──────────────────────────── */}
              {activeTab === "prontuario" && (
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Novo Registro de Prontuário</Label>
                    <textarea
                      value={newProntuario}
                      onChange={e => setNewProntuario(e.target.value)}
                      rows={4}
                      placeholder="Queixas, histórico, observações clínicas..."
                      className="w-full text-sm rounded-xl border border-border bg-neutral-50 px-4 py-3 focus:ring-1 focus:ring-blue-400 focus:outline-none resize-none"
                    />
                    <Button
                      onClick={handleAddProntuario}
                      disabled={savingProntuario || !newProntuario.trim()}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-9"
                    >
                      {savingProntuario ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <><SaveIcon className="h-4 w-4 mr-1.5" /> Salvar Registro</>}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {evolucoes.filter(e => e.note_type === "prontuario").length === 0 && (
                      <p className="text-xs text-muted-foreground italic text-center py-6">Nenhum registro de prontuário ainda.</p>
                    )}
                    {evolucoes.filter(e => e.note_type === "prontuario").map((entry, idx) => (
                      <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                        <p className="text-[10px] text-muted-foreground font-bold mb-1">
                          {fmtDate(entry.created_at)}
                        </p>
                        <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{entry.note_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── EVOLUÇÃO TAB ────────────────────────────── */}
              {activeTab === "evolucao" && (
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Nova Evolução</Label>
                    <textarea
                      value={newEvolucao}
                      onChange={e => setNewEvolucao(e.target.value)}
                      rows={3}
                      placeholder="Resultado do procedimento, resposta do paciente, próximos passos..."
                      className="w-full text-sm rounded-xl border border-border bg-neutral-50 px-4 py-3 focus:ring-1 focus:ring-blue-400 focus:outline-none resize-none"
                    />
                    <Button
                      onClick={handleAddEvolucao}
                      disabled={savingEvolucao || !newEvolucao.trim()}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-9"
                    >
                      {savingEvolucao ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <><PlusIcon className="h-4 w-4 mr-1.5" /> Registrar Evolução</>}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {evolucoes.filter(e => e.note_type !== "prontuario").length === 0 && (
                      <p className="text-xs text-muted-foreground italic text-center py-6">Nenhuma evolução registrada ainda.</p>
                    )}
                    {evolucoes.filter(e => e.note_type !== "prontuario").map((entry, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                          {idx < evolucoes.filter(e => e.note_type !== "prontuario").length - 1 && (
                            <div className="w-px flex-1 bg-neutral-200 mt-1" />
                          )}
                        </div>
                        <div className="pb-4 flex-1">
                          <p className="text-[10px] text-muted-foreground font-bold">{fmtDate(entry.created_at)}</p>
                          <p className="text-sm text-neutral-700 leading-relaxed mt-0.5 whitespace-pre-wrap">{entry.note_text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── FINANCEIRO TAB ──────────────────────────── */}
              {activeTab === "financeiro" && (
                <div className="p-6 space-y-4">
                  {transactions.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <DollarSignIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma transação registrada para este paciente.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                          <div>
                            <p className="text-sm font-bold text-foreground">{t.description}</p>
                            <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-black ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                              {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground capitalize">{t.status}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm font-black pt-2 border-t border-neutral-100">
                        <span className="text-neutral-600">Total receitas</span>
                        <span className="text-emerald-600">{fmt(transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PACOTES TAB ─────────────────────────────── */}
              {activeTab === "pacotes" && (
                <div className="p-6 space-y-3">
                  {packages.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <PackageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum pacote vinculado a este paciente.</p>
                    </div>
                  ) : (
                    packages.map((pkg) => {
                      return (
                        <div key={pkg.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <PackageProgressRing used={pkg.sessions_used} total={pkg.sessions_total} size={42} />
                              <div className="min-w-0">
                                <p className="text-sm font-black text-foreground truncate">{pkg.package_name}</p>
                                {pkg.expires_at && (
                                  <p className="text-xs text-muted-foreground">Válido até {fmtDate(pkg.expires_at)}</p>
                                )}
                              </div>
                            </div>
                            <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${
                              pkg.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : pkg.status === "completed" ? "bg-neutral-100 text-muted-foreground border-border"
                              : "bg-rose-50 text-rose-500 border-rose-200"
                            }`}>
                              {pkg.status === "active" ? "Ativo" : pkg.status === "completed" ? "Concluído" : pkg.status}
                            </span>
                          </div>

                          {/* Session progress */}
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{pkg.sessions_used} sessões realizadas</span>
                            <span>{pkg.sessions_total - pkg.sessions_used} restantes</span>
                          </div>

                          {pkg.value_paid > 0 && (
                            <p className="text-xs text-muted-foreground">Valor pago: <span className="font-bold text-neutral-700">{fmt(pkg.value_paid)}</span></p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50 shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {contact?.name} · {contact?.phone}
          </p>
          <button
            onClick={onClose}
            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
