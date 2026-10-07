import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingContact, findExistingContactsBatch, normalizeKey } from "@/lib/contacts/dedupe";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { idVariants } from "./apply-receipt";
import { bareMessageId } from "./uazapi-events";
import type {
  HistoryMessageRow,
  HistoryNewContact,
  HistoryStore,
} from "./history-import";

const CHUNK = 100;
const MSG_CHUNK = 200;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * HistoryStore over Supabase. Everything is scoped to `accountId`; the
 * service-role client bypasses RLS, so that scoping is explicit here.
 *
 * `owner` is the connected number: Uazapi hands ids back as
 * `owner:ID` on messages we sent and bare on echoes, so duplicates are
 * checked against both forms.
 */
export function createSupabaseHistoryStore(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  owner?: string | null,
  opts: { pauseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): HistoryStore {
  // Every inserted message becomes a Realtime event for every open inbox
  // of the account (and Realtime is shared by the whole project). A big
  // import written in one burst can lag live messages for everyone, so
  // the chunks are paced instead of fired back to back.
  const pauseMs = opts.pauseMs ?? 250;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  async function conversationsFor(contactIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const chunk of chunks(contactIds, CHUNK)) {
      const { data } = await db
        .from("conversations")
        .select("id, contact_id")
        .eq("account_id", accountId)
        .in("contact_id", chunk);
      for (const row of (data ?? []) as Array<{ id: string; contact_id: string }>) out.set(row.contact_id, row.id);
    }
    return out;
  }

  return {
    async findContactIds(phones) {
      const found = await findExistingContactsBatch(db, accountId, phones);
      const out = new Map<string, string>();
      for (const phone of phones) {
        const contact = found.get(normalizeKey(phone));
        if (contact) out.set(phone, contact.id);
      }
      return out;
    },

    async createContacts(list: HistoryNewContact[]) {
      const out = new Map<string, string>();
      const created: Array<{ id: string; phone: string; name: string }> = [];

      for (const chunk of chunks(list, CHUNK)) {
        const rows = chunk.map((c) => ({
          account_id: accountId,
          user_id: userId,
          phone: c.phone,
          name: c.name,
          is_group: false,
        }));
        const bulk = await db.from("contacts").insert(rows).select("id, phone");
        if (!bulk.error && bulk.data) {
          for (const r of bulk.data as Array<{ id: string; phone: string }>) {
            out.set(r.phone, r.id);
            created.push({ ...r, name: chunk.find((c) => c.phone === r.phone)?.name ?? r.phone });
          }
          continue;
        }
        // One duplicate (a live message created the contact meanwhile)
        // fails the whole insert — retry one by one to isolate it.
        for (const c of chunk) {
          const one = await db
            .from("contacts")
            .insert({ account_id: accountId, user_id: userId, phone: c.phone, name: c.name, is_group: false })
            .select("id, phone")
            .single();
          if (!one.error && one.data) {
            out.set(c.phone, (one.data as { id: string }).id);
            created.push({ id: (one.data as { id: string }).id, phone: c.phone, name: c.name });
          } else {
            const raced = await findExistingContact(db, accountId, c.phone);
            if (raced) out.set(c.phone, raced.id);
          }
        }
      }

      // Same companion rows the live path writes for a new contact:
      // a patient record (same id) and the WhatsApp push name. Not fatal.
      try {
        for (const chunk of chunks(created, CHUNK)) {
          await db.from("patients").upsert(
            chunk.map((c) => ({
              id: c.id,
              clinic_id: accountId,
              name: c.name,
              phone: c.phone,
              lead_score: 50,
              // NO tags. A contact created from old history hasn't done
              // anything yet that says what it is — the live path tags new
              // contacts 'lead-whatsapp' because they just wrote in; these
              // may be a client from years ago, a supplier, a wrong number.
              // Tags come later, from real interactions.
              tags: [],
              stage: "novo",
            })),
            { onConflict: "id", ignoreDuplicates: true },
          );
          const named = chunk.filter((c) => c.name !== c.phone);
          if (named.length > 0) {
            await db
              .from("contact_whatsapp_names")
              .upsert(named.map((c) => ({ contact_id: c.id, whatsapp_name: c.name })), { onConflict: "contact_id" });
          }
        }
      } catch (err) {
        console.error("[history-store] companion rows failed:", err instanceof Error ? err.message : err);
      }

      return out;
    },

    findConversations: conversationsFor,

    async createConversations(rows) {
      for (const chunk of chunks(rows, CHUNK)) {
        // unique (account_id, contact_id): a conversation a live message
        // created meanwhile is kept, not duplicated or overwritten.
        await db.from("conversations").upsert(
          chunk.map((r) => ({
            account_id: accountId,
            user_id: userId,
            contact_id: r.contactId,
            last_message_at: r.lastMessageAt,
            last_message_text: r.lastMessageText,
            last_message_from_me: r.lastFromMe,
            unread_count: 0,
          })),
          { onConflict: "account_id,contact_id", ignoreDuplicates: true },
        );
      }
      return conversationsFor(rows.map((r) => r.contactId));
    },

    async existingMessageIds(messageIds) {
      const found = new Set<string>();
      for (const chunk of chunks(messageIds, MSG_CHUNK)) {
        const variants = idVariants(chunk, owner);
        const rows = await fetchAllRows<{ message_id: string }>((from, to) =>
          db
            .from("messages")
            .select("message_id, conversations!inner(account_id)")
            .in("message_id", variants)
            .eq("conversations.account_id", accountId)
            .order("id")
            .range(from, to) as never,
        );
        for (const r of rows) if (r.message_id) found.add(bareMessageId(r.message_id));
      }
      return found;
    },

    async insertMessages(rows: HistoryMessageRow[]) {
      let inserted = 0;
      const batches = chunks(rows, MSG_CHUNK);
      for (let b = 0; b < batches.length; b++) {
        const chunk = batches[b];
        if (b > 0 && pauseMs > 0) await sleep(pauseMs);
        const payload = chunk.map((r) => ({
          conversation_id: r.conversationId,
          sender_type: r.fromMe ? "agent" : "customer",
          sender_id: r.fromMe ? userId : null,
          content_type: r.contentType,
          content_text: r.contentText,
          media_url: null,
          status: r.status,
          message_id: r.messageId,
          created_at: r.createdAt,
        }));
        const bulk = await db.from("messages").insert(payload);
        if (!bulk.error) {
          inserted += payload.length;
          continue;
        }
        // Isolate the bad row instead of losing the whole chunk.
        for (const row of payload) {
          const one = await db.from("messages").insert(row);
          if (!one.error) inserted += 1;
          else console.error("[history-store] message insert failed:", one.error.message);
        }
      }
      return inserted;
    },
  };
}
