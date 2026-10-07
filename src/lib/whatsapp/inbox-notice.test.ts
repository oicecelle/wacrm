import { describe, expect, it } from "vitest";
import { FIRST_PAIRING_MAX_CONTACTS } from "./history-import";
import {
  INBOX_NOTICE_POINTS,
  INBOX_NOTICE_TITLE,
  acknowledgeInboxNotice,
  hasAcknowledgedInboxNotice,
  inboxNoticeStorageKey,
  type KeyValueStorage,
} from "./inbox-notice";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("notice content", () => {
  it("stays SHORT: a handful of points, each a sentence or two", () => {
    expect(INBOX_NOTICE_POINTS.length).toBeLessThanOrEqual(4);
    const words = INBOX_NOTICE_POINTS.map((p) => `${p.title} ${p.text}`.split(/\s+/).length);
    for (const n of words) expect(n).toBeLessThanOrEqual(45);
    expect(words.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(130);
    expect(INBOX_NOTICE_TITLE.length).toBeLessThan(50);
  });

  it("quotes the REAL import limit (not a number that can drift from the code)", () => {
    const all = INBOX_NOTICE_POINTS.map((p) => p.text).join(" ");
    expect(all).toContain(FIRST_PAIRING_MAX_CONTACTS.toLocaleString("pt-BR"));
  });

  it("is honest about what is not guaranteed", () => {
    const all = INBOX_NOTICE_POINTS.map((p) => p.text).join(" ");
    expect(all).toContain("não é garantido");
    expect(all).toContain("confirmação de leitura");
  });

  it("explains each tick state and the history button by the name the screen uses", () => {
    const all = INBOX_NOTICE_POINTS.map((p) => p.text).join(" ");
    expect(all).toContain("Carregar mensagens anteriores");
    for (const piece of ["enviada", "entregue", "lida"]) expect(all).toContain(piece);
  });
});

describe("remembering 'Entendi'", () => {
  it("is not acknowledged until someone clicks it", () => {
    expect(hasAcknowledgedInboxNotice(memoryStorage(), "acct-1")).toBe(false);
  });
  it("once acknowledged, stays acknowledged for that account only", () => {
    const s = memoryStorage();
    acknowledgeInboxNotice(s, "acct-1");
    expect(hasAcknowledgedInboxNotice(s, "acct-1")).toBe(true);
    expect(hasAcknowledgedInboxNotice(s, "acct-2")).toBe(false);
  });
  it("the key carries a version, so a rewritten notice can be shown again", () => {
    expect(inboxNoticeStorageKey("a")).toMatch(/:v\d+:a$/);
  });
  it("never throws when storage is missing or blocked — it just shows the notice again", () => {
    expect(hasAcknowledgedInboxNotice(null, "a")).toBe(false);
    expect(() => acknowledgeInboxNotice(null, "a")).not.toThrow();
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(hasAcknowledgedInboxNotice(blocked, "a")).toBe(false);
    expect(() => acknowledgeInboxNotice(blocked, "a")).not.toThrow();
  });
  it("without an account there's nothing to remember", () => {
    const s = memoryStorage();
    acknowledgeInboxNotice(s, null);
    expect(s.data.size).toBe(0);
    expect(hasAcknowledgedInboxNotice(s, undefined)).toBe(false);
  });
});
