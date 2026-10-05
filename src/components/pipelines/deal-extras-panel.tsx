"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, History, Plus, StickyNote, X, ChevronDown, ChevronUp, Pencil, Trash2, Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface DealExtrasPanelProps {
  dealId: string;
  accountId: string;
}

interface InterestRow {
  id: string;
  value: string;
  created_at: string;
}
interface NoteRow {
  id: string;
  note_text: string;
  created_at: string;
}
interface HistoryRow {
  id: string;
  field: "status" | "crm_stage" | "crm_status";
  old_value: string | null;
  new_value: string;
  changed_at: string;
  changed_by_automation_id: string | null;
}

const FIELD_LABELS: Record<HistoryRow["field"], string> = {
  status: "Ciclo de vida",
  crm_stage: "Etapa no CRM",
  crm_status: "Status (fila de atendimento)",
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Lists everything automations can now accumulate on a deal
 * (interesses, observações) plus the audit trail of status/etapa
 * changes — the viewing half of what migrations 071/072 and the new
 * automation steps (add_interest, remove_interest, add_note,
 * update_deal_field on status/crm_stage/crm_status) write. Manual
 * add/remove here uses the exact same tables, so a person and an
 * automation editing the same deal never disagree about where the
 * data lives.
 */
export function DealExtrasPanel({ dealId, accountId }: DealExtrasPanelProps) {
  const supabase = createClient();
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInterest, setNewInterest] = useState("");
  const [newNote, setNewNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Inline editing: one entry at a time, per list.
  const [editingInterestId, setEditingInterestId] = useState<string | null>(null);
  const [editingInterestText, setEditingInterestText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<NoteRow | null>(null);

  async function reload() {
    const [{ data: i }, { data: n }, { data: h }] = await Promise.all([
      supabase.from("deal_interests").select("id, value, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }),
      supabase.from("deal_notes").select("id, note_text, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }),
      supabase
        .from("deal_field_history")
        .select("id, field, old_value, new_value, changed_at, changed_by_automation_id")
        .eq("deal_id", dealId)
        .order("changed_at", { ascending: false }),
    ]);
    setInterests((i as InterestRow[] | null) ?? []);
    setNotes((n as NoteRow[] | null) ?? []);
    setHistory((h as HistoryRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function addInterest() {
    const value = newInterest.trim();
    if (!value) return;
    const { error } = await supabase.from("deal_interests").insert({ account_id: accountId, deal_id: dealId, value });
    if (error) {
      toast.error("Não foi possível adicionar o interesse.");
      return;
    }
    setNewInterest("");
    reload();
  }

  async function removeInterest(id: string) {
    const { error } = await supabase.from("deal_interests").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover.");
      return;
    }
    reload();
  }

  async function addNote() {
    const value = newNote.trim();
    if (!value) return;
    const { error } = await supabase.from("deal_notes").insert({ account_id: accountId, deal_id: dealId, note_text: value });
    if (error) {
      toast.error("Não foi possível adicionar a observação.");
      return;
    }
    setNewNote("");
    reload();
  }

  async function saveInterest() {
    const value = editingInterestText.trim();
    if (!editingInterestId || !value) return;
    const { error } = await supabase.from("deal_interests").update({ value }).eq("id", editingInterestId);
    if (error) {
      toast.error("Não foi possível salvar o interesse.");
      return;
    }
    setEditingInterestId(null);
    reload();
  }

  async function saveNote() {
    const text = editingNoteText.trim();
    if (!editingNoteId || !text) return;
    const { error } = await supabase.from("deal_notes").update({ note_text: text }).eq("id", editingNoteId);
    if (error) {
      toast.error("Não foi possível salvar a observação.");
      return;
    }
    setEditingNoteId(null);
    reload();
  }

  async function deleteNote() {
    if (!noteToDelete) return;
    const { error } = await supabase.from("deal_notes").delete().eq("id", noteToDelete.id);
    setNoteToDelete(null);
    if (error) {
      toast.error("Não foi possível apagar a observação.");
      return;
    }
    reload();
  }

  if (loading) return null;

  return (
    <div className="space-y-3.5">
      {/* Interesses */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-neutral-600">
          <Heart className="h-3.5 w-3.5 text-pink-500" /> Interesses
        </Label>
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {interests.map((it) =>
              editingInterestId === it.id ? (
                <span key={it.id} className="flex items-center gap-1 rounded-full border border-pink-300 bg-card py-0.5 pl-2 pr-1">
                  <input
                    autoFocus
                    value={editingInterestText}
                    onChange={(e) => setEditingInterestText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveInterest();
                      if (e.key === "Escape") setEditingInterestId(null);
                    }}
                    className="w-28 bg-transparent text-[11px] font-semibold text-foreground outline-none"
                  />
                  <button type="button" onClick={saveInterest} className="rounded-full p-0.5 hover:bg-pink-100" aria-label="Salvar">
                    <Check className="h-3 w-3 text-pink-700" />
                  </button>
                  <button type="button" onClick={() => setEditingInterestId(null)} className="rounded-full p-0.5 hover:bg-pink-100" aria-label="Cancelar">
                    <X className="h-3 w-3 text-pink-700" />
                  </button>
                </span>
              ) : (
                <span
                  key={it.id}
                  className="flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-pink-700"
                  title={fmtDateTime(it.created_at)}
                >
                  {it.value}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingInterestId(it.id);
                      setEditingInterestText(it.value);
                    }}
                    className="rounded-full p-0.5 hover:bg-pink-200"
                    aria-label={`Editar ${it.value}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeInterest(it.id)}
                    className="rounded-full p-0.5 hover:bg-pink-200"
                    aria-label={`Remover ${it.value}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ),
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInterest())}
            placeholder="Ex: Toxina Botulínica"
            className="h-8 border-border bg-muted text-xs text-foreground"
          />
          <button
            type="button"
            onClick={addInterest}
            disabled={!newInterest.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Observações */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-neutral-600">
          <StickyNote className="h-3.5 w-3.5 text-yellow-600" /> Observações
        </Label>
        {notes.length > 0 && (
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-muted px-2.5 py-1.5">
                {editingNoteId === n.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNote();
                        if (e.key === "Escape") setEditingNoteId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground outline-none"
                    />
                    <button type="button" onClick={saveNote} className="rounded p-1 hover:bg-card" aria-label="Salvar">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                    </button>
                    <button type="button" onClick={() => setEditingNoteId(null)} className="rounded p-1 hover:bg-card" aria-label="Cancelar">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <p className="min-w-0 flex-1 text-xs text-foreground">{n.note_text}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(n.id);
                        setEditingNoteText(n.note_text);
                      }}
                      className="rounded p-1 hover:bg-card"
                      aria-label="Editar observação"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button type="button" onClick={() => setNoteToDelete(n)} className="rounded p-1 hover:bg-card" aria-label="Apagar observação">
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">{fmtDateTime(n.created_at)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
            placeholder="Nova observação…"
            className="h-8 border-border bg-muted text-xs text-foreground"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={!newNote.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Histórico de status/etapa */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-bold text-neutral-600"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico de mudanças ({history.length})
            </span>
            {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {historyOpen && (
            <div className="mt-2.5 max-h-48 space-y-1.5 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                  <p className="text-foreground">
                    <span className="font-semibold">{FIELD_LABELS[h.field]}</span>:{" "}
                    {h.old_value ? `${h.old_value} → ${h.new_value}` : h.new_value}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtDateTime(h.changed_at)} {h.changed_by_automation_id ? "· por automação" : "· manual"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!noteToDelete}
        onOpenChange={(o) => !o && setNoteToDelete(null)}
        title="Apagar observação?"
        description="Essa observação será removida do negócio. Não dá para desfazer."
        confirmLabel="Apagar"
        onConfirm={deleteNote}
      />
    </div>
  );
}
