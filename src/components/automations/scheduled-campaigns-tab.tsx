"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Trash2, CalendarClock, Tag as TagIcon } from "lucide-react";

interface TagRecord {
  id: string;
  name: string;
  color: string | null;
}

interface TemplateRecord {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  is_active: boolean;
  days_of_week: number[];
  time_of_day: string;
  audience_type: "tag" | "appointments_relative";
  filter_tag_id: string | null;
  appointment_day_offset: number;
  action_type: "send_template" | "send_media";
  action_config: { template_name?: string };
  apply_tag_id: string | null;
  remove_filter_tag: boolean;
  last_run_date: string | null;
  last_run_stats: { sent?: number; failed?: number } | null;
}

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function newCampaignDraft(): Omit<Campaign, "id" | "last_run_date" | "last_run_stats"> {
  return {
    name: "",
    is_active: true,
    days_of_week: [1, 2, 3, 4, 5, 6],
    time_of_day: "15:00",
    audience_type: "tag",
    filter_tag_id: null,
    appointment_day_offset: 1,
    action_type: "send_template",
    action_config: {},
    apply_tag_id: null,
    remove_filter_tag: true,
  };
}

export function ScheduledCampaignsTab() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [editing, setEditing] = useState<Campaign | ReturnType<typeof newCampaignDraft> | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [{ data: campaignRows }, { data: tagRows }, { data: templateRows }] = await Promise.all([
      supabase.from("scheduled_campaigns").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
      supabase.from("tags").select("id, name, color").eq("account_id", accountId).order("name"),
      supabase.from("message_templates").select("id, name").eq("account_id", accountId).order("name"),
    ]);
    setCampaigns((campaignRows as Campaign[] | null) ?? []);
    setTags((tagRows as TagRecord[] | null) ?? []);
    setTemplates((templateRows as TemplateRecord[] | null) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!editing || !accountId) return;
    if (!editing.name.trim()) {
      toast.error("Dê um nome pra campanha.");
      return;
    }
    if (editing.audience_type === "tag" && !editing.filter_tag_id) {
      toast.error("Escolha a tag que filtra quem recebe.");
      return;
    }
    if (editing.action_type === "send_template" && !editing.action_config.template_name) {
      toast.error("Escolha o modelo que será enviado.");
      return;
    }
    if (editing.days_of_week.length === 0) {
      toast.error("Escolha pelo menos um dia da semana.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        account_id: accountId,
        name: editing.name.trim(),
        is_active: editing.is_active,
        days_of_week: editing.days_of_week,
        time_of_day: editing.time_of_day,
        audience_type: editing.audience_type,
        filter_tag_id: editing.audience_type === "tag" ? editing.filter_tag_id : null,
        appointment_day_offset: editing.appointment_day_offset,
        action_type: editing.action_type,
        action_config: editing.action_config,
        apply_tag_id: editing.apply_tag_id,
        remove_filter_tag: editing.audience_type === "tag" ? editing.remove_filter_tag : false,
      };
      if ("id" in editing) {
        const { error } = await supabase.from("scheduled_campaigns").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Campanha atualizada.");
      } else {
        const { error } = await supabase.from("scheduled_campaigns").insert(payload);
        if (error) throw error;
        toast.success("Campanha criada.");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(campaign: Campaign) {
    const { error } = await supabase
      .from("scheduled_campaigns")
      .update({ is_active: !campaign.is_active })
      .eq("id", campaign.id);
    if (error) {
      toast.error("Falha ao atualizar.");
      return;
    }
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, is_active: !c.is_active } : c)));
  }

  async function handleDelete(campaign: Campaign) {
    const { error } = await supabase.from("scheduled_campaigns").delete().eq("id", campaign.id);
    if (error) {
      toast.error("Falha ao excluir.");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
    toast.success("Campanha excluída.");
  }

  function tagName(id: string | null) {
    return tags.find((t) => t.id === id)?.name ?? "—";
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-xs text-muted-foreground">
          Campanhas que rodam sozinhas todo dia, no horário configurado — mandam uma mensagem pra
          quem tem uma tag específica, e depois marcam quem recebeu pra não repetir amanhã.
        </p>
        <Button
          onClick={() => setEditing(newCampaignDraft())}
          className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold"
        >
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-bold text-foreground">Nenhuma campanha agendada ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ex: toda seg a sáb às 15h, envie um follow-up pra quem está com a tag &quot;Sem
            Resposta&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{c.name}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                      c.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.is_active ? "Ativa" : "Pausada"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.days_of_week.slice().sort().map((d) => DOW_LABELS[d]).join(", ")} às {c.time_of_day.slice(0, 5)}
                  {" · "}
                  {c.audience_type === "appointments_relative" ? (
                    <>
                      <CalendarClock className="inline h-3 w-3" />{" "}
                      {c.appointment_day_offset === 0
                        ? "Quem tem agendamento hoje"
                        : c.appointment_day_offset === 1
                          ? "Quem tem agendamento amanhã"
                          : `Quem tem agendamento em ${c.appointment_day_offset} dias`}
                    </>
                  ) : (
                    <>
                      <TagIcon className="inline h-3 w-3" /> {tagName(c.filter_tag_id)}
                    </>
                  )}
                  {c.action_config.template_name && ` · modelo "${c.action_config.template_name}"`}
                  {c.apply_tag_id && ` · marca como "${tagName(c.apply_tag_id)}" depois`}
                </p>
                {c.last_run_date && (
                  <p className="text-[10px] text-muted-foreground">
                    Última execução: {new Date(c.last_run_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    {c.last_run_stats?.sent != null && ` — ${c.last_run_stats.sent} enviada(s)`}
                    {!!c.last_run_stats?.failed && `, ${c.last_run_stats.failed} falharam`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleToggleActive(c)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  {c.is_active ? "Pausar" : "Ativar"}
                </button>
                <button
                  onClick={() => setEditing(c)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  Editar
                </button>
                <button
                  onClick={() => setPendingDelete(c)}
                  className="rounded-lg border border-destructive/20 px-2 py-1.5 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CampaignEditor
          draft={editing}
          tags={tags}
          templates={templates}
          saving={saving}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Excluir campanha agendada"
        description={pendingDelete ? `Excluir "${pendingDelete.name}"? Ela para de rodar imediatamente.` : ""}
        confirmLabel="Excluir"
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
        }}
      />
    </div>
  );
}

function CampaignEditor({
  draft,
  tags,
  templates,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Campaign | ReturnType<typeof newCampaignDraft>;
  tags: TagRecord[];
  templates: TemplateRecord[];
  saving: boolean;
  onChange: (d: Campaign | ReturnType<typeof newCampaignDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function toggleDay(day: number) {
    const has = draft.days_of_week.includes(day);
    onChange({
      ...draft,
      days_of_week: has ? draft.days_of_week.filter((d) => d !== day) : [...draft.days_of_week, day].sort(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-sm font-black text-foreground">
          {"id" in draft ? "Editar Campanha" : "Nova Campanha Agendada"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Nome da campanha</label>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Ex: Follow-up diário"
              className="bg-muted text-foreground"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Dias da semana</label>
            <div className="flex flex-wrap gap-1.5">
              {DOW_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
                    draft.days_of_week.includes(idx)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Horário</label>
            <Input
              type="time"
              value={draft.time_of_day.slice(0, 5)}
              onChange={(e) => onChange({ ...draft, time_of_day: e.target.value })}
              className="bg-muted text-foreground w-32"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              A campanha roda dentro de até 30 minutos depois desse horário (o sistema confere
              periodicamente, não é um segundo exato).
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Quem recebe</label>
            <div className="mb-2 flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onChange({ ...draft, audience_type: "tag" })}
                className={cn(
                  "flex-1 rounded-md py-1.5 font-bold transition-colors",
                  draft.audience_type === "tag" ? "bg-card shadow-xs text-foreground" : "text-muted-foreground",
                )}
              >
                Contatos com uma tag
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...draft, audience_type: "appointments_relative" })}
                className={cn(
                  "flex-1 rounded-md py-1.5 font-bold transition-colors",
                  draft.audience_type === "appointments_relative" ? "bg-card shadow-xs text-foreground" : "text-muted-foreground",
                )}
              >
                Quem tem agendamento em...
              </button>
            </div>

            {draft.audience_type === "tag" ? (
              <select
                value={draft.filter_tag_id ?? ""}
                onChange={(e) => onChange({ ...draft, filter_tag_id: e.target.value || null })}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <option value="">Selecione uma tag…</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={draft.appointment_day_offset}
                onChange={(e) => onChange({ ...draft, appointment_day_offset: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <option value={0}>Agendamento hoje</option>
                <option value={1}>Agendamento amanhã</option>
                <option value={2}>Agendamento em 2 dias</option>
                <option value={3}>Agendamento em 3 dias</option>
                <option value={7}>Agendamento em 7 dias</option>
              </select>
            )}
            {draft.audience_type === "appointments_relative" && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                A lista é recalculada toda vez que a campanha roda — direto da agenda, sem
                precisar marcar tag em ninguém.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Modelo a enviar</label>
            <select
              value={draft.action_config.template_name ?? ""}
              onChange={(e) => onChange({ ...draft, action_type: "send_template", action_config: { template_name: e.target.value } })}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione um modelo…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Modelos com várias partes (texto + foto, etc) são enviados certinho, na ordem.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">
              Marcar com esta tag depois de enviar (opcional)
            </label>
            <select
              value={draft.apply_tag_id ?? ""}
              onChange={(e) => onChange({ ...draft, apply_tag_id: e.target.value || null })}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="">Nenhuma</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {draft.audience_type === "tag" && (
            <>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.remove_filter_tag}
                  onChange={(e) => onChange({ ...draft, remove_filter_tag: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-xs font-bold text-foreground">
                  Remover a tag de filtro depois de enviar
                </span>
              </label>
              <p className="-mt-2 pl-6 text-[10px] text-muted-foreground">
                Recomendado: sem isso, o mesmo contato recebe de novo amanhã, todo dia, enquanto tiver
                a tag.
              </p>
            </>
          )}

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => onChange({ ...draft, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-xs font-bold text-foreground">Campanha ativa</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="border-border text-foreground hover:bg-muted">
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
