import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForUazapi, uazapiRequestHistorySync } from "./uazapi-api";
import { bareMessageId } from "./uazapi-events";

export const HISTORY_REQUEST_COUNT = 50;
/** One request per chat at a time: the docs warn against repeating the same one. */
export const HISTORY_REQUEST_COOLDOWN_MS = 2 * 60 * 1000;
/** After this, a request nobody answered is treated as a timeout. */
export const HISTORY_REQUEST_STALE_MS = 5 * 60 * 1000;

export type HistoryRequestResult =
  | { ok: true; requestId: string }
  | {
      ok: false;
      code: "not_found" | "group" | "no_phone" | "no_connection" | "cooldown" | "refused" | "failed";
      message: string;
    };

/**
 * "Load earlier messages" for one conversation.
 *
 * Asks the phone (through Uazapi) for 50 messages older than the oldest
 * one WE have. The answer is asynchronous and not guaranteed — the
 * request is recorded as `pending` so the screen can say what happened
 * once the closing `status` batch arrives (see history-status.ts).
 */
export async function requestEarlierMessages(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  conversationId: string,
  nowMs: number = Date.now(),
): Promise<HistoryRequestResult> {
  const { data: conv } = await db
    .from("conversations")
    .select("id, contact:contacts(phone, is_group)")
    .eq("id", conversationId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!conv) return { ok: false, code: "not_found", message: "Conversa não encontrada." };

  const contact = (conv as unknown as { contact: { phone: string | null; is_group: boolean | null } | null }).contact;
  if (contact?.is_group) {
    return { ok: false, code: "group", message: "Mensagens anteriores só estão disponíveis para conversas individuais." };
  }
  const digits = contact?.phone ? formatPhoneForUazapi(contact.phone) : "";
  if (!digits) return { ok: false, code: "no_phone", message: "Este contato não tem telefone." };
  const jid = `${digits}@s.whatsapp.net`;

  const { data: config } = await db
    .from("whatsapp_config")
    .select("provider_type, uazapi_base_url, uazapi_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!config || config.provider_type !== "uazapi" || !config.uazapi_token) {
    return { ok: false, code: "no_connection", message: "Buscar mensagens anteriores exige uma conexão Uazapi ativa." };
  }

  // A request nobody answered after a few minutes is over — close it so it
  // neither blocks a retry nor shows "waiting" forever.
  await db
    .from("history_sync_requests")
    .update({ state: "timeout", completed_at: new Date(nowMs).toISOString() })
    .eq("account_id", accountId)
    .eq("chat_jid", jid)
    .eq("state", "pending")
    .lt("requested_at", new Date(nowMs - HISTORY_REQUEST_STALE_MS).toISOString());

  const { data: recent } = await db
    .from("history_sync_requests")
    .select("id")
    .eq("account_id", accountId)
    .eq("chat_jid", jid)
    .eq("state", "pending")
    .gt("requested_at", new Date(nowMs - HISTORY_REQUEST_COOLDOWN_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) {
    return {
      ok: false,
      code: "cooldown",
      message: "Já existe um pedido em andamento para esta conversa. Aguarde a resposta do celular.",
    };
  }

  // Anchor: the oldest message we hold, so each click reaches further back.
  const { data: oldest } = await db
    .from("messages")
    .select("message_id")
    .eq("conversation_id", conversationId)
    .not("message_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const anchor = (oldest as { message_id: string } | null)?.message_id
    ? bareMessageId((oldest as { message_id: string }).message_id)
    : undefined;

  const { data: row } = await db
    .from("history_sync_requests")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      chat_jid: jid,
      anchor_message_id: anchor ?? null,
      requested_by: userId,
      requested_at: new Date(nowMs).toISOString(),
    })
    .select("id")
    .single();
  const requestId = (row as { id: string } | null)?.id;
  if (!requestId) return { ok: false, code: "failed", message: "Não foi possível registrar o pedido." };

  const baseUrl = config.uazapi_base_url || "https://customix.uazapi.com";
  let result = await uazapiRequestHistorySync(baseUrl, config.uazapi_token, {
    number: jid,
    count: HISTORY_REQUEST_COUNT,
    messageid: anchor,
  });
  // The server no longer knows our anchor (its own window is ~7 days):
  // ask again from the oldest message IT knows instead of giving up.
  if (!result.ok && anchor && (result.status === 400 || result.status === 404)) {
    result = await uazapiRequestHistorySync(baseUrl, config.uazapi_token, { number: jid, count: HISTORY_REQUEST_COUNT });
  }

  if (!result.ok) {
    await db
      .from("history_sync_requests")
      .update({ state: "failed", error: result.error ?? null, completed_at: new Date(nowMs).toISOString() })
      .eq("id", requestId);
    return {
      ok: false,
      code: result.status === 401 || result.status === 403 ? "refused" : "failed",
      message:
        result.status === 401 || result.status === 403
          ? "A Uazapi recusou o token desta conexão. Reconecte o número em Configurações → WhatsApp."
          : result.error ?? "A Uazapi não aceitou o pedido.",
    };
  }
  return { ok: true, requestId };
}
