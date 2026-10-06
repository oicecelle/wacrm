/**
 * Importing message HISTORY from Uazapi (`history` webhook batches).
 *
 * Two situations use this, with different rules about people we don't
 * have yet:
 *
 *  - the "load earlier messages" button on a conversation, and any
 *    later sync: ONLY conversations that already exist are filled in.
 *    A chat that isn't in the CRM is ignored — creating a contact for
 *    every chat in the clinic's phone would flood the CRM with people
 *    who never dealt with the clinic.
 *  - the FIRST pairing of a number: the CRM is empty by definition, so
 *    "existing only" would import nothing. For that window (see
 *    allowsContactCreation) contacts and conversations are created.
 *
 * Either way, history is written QUIETLY: no automations, no flows, no
 * unread counts, no deals, no AI analysis, and the conversation's
 * "last message" is only set on conversations created here — an old
 * message must never overwrite the preview of a live one. (The inbox
 * ignores messages this old when updating its list, and two database
 * triggers only act when the inserted message is the latest.)
 */

export type HistoryContentType = "text" | "image" | "document" | "audio" | "video" | "location";
export type HistoryStatus = "sent" | "delivered" | "read" | "failed";

/** The fields we use from a `history` batch's `messages[]` item. */
export interface HistoryMessage {
  messageid?: string;
  chatid?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageType?: string;
  text?: string;
  messageTimestamp?: number;
  status?: string;
}

export interface MappedHistoryMessage {
  messageId: string;
  phone: string;
  fromMe: boolean;
  createdAt: string;
  contentType: HistoryContentType;
  contentText: string;
  status: HistoryStatus;
  /** Push name of the contact — only meaningful on messages THEY sent. */
  senderName: string | null;
}

/** Message kinds that are not messages a person would read in a thread. */
const SKIP_TYPE = /reaction|protocol|call|senderkey|pollupdate|keepinchat|encreact|revoke|ephemeralsetting/;

const PLACEHOLDER: Record<string, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Documento]",
  location: "[Localização]",
  sticker: "[Figurinha]",
  contact: "[Contato]",
};

/** WhatsApp ms timestamps; tolerate seconds, reject nonsense. */
export function toIsoTimestamp(raw: unknown, nowMs = Date.now()): string | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const ms = raw < 1e11 ? raw * 1000 : raw; // seconds → ms
  if (ms < Date.UTC(2009, 0, 1) || ms > nowMs + 24 * 3600 * 1000) return null;
  return new Date(ms).toISOString();
}

export function mapHistoryStatus(raw: unknown, fromMe: boolean): HistoryStatus {
  if (!fromMe) return "delivered";
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s.includes("read") || s.includes("played")) return "read";
  if (s.includes("deliver")) return "delivered";
  if (s === "failed") return "failed";
  return "sent";
}

/**
 * One batch item → a row we can store, or null when it isn't an
 * individual-chat message worth keeping (groups, channels, LID-only
 * chats, reactions, calls, malformed items).
 */
export function mapHistoryMessage(m: HistoryMessage, nowMs = Date.now()): MappedHistoryMessage | null {
  const messageId = typeof m.messageid === "string" ? m.messageid.trim() : "";
  const chatId = typeof m.chatid === "string" ? m.chatid : "";
  if (!messageId || !chatId || m.isGroup === true) return null;

  const jid = /^(\d{8,15})@s\.whatsapp\.net$/.exec(chatId.trim());
  if (!jid) return null;

  const createdAt = toIsoTimestamp(m.messageTimestamp, nowMs);
  if (!createdAt) return null;

  const type = (m.messageType ?? "").toLowerCase();
  if (SKIP_TYPE.test(type)) return null;

  let contentType: HistoryContentType = "text";
  let kind = "";
  if (type.includes("image")) (contentType = "image"), (kind = "image");
  else if (type.includes("sticker")) (contentType = "image"), (kind = "sticker");
  else if (type.includes("video")) (contentType = "video"), (kind = "video");
  else if (type.includes("audio") || type.includes("ptt") || type.includes("voice")) (contentType = "audio"), (kind = "audio");
  else if (type.includes("document")) (contentType = "document"), (kind = "document");
  else if (type.includes("location")) (contentType = "location"), (kind = "location");
  else if (type.includes("contact") || type.includes("vcard")) kind = "contact";

  const text = typeof m.text === "string" ? m.text.trim() : "";
  // Media isn't downloaded for history: keep the caption if there is one,
  // otherwise a placeholder, so the thread still reads in order.
  const contentText = text || PLACEHOLDER[kind] || "[Mensagem]";

  const fromMe = m.fromMe === true;
  return {
    messageId,
    phone: jid[1],
    fromMe,
    createdAt,
    contentType,
    contentText,
    status: mapHistoryStatus(m.status, fromMe),
    senderName: !fromMe && typeof m.senderName === "string" && m.senderName.trim() ? m.senderName.trim() : null,
  };
}

// ── policy for creating contacts ─────────────────────────────────

/** How long after saving the connection the first-pairing import may create contacts. */
export const FIRST_PAIRING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether history may CREATE contacts/conversations. Only for the first
 * pairing: the state is 'pending'/'importing' (NULL = a connection that
 * existed before this feature, 'done' = already imported) and the window
 * hasn't lapsed — so a number someone saved but never scanned doesn't
 * keep the door open forever.
 */
export function allowsContactCreation(
  config: { history_import_state?: string | null; history_import_started_at?: string | null },
  nowMs = Date.now(),
): boolean {
  if (config.history_import_state !== "pending" && config.history_import_state !== "importing") return false;
  const started = config.history_import_started_at ? Date.parse(config.history_import_started_at) : NaN;
  return Number.isFinite(started) && nowMs - started <= FIRST_PAIRING_WINDOW_MS;
}

// ── orchestration, storage injected ──────────────────────────────

export interface HistoryConversationRef {
  id: string;
  contactId: string;
}

export interface HistoryNewContact {
  phone: string;
  name: string;
}

export interface HistoryMessageRow {
  conversationId: string;
  messageId: string;
  fromMe: boolean;
  createdAt: string;
  contentType: HistoryContentType;
  contentText: string;
  status: HistoryStatus;
}

/** What the import needs from the database; implemented over Supabase elsewhere. */
export interface HistoryStore {
  /** phone → contact id, for contacts that already exist. */
  findContactIds(phones: string[]): Promise<Map<string, string>>;
  /** Creates contacts (+ patient rows); returns phone → id for those that now exist. */
  createContacts(contacts: HistoryNewContact[]): Promise<Map<string, string>>;
  findConversations(contactIds: string[]): Promise<Map<string, string>>; // contactId → conversationId
  /** Creates conversations; `preview` seeds last_message_* ONLY for these new rows. */
  createConversations(
    rows: Array<{ contactId: string; lastMessageAt: string; lastMessageText: string; lastFromMe: boolean }>,
  ): Promise<Map<string, string>>;
  /** Which of these WhatsApp message ids are already stored for this account. */
  existingMessageIds(messageIds: string[]): Promise<Set<string>>;
  insertMessages(rows: HistoryMessageRow[]): Promise<number>;
}

export interface HistoryImportStats {
  received: number;
  mapped: number;
  skippedNoContact: number;
  skippedNoConversation: number;
  contactsCreated: number;
  conversationsCreated: number;
  duplicates: number;
  inserted: number;
}

export async function importHistoryMessages(
  store: HistoryStore,
  messages: HistoryMessage[],
  opts: { allowCreate: boolean; nowMs?: number },
): Promise<HistoryImportStats> {
  const stats: HistoryImportStats = {
    received: messages.length,
    mapped: 0,
    skippedNoContact: 0,
    skippedNoConversation: 0,
    contactsCreated: 0,
    conversationsCreated: 0,
    duplicates: 0,
    inserted: 0,
  };

  // Map, and drop repeats WITHIN the batch (batches may overlap).
  const seen = new Set<string>();
  const mapped: MappedHistoryMessage[] = [];
  for (const raw of messages) {
    const m = mapHistoryMessage(raw, opts.nowMs);
    if (!m || seen.has(m.messageId)) continue;
    seen.add(m.messageId);
    mapped.push(m);
  }
  stats.mapped = mapped.length;
  if (mapped.length === 0) return stats;

  const byPhone = new Map<string, MappedHistoryMessage[]>();
  for (const m of mapped) {
    if (!byPhone.has(m.phone)) byPhone.set(m.phone, []);
    byPhone.get(m.phone)!.push(m);
  }
  const phones = [...byPhone.keys()];

  // 1. contacts
  const contactIdByPhone = await store.findContactIds(phones);
  const missing = phones.filter((p) => !contactIdByPhone.has(p));
  if (missing.length > 0) {
    if (opts.allowCreate) {
      const created = await store.createContacts(
        missing.map((phone) => {
          // The push name is only on messages the contact sent; newest wins.
          const named = [...(byPhone.get(phone) ?? [])]
            .filter((x) => x.senderName)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return { phone, name: named?.senderName ?? phone };
        }),
      );
      for (const [phone, id] of created) contactIdByPhone.set(phone, id);
      stats.contactsCreated = created.size;
    } else {
      stats.skippedNoContact = missing.length;
    }
  }

  // 2. conversations
  const contactIds = [...new Set(contactIdByPhone.values())];
  const convByContact = contactIds.length > 0 ? await store.findConversations(contactIds) : new Map<string, string>();
  const needConv = contactIds.filter((id) => !convByContact.has(id));
  if (needConv.length > 0) {
    if (opts.allowCreate) {
      const phoneByContact = new Map<string, string>();
      for (const [phone, id] of contactIdByPhone) phoneByContact.set(id, phone);
      const created = await store.createConversations(
        needConv.map((contactId) => {
          const list = byPhone.get(phoneByContact.get(contactId) ?? "") ?? [];
          const newest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return {
            contactId,
            lastMessageAt: newest.createdAt,
            lastMessageText: newest.contentText,
            lastFromMe: newest.fromMe,
          };
        }),
      );
      for (const [contactId, convId] of created) convByContact.set(contactId, convId);
      stats.conversationsCreated = created.size;
    } else {
      stats.skippedNoConversation = needConv.length;
    }
  }

  // 3. messages, minus what's already stored
  const candidates: Array<{ m: MappedHistoryMessage; conversationId: string }> = [];
  for (const [phone, list] of byPhone) {
    const contactId = contactIdByPhone.get(phone);
    const conversationId = contactId ? convByContact.get(contactId) : undefined;
    if (!conversationId) continue;
    for (const m of list) candidates.push({ m, conversationId });
  }
  if (candidates.length === 0) return stats;

  const existing = await store.existingMessageIds(candidates.map((c) => c.m.messageId));
  const fresh = candidates.filter((c) => !existing.has(c.m.messageId));
  stats.duplicates = candidates.length - fresh.length;

  // Oldest first, so a partial failure leaves a contiguous run, not holes.
  fresh.sort((a, b) => a.m.createdAt.localeCompare(b.m.createdAt));
  stats.inserted = await store.insertMessages(
    fresh.map(({ m, conversationId }) => ({
      conversationId,
      messageId: m.messageId,
      fromMe: m.fromMe,
      createdAt: m.createdAt,
      contentType: m.contentType,
      contentText: m.contentText,
      status: m.status,
    })),
  );
  return stats;
}
