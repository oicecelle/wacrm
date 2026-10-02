import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeByPhone,
  findExistingContact,
  findExistingContactsBatch,
  isExactMatch,
  isUniqueViolation,
  normalizeKey,
} from "./dedupe";

describe("normalizeKey", () => {
  it("strips every non-digit", () => {
    expect(normalizeKey("+1 (555) 123-4567")).toBe("15551234567");
    expect(normalizeKey("15551234567")).toBe("15551234567");
  });

  it("collapses different formats of the same number to one key", () => {
    expect(normalizeKey("+44 7911 123456")).toBe(normalizeKey("447911123456"));
  });
});

describe("isExactMatch", () => {
  it("treats different formatting of the same digits as exact", () => {
    expect(isExactMatch({ id: "1", phone: "+1 555-123-4567" }, "15551234567")).toBe(
      true,
    );
  });

  it("is false for a trunk-variant (fuzzy) match", () => {
    // last-8 match but not the same full number
    expect(isExactMatch({ id: "1", phone: "37063949836" }, "370063949836")).toBe(
      false,
    );
  });
});

describe("isUniqueViolation", () => {
  it("detects Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("is false for other errors / non-objects", () => {
    expect(isUniqueViolation({ code: "23502" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
  });
});

describe("dedupeByPhone", () => {
  it("keeps the first occurrence and counts in-file duplicates", () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: "+1 555-1111", name: "A" },
      { phone: "15551111", name: "B" }, // same digits as #1
      { phone: "+1 555-2222", name: "C" },
    ]);
    expect(unique.map((r) => r.name)).toEqual(["A", "C"]);
    expect(duplicates).toBe(1);
  });

  it("drops rows with no digits", () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: "   " },
      { phone: "+1 555-3333" },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toBe(1);
  });
});

describe("findExistingContact", () => {
  // Minimal SupabaseClient stub: resolves the .from().select().eq().like()
  // chain to a fixed candidate set.
  function stubDb(rows: Array<{ id: string; phone: string }>): SupabaseClient {
    const builder = {
      select: () => builder,
      eq: () => builder,
      like: () => Promise.resolve({ data: rows, error: null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("returns a trunk-variant match via phonesMatch", async () => {
    const db = stubDb([{ id: "c1", phone: "37063949836" }]);
    const hit = await findExistingContact(db, "acct", "+370 063 949 836");
    expect(hit?.id).toBe("c1");
  });

  it("returns null when no candidate matches", async () => {
    const db = stubDb([{ id: "c1", phone: "15559999999" }]);
    const hit = await findExistingContact(db, "acct", "+1 555-123-4567");
    expect(hit).toBeNull();
  });

  it("returns null for an empty phone without querying", async () => {
    const db = stubDb([{ id: "c1", phone: "15551234567" }]);
    expect(await findExistingContact(db, "acct", "   ")).toBeNull();
  });
});

describe("findExistingContactsBatch", () => {
  // Deliberately has NO bare `.eq()` terminal resolution — only `.or()`
  // resolves to data. If the implementation ever regresses to an
  // unbounded `.select("*").eq("account_id", ...)` with no `.or()`
  // filter (the real bug this was built to catch — see below), that
  // chain would return `undefined` here instead of real rows, and
  // every assertion in this block would fail loudly instead of the
  // bug silently reappearing.
  function stubDb(rows: Array<{ id: string; phone: string; name?: string }>) {
    const calls: { orFilter: string }[] = [];
    const builder = {
      select: () => builder,
      eq: () => builder,
      or: (filter: string) => {
        calls.push({ orFilter: filter });
        return Promise.resolve({ data: rows, error: null });
      },
    };
    const db = { from: () => builder } as unknown as SupabaseClient;
    return { db, calls };
  }

  it("matches real contacts found via Postgres found via the suffix OR-filter (exact phones)", async () => {
    const { db } = stubDb([
      { id: "c1", phone: "5583987451115", name: "Tatiana" },
      { id: "c2", phone: "5583998314151", name: "Maytê" },
    ]);
    const result = await findExistingContactsBatch(db, "acct", ["(83) 98745-1115", "(83) 99831-4151"]);
    expect(result.get(normalizeKey("(83) 98745-1115"))?.name).toBe("Tatiana");
    expect(result.get(normalizeKey("(83) 99831-4151"))?.name).toBe("Maytê");
  });

  it(
    "finds an exact match regardless of how many OTHER contacts the account has " +
      "(the real bug: an unbounded select over a 1,000+ contact account silently " +
      "truncated at PostgREST's default row cap, so a real match further down the " +
      "table was missed and the caller tried to re-insert it, hitting the DB's own " +
      'unique index — "duplicate key value violates unique constraint ' +
      '\\"idx_contacts_account_phone_normalized\\""). The OR-filter approach only ever ' +
      "asks for rows that could match one of THIS batch's phones, so it can never be " +
      "truncated by how large the account's full contact list is.",
    async () => {
      const { db } = stubDb([{ id: "needle", phone: "5583987451115", name: "Tatiana" }]);
      const result = await findExistingContactsBatch(db, "acct", ["(83) 98745-1115"]);
      expect(result.get(normalizeKey("(83) 98745-1115"))?.id).toBe("needle");
    },
  );

  it("returns an empty map when nothing matches", async () => {
    const { db } = stubDb([{ id: "c1", phone: "5583987451115" }]);
    const result = await findExistingContactsBatch(db, "acct", ["(11) 90000-0000"]);
    expect(result.size).toBe(0);
  });

  it("de-duplicates OR-filter suffixes so repeated/similar phones in the batch don't balloon the query", async () => {
    const { db, calls } = stubDb([{ id: "c1", phone: "5583987451115" }]);
    await findExistingContactsBatch(db, "acct", ["(83) 98745-1115", "83987451115", "+55 83 98745-1115"]);
    // All three inputs share the same last-8-digit suffix — exactly
    // one OR-term, not three, regardless of how the same number was
    // formatted across the pasted list.
    expect(calls).toHaveLength(1);
    expect(calls[0].orFilter.split(",")).toHaveLength(1);
  });

  it("returns an empty map for an all-invalid batch without querying", async () => {
    const { db, calls } = stubDb([{ id: "c1", phone: "5583987451115" }]);
    const result = await findExistingContactsBatch(db, "acct", ["", "   "]);
    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
