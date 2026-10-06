import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingContact } from "@/lib/contacts/dedupe";
import {
  phoneFromChatId,
  type ParsedChatLabels,
  type ParsedLabelDefinition,
} from "./uazapi-events";

/** A label as stored here (mirror of WhatsApp's own, not a CRM tag). */
export interface WhatsappLabel {
  wa_label_id: string;
  name: string;
  color: number | null;
  deleted: boolean;
}

/**
 * Applies a `labels` event: a label was created, renamed, recoloured or
 * deleted. A deletion keeps the row (flagged) so an out-of-order event
 * can't resurrect it, and drops every contact association for it.
 * Fields the event doesn't carry are left as they were.
 */
export async function applyLabelDefinition(
  db: SupabaseClient,
  accountId: string,
  label: ParsedLabelDefinition,
): Promise<void> {
  if (label.deleted) {
    await db
      .from("whatsapp_labels")
      .upsert(
        { account_id: accountId, wa_label_id: label.labelId, deleted: true, updated_at: new Date().toISOString() },
        { onConflict: "account_id,wa_label_id" },
      );
    await db.from("contact_whatsapp_labels").delete().eq("account_id", accountId).eq("wa_label_id", label.labelId);
    return;
  }

  const row: Record<string, unknown> = {
    account_id: accountId,
    wa_label_id: label.labelId,
    deleted: false,
    updated_at: new Date().toISOString(),
  };
  if (label.name !== undefined) row.name = label.name;
  if (label.color !== undefined) row.color = label.color;
  await db.from("whatsapp_labels").upsert(row, { onConflict: "account_id,wa_label_id" });
}

/**
 * Makes a contact's WhatsApp labels equal `labelIds` (the event reports
 * the RESULTING set; empty means everything was removed). Applied as a
 * diff — only the changed pairs are written — so a busy chat doesn't
 * rewrite its rows on every event.
 */
export async function replaceContactLabels(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  labelIds: string[],
): Promise<{ added: number; removed: number }> {
  const wanted = new Set(labelIds);
  const { data } = await db.from("contact_whatsapp_labels").select("wa_label_id").eq("contact_id", contactId);
  const current = new Set(((data ?? []) as Array<{ wa_label_id: string }>).map((r) => r.wa_label_id));

  const toRemove = [...current].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    await db.from("contact_whatsapp_labels").delete().eq("contact_id", contactId).in("wa_label_id", toRemove);
  }
  if (toAdd.length > 0) {
    await db.from("contact_whatsapp_labels").upsert(
      toAdd.map((wa_label_id) => ({ contact_id: contactId, account_id: accountId, wa_label_id })),
      { onConflict: "contact_id,wa_label_id", ignoreDuplicates: true },
    );
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/**
 * Applies a `chat_labels` event to the matching CONTACT. Never creates a
 * contact: someone merely being labelled in the phone is not a reason to
 * add them to the CRM. Group chats and LID-only chats are skipped
 * (no phone to match).
 */
export async function applyChatLabels(
  db: SupabaseClient,
  accountId: string,
  event: ParsedChatLabels,
): Promise<"applied" | "no_phone" | "no_contact"> {
  const phone = phoneFromChatId(event.chatId);
  if (!phone) return "no_phone";
  const contact = await findExistingContact(db, accountId, phone);
  if (!contact) return "no_contact";
  await replaceContactLabels(db, accountId, contact.id, event.labelIds);
  return "applied";
}

/**
 * Pulls the label DEFINITIONS from the instance (`GET /labels`, whose
 * Label schema is documented: `labelid` = WhatsApp's id, `name`,
 * `color` 0–19). Used to fill in labels that existed before we started
 * listening to events. Returns how many were saved.
 */
export async function syncLabelDefinitions(
  db: SupabaseClient,
  accountId: string,
  baseUrl: string,
  token: string,
): Promise<number> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/labels`, {
    method: "GET",
    headers: { token, apikey: token },
  });
  if (!res.ok) throw new Error(`Uazapi GET /labels failed: HTTP ${res.status}`);
  const list = (await res.json()) as unknown;
  if (!Array.isArray(list)) return 0;

  const rows = list
    .map((l) => {
      const o = l as { labelid?: unknown; id?: unknown; name?: unknown; color?: unknown };
      const id = o.labelid ?? o.id;
      if (typeof id !== "string" && typeof id !== "number") return null;
      return {
        account_id: accountId,
        wa_label_id: String(id),
        name: typeof o.name === "string" ? o.name : "",
        color: typeof o.color === "number" ? o.color : null,
        deleted: false,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return 0;
  const { error } = await db.from("whatsapp_labels").upsert(rows, { onConflict: "account_id,wa_label_id" });
  if (error) throw new Error(error.message);
  return rows.length;
}
