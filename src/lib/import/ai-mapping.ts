import type { EntityKey } from "./types";

/**
 * Client helper for the optional AI column-mapping assist. Only the
 * column headers are sent by default; sample values (real patient
 * data) are included only when `samples` is passed, which the UI does
 * only after the user explicitly opts in.
 */
export async function requestAiMapping(
  entity: EntityKey,
  headers: string[],
  samples: string[][] | null,
): Promise<(string | null)[]> {
  const res = await fetch("/api/import/ai-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity, headers, samples }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Não foi possível consultar a IA.");
  return data.mapping as (string | null)[];
}

/** Up to 3 non-empty example values per column. */
export function collectSamples(rows: string[][], columnCount: number): string[][] {
  const out: string[][] = Array.from({ length: columnCount }, () => []);
  for (const row of rows) {
    let full = true;
    for (let c = 0; c < columnCount; c++) {
      const v = (row[c] ?? "").trim();
      if (v && out[c].length < 3) out[c].push(v);
      if (out[c].length < 3) full = false;
    }
    if (full) break;
  }
  return out;
}
