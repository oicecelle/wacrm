import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/contacts/dedupe", () => ({
  findExistingContact: vi.fn(async (_db: unknown, _acct: string, phone: string) =>
    phone === "5511888888888" ? { id: "contact-1", phone } : null,
  ),
}));

import { applyChatLabels, applyLabelDefinition, replaceContactLabels, syncLabelDefinitions } from "./labels-sync";

afterEach(() => vi.unstubAllGlobals());

interface Op { table: string; kind: string; payload?: unknown; filters: string[]; opts?: unknown }

function fakeDb(existing: string[] = []) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, kind: "select", filters: [] };
      const done = () => {
        ops.push(op);
        return Promise.resolve({ data: op.kind === "select" ? existing.map((wa_label_id) => ({ wa_label_id })) : null, error: null });
      };
      const b: Record<string, unknown> = {
        select: () => ((op.kind = "select"), b),
        upsert: (p: unknown, o: unknown) => ((op.kind = "upsert"), (op.payload = p), (op.opts = o), done()),
        delete: () => ((op.kind = "delete"), b),
        eq: (c: string, v: string) => (op.filters.push(`${c}=${v}`), op.kind === "select" ? b : b),
        in: (c: string, v: string[]) => (op.filters.push(`${c} in ${v.join("|")}`), done()),
        then: (res: (v: unknown) => unknown) => done().then(res),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, ops };
}

describe("replaceContactLabels (diff)", () => {
  it("adds only the new pairs and removes only the dropped ones", async () => {
    const { db, ops } = fakeDb(["1", "2"]);
    const r = await replaceContactLabels(db, "acct", "c1", ["2", "3"]);
    expect(r).toEqual({ added: 1, removed: 1 });
    const del = ops.find((o) => o.kind === "delete")!;
    expect(del.filters).toContain("wa_label_id in 1");
    const up = ops.find((o) => o.kind === "upsert")!;
    expect(up.payload).toEqual([{ contact_id: "c1", account_id: "acct", wa_label_id: "3" }]);
  });

  it("empty set removes everything (the 'all labels removed' event)", async () => {
    const { db, ops } = fakeDb(["1", "2"]);
    expect(await replaceContactLabels(db, "acct", "c1", [])).toEqual({ added: 0, removed: 2 });
    expect(ops.some((o) => o.kind === "upsert")).toBe(false);
  });

  it("writes nothing when nothing changed", async () => {
    const { db, ops } = fakeDb(["1"]);
    expect(await replaceContactLabels(db, "acct", "c1", ["1"])).toEqual({ added: 0, removed: 0 });
    expect(ops.filter((o) => o.kind !== "select")).toHaveLength(0);
  });
});

describe("applyLabelDefinition", () => {
  it("creates/renames a label without touching fields the event omitted", async () => {
    const { db, ops } = fakeDb();
    await applyLabelDefinition(db, "acct", { labelId: "31", name: "Suporte", color: 1, deleted: false });
    const up = ops.find((o) => o.kind === "upsert")!;
    expect(up.payload).toMatchObject({ account_id: "acct", wa_label_id: "31", name: "Suporte", color: 1, deleted: false });

    const second = fakeDb();
    await applyLabelDefinition(second.db, "acct", { labelId: "31", deleted: false });
    expect(second.ops.find((o) => o.kind === "upsert")!.payload).not.toHaveProperty("name");
  });

  it("a deletion flags the label (so a late event can't revive it) and drops its associations", async () => {
    const { db, ops } = fakeDb();
    await applyLabelDefinition(db, "acct", { labelId: "5", deleted: true });
    expect(ops.find((o) => o.table === "whatsapp_labels")!.payload).toMatchObject({ deleted: true });
    const del = ops.find((o) => o.table === "contact_whatsapp_labels" && o.kind === "delete")!;
    expect(del.filters).toEqual(expect.arrayContaining(["account_id=acct", "wa_label_id=5"]));
  });
});

describe("applyChatLabels", () => {
  it("applies to the matching contact", async () => {
    const { db } = fakeDb(["9"]);
    expect(await applyChatLabels(db, "acct", { chatId: "5511888888888@s.whatsapp.net", labelIds: ["3"] })).toBe("applied");
  });
  it("never creates a contact for someone who is only labelled in the phone", async () => {
    const { db, ops } = fakeDb();
    expect(await applyChatLabels(db, "acct", { chatId: "5599000000000@s.whatsapp.net", labelIds: ["3"] })).toBe("no_contact");
    expect(ops).toHaveLength(0);
  });
  it("skips groups and LID-only chats", async () => {
    const { db } = fakeDb();
    expect(await applyChatLabels(db, "acct", { chatId: "120363000000001@g.us", labelIds: [] })).toBe("no_phone");
    expect(await applyChatLabels(db, "acct", { chatId: "300001@lid", labelIds: [] })).toBe("no_phone");
  });
});

describe("syncLabelDefinitions", () => {
  it("saves what GET /labels returns, using WhatsApp's labelid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "uuid-a", labelid: "10", name: "Cliente VIP", color: 2 },
        { id: "uuid-b", name: "Sem labelid", color: 4 },
        { name: "sem id nenhum" },
      ],
    })));
    const { db, ops } = fakeDb();
    expect(await syncLabelDefinitions(db, "acct", "https://srv/", "tok")).toBe(2);
    const rows = ops.find((o) => o.kind === "upsert")!.payload as Array<{ wa_label_id: string }>;
    expect(rows.map((r) => r.wa_label_id)).toEqual(["10", "uuid-b"]);
  });
  it("throws on an HTTP error instead of silently saving nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    await expect(syncLabelDefinitions(fakeDb().db, "acct", "https://srv", "bad")).rejects.toThrow("401");
  });
});
