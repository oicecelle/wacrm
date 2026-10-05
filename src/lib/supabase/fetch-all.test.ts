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
