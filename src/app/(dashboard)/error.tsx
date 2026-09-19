"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, MessageCircle } from "lucide-react";

const SUPPORT_WHATSAPP = "5521976640033";

/**
 * Route-level error boundary for the whole (dashboard) area. Next.js
 * renders this in place of the failing page whenever a component
 * throws during render — there was no error.tsx anywhere in the app
 * before this, so any crash fell through to Next's bare default
 * screen with no way back into the app short of a manual reload.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  const supportMessage = encodeURIComponent(
    `Olá! Tive um erro no sistema.${error.digest ? ` (código: ${error.digest})` : ""} Poderia me ajudar?`
  );

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10">
        <AlertTriangle className="h-7 w-7 text-rose-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-foreground">Algo deu errado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Essa tela encontrou um problema inesperado. Você pode tentar de novo, ou falar com o
          suporte se continuar acontecendo.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <RotateCw className="h-4 w-4" />
          Tentar novamente
        </button>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${supportMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o suporte
        </a>
      </div>
      {error.digest && (
        <p className="text-[10px] text-muted-foreground/60">Código do erro: {error.digest}</p>
      )}
    </div>
  );
}
