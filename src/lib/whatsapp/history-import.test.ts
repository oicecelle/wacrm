import { describe, expect, it } from "vitest";
import {
  FIRST_PAIRING_WINDOW_MS,
  allowsContactCreation,
  importHistoryMessages,
  mapHistoryMessage,
  mapHistoryStatus,
  toIsoTimestamp,
  type HistoryMessage,
  type HistoryMessageRow,
  type HistoryStore,
} from "./history-import";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const T = (iso: string) => Date.parse(iso);

const msg = (over: Partial<HistoryMessage> = {}): HistoryMessage => ({
  messageid: "M1",
  chatid: "5511999990001@s.whatsapp.net",
  fromMe: false,
  text: "oi",
  messageType: "conversation",
  messageTimestamp: T("2026-09-01T10:00:00Z"),
  ...over,
});

describe("toIsoTimestamp", () => {
  it("reads milliseconds, tolerates seconds, rejects nonsense", () => {
    expect(toIsoTimestamp(T("2026-09-01T10:00:00Z"), NOW)).toBe("2026-09-01T10:00:00.000Z");
    expect(toIsoTimestamp(Math.floor(T("2026-09-01T10:00:00Z") / 1000), NOW)).toBe("2026-09-01T10:00:00.000Z");
    expect(toIsoTimestamp(0, NOW)).toBeNull();
    expect(toIsoTimestamp(-5, NOW)).toBeNull();
    expect(toIsoTimestamp("x" as never, NOW)).toBeNull();
    expect(toIsoTimestamp(NOW + 10 * 24 * 3600 * 1000, NOW)).toBeNull(); // far future
    expect(toIsoTimestamp(T("1999-01-01T00:00:00Z"), NOW)).toBeNull();
  });
});

describe("mapHistoryStatus", () => {
  it("customer messages are 'delivered'; ours follow the receipt, defaulting to 'sent'", () => {
    expect(mapHistoryStatus("Read", false)).toBe("delivered");
    expect(mapHistoryStatus("Read", true)).toBe("read");
    expect(mapHistoryStatus("Delivered", true)).toBe("delivered");
    expect(mapHistoryStatus("", true)).toBe("sent");
    expect(mapHistoryStatus(undefined, true)).toBe("sent");
    expect(mapHistoryStatus("Failed", true)).toBe("failed");
  });
});

describe("mapHistoryMessage", () => {
  it("maps a plain text message", () => {
    expect(mapHistoryMessage(msg(), NOW)).toMatchObject({
      messageId: "M1",
      phone: "5511999990001",
      fromMe: false,
      contentType: "text",
      contentText: "oi",
      status: "delivered",
      createdAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("keeps the ORIGINAL timestamp (not 'now')", () => {
    expect(mapHistoryMessage(msg({ messageTimestamp: T("2025-01-02T03:04:05Z") }), NOW)?.createdAt).toBe("2025-01-02T03:04:05.000Z");
  });

  it("skips groups, channels, LID-only chats and broadcast lists", () => {
    for (const chatid of ["120363000000001@g.us", "300001@lid", "status@broadcast", "123@newsletter"]) {
      expect(mapHistoryMessage(msg({ chatid }), NOW)).toBeNull();
    }
    expect(mapHistoryMessage(msg({ isGroup: true }), NOW)).toBeNull();
  });

  it("skips reactions, calls, protocol messages and malformed items", () => {
    for (const messageType of ["reactionMessage", "call", "protocolMessage", "pollUpdateMessage"]) {
      expect(mapHistoryMessage(msg({ messageType }), NOW)).toBeNull();
    }
    expect(mapHistoryMessage(msg({ messageid: "" }), NOW)).toBeNull();
    expect(mapHistoryMessage(msg({ chatid: undefined }), NOW)).toBeNull();
    expect(mapHistoryMessage(msg({ messageTimestamp: undefined }), NOW)).toBeNull();
  });

  it("media keeps its caption, or a placeholder when there is none", () => {
    expect(mapHistoryMessage(msg({ messageType: "imageMessage", text: "olha" }), NOW)).toMatchObject({ contentType: "image", contentText: "olha" });
    expect(mapHistoryMessage(msg({ messageType: "imageMessage", text: "" }), NOW)).toMatchObject({ contentType: "image", contentText: "[Imagem]" });
    expect(mapHistoryMessage(msg({ messageType: "audioMessage", text: "" }), NOW)).toMatchObject({ contentType: "audio", contentText: "[Áudio]" });
    expect(mapHistoryMessage(msg({ messageType: "documentMessage", text: "" }), NOW)).toMatchObject({ contentType: "document" });
  });

  it("types the database can't store fall back to text with a placeholder", () => {
    expect(mapHistoryMessage(msg({ messageType: "stickerMessage", text: "" }), NOW)).toMatchObject({ contentText: "[Figurinha]" });
    expect(mapHistoryMessage(msg({ messageType: "contactMessage", text: "" }), NOW)).toMatchObject({ contentType: "text", contentText: "[Contato]" });
    expect(mapHistoryMessage(msg({ messageType: "weirdNewKind", text: "" }), NOW)).toMatchObject({ contentType: "text", contentText: "[Mensagem]" });
  });

  it("the push name only counts on messages the CONTACT sent", () => {
    expect(mapHistoryMessage(msg({ senderName: " Ana ", fromMe: false }), NOW)?.senderName).toBe("Ana");
    expect(mapHistoryMessage(msg({ senderName: "Clínica", fromMe: true }), NOW)?.senderName).toBeNull();
  });
});

describe("allowsContactCreation", () => {
  const started = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h ago
  it("allows it only for a first pairing in progress", () => {
    expect(allowsContactCreation({ history_import_state: "pending", history_import_started_at: started }, NOW)).toBe(true);
    expect(allowsContactCreation({ history_import_state: "importing", history_import_started_at: started }, NOW)).toBe(true);
  });
  it("REGRESSION: connections that existed before this feature (state NULL) never create contacts", () => {
    expect(allowsContactCreation({ history_import_state: null, history_import_started_at: null }, NOW)).toBe(false);
    expect(allowsContactCreation({}, NOW)).toBe(false);
  });
  it("a finished import stays closed", () => {
    expect(allowsContactCreation({ history_import_state: "done", history_import_started_at: started }, NOW)).toBe(false);
  });
  it("the window lapses, so a number saved but never scanned doesn't keep the door open", () => {
    const old = new Date(NOW - FIRST_PAIRING_WINDOW_MS - 1000).toISOString();
    expect(allowsContactCreation({ history_import_state: "pending", history_import_started_at: old }, NOW)).toBe(false);
    expect(allowsContactCreation({ history_import_state: "pending", history_import_started_at: null }, NOW)).toBe(false);
  });
});

// ── orchestration with an in-memory store ──────────────────────────

function memoryStore(init: {
  contacts?: Record<string, string>; // phone → contactId
  conversations?: Record<string, string>; // contactId → conversationId
  messageIds?: string[];
}) {
  const contacts = new Map(Object.entries(init.contacts ?? {}));
  const convs = new Map(Object.entries(init.conversations ?? {}));
  const stored = new Set(init.messageIds ?? []);
  const log = {
    createdContacts: [] as Array<{ phone: string; name: string }>,
    createdConvs: [] as Array<{ contactId: string; lastMessageAt: string; lastMessageText: string; lastFromMe: boolean }>,
    inserted: [] as HistoryMessageRow[],
  };
  const store: HistoryStore = {
    findContactIds: async (phones) => new Map(phones.filter((p) => contacts.has(p)).map((p) => [p, contacts.get(p)!])),
    createContacts: async (list) => {
      const out = new Map<string, string>();
      for (const c of list) {
        const id = `new-${c.phone}`;
        contacts.set(c.phone, id);
        out.set(c.phone, id);
        log.createdContacts.push(c);
      }
      return out;
    },
    findConversations: async (ids) => new Map(ids.filter((i) => convs.has(i)).map((i) => [i, convs.get(i)!])),
    createConversations: async (rows) => {
      const out = new Map<string, string>();
      for (const r of rows) {
        const id = `conv-${r.contactId}`;
        convs.set(r.contactId, id);
        out.set(r.contactId, id);
        log.createdConvs.push(r);
      }
      return out;
    },
    existingMessageIds: async (ids) => new Set(ids.filter((i) => stored.has(i))),
    insertMessages: async (rows) => {
      log.inserted.push(...rows);
      return rows.length;
    },
  };
  return { store, log };
}

const P1 = "5511999990001";
const P2 = "5511999990002";

describe("importHistoryMessages — 'load earlier messages' (existing conversations only)", () => {
  it("fills in an existing conversation, oldest first, with original dates", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" }, conversations: { c1: "conv1" } });
    const stats = await importHistoryMessages(
      store,
      [
        msg({ messageid: "B", text: "segunda", messageTimestamp: T("2026-09-02T10:00:00Z") }),
        msg({ messageid: "A", text: "primeira", messageTimestamp: T("2026-09-01T10:00:00Z") }),
      ],
      { allowCreate: false, nowMs: NOW },
    );
    expect(stats).toMatchObject({ mapped: 2, inserted: 2, contactsCreated: 0, conversationsCreated: 0 });
    expect(log.inserted.map((r) => r.messageId)).toEqual(["A", "B"]);
    expect(log.inserted[0]).toMatchObject({ conversationId: "conv1", createdAt: "2026-09-01T10:00:00.000Z" });
  });

  it("DECISION: a chat that isn't in the CRM is ignored — no contact, no conversation, no messages", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" }, conversations: { c1: "conv1" } });
    const stats = await importHistoryMessages(
      store,
      [msg({ messageid: "A" }), msg({ messageid: "Z", chatid: `${P2}@s.whatsapp.net` })],
      { allowCreate: false, nowMs: NOW },
    );
    expect(stats).toMatchObject({ inserted: 1, skippedNoContact: 1, contactsCreated: 0 });
    expect(log.createdContacts).toHaveLength(0);
    expect(log.inserted.map((r) => r.messageId)).toEqual(["A"]);
  });

  it("a contact that exists but has no conversation is NOT given one in this mode", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" } });
    const stats = await importHistoryMessages(store, [msg()], { allowCreate: false, nowMs: NOW });
    expect(stats).toMatchObject({ inserted: 0, skippedNoConversation: 1, conversationsCreated: 0 });
    expect(log.createdConvs).toHaveLength(0);
  });

  it("never re-inserts a message that's already stored (batches overlap live traffic)", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" }, conversations: { c1: "conv1" }, messageIds: ["A"] });
    const stats = await importHistoryMessages(store, [msg({ messageid: "A" }), msg({ messageid: "B" })], { allowCreate: false, nowMs: NOW });
    expect(stats).toMatchObject({ duplicates: 1, inserted: 1 });
    expect(log.inserted.map((r) => r.messageId)).toEqual(["B"]);
  });

  it("drops repeats inside the same batch", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" }, conversations: { c1: "conv1" } });
    await importHistoryMessages(store, [msg({ messageid: "A" }), msg({ messageid: "A" })], { allowCreate: false, nowMs: NOW });
    expect(log.inserted).toHaveLength(1);
  });

  it("does nothing, and asks the store for nothing, when no message is usable", async () => {
    const { store, log } = memoryStore({});
    const stats = await importHistoryMessages(store, [msg({ chatid: "120363000000001@g.us" }), msg({ messageType: "call" })], { allowCreate: true, nowMs: NOW });
    expect(stats).toMatchObject({ mapped: 0, inserted: 0 });
    expect(log.createdContacts).toHaveLength(0);
  });
});

describe("importHistoryMessages — first pairing (creates what's missing)", () => {
  it("creates contacts and conversations for chats the CRM doesn't know yet", async () => {
    const { store, log } = memoryStore({});
    const stats = await importHistoryMessages(
      store,
      [
        msg({ messageid: "A", senderName: "Ana", messageTimestamp: T("2026-09-01T10:00:00Z") }),
        msg({ messageid: "B", fromMe: true, text: "resposta", messageTimestamp: T("2026-09-03T10:00:00Z") }),
      ],
      { allowCreate: true, nowMs: NOW },
    );
    expect(stats).toMatchObject({ contactsCreated: 1, conversationsCreated: 1, inserted: 2 });
    expect(log.createdContacts[0]).toEqual({ phone: P1, name: "Ana" });
    // the new conversation's preview is its NEWEST message, and it was ours
    expect(log.createdConvs[0]).toMatchObject({ lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessageText: "resposta", lastFromMe: true });
  });

  it("falls back to the phone as the name when the contact never wrote", async () => {
    const { store, log } = memoryStore({});
    await importHistoryMessages(store, [msg({ fromMe: true })], { allowCreate: true, nowMs: NOW });
    expect(log.createdContacts[0].name).toBe(P1);
  });

  it("uses the NEWEST push name", async () => {
    const { store, log } = memoryStore({});
    await importHistoryMessages(
      store,
      [
        msg({ messageid: "A", senderName: "Ana Antiga", messageTimestamp: T("2026-01-01T10:00:00Z") }),
        msg({ messageid: "B", senderName: "Ana Nova", messageTimestamp: T("2026-08-01T10:00:00Z") }),
      ],
      { allowCreate: true, nowMs: NOW },
    );
    expect(log.createdContacts[0].name).toBe("Ana Nova");
  });

  it("gives an existing contact that has no conversation a conversation", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" } });
    const stats = await importHistoryMessages(store, [msg()], { allowCreate: true, nowMs: NOW });
    expect(stats).toMatchObject({ contactsCreated: 0, conversationsCreated: 1, inserted: 1 });
    expect(log.createdConvs[0].contactId).toBe("c1");
  });

  it("does NOT create a new conversation preview for an existing conversation", async () => {
    const { store, log } = memoryStore({ contacts: { [P1]: "c1" }, conversations: { c1: "conv1" } });
    await importHistoryMessages(store, [msg()], { allowCreate: true, nowMs: NOW });
    expect(log.createdConvs).toHaveLength(0);
  });
});


describe("importHistoryMessages — first-pairing contact cap", () => {
  const phones = ["5511999990101", "5511999990102", "5511999990103", "5511999990104"];
  const chat = (phone: string, over: Partial<HistoryMessage> = {}) =>
    msg({ messageid: `M-${phone}-${over.messageid ?? ""}`, chatid: `${phone}@s.whatsapp.net`, ...over });

  it("creates only as many contacts as the cap grants, and reports the rest", async () => {
    const { store, log } = memoryStore({});
    const stats = await importHistoryMessages(
      store,
      phones.map((p) => chat(p)),
      { allowCreate: true, nowMs: NOW, reserveContactSlots: async () => 2 },
    );
    expect(stats).toMatchObject({ contactsCreated: 2, skippedOverCap: 2, inserted: 2 });
    expect(log.createdContacts).toHaveLength(2);
  });

  it("when the cap is exhausted (0 granted), creates nothing — and imports no messages for people it didn't create", async () => {
    const { store, log } = memoryStore({});
    const stats = await importHistoryMessages(store, phones.map((p) => chat(p)), {
      allowCreate: true,
      nowMs: NOW,
      reserveContactSlots: async () => 0,
    });
    expect(stats).toMatchObject({ contactsCreated: 0, skippedOverCap: 4, inserted: 0 });
    expect(log.createdContacts).toHaveLength(0);
    expect(log.createdConvs).toHaveLength(0);
  });

  it("under the cap, chats where the person WROTE come first, then the most recent", async () => {
    const { store, log } = memoryStore({});
    await importHistoryMessages(
      store,
      [
        // only OUR messages (never replied) — newest of all
        chat(phones[0], { fromMe: true, messageTimestamp: T("2026-09-30T10:00:00Z") }),
        // the person wrote — older
        chat(phones[1], { fromMe: false, messageTimestamp: T("2026-05-01T10:00:00Z") }),
        // the person wrote — newer
        chat(phones[2], { fromMe: false, messageTimestamp: T("2026-08-01T10:00:00Z") }),
      ],
      { allowCreate: true, nowMs: NOW, reserveContactSlots: async () => 2 },
    );
    expect(log.createdContacts.map((c) => c.phone).sort()).toEqual([phones[1], phones[2]].sort());
  });

  it("existing contacts are NOT counted against the cap and keep receiving their messages", async () => {
    const { store, log } = memoryStore({ contacts: { [phones[0]]: "c-existing" }, conversations: { "c-existing": "conv-existing" } });
    let asked = -1;
    const stats = await importHistoryMessages(store, [chat(phones[0]), chat(phones[1])], {
      allowCreate: true,
      nowMs: NOW,
      reserveContactSlots: async (n) => ((asked = n), 0),
    });
    expect(asked).toBe(1); // only the one that needs creating
    expect(stats).toMatchObject({ inserted: 1, skippedOverCap: 1 });
    expect(log.inserted[0].conversationId).toBe("conv-existing");
  });

  it("never grants itself more than the batch asked for (a misbehaving reservation)", async () => {
    const { store } = memoryStore({});
    const stats = await importHistoryMessages(store, [chat(phones[0])], {
      allowCreate: true,
      nowMs: NOW,
      reserveContactSlots: async () => 99,
    });
    expect(stats.contactsCreated).toBe(1);
  });

  it("without a reservation function creation is not capped (the existing behaviour)", async () => {
    const { store } = memoryStore({});
    const stats = await importHistoryMessages(store, phones.map((p) => chat(p)), { allowCreate: true, nowMs: NOW });
    expect(stats).toMatchObject({ contactsCreated: 4, skippedOverCap: 0 });
  });
});
