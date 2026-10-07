/**
 * Uazapi webhook events — what we subscribe to and how each payload is
 * read. Shapes come from the official docs (docs.uazapi.com, v2.4.4),
 * not from guesses:
 *
 *  - Every delivery carries `EventType` at the root. (The webhook used
 *    to look at `body.event` / `body.type`, which for these events mean
 *    something else entirely.)
 *  - `events` in the webhook registration is an ARRAY of those names.
 *  - Event-specific data sits at the root (`message`, `chat`, `event`,
 *    `instance`…), not under a shared `data` wrapper.
 */

/**
 * Events we ask Uazapi to deliver. Deliberately left out, per the
 * product decision: `call`, `groups`, `status_posts` (stories) and
 * `newsletter_messages` (channels). The last two only ever arrive when
 * named explicitly, so not naming them is enough; `All` is never used.
 */
export const UAZAPI_WEBHOOK_EVENTS = [
  "messages",
  "messages_update",
  "connection",
  "history",
  "contacts",
  "presence",
  "labels",
  "chats",
  "chat_labels",
  "sender",
] as const;

/**
 * Message filters. Group messages stay out (this system is built around
 * 1:1 conversations).
 *
 * `wasSentByApi` is intentionally NOT excluded even though the docs
 * recommend it against loops: a third-party integration reported that
 * the filter also suppressed delivery/read receipts for every message
 * the CRM itself sends. Echoes of our own sends are already handled by
 * the message-id de-duplication in the webhook.
 */
export const UAZAPI_WEBHOOK_EXCLUDE_MESSAGES = ["isGroupYes"] as const;

export type UazapiEventRoute =
  | "legacy" // no EventType: an older payload shape, handled as before
  | "messages"
  | "connection"
  | "receipt"
  | "label_definition"
  | "chat_labels"
  | "history_labels" // label batches inside `history`: logged only (items are definitions)
  | "history_messages" // old messages: pairing sync and "load earlier" requests
  | "history_status" // end of a history sync / result of one "load earlier" request
  | "ignored";

const ROUTES: Record<string, UazapiEventRoute> = {
  messages: "messages",
  connection: "connection",
  messages_update: "receipt",
  labels: "label_definition",
  chat_labels: "chat_labels",
};

/**
 * Decides which handler a webhook delivery belongs to. Anything that is
 * not explicitly handled is `ignored` — it must NEVER fall through to
 * the "incoming message" path: events like `chats` and `chat_labels`
 * carry a `chat.wa_chatid`, so that path would find a phone number,
 * create a contact and conversation, and store a blank inbound message
 * (firing automations and flows as if the customer had written).
 */
export function routeUazapiEvent(body: unknown): { route: UazapiEventRoute; eventType: string | null } {
  const eventType =
    body && typeof body === "object" && typeof (body as { EventType?: unknown }).EventType === "string"
      ? (body as { EventType: string }).EventType
      : null;
  if (!eventType) return { route: "legacy", eventType: null };

  // `history` carries many kinds of batch in its `event` field:
  // messages (imported), status (end of a sync / result of a "load
  // earlier" request), the two label batches (recorded only — they carry
  // definitions, confirmed on a real batch), and chats/calls (ignored).
  if (eventType === "history") {
    const batch = (body as { event?: unknown }).event;
    if (batch === "messages") return { route: "history_messages", eventType };
    if (batch === "status") return { route: "history_status", eventType };
    if (batch === "labels" || batch === "chat_labels") return { route: "history_labels", eventType };
    // `chats` and `calls` batches carry nothing we store.
    return { route: "ignored", eventType };
  }
  return { route: ROUTES[eventType] ?? "ignored", eventType };
}

// ── connection ───────────────────────────────────────────────────

/**
 * Connected / disconnected from a `connection` event. The documented
 * field is `instance.status`; the old heuristic never read it, so a
 * real "connected" event looked "not connected". Returns null when the
 * payload says nothing usable — the caller must then leave the stored
 * status alone rather than guess "disconnected".
 */
export function parseConnectionStatus(body: unknown): "connected" | "disconnected" | null {
  const status = (body as { instance?: { status?: unknown } } | null)?.instance?.status;
  if (typeof status !== "string") return null;
  const s = status.toLowerCase();
  if (s === "connected") return "connected";
  if (s === "disconnected" || s === "close" || s === "closed") return "disconnected";
  return null; // "connecting" and the like: not a final state
}

// ── delivery / read receipts ─────────────────────────────────────

/**
 * Two different things arrive as `messages_update` receipts, and the
 * field that tells them apart (`IsFromMe`) means the OPPOSITE of what the
 * documentation says — established from 3,695 real receipts, matched
 * against our own messages table:
 *
 *  - `IsFromMe: false`  (the contact is the one reporting): they RECEIVED
 *    or READ a message WE sent. 2,682 of 2,816 matched ids were our own
 *    outbound messages. This drives the ticks.
 *  - `IsFromMe: true`   (our own account, usually the phone, reporting):
 *    WE read a message the customer sent. 1,100 of the matched ids were
 *    customer messages. This is "the conversation was opened on the
 *    phone" — the signal to clear the unread badge.
 *
 * The documentation example shows the reverse. Trust the data.
 */
export interface ParsedReceipt {
  /** Bare WhatsApp message ids, the `owner:` prefix already stripped. */
  messageIds: string[];
  state: "delivered" | "read";
  /** contact → about OUR messages (ticks); own_device → about the CUSTOMER's messages (read on the phone). */
  source: "contact" | "own_device";
  /** JID of the conversation. */
  chatId: string;
}

/** "Read"/"Played" → read, "Delivered" → delivered; anything else (e.g. "Deleted") → null. */
export function mapReceiptState(raw: unknown): "delivered" | "read" | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s.includes("read") || s.includes("played")) return "read";
  if (s.includes("deliver")) return "delivered";
  return null;
}

/** Ids come as `5511999999999:3EB0…` or bare `3EB0…`; we match on the bare id. */
export function bareMessageId(id: string): string {
  const i = id.lastIndexOf(":");
  return i >= 0 ? id.slice(i + 1) : id;
}

/**
 * Reads a `messages_update` receipt for an individual chat. Group
 * receipts are batched differently (and groups are filtered out anyway).
 * From our own account only a READ is meaningful (a delivery receipt from
 * our own device says nothing about the customer).
 */
export function parseReceiptEvent(body: unknown): ParsedReceipt | null {
  const b = body as { type?: unknown; state?: unknown; event?: Record<string, unknown> } | null;
  const ev = b?.event;
  if (!ev || typeof ev !== "object") return null;
  if (b?.type === "GroupReceipts" || ev.Type === "GroupReceipts" || ev.IsGroup === true) return null;

  const state = mapReceiptState(b?.state ?? ev.Type);
  const rawIds = ev.MessageIDs;
  const chatId = typeof ev.Chat === "string" ? ev.Chat : "";
  if (!state || !Array.isArray(rawIds) || !chatId) return null;

  let source: ParsedReceipt["source"];
  if (ev.IsFromMe === false) {
    source = "contact";
  } else if (ev.IsFromMe === true) {
    // Our own account reporting. When the "sender" is the chat itself the
    // direction is ambiguous (seen on a handful of events) — skip those.
    if (typeof ev.Sender === "string" && ev.Sender === chatId) return null;
    if (state !== "read") return null;
    source = "own_device";
  } else {
    return null;
  }

  const messageIds = rawIds.filter((x): x is string => typeof x === "string" && x.length > 0).map(bareMessageId);
  return messageIds.length > 0 ? { messageIds, state, source, chatId } : null;
}

// ── labels ───────────────────────────────────────────────────────

/**
 * WhatsApp label ids arrive as `<owner number>:<label id>` (e.g.
 * `554196864960:15`) in `chat.wa_label` and as the `id` of a Label, but
 * the bare number (`15`, the Label's `labelid`) is what the definitions
 * and `POST /chat/labels` use. Everything is stored under the bare id.
 * Missing this made every association miss its definition, so no
 * contact ever showed a label even though the events were arriving.
 */
export function bareLabelId(id: string): string {
  const i = id.lastIndexOf(":");
  return (i >= 0 ? id.slice(i + 1) : id).trim();
}

/**
 * `chat.wa_label` is documented as "variable; may be JSON text".
 * Accepts an array of ids/objects, a JSON string of the same, or a
 * plain comma/space separated string, and returns the label ids.
 * Empty array / "[]" / empty string all mean "no labels".
 */
export function normalizeWaLabelIds(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item);
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const id = o.labelid ?? o.labelId ?? o.LabelID ?? o.id;
          return typeof id === "string" || typeof id === "number" ? String(id) : "";
        }
        return "";
      })
      .map((s) => bareLabelId(s))
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return normalizeWaLabelIds(JSON.parse(text));
      } catch {
        return [];
      }
    }
    return text.split(/[\s,;]+/).map(bareLabelId).filter(Boolean);
  }
  return [];
}

export interface ParsedChatLabels {
  /** JID of the conversation, e.g. 5511888888888@s.whatsapp.net */
  chatId: string;
  labelIds: string[];
}

/** `chat_labels` event: the chat's resulting set of labels (empty = all removed). */
export function parseChatLabelsEvent(body: unknown): ParsedChatLabels | null {
  const chat = (body as { chat?: Record<string, unknown> } | null)?.chat;
  const chatId = typeof chat?.wa_chatid === "string" ? chat.wa_chatid : "";
  if (!chat || !chatId) return null;
  return { chatId, labelIds: normalizeWaLabelIds(chat.wa_label) };
}

export interface ParsedLabelDefinition {
  labelId: string;
  name?: string;
  color?: number;
  deleted: boolean;
}

/** `labels` event: a label was created, renamed, recoloured or deleted. */
export function parseLabelEvent(body: unknown): ParsedLabelDefinition | null {
  const ev = (body as { event?: Record<string, unknown> } | null)?.event;
  const rawId = ev?.LabelID;
  if (!ev || (typeof rawId !== "string" && typeof rawId !== "number")) return null;
  const action = (ev.Action && typeof ev.Action === "object" ? ev.Action : {}) as Record<string, unknown>;
  return {
    labelId: bareLabelId(String(rawId)),
    name: typeof action.name === "string" ? action.name : undefined,
    color: typeof action.color === "number" ? action.color : undefined,
    deleted: action.deleted === true,
  };
}

/** `5511888888888@s.whatsapp.net` → `5511888888888`. Null for groups/lids/anything else. */
export function phoneFromChatId(chatId: string): string | null {
  const m = /^(\d{8,15})@(s\.whatsapp\.net|c\.us)$/.exec(chatId.trim());
  return m ? m[1] : null;
}
