import type { Deal, PipelineStage } from "@/types";
import { Calendar, Check, X, Flame, AlertCircle, Hourglass, Target } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

function formatWaitingSince(sinceStr?: string, side?: string) {
  if (!sinceStr) return null;
  const diffMs = new Date().getTime() - new Date(sinceStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  let timeStr = "";
  if (diffDays > 0) timeStr = `${diffDays}d`;
  else if (diffHours > 0) timeStr = `${diffHours}h`;
  else timeStr = "menos de 1h";

  const who = side === "lead" ? "lead" : "equipe";
  return `Aguardando ${who} (${timeStr})`;
}

export function DealCard({ deal, stage, onEdit, isOverlay }: DealCardProps) {
  const contactLabel = deal.contact?.name || deal.contact?.phone || "Sem contato";
  const assigneeLabel = deal.assignee?.full_name || null;
  const waitingLabel = formatWaitingSince(deal.waiting_since, deal.waiting_side);

  // Temperature classes
  const tempColors = {
    hot: "bg-red-500/10 text-red-600 border-red-500/20",
    warm: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    cold: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3.5 text-left shadow-sm transition-all ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-md"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      {/* Top badges & status row */}
      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5">
          {deal.temperature && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${tempColors[deal.temperature]}`}>
              <Flame className="h-2.5 w-2.5" />
              {deal.temperature}
            </span>
          )}
          {deal.score !== undefined && deal.score !== null && (
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[9px] font-bold">
              {deal.score}% engajado
            </span>
          )}
        </div>

        {deal.status === "won" && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase">
            <Check className="h-2.5 w-2.5" />
            Ganha
          </span>
        )}
        {deal.status === "lost" && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-500 uppercase">
            <X className="h-2.5 w-2.5" />
            Perdida
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          {deal.title}
        </h4>
      </div>

      {/* Contact row */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700 uppercase">
          {initials(deal.contact?.name, deal.contact?.phone)}
        </span>
        <span className="truncate text-xs font-semibold text-neutral-600">{contactLabel}</span>
      </div>

      {/* Waiting since indicator */}
      {waitingLabel && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 font-semibold bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded-lg w-fit">
          <Hourglass className="h-3 w-3 animate-spin duration-1000" />
          <span>{waitingLabel}</span>
        </div>
      )}

      {/* Objection alert */}
      {deal.main_objection && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-600 font-semibold bg-red-500/5 border border-red-500/10 px-2 py-0.5 rounded-lg">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">Objeção: {deal.main_objection}</span>
        </div>
      )}

      {/* Next Action indicator */}
      {deal.next_action && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600 font-semibold bg-blue-500/5 border border-blue-500/10 px-2 py-0.5 rounded-lg">
          <Target className="h-3 w-3 shrink-0" />
          <span className="truncate">Próxima ação: {deal.next_action}</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between pt-1.5 border-t border-neutral-100/50">
        <span className="text-sm font-black text-blue-600">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.expected_close_date && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>

      {assigneeLabel && (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={assigneeLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeLabel)}
          </span>
        </div>
      )}
    </button>
  );
}
