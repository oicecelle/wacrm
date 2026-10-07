import type { SupabaseClient } from "@supabase/supabase-js";
import { FIRST_PAIRING_MAX_CONTACTS } from "./history-import";

/**
 * Atomically reserves room for `requested` new contacts under the
 * first-pairing cap (see reserve_history_contact_slots, migration 082).
 *
 * Fails CLOSED: if the reservation can't be made (database error, missing
 * function, unknown connection) it grants 0 — creating nothing is the
 * safe outcome when the limit can't be enforced. Messages for contacts
 * that already exist are unaffected.
 */
export async function reserveHistoryContactSlots(
  db: SupabaseClient,
  configId: string,
  requested: number,
  max: number = FIRST_PAIRING_MAX_CONTACTS,
): Promise<number> {
  if (requested <= 0) return 0;
  try {
    const { data, error } = await db.rpc("reserve_history_contact_slots", {
      p_config_id: configId,
      p_requested: requested,
      p_max: max,
    });
    if (error) {
      console.error("[history-cap] reservation failed, creating no contacts:", error.message);
      return 0;
    }
    const granted = typeof data === "number" ? data : Number(data);
    return Number.isFinite(granted) ? Math.max(0, Math.min(requested, granted)) : 0;
  } catch (err) {
    console.error("[history-cap] reservation threw, creating no contacts:", err instanceof Error ? err.message : err);
    return 0;
  }
}
