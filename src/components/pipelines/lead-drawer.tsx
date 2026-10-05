"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import type { Deal } from "@/types";
import { DealExtrasPanel } from "@/components/pipelines/deal-extras-panel";
import { formatCurrency } from "@/lib/currency";
import { Flame, Thermometer, Snowflake, MessageCircle, Pencil, Zap, Bot, Clock } from "lucide-react";

interface LeadDrawerProps {
  deal: Deal | null;
  stageName?: string;
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (deal: Deal) => void;
}

interface MessageRow {
  id: string;
  sender_type: "customer" | "agent";
  content_type: string | null;
  content_text: string | null;
  template_name: string | null;
  created_at: string;
}
interface PendingRow {
  id: string;
  run_at: string;
  automationName: string;
}
interface LogRow {
  id: string;
  created_at: string;
  status: string;
  automationName: string;
  steps: { step_type: string; detail?: string }[];
}
interface TimelineEntry {
  id: string;
  at: string;
  text: string;
  auto: boolean;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const FIELD_LABELS: Record<string, string> = {
  status: "Ciclo de vida",
  crm_stage: "Etapa no CRM",
  crm_status: "Status (fila de atendimento)",
};

function elapsed(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "menos de 1 dia";
  return `${days} dia${days === 1 ? "" : "s"}`;
}

function TempIcon({ t }: { t?: "hot" | "warm" | "cold" }) {
  if (t === "hot") return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600"><Flame className="h-3 w-3" />Quente</span>;
  if (t === "warm") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600"><Thermometer className="h-3 w-3" />Morno</span>;
  if (t === "cold") return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600"><Snowflake className="h-3 w-3" />Frio</span>;
  return null;
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 text-xs last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function LeadDrawer({ deal, stageName, accountId, open, onOpenChange, onEdit }: LeadDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const dealId = deal?.id;
  const contactId = deal?.contact_id ?? null;
  const conversationId = deal?.conversation_id ?? null;

  useEffect(() => {
    if (!open || !dealId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [msgs, pend, lg, hist, ints, nts] = await Promise.all([
        conversationId
          ? supabase
              .from("messages")
              .select("id, sender_type, content_type, content_text, template_name, created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: false })
              .limit(80)
          : Promise.resolve({ data: [] }),
        contactId
          ? supabase
              .from("automation_pending_executions")
              .select("id, run_at, automations(name)")
              .eq("contact_id", contactId)
              .eq("status", "pending")
              .order("run_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        contactId
          ? supabase
              .from("automation_logs")
              .select("id, created_at, status, steps_executed, automations(name)")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] }),
        supabase
          .from("deal_field_history")
          .select("id, changed_at, field, old_value, new_value, changed_by_automation_id")
          .eq("deal_id", dealId),
        supabase.from("deal_interests").select("id, created_at, value, created_by_automation_id").eq("deal_id", dealId),
        supabase.from("deal_notes").select("id, created_at, note_text, created_by_automation_id").eq("deal_id", dealId),
      ]);
      if (cancelled) return;

      setMessages(((msgs.data ?? []) as MessageRow[]).slice().reverse());
      setPending(
        (pend.data ?? []).map((r) => {
          const row = r as unknown as { id: string; run_at: string; automations: { name: string } | null };
          return { id: row.id, run_at: row.run_at, automationName: row.automations?.name ?? "—" };
        }),
      );
      const logRows = (lg.data ?? []).map((r) => {
        const row = r as unknown as {
          id: string; created_at: string; status: string;
          steps_executed: { step_type: string; detail?: string }[] | null;
          automations: { name: string } | null;
        };
        return { id: row.id, created_at: row.created_at, status: row.status, automationName: row.automations?.name ?? "—", steps: row.steps_executed ?? [] };
      });
      setLogs(logRows);

      const entries: TimelineEntry[] = [
        { id: "created", at: deal!.created_at, text: `Lead criado${deal!.source ? ` — origem: ${deal!.source}` : ""}`, auto: false },
        ...(hist.data ?? []).map((h) => {
          const r = h as { id: string; changed_at: string; field: string; old_value: string | null; new_value: string; changed_by_automation_id: string | null };
          return {
            id: `h-${r.id}`,
            at: r.changed_at,
            text: `${FIELD_LABELS[r.field] ?? r.field}: ${r.old_value ? `${r.old_value} → ${r.new_value}` : `definido como ${r.new_value}`}`,
            auto: !!r.changed_by_automation_id,
          };
        }),
        ...(ints.data ?? []).map((i) => {
          const r = i as { id: string; created_at: string; value: string; created_by_automation_id: string | null };
          return { id: `i-${r.id}`, at: r.created_at, text: `Interesse registrado: ${r.value}`, auto: !!r.created_by_automation_id };
        }),
        ...(nts.data ?? []).map((n) => {
          const r = n as { id: string; created_at: string; note_text: string; created_by_automation_id: string | null };
          return { id: `n-${r.id}`, at: r.created_at, text: `Observação adicionada: ${r.note_text}`, auto: !!r.created_by_automation_id };
        }),
        ...logRows.map((l) => ({
          id: `l-${l.id}`,
          at: l.created_at,
          text: `Automação "${l.automationName}" ${l.status === "success" ? "executada" : l.status === "partial" ? "em andamento" : "falhou"}`,
          auto: true,
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setTimeline(entries);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dealId]);

  if (!deal) return null;

  const phone = deal.contact?.phone ?? "";
  const waDigits = phone.replace(/\D/g, "");
  const displayName = deal.contact?.name || deal.title;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-[620px]">
        <SheetTitle className="sr-only">{displayName}</SheetTitle>
        <SheetDescription className="sr-only">Detalhes do lead</SheetDescription>

        {/* Header */}
        <div className="border-b border-border px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight text-foreground">{displayName}</h2>
                <TempIcon t={deal.temperature} />
                {deal.score !== undefined && deal.score !== null && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                    <Zap className="h-3 w-3" />Score {deal.score}
                  </span>
                )}
              </div>
              {deal.title !== displayName && <p className="truncate text-xs text-muted-foreground">{deal.title}</p>}
              {phone && (
                <a href={`tel:+${waDigits}`} className="text-xs text-muted-foreground hover:text-foreground">
                  {phone}
                </a>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {waDigits && (
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => onEdit(deal)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary-hover"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          </div>
        </div>

        <Tabs defaultValue="resumo" className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="w-full justify-start gap-1 border-b border-border px-3">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="conversa">Conversa</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="dados">Dados</TabsTrigger>
          </TabsList>

          {/* RESUMO */}
          <TabsContent value="resumo" className="space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-xl border border-border bg-primary-soft p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                <Bot className="h-3.5 w-3.5" /> Próxima ação automática
              </p>
              {pending.length > 0 ? (
                <div className="space-y-1">
                  {pending.map((p) => (
                    <p key={p.id} className="text-xs text-foreground">
                      <span className="font-semibold">{p.automationName}</span> — {fmt(p.run_at)}
                    </p>
                  ))}
                  <p className="text-[11px] text-muted-foreground">A LYA fará isso automaticamente.</p>
                </div>
              ) : deal.followup_scheduled_at && new Date(deal.followup_scheduled_at) > new Date() ? (
                <div className="space-y-1">
                  <p className="text-xs text-foreground">Follow-up em {fmt(deal.followup_scheduled_at)}</p>
                  {deal.followup_message && (
                    <p className="rounded-lg bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">{deal.followup_message}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma ação programada para este lead.</p>
              )}
            </div>

            <div className="rounded-xl border border-border px-3">
              <Row label="Estágio" value={stageName} />
              <Row label="Status (fila)" value={deal.crm_status?.nome} />
              <Row label="Origem" value={deal.source} />
              <Row label="Interesse" value={deal.interest} />
              <Row label="Responsável" value={deal.assignee?.full_name} />
              <Row label="Entrou em" value={fmt(deal.created_at)} />
              <Row label="Tempo no funil" value={elapsed(deal.created_at)} />
              <Row label="Valor" value={deal.value > 0 ? formatCurrency(deal.value, deal.currency) : undefined} />
              <Row label="Tags" value={deal.contact?.tags_visual?.length ? deal.contact.tags_visual.join(", ") : undefined} />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold text-foreground">Automações deste lead</p>
              {loading ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              ) : logs.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-center text-xs text-muted-foreground">Nenhuma automação executada para este lead ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {logs.slice(0, 5).map((l) => (
                    <div key={l.id} className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{l.automationName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {fmt(l.created_at)} · {l.status === "success" ? "concluída" : l.status === "partial" ? "em andamento" : "falhou"}
                        {l.steps.length > 0 && ` · ${l.steps.length} passo${l.steps.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* CONVERSA */}
          <TabsContent value="conversa" className="overflow-y-auto px-5 py-4">
            {deal.last_message_summary && (
              <div className="mb-3 rounded-xl bg-primary-soft p-3">
                <p className="mb-0.5 text-[11px] font-bold text-primary">Resumo registrado</p>
                <p className="text-xs text-foreground">{deal.last_message_summary}</p>
              </div>
            )}
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : messages.length === 0 ? (
              <p className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_type === "agent";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-primary-soft-2 text-foreground" : "bg-muted text-foreground"}`}>
                        {m.template_name && (
                          <p className="mb-0.5 text-[9px] font-bold text-muted-foreground">Modelo: {m.template_name}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-xs">
                          {m.content_text || (m.content_type ? `[${m.content_type}]` : "")}
                        </p>
                        <p className="mt-0.5 text-right text-[9px] text-muted-foreground">{fmt(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ATIVIDADES */}
          <TabsContent value="atividades" className="overflow-y-auto px-5 py-4">
            <DealExtrasPanel dealId={deal.id} accountId={accountId} />
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background ${e.auto ? "bg-primary" : "bg-neutral-400"}`} />
                    <p className="text-xs text-foreground">{e.text}</p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {fmt(e.at)}
                      {e.auto ? " · automático" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          {/* DADOS */}
          <TabsContent value="dados" className="space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">Contato</p>
              <div className="rounded-xl border border-border px-3">
                <Row label="Nome" value={deal.contact?.name} />
                <Row label="Telefone" value={deal.contact?.phone} />
                <Row label="E-mail" value={deal.contact?.email} />
                <Row label="Empresa" value={deal.contact?.company} />
                <Row label="CPF" value={deal.contact?.cpf} />
                <Row label="Nascimento" value={deal.contact?.birthday} />
                <Row label="Tipo" value={deal.contact?.contact_type === "client" ? "Cliente" : deal.contact?.contact_type === "lead" ? "Lead" : undefined} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">Negócio</p>
              <div className="rounded-xl border border-border px-3">
                <Row label="Título" value={deal.title} />
                <Row label="Ciclo de vida" value={deal.status === "won" ? "Ganho" : deal.status === "lost" ? "Perdido" : "Aberto"} />
                <Row label="Etapa no CRM" value={deal.crm_stage} />
                <Row label="Previsão de fechamento" value={deal.expected_close_date} />
                <Row label="Próxima ação (texto)" value={deal.next_action} />
                <Row label="Principal objeção" value={deal.main_objection} />
                <Row label="Notas" value={deal.notes} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
