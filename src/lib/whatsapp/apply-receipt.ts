import type { SupabaseClient } from "@supabase/supabase-js";

/** Forward-only ladder. `failed` is terminal and never touched by a receipt. */
const RANK: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };

/** Ids to look up for one bare WhatsApp id: Uazapi returns it as `owner:ID` on send, bare on echo. */
export function idVariants(bareIds: string[], owner?: string | null): string[] {
  const out = new Set<string>();
  for (const id of bareIds) {
    out.add(id);
    if (owner) out.add(`${owner}:${id}`);
  }
  return Array.from(out);
}

/**
 * Advances the status of OUR outbound messages when a delivery/read
 * receipt arrives. Only moves forward — receipts can arrive out of
 * order, and a late "delivered" must never undo "read" — and only
 * touches messages in this account's conversations that the customer
 * didn't send. Returns how many messages changed.
 */
export async function advanceMessageStatuses(
  db: SupabaseClient,
  accountId: string,
  bareIds: string[],
  state: "delivered" | "read",
  owner?: string | null,
): Promise<number> {
  const variants = idVariants(bareIds, owner);
  if (variants.length === 0) return 0;

  const { data, error } = await db
    .from("messages")
    .select("id, status, conversations!inner(account_id)")
    .in("message_id", variants)
    .eq("conversations.account_id", accountId)
    .neq("sender_type", "customer");
  if (error || !data) return 0;

  const target = RANK[state];
  const toUpdate = (data as Array<{ id: string; status: string | null }>)
    // `failed` has no rank on purpose and must be skipped explicitly —
    // defaulting an unknown status to "sent" would let a receipt
    // resurrect a message that never went out.
    .filter((m) => m.status !== "failed" && (RANK[m.status ?? "sent"] ?? 1) < target)
    .map((m) => m.id);
  if (toUpdate.length === 0) return 0;

  const { error: updErr } = await db.from("messages").update({ status: state }).in("id", toUpdate);
  return updErr ? 0 : toUpdate.length;
}
