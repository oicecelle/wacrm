import { HISTORY_REQUEST_STALE_MS } from "./history-request";

export interface HistoryRequestRow {
  id: string;
  state: "pending" | "completed" | "timeout" | "failed";
  received_messages: number | null;
  has_more: boolean | null;
  history_access: string | null;
  error: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface HistoryRequestView {
  phase: "idle" | "waiting" | "done" | "problem";
  text: string;
  canRequest: boolean;
  /** WhatsApp confirmed there is nothing older: the button should go away. */
  reachedStart: boolean;
}

/** How long a finished result stays on screen before the thread goes back to normal. */
const RESULT_VISIBLE_MS = 10 * 60 * 1000;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What the "load earlier messages" control should say, from the latest
 * request. Never promises more than we know: the phone may not answer,
 * and only `has_more: false` proves the start of the conversation.
 */
export function describeHistoryRequest(row: HistoryRequestRow | null, nowMs: number = Date.now()): HistoryRequestView {
  const idle: HistoryRequestView = { phase: "idle", text: "", canRequest: true, reachedStart: false };
  if (!row) return idle;

  const age = nowMs - Date.parse(row.requested_at);
  const state = row.state === "pending" && age >= HISTORY_REQUEST_STALE_MS ? "timeout" : row.state;

  if (state === "pending") {
    return {
      phase: "waiting",
      canRequest: false,
      reachedStart: false,
      text: "Pedido enviado ao celular. As mensagens aparecem aqui quando chegarem — pode levar alguns instantes. Mantenha o WhatsApp aberto no celular.",
    };
  }

  const reachedStart = state === "completed" && row.has_more === false;
  const recent = nowMs - Date.parse(row.completed_at ?? row.requested_at) < RESULT_VISIBLE_MS;

  if (state === "completed") {
    const n = row.received_messages ?? 0;
    if (n > 0) {
      const base = `${n} ${plural(n, "mensagem anterior carregada", "mensagens anteriores carregadas")}.`;
      return recent || reachedStart
        ? { phase: "done", canRequest: !reachedStart, reachedStart, text: reachedStart ? `${base} Você chegou ao início da conversa.` : base }
        : idle;
    }
    if (reachedStart) {
      return { phase: "done", canRequest: false, reachedStart, text: "Início da conversa: não há mensagens anteriores." };
    }
    if (!recent) return idle;
    if (row.history_access === "unavailable") {
      return { phase: "problem", canRequest: true, reachedStart: false, text: "O WhatsApp não liberou mais mensagens anteriores desta conversa." };
    }
    return { phase: "problem", canRequest: true, reachedStart: false, text: "O celular respondeu, mas não enviou mensagens anteriores." };
  }

  if (!recent) return idle;
  if (state === "failed") {
    return { phase: "problem", canRequest: true, reachedStart: false, text: `Não foi possível pedir as mensagens${row.error ? `: ${row.error}` : "."}` };
  }
  return {
    phase: "problem",
    canRequest: true,
    reachedStart: false,
    text: "O celular não respondeu. Abra o WhatsApp no celular e tente de novo.",
  };
}
