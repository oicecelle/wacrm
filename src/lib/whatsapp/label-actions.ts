import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForUazapi, uazapiChatLabels } from "./uazapi-api";

export interface LabelActionResult {
  ok: boolean;
  /** Human-readable reason when ok is false (or the step did nothing). */
  error?: string;
}

/**
 * Adds or removes ONE WhatsApp label on a contact's chat — the single
 * place automations, flows and the inbox go through, so they can't
 * drift apart.
 *
 * The Uazapi call is the source of truth: it is made first, and the
 * local mirror (contact_whatsapp_labels) is only touched when it
 * succeeds. The `chat_labels` webhook event then re-confirms the set;
 * writing the mirror here too just makes the change visible
 * immediately instead of after that round trip.
 */
export async function setContactWhatsappLabel(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  waLabelId: string,
  op: "add" | "remove",
): Promise<LabelActionResult> {
  if (!waLabelId) return { ok: false, error: "etiqueta não informada" };

  const { data: config } = await db
    .from("whatsapp_config")
    .select("provider_type, uazapi_base_url, uazapi_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!config || config.provider_type !== "uazapi" || !config.uazapi_token) {
    return { ok: false, error: "etiquetas do WhatsApp exigem uma conexão Uazapi ativa" };
  }

  const { data: contact } = await db
    .from("contacts")
    .select("id, phone")
    .eq("id", contactId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!contact?.phone) return { ok: false, error: "contato sem telefone" };

  const result = await uazapiChatLabels(
    config.uazapi_base_url || "https://customix.uazapi.com",
    config.uazapi_token,
    formatPhoneForUazapi(contact.phone),
    op === "add" ? { add: waLabelId } : { remove: waLabelId },
  );
  if (!result.ok) return { ok: false, error: result.error ?? "a Uazapi recusou a operação" };

  if (op === "add") {
    await db
      .from("contact_whatsapp_labels")
      .upsert(
        { contact_id: contactId, account_id: accountId, wa_label_id: waLabelId },
        { onConflict: "contact_id,wa_label_id", ignoreDuplicates: true },
      );
  } else {
    await db.from("contact_whatsapp_labels").delete().eq("contact_id", contactId).eq("wa_label_id", waLabelId);
  }
  return { ok: true };
}
