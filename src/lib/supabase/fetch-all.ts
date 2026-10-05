/**
 * Fetches every row of a query, page by page.
 *
 * PostgREST silently caps any single response at 1,000 rows by default
 * — no error, just a partial result — so a plain `.select()` over a
 * table that has grown past that quietly drops rows. That is exactly
 * what broke the broadcast list lookup on an account with 1,271
 * contacts, and the Kanban was one growth spurt behind it (949
 * deals). Anything that needs "all of them" goes through here.
 *
 * `buildPage(from, to)` must return the query with `.range(from, to)`
 * applied and a DETERMINISTIC `.order()` — without a stable order,
 * pages can overlap or skip rows between requests.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = 200,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    // Advance by what actually came back, not by `pageSize`, and stop
    // only on an empty page. A short page does NOT mean "done": if the
    // server's own row cap is lower than `pageSize`, every page is
    // "short" and stopping there would silently truncate again.
    const from = rows.length;
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
  // 200 pages (200k rows) is far beyond what a single Kanban can usefully render;
  // stop rather than loop forever on a runaway query.
  return rows;
}
