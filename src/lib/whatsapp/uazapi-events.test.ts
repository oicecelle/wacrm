import { describe, expect, it } from "vitest";
import {
  UAZAPI_WEBHOOK_EVENTS,
  bareLabelId,
  bareMessageId,
  mapReceiptState,
  normalizeWaLabelIds,
  parseChatLabelsEvent,
  parseConnectionStatus,
  parseLabelEvent,
  parseReceiptEvent,
  phoneFromChatId,
  routeUazapiEvent,
} from "./uazapi-events";

describe("webhook subscription", () => {
  it("does not subscribe to calls, groups, stories or channels", () => {
    for (const excluded of ["call", "groups", "status_posts", "newsletter_messages", "All"]) {
      expect(UAZAPI_WEBHOOK_EVENTS).not.toContain(excluded);
    }
  });
  it("subscribes to receipts and labels", () => {
    for (const wanted of ["messages", "messages_update", "labels", "chat_labels", "connection"]) {
      expect(UAZAPI_WEBHOOK_EVENTS).toContain(wanted);
    }
  });
});

describe("routeUazapiEvent", () => {
  it("routes the events we handle", () => {
    expect(routeUazapiEvent({ EventType: "messages" }).route).toBe("messages");
    expect(routeUazapiEvent({ EventType: "connection" }).route).toBe("connection");
    expect(routeUazapiEvent({ EventType: "messages_update" }).route).toBe("receipt");
    expect(routeUazapiEvent({ EventType: "labels" }).route).toBe("label_definition");
    expect(routeUazapiEvent({ EventType: "chat_labels" }).route).toBe("chat_labels");
  });

  it("REGRESSION: chats/history/presence/contacts/sender never reach the message path", () => {
    for (const t of ["chats", "presence", "contacts", "sender", "call", "groups", "status_posts"]) {
      expect(routeUazapiEvent({ EventType: t }).route).toBe("ignored");
    }
  });

  it("history: only the label batches are kept (to be logged); everything else is ignored", () => {
    expect(routeUazapiEvent({ EventType: "history", event: "labels" }).route).toBe("history_labels");
    expect(routeUazapiEvent({ EventType: "history", event: "chat_labels" }).route).toBe("history_labels");
    for (const batch of ["messages", "chats", "calls", "status", undefined]) {
      expect(routeUazapiEvent({ EventType: "history", event: batch }).route).toBe("ignored");
    }
  });

  it("ignores an event type it has never heard of", () => {
    expect(routeUazapiEvent({ EventType: "something_new" }).route).toBe("ignored");
  });

  it("treats a payload with no EventType as the legacy shape", () => {
    expect(routeUazapiEvent({ message: {} }).route).toBe("legacy");
    expect(routeUazapiEvent(null).route).toBe("legacy");
    expect(routeUazapiEvent("x").route).toBe("legacy");
  });
});

describe("parseConnectionStatus", () => {
  it("reads the documented instance.status", () => {
    expect(parseConnectionStatus({ instance: { status: "connected" } })).toBe("connected");
    expect(parseConnectionStatus({ instance: { status: "disconnected" } })).toBe("disconnected");
  });
  it("REGRESSION: a real connected event must not read as 'not connected'", () => {
    expect(parseConnectionStatus({ EventType: "connection", instance: { name: "x", status: "connected" } })).toBe("connected");
  });
  it("returns null (leave the stored status alone) when it cannot tell", () => {
    expect(parseConnectionStatus({})).toBeNull();
    expect(parseConnectionStatus({ instance: { status: "connecting" } })).toBeNull();
    expect(parseConnectionStatus({ instance: {} })).toBeNull();
  });
});

describe("receipts", () => {
  const read = {
    EventType: "messages_update",
    type: "ReadReceipt",
    state: "Read",
    event: { MessageIDs: ["MSG1", "5511999999999:MSG2"], Type: "Read", IsFromMe: true, IsGroup: false },
  };

  it("maps states", () => {
    expect(mapReceiptState("Read")).toBe("read");
    expect(mapReceiptState("Played")).toBe("read");
    expect(mapReceiptState("Delivered")).toBe("delivered");
    expect(mapReceiptState("Sender")).toBeNull();
    expect(mapReceiptState(undefined)).toBeNull();
  });

  it("strips the owner: prefix so ids match the stored ones", () => {
    expect(bareMessageId("5511999999999:3EB0ABC")).toBe("3EB0ABC");
    expect(bareMessageId("3EB0ABC")).toBe("3EB0ABC");
  });

  it("parses a read receipt for several messages", () => {
    expect(parseReceiptEvent(read)).toEqual({ messageIds: ["MSG1", "MSG2"], state: "read" });
  });

  it("parses delivered", () => {
    const d = { ...read, state: "Delivered", event: { ...read.event, Type: "Delivered" } };
    expect(parseReceiptEvent(d)?.state).toBe("delivered");
  });

  it("ignores group receipts and receipts about the customer's own messages", () => {
    expect(parseReceiptEvent({ ...read, type: "GroupReceipts" })).toBeNull();
    expect(parseReceiptEvent({ ...read, event: { ...read.event, IsGroup: true } })).toBeNull();
    expect(parseReceiptEvent({ ...read, event: { ...read.event, IsFromMe: false } })).toBeNull();
  });

  it("returns null for malformed payloads instead of throwing", () => {
    expect(parseReceiptEvent({})).toBeNull();
    expect(parseReceiptEvent({ state: "Read", event: { MessageIDs: [] } })).toBeNull();
    expect(parseReceiptEvent({ state: "Read", event: { MessageIDs: null } })).toBeNull();
  });
});

describe("labels", () => {
  it("normalises every shape wa_label may arrive in", () => {
    expect(normalizeWaLabelIds([])).toEqual([]);
    expect(normalizeWaLabelIds("[]")).toEqual([]);
    expect(normalizeWaLabelIds("")).toEqual([]);
    expect(normalizeWaLabelIds(null)).toEqual([]);
    expect(normalizeWaLabelIds(["10", 20])).toEqual(["10", "20"]);
    expect(normalizeWaLabelIds('["10","20"]')).toEqual(["10", "20"]);
    expect(normalizeWaLabelIds('[{"labelid":"7"},{"id":"8"}]')).toEqual(["7", "8"]);
    expect(normalizeWaLabelIds("10,20 30")).toEqual(["10", "20", "30"]);
    expect(normalizeWaLabelIds("{not json")).toEqual([]);
  });

  it("REGRESSION: real wa_label ids carry the owner number — stored bare, so they match the definitions", () => {
    // Exactly what the production webhook logs showed.
    expect(normalizeWaLabelIds(["5521966177727:11"])).toEqual(["11"]);
    expect(normalizeWaLabelIds('["554196864960:15"]')).toEqual(["15"]);
    expect(normalizeWaLabelIds([{ id: "554196864960:9" }])).toEqual(["9"]);
    expect(normalizeWaLabelIds("554196864960:4, 554196864960:6")).toEqual(["4", "6"]);
    expect(bareLabelId("554196864960:15")).toBe("15");
    expect(bareLabelId("15")).toBe("15");
    expect(
      parseChatLabelsEvent({ chat: { wa_chatid: "554198755731@s.whatsapp.net", wa_label: ["554196864960:15"] } })?.labelIds,
    ).toEqual(["15"]);
  });

  it("a labels event id with the owner prefix is stored bare too", () => {
    expect(parseLabelEvent({ event: { LabelID: "554196864960:9", Action: { name: "X" } } })?.labelId).toBe("9");
  });

  it("parses a chat_labels event, including 'all removed'", () => {
    expect(
      parseChatLabelsEvent({ chat: { wa_chatid: "5511888888888@s.whatsapp.net", wa_label: "[]" } }),
    ).toEqual({ chatId: "5511888888888@s.whatsapp.net", labelIds: [] });
    expect(
      parseChatLabelsEvent({ chat: { wa_chatid: "5511888888888@s.whatsapp.net", wa_label: ["3", "9"] } })?.labelIds,
    ).toEqual(["3", "9"]);
    expect(parseChatLabelsEvent({ chat: {} })).toBeNull();
    expect(parseChatLabelsEvent({})).toBeNull();
  });

  it("parses a label definition event", () => {
    expect(
      parseLabelEvent({ event: { LabelID: "31", Action: { name: "Suporte", color: 1, deleted: false } } }),
    ).toEqual({ labelId: "31", name: "Suporte", color: 1, deleted: false });
    expect(parseLabelEvent({ event: { LabelID: 5, Action: { deleted: true } } })).toEqual({
      labelId: "5",
      name: undefined,
      color: undefined,
      deleted: true,
    });
    expect(parseLabelEvent({ event: {} })).toBeNull();
  });

  it("extracts a phone only from individual chat JIDs", () => {
    expect(phoneFromChatId("5511888888888@s.whatsapp.net")).toBe("5511888888888");
    expect(phoneFromChatId("120363000000001@g.us")).toBeNull();
    expect(phoneFromChatId("300001@lid")).toBeNull();
  });
});
