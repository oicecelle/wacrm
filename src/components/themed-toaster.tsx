"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

import { useTheme } from "@/hooks/use-theme";
import { DEFAULT_MODE } from "@/lib/themes";

// Returns false during SSR and the first hydration render, true after —
// the sanctioned (warning-free, no setState-in-effect) way to diverge
// server vs client. Lets us match the server-rendered default on first
// paint, then adopt the real mode.
const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Toaster wrapper that tracks the active light/dark mode.
 *
 * Lives inside <ThemeProvider> (see layout.tsx) so it can read the
 * current mode and hand it to sonner. Colors are driven off the same
 * CSS tokens as the rest of the app, so a toast looks at home in
 * either mode without a second palette to maintain.
 *
 * The theme is gated behind `useIsClient`: the server renders
 * DEFAULT_MODE, so first client paint must too, otherwise a light-mode
 * user hydrates with a different sonner `theme` attribute than the
 * server emitted and React logs a hydration mismatch.
 */
export function ThemedToaster() {
  const { mode } = useTheme();
  const isClient = useIsClient();
  return (
    <Toaster
      theme={isClient ? mode : DEFAULT_MODE}
      position="top-right"
      offset={{ top: "72px", right: "16px" }}
      style={{ width: "min(380px, calc(100vw - 32px))" }}
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          color: "var(--popover-foreground)",
        },
        // Success (verde) / Error (vermelho) / Warning (amarelo) /
        // Info-dica (azul) — cor sólida suave (não translúcida, pra
        // não deixar o conteúdo atrás aparecer por baixo) e não 100%
        // saturada. Aplica automaticamente a qualquer toast.success/
        // error/warning/info chamado em qualquer parte do app.
        classNames: {
          success:
            "!bg-emerald-50 dark:!bg-emerald-950 !border-emerald-300 dark:!border-emerald-800 !text-emerald-700 dark:!text-emerald-300",
          error:
            "!bg-red-50 dark:!bg-red-950 !border-red-300 dark:!border-red-800 !text-red-700 dark:!text-red-300",
          warning:
            "!bg-amber-50 dark:!bg-amber-950 !border-amber-300 dark:!border-amber-800 !text-amber-700 dark:!text-amber-300",
          info:
            "!bg-blue-50 dark:!bg-blue-950 !border-blue-300 dark:!border-blue-800 !text-blue-700 dark:!text-blue-300",
        },
      }}
    />
  );
}
