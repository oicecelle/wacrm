/**
 * Decides what a paced outbound send should do once it has reserved
 * its slot (see reserve_automation_send_slot / reserve_flow_send_slot).
 *
 * Why three outcomes instead of "wait until the slot":
 *
 * - The work runs inside a webhook request, which can't sleep for
 *   minutes — long delays must be parked and resumed by the cron.
 * - But the cron only ticks about once a minute and releases everything
 *   that came due in one go. If EVERY paced send were parked, a
 *   4-message conversation with a 5-second interval would take ~3
 *   minutes, and a burst would still go out in once-a-minute clumps.
 *
 * So short gaps are waited out inline (the messages really are spaced
 * by the configured interval and a sequence feels natural), and only
 * the excess is deferred. A per-run inline budget stops a long
 * sequence from holding the request open for too long.
 */
export const INLINE_WAIT_MAX_MS = 6_000;
export const INLINE_BUDGET_MS = 12_000;
/** Below this the slot is effectively "now" — not worth any wait. */
const NOW_THRESHOLD_MS = 500;

export type PacedSendPlan =
  | { action: "send_now" }
  | { action: "wait_inline"; ms: number }
  | { action: "defer"; until: string };

export function planPacedSend(
  slotIso: string | null | undefined,
  inlineBudgetLeftMs: number,
  nowMs: number = Date.now(),
): PacedSendPlan {
  if (!slotIso) return { action: "send_now" };
  const waitMs = new Date(slotIso).getTime() - nowMs;
  if (!Number.isFinite(waitMs) || waitMs <= NOW_THRESHOLD_MS) return { action: "send_now" };
  if (waitMs <= INLINE_WAIT_MAX_MS && waitMs <= inlineBudgetLeftMs) {
    return { action: "wait_inline", ms: Math.ceil(waitMs) };
  }
  return { action: "defer", until: slotIso };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
