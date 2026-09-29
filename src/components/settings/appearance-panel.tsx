"use client";

import { useState } from "react";
import { Check, GripVertical, Moon, RotateCcw, SunMoon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { MODES, type Mode } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { applySidebarOrder, getSidebarOrder, resetSidebarOrder, setSidebarOrder } from "@/lib/sidebar-order";
import { SettingsPanelHead } from "./settings-panel-head";

// Keep these keys/labels in sync with the `key`s in
// components/layout/sidebar.tsx's defaultMenuItems — this is a
// lightweight, icon-free mirror just for the reorder list, so this
// file doesn't need to pull in every nav icon just to render labels.
const REORDERABLE_ITEMS: { key: string; label: string }[] = [
  { key: "/agenda", label: "Agenda" },
  { key: "/inbox", label: "Caixa de Entrada" },
  { key: "/dashboard", label: "Dashboard" },
  { key: "/pipelines", label: "CRM" },
  { key: "/contacts", label: "Contatos" },
  { key: "/financeiro", label: "Financeiro" },
  { key: "/documentos", label: "Documentos" },
  { key: "/equipe", label: "Equipe" },
  { key: "/servicos", label: "Serviços" },
  { key: "marketing-group", label: "Marketing" },
  { key: "/automations", label: "Automações" },
  { key: "/relatorios", label: "Relatórios" },
  { key: "/comunicacao/importacao", label: "Migração" },
  { key: "/comunicacao/portal-config", label: "Configurar Portal" },
  { key: "/comunicacao/link-bio", label: "Link na Bio" },
];

function SidebarOrderSection() {
  const [items, setItems] = useState(() => applySidebarOrder(REORDERABLE_ITEMS, getSidebarOrder()));
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function persist(next: { key: string; label: string }[]) {
    setItems(next);
    setSidebarOrder(next.map((i) => i.key));
  }

  function handleDrop() {
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const next = [...items];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      persist(next);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  }

  function handleReset() {
    setItems(REORDERABLE_ITEMS);
    resetSidebarOrder();
  }

  return (
    <div className="mt-8 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Ordem do menu lateral</h3>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar padrão
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Arraste os itens pra reorganizar o menu do jeito que preferir. Só muda pra você, neste
        navegador.
      </p>
      <div className="max-w-md space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={item.key}
            draggable
            onDragStart={() => setDraggedIdx(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIdx(idx);
            }}
            onDragEnd={handleDrop}
            className={cn(
              "flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground transition-opacity active:cursor-grabbing",
              draggedIdx === idx && "opacity-40",
              dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx && "ring-2 ring-primary",
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Appearance panel — light/dark mode + accent-color picker.
 *
 * Two independent controls: a mode toggle (light / dark) and the
 * accent grid. Either applies + persists immediately. No save button:
 * each change is a single attribute swap on <html>, there's nothing
 * to roll back.
 *
 * Persistence: localStorage only (device-scoped). The boot script in
 * layout.tsx replays both choices before first paint on subsequent
 * loads.
 */
export function AppearancePanel() {
  const { mode, setMode } = useTheme();
  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Aparência"
        description="Escolha o modo usado em todo o sistema. Salvo neste dispositivo — experimente, muda na hora."
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          Modo
        </h3>

        <div
          role="radiogroup"
          aria-label="Modo de cor"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <SidebarOrderSection />
    </section>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  const modeLabel = isLight ? "Claro" : "Escuro";
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={`Usar modo ${modeLabel.toLowerCase()}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold text-foreground">
        {modeLabel}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          Active
        </span>
      )}
    </button>
  );
}

