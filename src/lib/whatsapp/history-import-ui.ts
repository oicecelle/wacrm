/** After this long still 'pending', WhatsApp probably isn't going to send it. */
export const HISTORY_PENDING_GIVE_UP_MS = 10 * 60 * 1000;

/**
 * What to tell the person about the first-pairing history import.
 * Returns null when there is nothing to say (an old connection, state
 * NULL). `sawOpenState` is whether THIS screen watched the import being
 * pending/importing — "done" is only worth announcing to someone who
 * was waiting for it, not to everyone who opens the page later.
 */
export function describeHistoryImport(
  state: string | null | undefined,
  startedAt: string | null | undefined,
  sawOpenState: boolean,
  nowMs: number = Date.now(),
): string | null {
  if (state === "importing") {
    return "Importando as conversas antigas do seu WhatsApp. Elas vão aparecendo na Caixa de Entrada — você já pode continuar usando o sistema.";
  }
  if (state === "pending") {
    const started = startedAt ? Date.parse(startedAt) : NaN;
    if (Number.isFinite(started) && nowMs - started > HISTORY_PENDING_GIVE_UP_MS) {
      return "O WhatsApp ainda não enviou as conversas antigas. Se não chegarem, abra uma conversa e use “Carregar mensagens anteriores”.";
    }
    return "Aguardando o WhatsApp enviar suas conversas antigas. Pode levar alguns minutos depois de conectar.";
  }
  if (state === "done" && sawOpenState) {
    return "Histórico importado. As conversas anteriores já estão na Caixa de Entrada.";
  }
  return null;
}
