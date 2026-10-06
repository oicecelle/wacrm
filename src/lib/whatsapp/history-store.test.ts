import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/contacts/dedupe", () => ({
  normalizeKey: (p: string) => p.replace(/\D/g, "").slice(-8),
  findExistingContact: vi.fn(async (_db: unknown, _a: string, phone: string) => (phone === "5511999990009" ? { id: "raced-id", phone } : null)),
  findExistingContactsBatch: vi.fn(async (_db: unknown, _a: string, phones: string[]) => {
    const m = new Map<string, { id: string; phone: string }>();
    for (const p of phones) if (p === "5511999990001") m.set(p.slice(-8), { id: "c1", phone: p });
    return m;
  }),
}));

import { createSupabaseHistoryStore } from "./history-store";

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  opts?: unknown;
  filters: Array<[string, string, unknown]>;
}
type Responder = (call: Call) => { data?: unknown; error?: { message: string; code?: string } | null };

function fakeDb(respond: Responder) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), b),
        upsert: (p: unknown, o: unknown) => ((call.op = "upsert"), (call.payload = p), (call.opts = o), b),
        eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), b),
        in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), b),
        order: () => b,
        range: () => b,
        single: () => {
          const res = respond(call);
          calls.push(call);
          return Promise.resolve({ data: res.data ?? null, error: res.error ?? null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          const res = respond(call);
          calls.push(call);
          return Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve);
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("createSupabaseHistoryStore", () => {
  it("finds existing contacts by phone", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    const store = createSupabaseHistoryStore(db, "acct", "user");
    const found = await store.findContactIds(["5511999990001", "5511999990002"]);
    expect([...found]).toEqual([["5511999990001", "c1"]]);
  });

  it("dedupe: scoped to THIS account and matches both the bare id and owner:id, returning bare ids", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ message_id: "5511000:A" }, { message_id: "B" }] }));
    const store = createSupabaseHistoryStore(db, "acct-1", "user", "5511000");
    const found = await store.existingMessageIds(["A", "B", "C"]);
    expect([...found].sort()).toEqual(["A", "B"]);
    const call = calls.find((c) => c.table === "messages")!;
    expect(call.filters).toContainEqual(["eq", "conversations.account_id", "acct-1"]);
    const ids = call.filters.find((f) => f[0] === "in" && f[1] === "message_id")![2] as string[];
    expect(ids.sort()).toEqual(["5511000:A", "5511000:B", "5511000:C", "A", "B", "C"]);
  });

  it("inserts messages with the ORIGINAL date, agent/customer sender and no media", async () => {
    const { db, calls } = fakeDb(() => ({}));
    const store = createSupabaseHistoryStore(db, "acct", "owner-user");
    const n = await store.insertMessages([
      { conversationId: "conv", messageId: "A", fromMe: true, createdAt: "2026-01-01T00:00:00.000Z", contentType: "text", contentText: "x", status: "read" },
      { conversationId: "conv", messageId: "B", fromMe: false, createdAt: "2026-01-02T00:00:00.000Z", contentType: "image", contentText: "[Imagem]", status: "delivered" },
    ]);
    expect(n).toBe(2);
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ sender_type: "agent", sender_id: "owner-user", created_at: "2026-01-01T00:00:00.000Z", status: "read", message_id: "A", media_url: null });
    expect(rows[1]).toMatchObject({ sender_type: "customer", sender_id: null, content_type: "image" });
  });

  it("REGRESSION: one bad row must not lose the whole chunk — falls back to row by row", async () => {
    let n = 0;
    const { db } = fakeDb((call) => {
      if (call.op !== "insert") return {};
      n += 1;
      if (n === 1) return { error: { message: "bulk failed" } }; // the chunk
      const row = call.payload as { message_id: string };
      return row.message_id === "BAD" ? { error: { message: "check violation" } } : {};
    });
    const store = createSupabaseHistoryStore(db, "acct", "u");
    const mk = (id: string) => ({ conversationId: "c", messageId: id, fromMe: false, createdAt: "2026-01-01T00:00:00.000Z", contentType: "text" as const, contentText: id, status: "delivered" as const });
    expect(await store.insertMessages([mk("A"), mk("BAD"), mk("C")])).toBe(2);
  });

  it("creates contacts in bulk, then the patient + push-name companion rows", async () => {
    const { db, calls } = fakeDb((call) =>
      call.table === "contacts" && call.op === "insert"
        ? { data: [{ id: "n1", phone: "5511999990005" }] }
        : {},
    );
    const store = createSupabaseHistoryStore(db, "acct", "u");
    const out = await store.createContacts([{ phone: "5511999990005", name: "Ana" }]);
    expect(out.get("5511999990005")).toBe("n1");
    const patients = calls.find((c) => c.table === "patients")!;
    expect(patients.opts).toMatchObject({ onConflict: "id", ignoreDuplicates: true });
    expect((patients.payload as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "n1", clinic_id: "acct", name: "Ana" });
    expect(calls.some((c) => c.table === "contact_whatsapp_names")).toBe(true);
  });

  it("a contact whose name is just its phone gets no push-name row", async () => {
    const { db, calls } = fakeDb((call) =>
      call.table === "contacts" && call.op === "insert" ? { data: [{ id: "n1", phone: "5511999990005" }] } : {},
    );
    await createSupabaseHistoryStore(db, "acct", "u").createContacts([{ phone: "5511999990005", name: "5511999990005" }]);
    expect(calls.some((c) => c.table === "contact_whatsapp_names")).toBe(false);
  });

  it("when the bulk insert hits a duplicate, retries one by one and reuses the contact a live message created", async () => {
    const { db } = fakeDb((call) => {
      if (call.table !== "contacts" || call.op !== "insert") return {};
      return Array.isArray(call.payload)
        ? { error: { message: "duplicate", code: "23505" } }
        : (call.payload as { phone: string }).phone === "5511999990009"
          ? { error: { message: "duplicate", code: "23505" } }
          : { data: { id: "ok-id", phone: (call.payload as { phone: string }).phone } };
    });
    const out = await createSupabaseHistoryStore(db, "acct", "u").createContacts([
      { phone: "5511999990008", name: "A" },
      { phone: "5511999990009", name: "B" },
    ]);
    expect(out.get("5511999990008")).toBe("ok-id");
    expect(out.get("5511999990009")).toBe("raced-id");
  });

  it("conversations: never overwrites one that already exists (ignoreDuplicates on the unique pair)", async () => {
    const { db, calls } = fakeDb((call) =>
      call.table === "conversations" && call.op === "select" ? { data: [{ id: "conv1", contact_id: "c1" }] } : {},
    );
    const out = await createSupabaseHistoryStore(db, "acct", "u").createConversations([
      { contactId: "c1", lastMessageAt: "2026-01-01T00:00:00.000Z", lastMessageText: "x", lastFromMe: false },
    ]);
    const up = calls.find((c) => c.op === "upsert")!;
    expect(up.opts).toMatchObject({ onConflict: "account_id,contact_id", ignoreDuplicates: true });
    expect((up.payload as Array<Record<string, unknown>>)[0]).toMatchObject({ unread_count: 0, account_id: "acct" });
    expect(out.get("c1")).toBe("conv1");
  });

  it("conversation lookup is scoped to the account", async () => {
    const { db, calls } = fakeDb(() => ({ data: [] }));
    await createSupabaseHistoryStore(db, "acct-7", "u").findConversations(["c1"]);
    expect(calls[0].filters).toContainEqual(["eq", "account_id", "acct-7"]);
  });
});
