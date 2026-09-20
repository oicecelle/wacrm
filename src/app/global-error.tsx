"use client";

import { useEffect } from "react";

const SUPPORT_WHATSAPP = "5521990525962";

/**
 * Last-resort error boundary — only fires if the root layout itself
 * throws, which is why this renders its own <html>/<body> instead of
 * relying on layout.tsx (which is presumably what's broken).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const supportMessage = encodeURIComponent(
    `Olá! O sistema não carregou de jeito nenhum.${error.digest ? ` (código: ${error.digest})` : ""} Poderia me ajudar?`
  );

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            padding: 24,
            textAlign: "center",
            background: "#fff",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#262626" }}>
            O sistema não conseguiu carregar
          </h1>
          <p style={{ maxWidth: 360, fontSize: 14, color: "#737373" }}>
            Algo deu muito errado. Tente novamente, ou fale com o suporte se continuar
            acontecendo.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                borderRadius: 12,
                border: "1px solid #e5e5e5",
                background: "#fff",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#404040",
                cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${supportMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                borderRadius: 12,
                background: "#2563eb",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Falar com o suporte
            </a>
          </div>
          {error.digest && (
            <p style={{ fontSize: 10, color: "#a3a3a3" }}>Código do erro: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
