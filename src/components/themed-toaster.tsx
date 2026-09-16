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
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          color: "var(--popover-foreground)",
        },
        // Success (verde) / Error (vermelho) / Warning (amarelo) /
        // Info-dica (azul) — fundo translúcido, sem cor 100% chapada,
        // aplica automaticamente a qualquer toast.success/error/
        // warning/message('info') chamado em qualquer parte do app,
        // sem precisar tocar em cada chamada individual.
        classNames: {
          success:
            "!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-700 dark:!text-emerald-300",
          error:
            "!bg-red-500/10 !border-red-500/30 !text-red-700 dark:!text-red-300",
          warning:
            "!bg-amber-500/10 !border-amber-500/30 !text-amber-700 dark:!text-amber-300",
          info:
            "!bg-blue-500/10 !border-blue-500/30 !text-blue-700 dark:!text-blue-300",
        },
      }}
    />
  );
}
