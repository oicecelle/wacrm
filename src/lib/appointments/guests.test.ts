import { describe, expect, it } from "vitest";
import { addGuestEmails, isValidGuestEmail, MAX_GUESTS, normalizeGuestEmails, splitEmailInput } from "./guests";

describe("isValidGuestEmail", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    expect(isValidGuestEmail("maria@clinica.com.br")).toBe(true);
    expect(isValidGuestEmail("  ana+agenda@gmail.com  ")).toBe(true);
    for (const bad of ["maria", "maria@", "@x.com", "maria@x", "ma ria@x.com", "a@b.c", "a@b,com"]) {
      expect(isValidGuestEmail(bad), bad).toBe(false);
    }
  });
});

describe("splitEmailInput", () => {
  it("splits on commas, semicolons, spaces and newlines", () => {
    expect(splitEmailInput("a@x.com, b@y.com; c@z.com\nd@w.com  e@v.com")).toEqual([
      "a@x.com", "b@y.com", "c@z.com", "d@w.com", "e@v.com",
    ]);
  });
  it("unwraps 'Name <email>' and quoted addresses", () => {
    expect(splitEmailInput("<maria@x.com>")).toEqual(["maria@x.com"]);
    expect(splitEmailInput('"ana@x.com"')).toEqual(["ana@x.com"]);
  });
  it("returns nothing for blank input", () => {
    expect(splitEmailInput("   ")).toEqual([]);
  });
});

describe("normalizeGuestEmails", () => {
  it("lowercases, de-duplicates and drops invalid or non-string entries", () => {
    expect(normalizeGuestEmails(["A@X.com", "a@x.com", "bad", 5, null, "b@y.com"])).toEqual(["a@x.com", "b@y.com"]);
  });
  it("treats anything that is not an array as empty", () => {
    expect(normalizeGuestEmails(undefined)).toEqual([]);
    expect(normalizeGuestEmails("a@x.com")).toEqual([]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: MAX_GUESTS + 5 }, (_, i) => `g${i}@x.com`);
    expect(normalizeGuestEmails(many)).toHaveLength(MAX_GUESTS);
  });
});

describe("addGuestEmails", () => {
  it("adds valid addresses and reports what it skipped and why", () => {
    const r = addGuestEmails(["a@x.com"], "A@x.com, b@y.com, nope, c@z.com");
    expect(r.emails).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(r.added).toEqual(["b@y.com", "c@z.com"]);
    expect(r.duplicates).toEqual(["a@x.com"]);
    expect(r.invalid).toEqual(["nope"]);
    expect(r.overLimit).toBe(false);
  });
  it("does not mutate the current list", () => {
    const current = ["a@x.com"];
    addGuestEmails(current, "b@y.com");
    expect(current).toEqual(["a@x.com"]);
  });
  it("flags when the limit stops additions", () => {
    const full = Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}@x.com`);
    const r = addGuestEmails(full, "extra@x.com");
    expect(r.emails).toHaveLength(MAX_GUESTS);
    expect(r.overLimit).toBe(true);
    expect(r.added).toEqual([]);
  });
});
