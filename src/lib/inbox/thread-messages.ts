/**
 * Live messages are stored with `created_at = now`, so a message whose
 * `created_at` is well in the past was NOT just sent or received — it was
 * backfilled from WhatsApp history (see lib/whatsapp/history-import.ts).
 * The inbox treats those differently: they are slotted into the thread by
 * date and must not touch the conversation list's preview or unread
 * count, which describe the LATEST message.
 */
export const BACKFILL_AGE_MS = 2 * 60 * 1000;

export function isBackfilledMessage(createdAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && nowMs - t > BACKFILL_AGE_MS;
}

interface Dated {
  id: string;
  created_at?: string | null;
}

/**
 * Inserts a message at its chronological position (after any message with
 * the same timestamp), never duplicating one already present. Optimistic
 * `temp-` messages are left alone: they belong at the end and a backfill
 * must not make them vanish.
 */
export function insertMessageSorted<T extends Dated>(messages: T[], incoming: T): T[] {
  if (messages.some((m) => m.id === incoming.id)) return messages;
  const t = incoming.created_at ? Date.parse(incoming.created_at) : Number.NaN;
  if (!Number.isFinite(t)) return [...messages, incoming];

  let index = messages.length;
  for (let i = 0; i < messages.length; i++) {
    const other = messages[i].created_at ? Date.parse(messages[i].created_at as string) : Number.NaN;
    if (Number.isFinite(other) && other > t) {
      index = i;
      break;
    }
  }
  return [...messages.slice(0, index), incoming, ...messages.slice(index)];
}
