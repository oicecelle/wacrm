import { FIRST_PAIRING_MAX_CONTACTS } from "./history-import";

/**
 * The notice shown when a number is connected: how the inbox works, as
 * short as it can be. Kept as data so the wording lives in one place and
 * a test can keep it honest (short, and quoting the real limit).
 */
export interface InboxNoticePoint {
  title: string;
  text: string;
}

const limit = FIRST_PAIRING_MAX_CONTACTS.toLocaleString("pt-BR");

export const INBOX_NOTICE_TITLE = "Como funciona a sua Caixa de Entrada";

export const INBOX_NOTICE_POINTS: InboxNoticePoint[] = [
  {
    title: "É o espelho do seu WhatsApp.",
    text: "O que você envia ou recebe pelo celular aparece aqui, e o que você envia daqui aparece no celular.",
  },
  {
    title: "Conversas antigas.",
    text: `Ao conectar um número novo, importamos o que o WhatsApp enviar (até ${limit} conversas; pode levar alguns minutos e não é garantido). Depois, use “Carregar mensagens anteriores” dentro da conversa.`,
  },
  {
    title: "Traços como no WhatsApp.",
    text: "✓ enviada · ✓✓ entregue · ✓✓ azul lida (só se o contato deixou a confirmação de leitura ativa). Se você lê no celular, fica lida aqui também.",
  },
  {
    title: "Etiquetas e tags são diferentes.",
    text: "Etiquetas vêm do WhatsApp do celular; tags existem só no CRM.",
  },
];

// ── "I understood" memory ────────────────────────────────────────

/** Minimal slice of the Storage API, so this can be tested without a browser. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Bump the version when the notice changes enough that people should see it again. */
export const INBOX_NOTICE_VERSION = 1;

export const inboxNoticeStorageKey = (accountId: string) => `inbox-connection-notice:v${INBOX_NOTICE_VERSION}:${accountId}`;

export function hasAcknowledgedInboxNotice(storage: KeyValueStorage | null, accountId: string | null | undefined): boolean {
  if (!storage || !accountId) return false;
  try {
    return storage.getItem(inboxNoticeStorageKey(accountId)) === "1";
  } catch {
    return false; // storage blocked (private mode): showing it again is harmless
  }
}

export function acknowledgeInboxNotice(storage: KeyValueStorage | null, accountId: string | null | undefined): void {
  if (!storage || !accountId) return;
  try {
    storage.setItem(inboxNoticeStorageKey(accountId), "1");
  } catch {
    /* nothing to do: it just may be shown again */
  }
}
