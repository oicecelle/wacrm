import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setContactWhatsappLabel } from "./label-actions";
import { uazapiChatLabels, uazapiEditLabel } from "./uazapi-api";

afterEach(() => vi.unstubAllGlobals());

function fakeDb(opts: { config?: unknown; contact?: unknown }) {
  const writes: { table: string; kind: string; payload?: unknown }[] = [];
  const db = {
    from(table: string) {
      let kind = "select";
      let payload: unknown;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === "whatsapp_config" ? opts.config : opts.contact, error: null }),
        upsert: (p: unknown) => ((kind = "upsert"), (payload = p), (writes.push({ table, kind, payload }), Promise.resolve({ error: null }))),
        delete: () => ((kind = "delete"), b),
        then: (res: (v: unknown) => unknown) => (writes.push({ table, kind }), Promise.resolve({ error: null }).then(res)),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, writes };
}

const okConfig = { provider_type: "uazapi", uazapi_base_url: "https://srv", uazapi_token: "tok" };

describe("uazapiChatLabels payloads (documented contract)", () => {
  function capture() {
    const f = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    return f;
  }
  it("add → add_labelid, remove → remove_labelid, set → labelids; exactly one per call", async () => {
    const f = capture();
    await uazapiChatLabels("https://srv/", "t", "5511999999999", { add: "10" });
    await uazapiChatLabels("https://srv", "t", "5511999999999", { remove: "20" });
    await uazapiChatLabels("https://srv", "t", "5511999999999", { set: ["1", "2"] });
    const bodies = f.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0]).toEqual({ number: "5511999999999", add_labelid: "10" });
    expect(bodies[1]).toEqual({ number: "5511999999999", remove_labelid: "20" });
    expect(bodies[2]).toEqual({ number: "5511999999999", labelids: ["1", "2"] });
    expect(f.mock.calls[0][0]).toBe("https://srv/chat/labels");
  });
  it("surfaces the server's error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "Chat not found" }) })));
    expect(await uazapiChatLabels("https://srv", "t", "5511", { add: "1" })).toEqual({ ok: false, error: "Chat not found" });
  });
});

describe("uazapiEditLabel payloads", () => {
  it("creates with labelid 'new' and delete:false", async () => {
    const f = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    await uazapiEditLabel("https://srv", "t", { labelid: "new", name: "VIP", color: 2 });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ delete: false, labelid: "new", name: "VIP", color: 2 });
    expect(f.mock.calls[0][0]).toBe("https://srv/label/edit");
  });
});

describe("setContactWhatsappLabel", () => {
  it("calls Uazapi first, then mirrors the add locally", async () => {
    const f = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", f);
    const { db, writes } = fakeDb({ config: okConfig, contact: { id: "c1", phone: "(83) 99999-1234" } });
    expect(await setContactWhatsappLabel(db, "acct", "c1", "10", "add")).toEqual({ ok: true });
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ add_labelid: "10" });
    expect(writes.find((w) => w.table === "contact_whatsapp_labels")?.kind).toBe("upsert");
  });

  it("removing deletes the local pair", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const { db, writes } = fakeDb({ config: okConfig, contact: { id: "c1", phone: "83999991234" } });
    await setContactWhatsappLabel(db, "acct", "c1", "10", "remove");
    expect(writes.find((w) => w.table === "contact_whatsapp_labels")?.kind).toBe("delete");
  });

  it("does NOT touch the local mirror when Uazapi refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "label not found" }) })));
    const { db, writes } = fakeDb({ config: okConfig, contact: { id: "c1", phone: "83999991234" } });
    const r = await setContactWhatsappLabel(db, "acct", "c1", "999", "add");
    expect(r).toEqual({ ok: false, error: "label not found" });
    expect(writes).toHaveLength(0);
  });

  it("explains itself when there is no Uazapi connection", async () => {
    const { db } = fakeDb({ config: { provider_type: "meta", uazapi_token: null }, contact: { id: "c1", phone: "1" } });
    const r = await setContactWhatsappLabel(db, "acct", "c1", "10", "add");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Uazapi");
  });

  it("fails clearly for a contact without a phone, and for a missing label id", async () => {
    const { db } = fakeDb({ config: okConfig, contact: { id: "c1", phone: null } });
    expect((await setContactWhatsappLabel(db, "acct", "c1", "10", "add")).error).toContain("telefone");
    expect((await setContactWhatsappLabel(db, "acct", "c1", "", "add")).ok).toBe(false);
  });
});
