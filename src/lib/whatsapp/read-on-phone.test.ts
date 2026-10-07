import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/contacts/dedupe", () => ({
  findExistingContact: vi.fn(async (_db: unknown, _a: string, phone: string) => (phone === "5511999990001" ? { id: "c1", phone } : null)),
}));

import { markConversationReadFromPhone } from "./read-on-phone";

function fakeDb(world: { conv?: { id: string; unread_count: number | null } | null; latestCustomerMsg?: string | null }) {
  const updates: Array<{ table: string; patch: unknown; filters: string[] }> = [];
  const db = {
    from(table: string) {
      const rec = { table, patch: undefined as unknown, filters: [] as string[] };
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: unknown) => ((rec.patch = p), updates.push(rec), b),
        eq: (c: string, v: unknown) => (rec.filters.push(`${c}=${v}`), b),
        not: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "conversations"
                ? world.conv ?? null
                : world.latestCustomerMsg
                  ? { message_id: world.latestCustomerMsg }
                  : null,
            error: null,
          }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, updates };
}

const CHAT = "5511999990001@s.whatsapp.net";

describe("markConversationReadFromPhone", () => {
  it("clears the unread badge when the phone read the customer's LATEST message", async () => {
    const { db, updates } = fakeDb({ conv: { id: "conv1", unread_count: 3 }, latestCustomerMsg: "3EB0LATEST" });
    expect(await markConversationReadFromPhone(db, "acct", CHAT, ["3EB0OLD", "5511000:3EB0LATEST"])).toBe(true);
    expect(updates[0]).toMatchObject({ table: "conversations", patch: { unread_count: 0 } });
    expect(updates[0].filters).toContain("id=conv1");
  });

  it("REGRESSION: a late receipt covering only OLDER messages must not erase the badge of a newer, unseen one", async () => {
    const { db, updates } = fakeDb({ conv: { id: "conv1", unread_count: 1 }, latestCustomerMsg: "3EB0NEWEST" });
    expect(await markConversationReadFromPhone(db, "acct", CHAT, ["3EB0OLD"])).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("does nothing when nothing was unread (no pointless write)", async () => {
    const { db, updates } = fakeDb({ conv: { id: "conv1", unread_count: 0 }, latestCustomerMsg: "X" });
    expect(await markConversationReadFromPhone(db, "acct", CHAT, ["X"])).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("ignores chats that aren't contacts here, groups and LID chats — and never creates anything", async () => {
    const { db, updates } = fakeDb({ conv: { id: "c", unread_count: 2 }, latestCustomerMsg: "X" });
    expect(await markConversationReadFromPhone(db, "acct", "5599000000000@s.whatsapp.net", ["X"])).toBe(false);
    expect(await markConversationReadFromPhone(db, "acct", "120363000000001@g.us", ["X"])).toBe(false);
    expect(await markConversationReadFromPhone(db, "acct", "300001@lid", ["X"])).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("does nothing without a conversation or without a stored customer message to compare", async () => {
    expect(await markConversationReadFromPhone(fakeDb({ conv: null }).db, "acct", CHAT, ["X"])).toBe(false);
    expect(await markConversationReadFromPhone(fakeDb({ conv: { id: "c", unread_count: 2 }, latestCustomerMsg: null }).db, "acct", CHAT, ["X"])).toBe(false);
    expect(await markConversationReadFromPhone(fakeDb({ conv: { id: "c", unread_count: 2 }, latestCustomerMsg: "X" }).db, "acct", CHAT, [])).toBe(false);
  });
});
