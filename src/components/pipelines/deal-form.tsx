"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type {
  Contact,
  Conversation,
  Deal,
  DealStatus,
  FollowupSettings,
  PipelineStage,
  Profile,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  DollarSign,
  Loader2,
  Sparkles,
  CalendarClock,
  BellRing,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  onSaved: () => void;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  onSaved,
}: DealFormProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  // AI/Copilot fields
  const [interest, setInterest] = useState("");
  const [temperature, setTemperature] = useState<"hot" | "warm" | "cold" | "">("");
  const [mainObjection, setMainObjection] = useState("");
  const [score, setScore] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [source, setSource] = useState("");
  // New CRM fields
  const [objections, setObjections] = useState<string[]>([]);
  const [objectionInput, setObjectionInput] = useState("");
  const [futureTaskDate, setFutureTaskDate] = useState("");
  const [futureTaskNote, setFutureTaskNote] = useState("");
  const [followupDateTime, setFollowupDateTime] = useState("");
  const [followupMessage, setFollowupMessage] = useState("");
  const [alertDate, setAlertDate] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [followupSettings, setFollowupSettings] = useState<FollowupSettings | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ""));
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? "");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
      setInterest(deal.interest ?? "");
      setTemperature(deal.temperature ?? "");
      setMainObjection(deal.main_objection ?? "");
      setScore(deal.score !== undefined && deal.score !== null ? String(deal.score) : "");
      setNextAction(deal.next_action ?? "");
      setSource(deal.source ?? "");
      setObjections(deal.objections ?? []);
      setFutureTaskDate(deal.future_task_date ? deal.future_task_date.substring(0, 10) : "");
      setFutureTaskNote(deal.future_task_note ?? "");
      setFollowupDateTime(deal.followup_scheduled_at ? deal.followup_scheduled_at.substring(0, 16) : "");
      setFollowupMessage(deal.followup_message ?? "");
      setAlertDate(deal.alert_scheduled_at ? deal.alert_scheduled_at.substring(0, 16) : "");
      setAlertNote(deal.alert_note ?? "");
    } else {
      setTitle("");
      setValue("");
      setCurrency(defaultCurrency);
      setContactId("");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
      setInterest("");
      setTemperature("");
      setMainObjection("");
      setScore("");
      setNextAction("");
      setSource("");
      setObjections([]);
      setFutureTaskDate("");
      setFutureTaskNote("");
      setFollowupDateTime("");
      setFollowupMessage("");
      setAlertDate("");
      setAlertNote("");
    }
  }, [open, deal, defaultStageId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load supporting data + followup settings once sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p, fs] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        fetch("/api/account/followup-settings").then(r => r.json()),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
      if (fs?.settings) setFollowupSettings(fs.settings);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error("Título, contato e etapa são obrigatórios");
      return;
    }
    setSaving(true);

    const payload = {
      title: title.trim(),
      value: parseFloat(value) || 0,
      currency,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
      interest: interest.trim() || null,
      temperature: temperature || null,
      main_objection: mainObjection.trim() || null,
      score: score ? parseInt(score, 10) : null,
      next_action: nextAction.trim() || null,
      source: source.trim() || null,
      objections: objections.length > 0 ? objections : [],
      future_task_date: futureTaskDate || null,
      future_task_note: futureTaskNote.trim() || null,
      followup_scheduled_at: followupDateTime || null,
      followup_type: followupDateTime ? 'manual' : null,
      followup_message: followupMessage.trim() || null,
      alert_scheduled_at: alertDate || null,
      alert_note: alertNote.trim() || null,
      // Auto-link conversation if contact has one
      conversation_id: linkedConversation?.id || null,
    };

    if (deal) {
      const { error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal.id)
        .eq("account_id", accountId ?? "");
      if (error) {
        toast.error("Falha ao salvar negócio");
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error("Sessão não autenticada");
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error("Seu perfil não está vinculado a uma conta.");
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("deals")
        .insert({ ...payload, user_id: user.id, account_id: accountId, status: "open" });
      if (error) {
        toast.error("Falha ao criar negócio");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(deal ? "Negócio atualizado" : "Negócio criado");
    onOpenChange(false);
    onSaved();
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update({ status })
      .eq("id", deal.id)
      .eq("account_id", accountId ?? "");
    setStatusAction(null);
    if (error) {
      toast.error("Falha ao atualizar status do negócio");
      return;
    }
    toast.success(
      status === "won" ? "Marcado como ganho" : status === "lost" ? "Marcado como perdido" : "Negócio reaberto",
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id).eq("account_id", accountId ?? "");
    setDeleting(false);
    if (error) {
      toast.error("Falha ao excluir negócio");
      return;
    }
    toast.success("Negócio excluído");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl h-[85vh] bg-popover border border-border shadow-2xl text-popover-foreground w-full p-0 overflow-hidden flex flex-col rounded-2xl z-50"
      >
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/50 p-4">
            <DialogTitle className="text-popover-foreground">
              {deal ? "Editar Negócio" : "Novo Negócio"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do negócio"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Contato</Label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione um contato</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone}
                  </option>
                ))}
              </select>

              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                >
                  <MessageSquare className="h-3 w-3" />
                  Link to Conversation
                </Link>
              )}
            </div>

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Valor</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                    className="border-border bg-muted pl-7 text-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Moeda</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Data Prevista de Fechamento</Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Etapa</Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Atribuído a</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Não atribuído</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            {/* AI / Copilot Fields Group */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3.5">
              <p className="text-xs font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                🤖 Copiloto IA & CRM Inteligente
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Temperatura</Label>
                  <select
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value as any)}
                    className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none"
                  >
                    <option value="">Nenhuma</option>
                    <option value="hot">🔥 Hot (Quente)</option>
                    <option value="warm">⚡ Warm (Morno)</option>
                    <option value="cold">❄️ Cold (Frio)</option>
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Engajamento Score (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="0-100"
                    className="border-border bg-card text-xs h-9 text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Interesse</Label>
                  <Input
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    placeholder="Ex: Toxina Botulínica"
                    className="border-border bg-card text-xs h-9 text-foreground"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Origem do Lead</Label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none"
                  >
                    <option value="">Selecione...</option>
                    {(followupSettings?.lead_sources ?? ['WhatsApp Orgânico','Instagram','Indicação','Site','Google','TikTok']).map((s: string) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Objeção Principal</Label>
                <Input
                  value={mainObjection}
                  onChange={(e) => setMainObjection(e.target.value)}
                  placeholder="Ex: Achou o preço alto"
                  className="border-border bg-card text-xs h-9 text-foreground"
                />
              </div>

              {/* Objeções múltiplas (tags) */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Objeções (múltiplas)</Label>
                <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 rounded-lg border border-border bg-card">
                  {objections.map((obj, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                      {obj}
                      <button type="button" onClick={() => setObjections(prev => prev.filter((_, idx) => idx !== i))} className="ml-0.5 hover:text-red-900">×</button>
                    </span>
                  ))}
                  <input
                    value={objectionInput}
                    onChange={e => setObjectionInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && objectionInput.trim()) {
                        e.preventDefault();
                        setObjections(prev => [...prev, objectionInput.trim()]);
                        setObjectionInput('');
                      }
                    }}
                    placeholder="Digite e pressione Enter..."
                    className="flex-1 min-w-[120px] text-xs outline-none bg-transparent"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Próxima Ação</Label>
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Ex: Enviar proposta de parcelamento na segunda"
                  className="border-border bg-card text-xs h-9 text-foreground"
                />
              </div>
            </div>

            {/* Follow-up Section */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <p className="text-xs font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" /> Follow-up Programado
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Data e Hora</Label>
                  <Input
                    type="datetime-local"
                    value={followupDateTime}
                    onChange={e => setFollowupDateTime(e.target.value)}
                    className="border-border bg-card text-xs h-9 text-foreground"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generatingAI || !contactId}
                    onClick={async () => {
                      setGeneratingAI(true);
                      try {
                        const contact = contacts.find(c => c.id === contactId);
                        const res = await fetch('/api/ai/followup-suggestion', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            contact_name: contact?.name || contact?.phone || 'lead',
                            deal_title: title,
                          }),
                        });
                        const data = await res.json();
                        if (data.suggestion) setFollowupMessage(data.suggestion);
                      } catch { toast.error('Erro ao gerar sugestão'); }
                      setGeneratingAI(false);
                    }}
                    className="w-full text-xs h-9 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50"
                  >
                    {generatingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    Gerar com IA
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Mensagem do Follow-up</Label>
                <Textarea
                  value={followupMessage}
                  onChange={e => setFollowupMessage(e.target.value)}
                  placeholder="Olá! Tudo bem? Passando para saber se ainda tem interesse..."
                  className="min-h-[70px] border-border bg-card text-xs text-foreground"
                />
              </div>
            </div>

            {/* Tarefa Futura */}
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
              <p className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Tarefa Futura
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Data disponível</Label>
                  <Input
                    type="date"
                    value={futureTaskDate}
                    onChange={e => setFutureTaskDate(e.target.value)}
                    className="border-border bg-card text-xs h-9 text-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Anotação</Label>
                <Input
                  value={futureTaskNote}
                  onChange={e => setFutureTaskNote(e.target.value)}
                  placeholder='Ex: "Lead volta em agosto"'
                  className="border-border bg-card text-xs h-9 text-foreground"
                />
              </div>
            </div>

            {/* Alerta */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
              <p className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
                <BellRing className="h-3.5 w-3.5" /> Alerta
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold text-neutral-600">Data e Hora</Label>
                  <Input
                    type="datetime-local"
                    value={alertDate}
                    onChange={e => setAlertDate(e.target.value)}
                    className="border-border bg-card text-xs h-9 text-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold text-neutral-600">Motivo do alerta</Label>
                <Input
                  value={alertNote}
                  onChange={e => setAlertNote(e.target.value)}
                  placeholder="Ex: Ligar para confirmar consulta"
                  className="border-border bg-card text-xs h-9 text-foreground"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicionar notas..."
                className="min-h-[100px] border-border bg-muted text-foreground"
              />
            </div>

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Mark as Won
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("lost")}
                    disabled={!!statusAction || deal.status === "lost"}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        Mark as Lost
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    Reopen deal
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? "Saving..." : deal ? "Save Changes" : "Create Deal"}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">Excluir este negócio?</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Deal
                </button>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
