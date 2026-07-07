"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Plus, ChevronDown, Settings, AlertCircle, Clock, X, MessageSquare, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { FollowupQueue } from "@/components/pipelines/followup-queue";

// Pipeline creation is admin-class (settings-tier write under
// the new RLS); deal creation is operational and only requires
// agent+. The two CTAs gate on different `useCan` capabilities,
// not on different copy.

// Spec-defined seed — name and color per the product spec.
const SPEC_DEFAULT_STAGES = [
  { name: "Novo Lead", color: "#3b82f6", position: 0 }, // blue
  { name: "Qualificado", color: "#eab308", position: 1 }, // yellow
  { name: "Proposta Enviada", color: "#f97316", position: 2 }, // orange
  { name: "Negociação", color: "#8b5cf6", position: 3 }, // purple
  { name: "Ganha", color: "#22c55e", position: 4 }, // green
];

export default function PipelinesPage() {
  const supabase = createClient();
  const router = useRouter();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // Unanswered Conversations / Leads
  const [unansweredConversations, setUnansweredConversations] = useState<any[]>([]);
  const [showUnansweredSheet, setShowUnansweredSheet] = useState(false);
  // Follow-up queue
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [showFollowupSheet, setShowFollowupSheet] = useState(false);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);

  const loadUnanswered = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("account_id", accountId)
      .gt("unread_count", 0)
      .order("last_message_at", { ascending: true }); // oldest first
    
    setUnansweredConversations(data || []);
  }, [supabase, accountId]);

  const loadFollowupCount = useCallback(async () => {
    const res = await fetch('/api/followups?status=pending&limit=1');
    const json = await res.json();
    const all = await fetch('/api/followups?status=pending&limit=200').then(r => r.json());
    setPendingFollowupsCount(all.followups?.length ?? 0);
  }, []);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    const fetched = data ?? [];
    for (const pipe of fetched) {
      if (pipe.name === "Sales Pipeline") {
        supabase
          .from("pipelines")
          .update({ name: "Funil de Vendas" })
          .eq("id", pipe.id)
          .then(() => {});
        pipe.name = "Funil de Vendas";
      }
    }
    return fetched;
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      
      const fetched = data ?? [];
      const translations: Record<string, string> = {
        "New Lead": "Novo Lead",
        "Qualified": "Qualificado",
        "Proposal Sent": "Proposta Enviada",
        "Negotiation": "Negociação",
        "Won": "Ganha"
      };
      
      for (const stage of fetched) {
        if (translations[stage.name]) {
          const newName = translations[stage.name];
          supabase
            .from("pipeline_stages")
            .update({ name: newName })
            .eq("id", stage.id)
            .then(() => {});
          stage.name = newName;
        }
      }
      return fetched;
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name: "Funil de Vendas" })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  useEffect(() => {
    loadUnanswered();
    loadFollowupCount();
  }, [loadUnanswered, loadFollowupCount, selectedPipelineId]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      // Optimistic update — board already animated; just persist.
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", dealId);
      if (error) {
        toast.error("Failed to move deal");
        refreshDeals();
      }
    },
    [supabase, refreshDeals],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) {
      toast.error("Your profile is not linked to an account.");
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error("Failed to create pipeline");
      setCreating(false);
      return;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success("Pipeline created");
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted"
            >
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? "Selecionar Funil"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  Nenhum funil ainda
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Gerenciar Funis
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {unansweredConversations.length > 0 && (
            <button
              onClick={() => {
                loadUnanswered();
                setShowUnansweredSheet(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-500 transition-colors cursor-pointer shrink-0"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Sem Resposta ({unansweredConversations.length})
            </button>
          )}
          {/* Follow-up queue button */}
          <button
            onClick={() => setShowFollowupSheet(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              pendingFollowupsCount > 0
                ? 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700'
                : 'border-border bg-muted/30 hover:bg-muted text-muted-foreground'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Follow-ups{pendingFollowupsCount > 0 ? ` (${pendingFollowupsCount})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adicionar Funil
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adicionar Lead
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            Nenhum funil cadastrado
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie um funil para começar a gerenciar seus leads
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            Criar Funil
          </GatedButton>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={stages} deals={deals} />
          <PipelineBoard
            stages={stages}
            deals={deals}
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleEditDeal}
          />
        </>
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New Pipeline</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">Pipeline Name</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="e.g., Enterprise Sales"
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Default stages (New Lead → Won) will be created automatically.
            </p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? "Creating..." : "Create Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />

      {/* Unanswered Leads Sidebar Sheet */}
      {showUnansweredSheet && (
        <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-[100] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Leads Sem Resposta
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Leads com mensagens pendentes aguardando retorno</p>
            </div>
            <button
              onClick={() => setShowUnansweredSheet(false)}
              className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {unansweredConversations.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground italic">
                Nenhum lead aguardando retorno no momento!
              </div>
            ) : (
              unansweredConversations.map((conv) => {
                const waitingTime = (() => {
                  if (!conv.last_message_at) return "—";
                  const diffMs = Date.now() - new Date(conv.last_message_at).getTime();
                  const diffMins = Math.round(diffMs / (1000 * 60));
                  if (diffMins < 60) return `Há ${diffMins} min`;
                  const diffHours = Math.floor(diffMins / 60);
                  if (diffHours < 24) return `Há ${diffHours} hora(s)`;
                  const diffDays = Math.floor(diffHours / 24);
                  return `Há ${diffDays} dia(s)`;
                })();

                return (
                  <div key={conv.id} className="rounded-xl border border-border bg-card p-4 space-y-2 hover:border-amber-500/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-foreground">{conv.contact?.name || "Paciente"}</h4>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-500 bg-amber-500/10 rounded-full px-2 py-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {waitingTime}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 line-clamp-2">
                      "{conv.last_message_text || "Mídia ou arquivo"}"
                    </p>
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => {
                          setShowUnansweredSheet(false);
                          router.push("/inbox");
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Responder no Inbox
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {/* Follow-up Queue Sidebar */}
      {showFollowupSheet && (
        <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-[100] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-emerald-600" />
                Fila de Follow-ups
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Mensagens programadas para envio automático</p>
            </div>
            <button
              onClick={() => { setShowFollowupSheet(false); loadFollowupCount(); }}
              className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <FollowupQueue />
          </div>
        </div>
      )}
    </div>
  );
}
