"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagBadge } from "@/components/inbox/tag-chips";
import { waLabelColor } from "@/lib/whatsapp/label-colors";
import type { TagChip } from "@/lib/inbox/contact-tag-map";

/**
 * The contact's WhatsApp labels — a section of its own, kept apart from
 * the CRM tags below it: these live in the clinic's phone and are
 * mirrored here; adding or removing one changes the label on the real
 * WhatsApp chat too (via Uazapi), not just in this system.
 */
export function ContactWhatsappLabels({ contactId }: { contactId: string }) {
  const { accountId } = useAuth();
  const [all, setAll] = useState<TagChip[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const [defs, pairs] = await Promise.all([
      supabase.from("whatsapp_labels").select("wa_label_id, name, color").eq("account_id", accountId).eq("deleted", false),
      supabase.from("contact_whatsapp_labels").select("wa_label_id").eq("contact_id", contactId),
    ]);
    setAll(
      ((defs.data ?? []) as Array<{ wa_label_id: string; name: string; color: number | null }>).map((l) => ({
        kind: "wa" as const,
        id: l.wa_label_id,
        name: l.name || `Etiqueta ${l.wa_label_id}`,
        color: waLabelColor(l.color),
      })),
    );
    setApplied(new Set(((pairs.data ?? []) as Array<{ wa_label_id: string }>).map((p) => p.wa_label_id)));
  }, [accountId, contactId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, state set after the awaits
    load();
  }, [load]);

  async function change(label: TagChip, op: "add" | "remove") {
    setBusy(label.id);
    try {
      const res = await fetch("/api/whatsapp/chat-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, wa_label_id: label.id, op }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "A operação não foi aceita pelo WhatsApp.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar a etiqueta.");
    } finally {
      setBusy(null);
    }
  }

  const mine = all.filter((l) => applied.has(l.id));
  const available = all.filter((l) => !applied.has(l.id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageCircle className="h-3 w-3 text-emerald-600" />
          Etiquetas do WhatsApp
        </h3>
        <Popover>
          <PopoverTrigger className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            {available.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {all.length === 0
                  ? "Nenhuma etiqueta sincronizada ainda. Use “Sincronizar” no filtro de etiquetas da lista de conversas."
                  : "Todas as etiquetas já foram aplicadas."}
              </p>
            ) : (
              available.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy === l.id}
                  onClick={() => change(l, "add")}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
                >
                  <TagBadge tag={l} />
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mine.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Sem etiquetas</p>
        ) : (
          mine.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-0.5">
              <TagBadge tag={l} />
              <button
                type="button"
                disabled={busy === l.id}
                onClick={() => change(l, "remove")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label={`Remover ${l.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
