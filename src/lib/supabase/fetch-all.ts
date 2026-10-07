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
 *
 * SPEED. Every request here is a full round trip to the database, and
 * the database is far from the users, so the number of SEQUENTIAL
 * requests is what the person waits for:
 *
 *  - If the query asks for `{ count: "exact" }` in its `select`, the
 *    first page also tells us the total. A table that fits in one page
 *    costs exactly ONE request, and a bigger one costs the first page
 *    plus the remaining pages fetched IN PARALLEL.
 *  - Without a count we can't know where the data ends, so we walk the
 *    pages one by one until an empty one (slower, but always correct).
 *
 * Either way a lower server cap than `pageSize` can't truncate the
 * result: if the counted pages don't add up to the total, the rest is
 * walked sequentially.
 */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  /** Present when the query was made with `select(..., { count: "exact" })`. */
  count?: number | null;
}

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
  maxPages = 200,
): Promise<T[]> {
  const first = await buildPage(0, pageSize - 1);
  if (first.error) throw new Error(first.error.message);
  const rows: T[] = [...(first.data ?? [])];
  if (rows.length === 0) return rows;

  // Counted: the total is known, so no "is there another page?" probe.
  if (typeof first.count === "number") {
    const total = first.count;
    if (total <= rows.length) return rows;

    // The parallel plan assumes every page comes back FULL. If the
    // server caps responses below `pageSize`, the first page is already
    // short and pages at fixed offsets would leave holes — so only go
    // parallel when the first page is as big as it should be.
    if (rows.length === Math.min(pageSize, total)) {
      const offsets: number[] = [];
      for (let from = pageSize; from < total && offsets.length < maxPages; from += pageSize) offsets.push(from);

      // Parallel, but a few at a time — not hundreds of simultaneous requests.
      const CONCURRENCY = 4;
      const pages: T[][] = new Array(offsets.length);
      for (let i = 0; i < offsets.length; i += CONCURRENCY) {
        const slice = offsets.slice(i, i + CONCURRENCY);
        const results = await Promise.all(slice.map((from) => buildPage(from, from + pageSize - 1)));
        results.forEach((res, j) => {
          if (res.error) throw new Error(res.error.message);
          pages[i + j] = res.data ?? [];
        });
      }

      const complete = pages.every((page, i) => page.length === Math.min(pageSize, total - offsets[i]));
      if (complete) {
        for (const page of pages) rows.push(...page);
        return rows;
      }
      // A page came back short (a cap lower than expected, or rows changed
      // underneath us): the pages are not a contiguous run, so throw them
      // away and walk sequentially from the contiguous prefix we trust.
    }
  }

  for (let page = 0; page < maxPages; page++) {
    // Advance by what actually came back, not by `pageSize`, and stop
    // only on an empty page. A short page does NOT mean "done": if the
    // server's own row cap is lower than `pageSize`, every page is
    // "short" and stopping there would silently truncate again.
    const from = rows.length;
    const res = await buildPage(from, from + pageSize - 1);
    if (res.error) throw new Error(res.error.message);
    const batch = res.data ?? [];
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
  // A runaway query shouldn't loop forever.
  return rows;
}
