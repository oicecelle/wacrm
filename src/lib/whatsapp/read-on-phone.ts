import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingContact } from "@/lib/contacts/dedupe";
import { bareMessageId, phoneFromChatId } from "./uazapi-events";

/**
 * The clinic opened this conversation on its own phone: WhatsApp reports
 * a READ receipt from our account for the customer's messages. Clears
 * the unread badge here — but only when the receipt covers the
 * customer's LATEST message. Receipts can arrive late; one that only
 * covers older messages must not erase the badge of a newer message the
 * clinic hasn't seen.
 *
 * Returns whether the badge was cleared. Never creates anything: a chat
 * that isn't a contact/conversation here is simply ignored.
 */
export async function markConversationReadFromPhone(
  db: SupabaseClient,
  accountId: string,
  chatId: string,
  readMessageIds: string[],
): Promise<boolean> {
  const phone = phoneFromChatId(chatId);
  if (!phone || readMessageIds.length === 0) return false;

  const contact = await findExistingContact(db, accountId, phone);
  if (!contact) return false;

  const { data: conv } = await db
    .from("conversations")
    .select("id, unread_count")
    .eq("account_id", accountId)
    .eq("contact_id", contact.id)
    .maybeSingle();
  const conversation = conv as { id: string; unread_count: number | null } | null;
  if (!conversation || !conversation.unread_count) return false;

  const { data: latest } = await db
    .from("messages")
    .select("message_id")
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "customer")
    .not("message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestId = (latest as { message_id: string } | null)?.message_id;
  if (!latestId) return false;

  const covered = new Set(readMessageIds.map(bareMessageId));
  if (!covered.has(bareMessageId(latestId))) return false;

  await db.from("conversations").update({ unread_count: 0 }).eq("id", conversation.id);
  return true;
}
