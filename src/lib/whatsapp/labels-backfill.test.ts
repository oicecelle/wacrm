import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/contacts/dedupe", () => ({
  normalizeKey: (p: string) => p.replace(/\D/g, "").slice(-8),
  findExistingContactsBatch: vi.fn(async (_db: unknown, _acct: string, phones: string[]) => {
    const known: Record<string, string> = { "5511999990001": "c1", "5511999990002": "c2", "5511999990003": "c3" };
    const map = new Map<string, { id: string; phone: string }>();
    for (const p of phones) {
      const id = known[p];
      if (id) map.set(p.replace(/\D/g, "").slice(-8), { id, phone: p });
    }
    return map;
  }),
}));

import { applyLabelSetsBatch, backfillLabelsPage } from "./labels-backfill";
import { parseFindChatsResponse } from "./uazapi-api";

afterEach(() => vi.unstubAllGlobals());

interface Op { kind: string; table: string; payload?: unknown; filters: string[] }

function fakeDb(existing: Array<{ contact_id: string; wa_label_id: string }> = []) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { kind: "select", table, filters: [] };
      const b: Record<string, unknown> = {
        select: () => b,
        in: (c: string, v: string[]) => {
          op.filters.push(`${c} in ${v.join("|")}`);
          return b;
        },
        order: () => b,
        range: () => {
          ops.push(op);
          return Promise.resolve({ data: existing, error: null });
        },
        upsert: (p: unknown) => ((op.kind = "upsert"), (op.payload = p), ops.push(op), Promise.resolve({ error: null })),
        delete: () => ((op.kind = "delete"), b),
        eq: (c: string, v: string) => (op.filters.push(`${c}=${v}`), b),
        then: (res: (v: unknown) => unknown) => (ops.push(op), Promise.resolve({ error: null }).then(res)),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, ops };
}

describe("parseFindChatsResponse", () => {
  it("uses the server's paging hints", () => {
    const r = parseFindChatsResponse(
      { chats: [{}, {}], pagination: { hasMore: true, nextOffset: 2, totalRecords: 9 } },
      0,
      2,
    );
    expect(r).toMatchObject({ hasMore: true, nextOffset: 2, total: 9 });
  });
  it("derives paging when the server sends no hints", () => {
    expect(parseFindChatsResponse({ chats: [{}, {}, {}], pagination: { totalRecords: 3 } }, 0, 200).hasMore).toBe(false);
    expect(parseFindChatsResponse({ chats: new Array(200).fill({}) }, 0, 200)).toMatchObject({ hasMore: true, nextOffset: 200 });
  });
  it("an empty page can never advance (no infinite loop)", () => {
    expect(parseFindChatsResponse({ chats: [], pagination: { hasMore: true, nextOffset: 5 } }, 0, 200)).toMatchObject({
      hasMore: false,
      nextOffset: null,
    });
  });
  it("a server nextOffset that doesn't move forward falls back to offset + count", () => {
    expect(parseFindChatsResponse({ chats: [{}, {}], pagination: { hasMore: true, nextOffset: 0 } }, 0, 2).nextOffset).toBe(2);
  });
  it("tolerates garbage", () => {
    expect(parseFindChatsResponse(null, 0, 200).chats).toEqual([]);
    expect(parseFindChatsResponse({ chats: "x" }, 0, 200).chats).toEqual([]);
  });
});

describe("applyLabelSetsBatch", () => {
  it("adds missing pairs in bulk and removes dropped ones", async () => {
    const { db, ops } = fakeDb([{ contact_id: "c1", wa_label_id: "9" }]);
    const r = await applyLabelSetsBatch(db, "acct", [
      { contactId: "c1", labelIds: ["4"] }, // drops 9, adds 4
      { contactId: "c2", labelIds: ["4", "6"] },
    ]);
    expect(r).toEqual({ added: 3, removed: 1, contactsChanged: 2 });
    const up = ops.find((o) => o.kind === "upsert")!;
    expect(up.payload).toHaveLength(3);
    const del = ops.find((o) => o.kind === "delete")!;
    expect(del.filters).toEqual(expect.arrayContaining(["contact_id=c1", "wa_label_id in 9"]));
  });
  it("writes nothing when everything already matches", async () => {
    const { db, ops } = fakeDb([{ contact_id: "c1", wa_label_id: "4" }]);
    expect(await applyLabelSetsBatch(db, "acct", [{ contactId: "c1", labelIds: ["4"] }])).toEqual({ added: 0, removed: 0, contactsChanged: 0 });
    expect(ops.some((o) => o.kind === "upsert" || o.kind === "delete")).toBe(false);
  });
  it("an empty list for a contact removes everything it had", async () => {
    const { db } = fakeDb([{ contact_id: "c1", wa_label_id: "4" }, { contact_id: "c1", wa_label_id: "6" }]);
    expect((await applyLabelSetsBatch(db, "acct", [{ contactId: "c1", labelIds: [] }])).removed).toBe(2);
  });
  it("does nothing for no input", async () => {
    const { db, ops } = fakeDb();
    expect(await applyLabelSetsBatch(db, "acct", [])).toEqual({ added: 0, removed: 0, contactsChanged: 0 });
    expect(ops).toHaveLength(0);
  });
});

describe("backfillLabelsPage", () => {
  const stubChats = (chats: unknown[], pagination: unknown = { hasMore: false, totalRecords: chats.length }) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ chats, pagination }) })));

  it("loads labels for contacts that exist, using bare ids from the real 'owner:id' format", async () => {
    stubChats([
      { wa_chatid: "5511999990001@s.whatsapp.net", wa_label: ["554196864960:15", "554196864960:4"] },
      { wa_chatid: "5599888887777@s.whatsapp.net", wa_label: ["554196864960:15"] }, // not in the CRM
    ]);
    const { db, ops } = fakeDb();
    const r = await backfillLabelsPage(db, "acct", "https://srv", "tok", 0);
    expect(r).toMatchObject({ scanned: 2, withLabels: 2, matchedContacts: 1, matchedWithLabels: 1, contactsChanged: 1, hasMore: false });
    const rows = ops.find((o) => o.kind === "upsert")!.payload as Array<{ contact_id: string; wa_label_id: string }>;
    expect(rows.map((x) => `${x.contact_id}:${x.wa_label_id}`).sort()).toEqual(["c1:15", "c1:4"]);
  });

  it("SAFETY: a chat whose wa_label field is ABSENT is skipped — it must not wipe stored labels", async () => {
    stubChats([{ wa_chatid: "5511999990001@s.whatsapp.net" /* no wa_label key at all */ }]);
    const { db, ops } = fakeDb([{ contact_id: "c1", wa_label_id: "15" }]);
    const r = await backfillLabelsPage(db, "acct", "https://srv", "tok", 0);
    expect(r.matchedContacts).toBe(0);
    expect(ops.some((o) => o.kind === "delete")).toBe(false);
  });

  it("an explicit EMPTY list does clear a stale label", async () => {
    stubChats([{ wa_chatid: "5511999990001@s.whatsapp.net", wa_label: [] }]);
    const { db, ops } = fakeDb([{ contact_id: "c1", wa_label_id: "15" }]);
    const r = await backfillLabelsPage(db, "acct", "https://srv", "tok", 0);
    expect(r.contactsChanged).toBe(1);
    // matched, but carries NO label — must not be reported as "has a label"
    expect(r).toMatchObject({ matchedContacts: 1, matchedWithLabels: 0 });
    expect(ops.some((o) => o.kind === "delete")).toBe(true);
  });

  it("skips groups, LID chats and never creates contacts; reports paging", async () => {
    stubChats(
      [
        { wa_chatid: "120363000000001@g.us", wa_label: ["1:1"] },
        { wa_chatid: "300001@lid", wa_label: ["1:1"] },
      ],
      { hasMore: true, nextOffset: 2, totalRecords: 10 },
    );
    const { db, ops } = fakeDb();
    const r = await backfillLabelsPage(db, "acct", "https://srv", "tok", 0, 2);
    expect(r).toMatchObject({ matchedContacts: 0, hasMore: true, nextOffset: 2, total: 10 });
    expect(ops.some((o) => o.kind === "upsert")).toBe(false);
  });

  it("asks Uazapi for compact, non-group chats at the given offset", async () => {
    stubChats([]);
    await backfillLabelsPage(fakeDb().db, "acct", "https://srv/", "tok", 400, 200);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://srv/chat/find");
    expect(JSON.parse(init.body)).toMatchObject({ compact: true, wa_isGroup: false, offset: 400, limit: 200 });
  });

  it("surfaces an HTTP failure instead of silently loading nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    await expect(backfillLabelsPage(fakeDb().db, "acct", "https://srv", "bad", 0)).rejects.toThrow("401");
  });
});
