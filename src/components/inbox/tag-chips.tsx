"use client";

import { useMemo, useState } from "react";
import { MessageCircle, RefreshCw, Tag as TagIcon, Check, ListFilter } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tagKey, type ContactTagInfo, type TagChip } from "@/lib/inbox/contact-tag-map";

/**
 * One tag. The two kinds are told apart by SHAPE and ICON, not only by
 * colour (colours are chosen per tag, so they can't carry the meaning):
 *
 *   CRM tag            → round pill, tag icon        (lives in this system)
 *   WhatsApp label     → square-cornered, chat icon  (lives in the phone)
 */
export function TagBadge({ tag, className }: { tag: TagChip; className?: string }) {
  const isWa = tag.kind === "wa";
  return (
    <span
      title={`${isWa ? "Etiqueta do WhatsApp" : "Tag do CRM"}: ${tag.name}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium leading-none",
        isWa ? "rounded-[4px] border" : "rounded-full",
        className,
      )}
      style={
        isWa
          ? { backgroundColor: `${tag.color}33`, borderColor: tag.color, color: "var(--foreground)" }
          : { backgroundColor: `${tag.color}20`, color: tag.color }
      }
    >
      {isWa ? <MessageCircle className="h-2.5 w-2.5 shrink-0 text-emerald-600" /> : <TagIcon className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/** A compact row of badges for a conversation: up to `max`, then "+N". */
export function TagChipsRow({ info, max = 3 }: { info: ContactTagInfo | undefined; max?: number }) {
  if (!info) return null;
  const all = [...info.wa, ...info.crm];
  if (all.length === 0) return null;
  const shown = all.slice(0, max);
  const extra = all.length - shown.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <TagBadge key={tagKey(t)} tag={t} />
      ))}
      {extra > 0 && (
        <span
          className="text-[10px] text-muted-foreground"
          title={all
            .slice(max)
            .map((t) => t.name)
            .join(", ")}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

interface TagFilterProps {
  crmTags: TagChip[];
  waLabels: TagChip[];
  byContact: Map<string, ContactTagInfo>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Called after the labels were re-synced, so the parent can reload them. */
  onSynced: () => void;
}

/**
 * Tag filter with the two kinds in separate sections and, for each tag,
 * how many contacts have it — so you can tell at a glance who carries
 * which tag, not just filter blindly.
 */
export function TagFilter({ crmTags, waLabels, byContact, selected, onChange, onSynced }: TagFilterProps) {
  const [syncing, setSyncing] = useState(false);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const info of byContact.values()) {
      for (const t of [...info.crm, ...info.wa]) c.set(tagKey(t), (c.get(tagKey(t)) ?? 0) + 1);
    }
    return c;
  }, [byContact]);

  const toggle = (t: TagChip) => {
    const next = new Set(selected);
    const k = tagKey(t);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  };

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/labels/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Falha ao sincronizar");
      toast.success(`${body.labels ?? 0} etiqueta(s) do WhatsApp sincronizada(s).`);
      onSynced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar etiquetas.");
    } finally {
      setSyncing(false);
    }
  }

  const section = (title: string, tags: TagChip[], empty: string) => (
    <div className="py-1.5">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {tags.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        tags.map((t) => {
          const on = selected.has(tagKey(t));
          return (
            <button
              key={tagKey(t)}
              type="button"
              onClick={() => toggle(t)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              <TagBadge tag={t} />
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{counts.get(tagKey(t)) ?? 0}</span>
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <ListFilter className="h-3 w-3" />
        Etiquetas
        {selected.size > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{selected.size}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-popover-foreground">Filtrar por etiqueta</span>
          {selected.size > 0 && (
            <button type="button" onClick={() => onChange(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
              Limpar
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {section("Etiquetas do WhatsApp", waLabels, "Nenhuma ainda — use “Sincronizar” abaixo.")}
          <div className="border-t border-border" />
          {section("Tags do CRM", crmTags, "Nenhuma tag criada.")}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-[10px] text-muted-foreground">Mostra quem tem pelo menos uma das selecionadas</span>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            Sincronizar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
