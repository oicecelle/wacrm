import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A `history` batch with `event: "status"` means one of two things:
 *
 *  - a MANUAL request finished (`request_chat` is present): the result of
 *    a "load earlier messages" click — how many arrived, whether the
 *    start of the conversation was reached, whether the phone refused;
 *  - the PAIRING sync finished (no `request_chat`,
 *    `batchHistoryStatus: "complete"`).
 */
export type ParsedHistoryStatus =
  | {
      kind: "manual";
      requestChat: string;
      state: "completed" | "timeout";
      receivedMessages: number | null;
      /** true = more messages exist; false = start of the conversation; null = unknown */
      hasMore: boolean | null;
      historyAccess: string | null;
    }
  | { kind: "pairing_complete" };

export function parseHistoryStatusBatch(body: unknown): ParsedHistoryStatus | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;

  if (typeof b.request_chat === "string" && b.request_chat) {
    return {
      kind: "manual",
      requestChat: b.request_chat,
      // The docs list `completed` and `timeout`; anything else is treated
      // as not-completed rather than claiming success.
      state: b.status === "completed" ? "completed" : "timeout",
      receivedMessages: typeof b.received_messages === "number" ? b.received_messages : null,
      hasMore: typeof b.has_more === "boolean" ? b.has_more : null,
      historyAccess: typeof b.history_access === "string" ? b.history_access : null,
    };
  }
  if (b.batchHistoryStatus === "complete") return { kind: "pairing_complete" };
  return null;
}

/**
 * Records the outcome on the most recent PENDING request for that chat
 * (a person clicks once and waits; if they click twice, the newest is
 * the one still being waited on). Returns whether a request was updated.
 */
export async function applyManualHistoryStatus(
  db: SupabaseClient,
  accountId: string,
  status: Extract<ParsedHistoryStatus, { kind: "manual" }>,
): Promise<boolean> {
  const { data } = await db
    .from("history_sync_requests")
    .select("id")
    .eq("account_id", accountId)
    .eq("chat_jid", status.requestChat)
    .eq("state", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;

  await db
    .from("history_sync_requests")
    .update({
      state: status.state,
      received_messages: status.receivedMessages,
      has_more: status.hasMore,
      history_access: status.historyAccess,
      completed_at: new Date().toISOString(),
    })
    .eq("id", (data as { id: string }).id);
  return true;
}

/** Closes the first-pairing window once WhatsApp says the sync is complete. */
export async function markPairingImportDone(db: SupabaseClient, configId: string): Promise<void> {
  await db
    .from("whatsapp_config")
    .update({ history_import_state: "done" })
    .eq("id", configId)
    .in("history_import_state", ["pending", "importing"]);
}

/** First history batch of a pairing: pending → importing (a no-op for any other state). */
export async function markPairingImportStarted(db: SupabaseClient, configId: string): Promise<void> {
  await db
    .from("whatsapp_config")
    .update({ history_import_state: "importing" })
    .eq("id", configId)
    .eq("history_import_state", "pending");
}
