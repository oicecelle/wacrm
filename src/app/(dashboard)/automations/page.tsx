"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  PhoneCall,
  CalendarCheck,
  Send,
  Flame,
  Loader2,
  Workflow,
  HelpCircle,
  UserPlus,
  MessageSquare,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import type { Automation } from "@/types";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates";
import { triggerMeta, formatRelative } from "@/lib/automations/trigger-meta";
import { cn } from "@/lib/utils";

const TEMPLATE_ORDER: TemplateSlug[] = [
  "appointment_confirmation",
  "follow_up_reminder",
  "send_template_on_keyword",
  "mark_lead_hot",
];

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  appointment_confirmation: CalendarCheck,
  follow_up_reminder: PhoneCall,
  send_template_on_keyword: Send,
  mark_lead_hot: Flame,
};

/* ─── Flows interfaces ─────────────────────────────────────── */
interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FlowTemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: string;
  node_count: number;
}

const FLOW_TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

const FLOW_STATUS_LABELS: Record<FlowRow["status"], string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const FLOW_STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-600",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

export default function AutomationsPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const canCreate = !permsLoading && hasPermission("configurar_marketing", "edit");
  const [activeTab, setActiveTab] = useState<"rules" | "flows">("rules");

  /* --- Automation Rules state --- */
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* --- Flows state --- */
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [flowTemplates, setFlowTemplates] = useState<FlowTemplateSummary[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [creatingFlow, setCreatingFlow] = useState(false);

  async function loadAutomations() {
    if (!accountId) return;
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (fetchErr) throw fetchErr;
      setAutomations((data ?? []) as Automation[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar automações");
    }
  }

  async function loadFlows() {
    setLoadingFlows(true);
    try {
      const [flowsRes, tmplRes] = await Promise.all([
        fetch("/api/flows"),
        fetch("/api/flows/templates"),
      ]);
      if (flowsRes.ok) {
        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        setFlows(flowsJson.flows ?? []);
      }
      if (tmplRes.ok) {
        const tmplJson = (await tmplRes.json()) as { templates: FlowTemplateSummary[] };
        setFlowTemplates(tmplJson.templates ?? []);
      }
    } catch (err) {
      console.error("Error loading flows:", err);
      toast.error("Não foi possível carregar os fluxos.");
    } finally {
      setLoadingFlows(false);
    }
  }

  useEffect(() => {
    loadAutomations();
    loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  /* --- Automation Rules Actions --- */
  async function toggleActive(a: Automation, next: boolean) {
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev
    );
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev
      );
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Erro ao atualizar");
      return;
    }
    toast.success(next ? "Automação ativada" : "Automação pausada");
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Erro ao duplicar");
      return;
    }
    toast.success("Automação duplicada com sucesso");
    loadAutomations();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Erro ao excluir");
      return;
    }
    toast.success("Automação excluída");
    setPendingDelete(null);
    loadAutomations();
  }

  function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`);
  }

  /* --- Flows Actions --- */
  async function handleCreateFlow() {
    if (!newFlowName.trim()) return;
    setCreatingFlow(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFlowName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateFlowOpen(false);
      setNewFlowName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível criar o fluxo.");
    } finally {
      setCreatingFlow(false);
    }
  }

  async function handleUseFlowTemplate(slug: string) {
    setCreatingFlow(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Clone failed: ${res.status}`);
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateFlowOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar do modelo";
      toast.error(msg);
    } finally {
      setCreatingFlow(false);
    }
  }

  async function handleDeleteFlow(flow: FlowRow) {
    const yes = window.confirm(
      `Excluir o fluxo "${flow.name}"? Qualquer execução ativa será encerrada imediatamente.`
    );
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success("Fluxo excluído com sucesso.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível excluir o fluxo.");
    }
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-left">
        <p className="text-sm text-red-500 font-bold">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Automações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Construa fluxos inteligentes e regras automatizadas para responder no WhatsApp®.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "rules" ? (
            <GatedButton
              canAct={canCreate}
              gateReason="criar automações"
              onClick={() => router.push("/automations/new")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-md shadow-blue-200"
            >
              <Plus className="h-4 w-4" />
              Criar Automação
            </GatedButton>
          ) : (
            <GatedButton
              canAct={canCreate}
              gateReason="criar fluxos"
              onClick={() => setCreateFlowOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-md shadow-blue-200"
            >
              <Plus className="h-4 w-4" />
              Novo Fluxo
            </GatedButton>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab("rules")}
          className={cn(
            "px-4 py-2.5 text-xs font-bold transition-all border-b-2",
            activeTab === "rules"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Regras de Automação
        </button>
        <button
          onClick={() => setActiveTab("flows")}
          className={cn(
            "px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5",
            activeTab === "flows"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Fluxos de Mensagens
          <Badge className="rounded-full bg-blue-100 border border-blue-200/50 text-blue-700 px-1 py-0 text-[8px] font-black uppercase shrink-0">
            BETA
          </Badge>
        </button>
      </div>

      {/* Render tab content */}
      {activeTab === "rules" ? (
        /* --- TAB 1: AUTOMATION RULES --- */
        <div className="space-y-6">
          {automations === null ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {automations.length < 3 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Modelos de início rápido</h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {TEMPLATE_ORDER.map((slug) => {
                      const t = AUTOMATION_TEMPLATES[slug];
                      const Icon = TEMPLATE_ICON[slug];
                      return (
                        <button
                          key={slug}
                          onClick={() => startFromTemplate(slug)}
                          className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-blue-300 hover:shadow-xs"
                        >
                          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="text-xs font-bold text-foreground">{t.name}</div>
                          <p className="mt-1 text-[10px] text-muted-foreground font-semibold leading-relaxed">{t.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {automations.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card shadow-xs">
                  <Zap className="h-8 w-8 text-neutral-300 mb-2 animate-pulse" />
                  <p className="text-xs font-bold text-foreground">Nenhuma regra de automação criada</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-semibold">
                    Escolha um modelo acima ou crie uma do zero no botão superior.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {automations.map((a) => (
                    <AutomationCard
                      key={a.id}
                      automation={a}
                      onToggle={(next) => toggleActive(a, next)}
                      onEdit={() => router.push(`/automations/${a.id}/edit`)}
                      onDuplicate={() => duplicate(a)}
                      onLogs={() => router.push(`/automations/${a.id}/logs`)}
                      onDelete={() => setPendingDelete(a)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        /* --- TAB 2: FLOWS --- */
        <div className="space-y-6">
          {loadingFlows ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : flows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card shadow-xs">
              <Workflow className="h-8 w-8 text-neutral-300 mb-2 animate-pulse" />
              <p className="text-xs font-bold text-foreground">Nenhum fluxo interativo criado</p>
              <p className="text-[10px] text-muted-foreground mt-1 font-semibold">
                Crie menus automáticos e triagens guiadas por botões para o seu WhatsApp.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFlowOpen(true)}
                className="mt-3 text-xs font-bold border-border text-neutral-700 bg-card hover:bg-neutral-50 h-8 rounded-lg"
              >
                Começar Fluxo
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {flows.map((flow) => (
                <FlowCard
                  key={flow.id}
                  flow={flow}
                  onEdit={() => router.push(`/flows/${flow.id}`)}
                  onDelete={() => handleDeleteFlow(flow)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Rule Confirmation Dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent className="bg-card border border-border shadow-xl rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Excluir Automação</DialogTitle>
            <DialogDescription className="text-xs font-semibold text-muted-foreground leading-relaxed mt-1">
              Tem certeza que deseja excluir permanentemente a automação <span className="font-bold text-neutral-700">{pendingDelete?.name}</span> e todo o seu histórico? Esta ação não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-3 flex items-center justify-end">
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="text-xs font-bold text-muted-foreground hover:bg-neutral-100 rounded-lg h-9 px-3"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg h-9 px-3 flex items-center justify-center gap-1.5"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Flow Dialog */}
      <Dialog open={createFlowOpen} onOpenChange={setCreateFlowOpen}>
        <DialogContent className="sm:max-w-3xl bg-card border border-border shadow-2xl rounded-2xl p-6 text-left space-y-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Criar Novo Fluxo de Conversa</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-semibold leading-relaxed mt-1">
              Desenhe um fluxo de mensagens ramificado e automatizado. Escolha um modelo abaixo ou crie em branco.
            </DialogDescription>
          </DialogHeader>

          {flowTemplates.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                Começar de um modelo
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {flowTemplates.map((t) => {
                  const Icon = FLOW_TEMPLATE_ICONS[t.icon] ?? FileText;
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => handleUseFlowTemplate(t.slug)}
                      disabled={creatingFlow}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-blue-400 hover:shadow-xs disabled:opacity-50"
                    >
                      <Icon className="h-5 w-5 text-blue-600" />
                      <span className="text-xs font-bold text-foreground leading-tight">
                        {t.name}
                      </span>
                      <span className="text-[10px] leading-relaxed text-muted-foreground font-semibold flex-1">
                        {t.description}
                      </span>
                      <span className="mt-2 border-t border-neutral-100 pt-2 text-[9px] font-bold text-muted-foreground">
                        {t.node_count} {t.node_count === 1 ? "bloco" : "blocos"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-neutral-100 pt-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
              Ou comece em branco
            </p>
            <div className="flex gap-2 items-center">
              <Input
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder="Ex: Menu de boas-vindas da clínica"
                className="bg-neutral-50 border-border outline-none placeholder:text-muted-foreground font-semibold text-xs h-10 w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFlowName.trim()) {
                    handleCreateFlow();
                  }
                }}
              />
              <Button
                disabled={creatingFlow || !newFlowName.trim()}
                onClick={handleCreateFlow}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 text-xs shrink-0 rounded-xl"
              >
                {creatingFlow ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Fluxo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --- Sub-Components --- */
function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
}: {
  automation: Automation;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onLogs: () => void;
  onDelete: () => void;
}) {
  const meta = triggerMeta(automation.trigger_type);
  
  // Custom translates for trigger triggers labels in Portuguese
  let localizedTriggerLabel = meta.label;
  if (automation.trigger_type === "keyword_match") localizedTriggerLabel = "Palavra-chave";
  else if (automation.trigger_type === "new_message_received") localizedTriggerLabel = "Nova Mensagem";
  else if (automation.trigger_type === "first_inbound_message") localizedTriggerLabel = "Primeiro Contato";
  else if (automation.trigger_type === "new_contact_created") localizedTriggerLabel = "Novo Contato";

  return (
    <li className="rounded-xl border border-border bg-card transition-all hover:border-blue-200 shadow-xs">
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Zap className="h-5 w-5" />
        </div>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-bold text-foreground">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="ativo">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-600 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground font-semibold">{automation.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-semibold">
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase", meta.pillClass)}>
              {localizedTriggerLabel}
            </span>
            <span className="tabular-nums">
              {automation.execution_count} execuç{automation.execution_count === 1 ? "ão" : "ões"}
            </span>
            <span aria-hidden>·</span>
            <span>executada {formatRelative(automation.last_executed_at)}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? "Pausar" : "Ativar"}
          />

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-neutral-50 hover:text-neutral-600">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40 bg-card border border-border shadow-lg text-xs">
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
                <Copy className="h-3.5 w-3.5" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs} className="cursor-pointer">
                <FileText className="h-3.5 w-3.5" />
                Ver Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-neutral-100" />
              <DropdownMenuItem variant="destructive" onClick={onDelete} className="cursor-pointer text-red-600 focus:text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  let triggerLabel: string = flow.trigger_type;
  if (flow.trigger_type === "keyword") triggerLabel = "Palavra-chave";
  else if (flow.trigger_type === "first_inbound_message") triggerLabel = "Primeiro contato";
  else if (flow.trigger_type === "manual") triggerLabel = "Manual";

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-blue-200 transition-all shadow-xs flex flex-col justify-between">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="h-4 w-4 text-blue-600 shrink-0" />
            <h3 className="text-xs font-bold text-foreground truncate" title={flow.name}>
              {flow.name}
            </h3>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${FLOW_STATUS_COLORS[flow.status]}`}>
            {FLOW_STATUS_LABELS[flow.status]}
          </span>
        </div>
        
        {flow.description && (
          <p className="text-[10px] text-muted-foreground font-semibold leading-relaxed truncate">{flow.description}</p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap pt-1.5 text-[9px] text-muted-foreground font-bold">
          <span className="bg-neutral-50 text-neutral-600 border border-neutral-100 rounded px-1.5 py-0.2 uppercase">
            {triggerLabel}
          </span>
          <span>•</span>
          <span>{flow.execution_count} execuç{flow.execution_count === 1 ? "ão" : "ões"}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 mt-4 pt-3 gap-2">
        <span className="text-[8px] text-muted-foreground font-semibold">
          {flow.last_executed_at ? `Última em ${new Date(flow.last_executed_at).toLocaleDateString("pt-BR")}` : "Nunca executado"}
        </span>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            className="h-7 text-[10px] font-bold border-border text-neutral-700 bg-card hover:bg-neutral-50 px-2.5 rounded-lg"
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="h-7 text-[10px] font-bold border-red-100 hover:bg-red-50 text-red-600 hover:text-red-700 px-2.5 rounded-lg"
          >
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}
