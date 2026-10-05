import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPatientSearchFilters, searchPatientOptions } from "./patient-search";

describe("buildPatientSearchFilters", () => {
  it("returns null for an empty or blank search", () => {
    expect(buildPatientSearchFilters("")).toBeNull();
    expect(buildPatientSearchFilters("   ")).toBeNull();
  });

  it("searches name, phone and email", () => {
    const f = buildPatientSearchFilters("ana")!;
    expect(f.patientsOr).toContain("name.ilike.%ana%");
    expect(f.patientsOr).toContain("phone.ilike.%ana%");
    expect(f.patientsOr).toContain("email.ilike.%ana%");
  });

  it("matches a masked phone through its digits, on both tables", () => {
    const f = buildPatientSearchFilters("(83) 99999-1234")!;
    expect(f.patientsOr).toContain("phone.ilike.%83999991234%");
    expect(f.contactsOr).toContain("phone_normalized.ilike.%83999991234%");
    // patients has no phone_normalized column
    expect(f.patientsOr).not.toContain("phone_normalized");
  });

  it("ignores digit matching for very short numbers (too broad)", () => {
    const f = buildPatientSearchFilters("83")!;
    expect(f.contactsOr).not.toContain("phone_normalized");
  });

  it("strips characters that would break or widen the or() filter", () => {
    const f = buildPatientSearchFilters("Silva, Ana (2ª) %*")!;
    // Exactly the three conditions — the comma the user typed did not
    // become a fourth, and no stray syntax characters survive.
    expect(f.patientsOr.split(",")).toHaveLength(3);
    const values = f.patientsOr.split(",").map((c) => c.replace(/^[a-z_]+\.ilike\./, ""));
    for (const v of values) expect(v.replace(/^%|%$/g, "")).not.toMatch(/[(),%*]/);
  });
});

function fakeDb(patients: unknown[], contacts: unknown[], capture: { or: Record<string, string>; limit: Record<string, number> }) {
  const make = (table: string, rows: unknown[]) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      or: (f: string) => ((capture.or[table] = f), b),
      order: () => b,
      limit: (n: number) => ((capture.limit[table] = n), Promise.resolve({ data: rows, error: null })),
    };
    return b;
  };
  return { from: (t: string) => (t === "patients" ? make(t, patients) : make(t, contacts)) } as unknown as SupabaseClient;
}

describe("searchPatientOptions", () => {
  it("merges patients and contacts, patients winning on the same id", async () => {
    const cap = { or: {}, limit: {} };
    const db = fakeDb(
      [{ id: "1", name: "Ana Paciente", phone: "83911112222" }],
      [
        { id: "1", name: "Ana Contato", phone: "83911112222" },
        { id: "2", name: "Bruno", phone: "83933334444" },
      ],
      cap,
    );
    const out = await searchPatientOptions(db, "clinic", "");
    expect(out.map((o) => o.name)).toEqual(["Ana Paciente", "Bruno"]);
  });

  it("keeps an unnamed contact selectable by falling back to its phone", async () => {
    const db = fakeDb([], [{ id: "9", name: null, phone: "83955556666" }], { or: {}, limit: {} });
    const out = await searchPatientOptions(db, "clinic", "");
    expect(out[0].name).toBe("83955556666");
  });

  it("asks the SERVER for a bounded page — never downloads the table", async () => {
    const cap = { or: {} as Record<string, string>, limit: {} as Record<string, number> };
    await searchPatientOptions(fakeDb([], [], cap), "clinic", "maria");
    expect(cap.limit).toEqual({ patients: 20, contacts: 20 });
    expect(cap.or.patients).toContain("name.ilike.%maria%");
    expect(cap.or.contacts).toContain("name.ilike.%maria%");
  });

  it("applies no or() filter for an empty search", async () => {
    const cap = { or: {} as Record<string, string>, limit: {} as Record<string, number> };
    await searchPatientOptions(fakeDb([], [], cap), "clinic", "");
    expect(cap.or).toEqual({});
  });
});
