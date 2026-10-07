import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";

// Fake table that, like PostgREST, answers any range with at most
// `cap` rows no matter how many were asked for.
function fakeTable(total: number, cap = 1000) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const slice = all.slice(from, Math.min(to, from + cap - 1) + 1);
    return Promise.resolve({ data: slice, error: null });
  };
  return { build, calls };
}

describe("fetchAllRows", () => {
  it("returns every row of a table larger than the 1,000-row cap", async () => {
    const { build } = fakeTable(2350);
    const rows = await fetchAllRows(build);
    expect(rows).toHaveLength(2350);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2350); // no overlap, no gap
  });

  it("returns everything when the table fits under the cap", async () => {
    const { build } = fakeTable(949);
    expect(await fetchAllRows(build)).toHaveLength(949);
  });

  it("still gets every row when the server's cap is LOWER than the page size", async () => {
    // A short page must not be read as 'finished'.
    const { build } = fakeTable(2350, 500);
    const rows = await fetchAllRows(build);
    expect(rows).toHaveLength(2350);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2350);
  });

  it("stops cleanly on an exact multiple of the page size", async () => {
    const { build } = fakeTable(2000);
    expect(await fetchAllRows(build)).toHaveLength(2000);
  });

  it("handles an empty table", async () => {
    const { build } = fakeTable(0);
    expect(await fetchAllRows(build)).toEqual([]);
  });

  it("surfaces a query error instead of returning a partial list", async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});


// ── counted mode: fewer round trips ──────────────────────────────────

function countedTable(total: number, cap = 1000) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const build = async (from: number, to: number) => {
    calls.push([from, to]);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    return { data: all.slice(from, Math.min(to, from + cap - 1) + 1), error: null, count: total };
  };
  return { build, calls, maxInFlight: () => maxInFlight };
}

describe("fetchAllRows with a count", () => {
  it("a table that fits in one page costs exactly ONE request (no empty probe page)", async () => {
    const { build, calls } = countedTable(949);
    expect(await fetchAllRows(build)).toHaveLength(949);
    expect(calls).toHaveLength(1);
  });

  it("an exact multiple of the page size also costs one request when it fits", async () => {
    const { build, calls } = countedTable(1000);
    expect(await fetchAllRows(build)).toHaveLength(1000);
    expect(calls).toHaveLength(1);
  });

  it("a bigger table: first page + the remaining pages, complete and in order, no overlap", async () => {
    const { build, calls } = countedTable(2350);
    const rows = await fetchAllRows(build);
    expect(rows).toHaveLength(2350);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 2350 }, (_, i) => i));
    expect(calls).toHaveLength(3); // 1000 + 1000 + 350, no extra empty page
  });

  it("fetches the remaining pages in PARALLEL, but never hundreds at once", async () => {
    const t = countedTable(12_000);
    const rows = await fetchAllRows(t.build);
    expect(rows).toHaveLength(12_000);
    expect(t.maxInFlight()).toBeGreaterThan(1);
    expect(t.maxInFlight()).toBeLessThanOrEqual(4);
  });

  it("REGRESSION: a server cap LOWER than the page size can't truncate a counted fetch", async () => {
    const t = countedTable(2350, 500);
    const rows = await fetchAllRows(t.build);
    expect(rows).toHaveLength(2350);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2350);
  });

  it("an empty table is one request", async () => {
    const { build, calls } = countedTable(0);
    expect(await fetchAllRows(build)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("an error in a LATER page surfaces instead of returning a partial list", async () => {
    const build = async (from: number) =>
      from >= 1000
        ? { data: null, error: { message: "boom" }, count: 2500 }
        : { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null, count: 2500 };
    await expect(fetchAllRows(build)).rejects.toThrow("boom");
  });
});
