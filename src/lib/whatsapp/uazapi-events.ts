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

export interface ParsedReceipt {
  /** Bare WhatsApp message ids, the `owner:` prefix already stripped. */
  messageIds: string[];
  state: "delivered" | "read";
}

/** "Read"/"Played" → read, "Delivered" → delivered; anything else → null. */
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
 * Reads a `messages_update` delivery. Only individual-chat receipts
 * (`type: "ReadReceipt"`) for messages WE sent are used: group receipts
 * are batched differently (and groups are filtered out anyway), and a
 * receipt with `IsFromMe: false` is about a message the customer sent.
 */
export function parseReceiptEvent(body: unknown): ParsedReceipt | null {
  const b = body as { type?: unknown; state?: unknown; event?: Record<string, unknown> } | null;
  const ev = b?.event;
  if (!ev || typeof ev !== "object") return null;
  if (b?.type === "GroupReceipts" || ev.Type === "GroupReceipts" || ev.IsGroup === true) return null;
  if (ev.IsFromMe === false) return null;

  const state = mapReceiptState(b?.state ?? ev.Type);
  const rawIds = ev.MessageIDs;
  if (!state || !Array.isArray(rawIds)) return null;

  const messageIds = rawIds.filter((x): x is string => typeof x === "string" && x.length > 0).map(bareMessageId);
  return messageIds.length > 0 ? { messageIds, state } : null;
}

// ── labels ───────────────────────────────────────────────────────

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
      .map((s) => s.trim())
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
    return text.split(/[\s,;]+/).filter(Boolean);
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
    labelId: String(rawId),
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
