"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, MessageCircle } from "lucide-react";

const SUPPORT_WHATSAPP = "5521990525962";

/**
 * Root-level error boundary — catches crashes on routes outside the
 * (dashboard) group (portal pages the patient sees, landing, join
 * links) that don't have their own more specific error.tsx.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  const supportMessage = encodeURIComponent(
    `Olá! Tive um erro numa página do sistema.${error.digest ? ` (código: ${error.digest})` : ""} Poderia me ajudar?`
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <AlertTriangle className="h-7 w-7 text-rose-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-neutral-800">Algo deu errado</h1>
        <p className="max-w-sm text-sm text-neutral-500">
          Essa página encontrou um problema inesperado. Você pode tentar de novo, ou falar com o
          suporte se continuar acontecendo.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          <RotateCw className="h-4 w-4" />
          Tentar novamente
        </button>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${supportMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o suporte
        </a>
      </div>
      {error.digest && (
        <p className="text-[10px] text-neutral-400">Código do erro: {error.digest}</p>
      )}
    </div>
  );
}
