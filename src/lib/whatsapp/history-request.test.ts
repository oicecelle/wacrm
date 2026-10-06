import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HISTORY_REQUEST_COOLDOWN_MS,
  HISTORY_REQUEST_COUNT,
  HISTORY_REQUEST_STALE_MS,
  requestEarlierMessages,
} from "./history-request";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse("2026-10-06T12:00:00Z");

interface World {
  conv?: unknown;
  config?: unknown;
  oldestMessageId?: string | null;
  pendingRecent?: boolean;
}
interface Write { table: string; kind: string; payload?: unknown; filters: string[] }

function fakeDb(w: World, onEq?: (table: string, col: string, val: unknown) => void) {
  const writes: Write[] = [];
  const db = {
    from(table: string) {
      const rec: Write = { table, kind: "select", filters: [] };
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (p: unknown) => ((rec.kind = "insert"), (rec.payload = p), writes.push(rec), b),
        update: (p: unknown) => ((rec.kind = "update"), (rec.payload = p), writes.push(rec), b),
        eq: (c: string, v: unknown) => (rec.filters.push(`${c}=${v}`), onEq?.(table, c, v), b),
        lt: (c: string) => (rec.filters.push(`${c}<`), b),
        gt: (c: string) => (rec.filters.push(`${c}>`), b),
        not: () => b,
        order: () => b,
        limit: () => b,
        single: () => Promise.resolve({ data: { id: "req-1" }, error: null }),
        maybeSingle: () => {
          if (table === "conversations") return Promise.resolve({ data: w.conv ?? null, error: null });
          if (table === "whatsapp_config") return Promise.resolve({ data: w.config ?? null, error: null });
          if (table === "messages")
            return Promise.resolve({ data: w.oldestMessageId ? { message_id: w.oldestMessageId } : null, error: null });
          if (table === "history_sync_requests") return Promise.resolve({ data: w.pendingRecent ? { id: "old" } : null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, writes };
}

const okWorld = (over: World = {}): World => ({
  conv: { id: "conv1", contact: { phone: "(55) 11 99999-0001", is_group: false } },
  config: { provider_type: "uazapi", uazapi_base_url: "https://srv", uazapi_token: "tok" },
  oldestMessageId: "5511000:3EB0OLDEST",
  ...over,
});

function stubUazapi(responses: Array<{ ok: boolean; status: number; error?: string }>) {
  const f = vi.fn(async (_url: string, _init: { body: string }) => {
    const r = responses.shift() ?? { ok: true, status: 200 };
    return { ok: r.ok, status: r.status, json: async () => (r.error ? { error: r.error } : {}) } as Response;
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const bodyOf = (f: ReturnType<typeof stubUazapi>, i: number) => JSON.parse(f.mock.calls[i][1].body);

describe("requestEarlierMessages", () => {
  it("asks for 50 messages before OUR oldest one, in the chat's JID, and records the request", async () => {
    const f = stubUazapi([{ ok: true, status: 200 }]);
    const { db, writes } = fakeDb(okWorld());
    const r = await requestEarlierMessages(db, "acct", "user", "conv1", NOW);
    expect(r).toEqual({ ok: true, requestId: "req-1" });
    expect(bodyOf(f, 0)).toEqual({
      number: "5511999990001@s.whatsapp.net",
      mode: "history",
      count: HISTORY_REQUEST_COUNT,
      messageid: "3EB0OLDEST", // bare id: the owner prefix is stripped
    });
    expect(f.mock.calls[0][0]).toBe("https://srv/message/history-sync");
    const ins = writes.find((x) => x.table === "history_sync_requests" && x.kind === "insert")!;
    expect(ins.payload).toMatchObject({ account_id: "acct", conversation_id: "conv1", chat_jid: "5511999990001@s.whatsapp.net", anchor_message_id: "3EB0OLDEST" });
  });

  it("with no stored message, sends no anchor (the server uses its own oldest)", async () => {
    const f = stubUazapi([{ ok: true, status: 200 }]);
    await requestEarlierMessages(fakeDb(okWorld({ oldestMessageId: null })).db, "acct", "user", "conv1", NOW);
    expect(bodyOf(f, 0)).not.toHaveProperty("messageid");
  });

  it("REGRESSION: when the server doesn't know our anchor (older than its ~7-day window), retries without it instead of failing", async () => {
    const f = stubUazapi([
      { ok: false, status: 400, error: "anchor not found" },
      { ok: true, status: 200 },
    ]);
    const r = await requestEarlierMessages(fakeDb(okWorld()).db, "acct", "user", "conv1", NOW);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 0)).toHaveProperty("messageid");
    expect(bodyOf(f, 1)).not.toHaveProperty("messageid");
  });

  it("does not retry on an auth failure, and says to reconnect", async () => {
    const f = stubUazapi([{ ok: false, status: 401 }]);
    const { db, writes } = fakeDb(okWorld());
    const r = await requestEarlierMessages(db, "acct", "user", "conv1", NOW);
    expect(r).toMatchObject({ ok: false, code: "refused" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(writes.find((x) => x.kind === "update" && (x.payload as { state?: string }).state === "failed")).toBeTruthy();
  });

  it("marks the request failed (so the screen doesn't wait) when Uazapi rejects it", async () => {
    stubUazapi([{ ok: false, status: 500, error: "connection closed" }, { ok: false, status: 500, error: "connection closed" }]);
    const { db, writes } = fakeDb(okWorld({ oldestMessageId: null }));
    const r = await requestEarlierMessages(db, "acct", "user", "conv1", NOW);
    expect(r).toMatchObject({ ok: false, code: "failed", message: "connection closed" });
    const failed = writes.find((x) => x.kind === "update" && (x.payload as { state?: string }).state === "failed")!;
    expect(failed.payload).toMatchObject({ error: "connection closed" });
  });

  it("refuses a second request while one is still waiting for the phone", async () => {
    const f = stubUazapi([]);
    const r = await requestEarlierMessages(fakeDb(okWorld({ pendingRecent: true })).db, "acct", "user", "conv1", NOW);
    expect(r).toMatchObject({ ok: false, code: "cooldown" });
    expect(f).not.toHaveBeenCalled();
  });

  it("closes requests nobody answered (stale pending → timeout) before checking the cooldown", async () => {
    stubUazapi([{ ok: true, status: 200 }]);
    const { db, writes } = fakeDb(okWorld());
    await requestEarlierMessages(db, "acct", "user", "conv1", NOW);
    const expire = writes.find((x) => x.kind === "update" && (x.payload as { state?: string }).state === "timeout")!;
    expect(expire.filters).toEqual(expect.arrayContaining(["account_id=acct", "state=pending", "requested_at<"]));
    expect(HISTORY_REQUEST_STALE_MS).toBeGreaterThan(HISTORY_REQUEST_COOLDOWN_MS);
  });

  it("rejects groups, phoneless contacts, other accounts' conversations, and missing connections — without calling Uazapi", async () => {
    const f = stubUazapi([]);
    expect(await requestEarlierMessages(fakeDb(okWorld({ conv: { id: "c", contact: { phone: "5511999990001", is_group: true } } })).db, "a", "u", "c", NOW)).toMatchObject({ code: "group" });
    expect(await requestEarlierMessages(fakeDb(okWorld({ conv: { id: "c", contact: { phone: null, is_group: false } } })).db, "a", "u", "c", NOW)).toMatchObject({ code: "no_phone" });
    expect(await requestEarlierMessages(fakeDb(okWorld({ conv: null })).db, "a", "u", "c", NOW)).toMatchObject({ code: "not_found" });
    expect(await requestEarlierMessages(fakeDb(okWorld({ config: { provider_type: "meta", uazapi_token: null } })).db, "a", "u", "c", NOW)).toMatchObject({ code: "no_connection" });
    expect(f).not.toHaveBeenCalled();
  });

  it("looks the conversation up WITHIN the caller's account", async () => {
    stubUazapi([{ ok: true, status: 200 }]);
    const eqs: string[] = [];
    const { db } = fakeDb(okWorld(), (table, col, val) => {
      if (table === "conversations") eqs.push(`${col}=${val}`);
    });
    await requestEarlierMessages(db, "acct-9", "user", "conv1", NOW);
    expect(eqs).toContain("account_id=acct-9");
  });
});
