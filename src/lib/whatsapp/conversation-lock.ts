import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConversationLockOptions {
  /** How long to wait for a busy conversation before running anyway. */
  maxWaitMs?: number;
  pollMs?: number;
  /** Lease length: a crashed holder frees the conversation after this. */
  ttlSeconds?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Unique per call; defaults to a random id. */
  holder?: string;
}

/**
 * Runs `fn` while holding a short lease on the conversation, so the work
 * triggered by two messages from the same customer runs ONE AT A TIME.
 *
 * Why it exists: the webhook saves a message, answers Uazapi, and only
 * then runs flows / automations / AI. That makes replies fast, but lets
 * the customer's NEXT message arrive while the previous one is still
 * being processed — and the flow engine drops a message that meets a run
 * still being created (it reads it as a duplicate). Two quick messages
 * ("oi" then "quero agendar") could lose the second.
 *
 * It FAILS OPEN on purpose. If the lock can't be taken in time, or the
 * lock service errors, `fn` runs anyway: processing two messages
 * concurrently is the behaviour before this existed, while skipping the
 * work would silently drop an automation. The lease expires by itself,
 * and only the holder can release it.
 */
export async function withConversationLock<T>(
  db: SupabaseClient,
  conversationId: string,
  fn: () => Promise<T>,
  opts: ConversationLockOptions = {},
): Promise<T> {
  const maxWaitMs = opts.maxWaitMs ?? 15_000;
  const pollMs = opts.pollMs ?? 300;
  const ttlSeconds = opts.ttlSeconds ?? 60;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const holder = opts.holder ?? `h-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

  let acquired = false;
  try {
    let waited = 0;
    for (;;) {
      const { data, error } = await db.rpc("acquire_conversation_lock", {
        p_conversation_id: conversationId,
        p_holder: holder,
        p_ttl_seconds: ttlSeconds,
      });
      if (error) {
        console.error("[conversation-lock] acquire failed, running without the lock:", error.message);
        break;
      }
      if (data === true) {
        acquired = true;
        break;
      }
      if (waited >= maxWaitMs) {
        console.warn(`[conversation-lock] still busy after ${waited}ms, running anyway`);
        break;
      }
      await sleep(pollMs);
      waited += pollMs;
    }
  } catch (err) {
    console.error("[conversation-lock] acquire threw, running without the lock:", err instanceof Error ? err.message : err);
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      try {
        await db.rpc("release_conversation_lock", { p_conversation_id: conversationId, p_holder: holder });
      } catch {
        /* the lease expires by itself */
      }
    }
  }
}
