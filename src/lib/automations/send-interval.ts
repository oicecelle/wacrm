/**
 * Parses the "Intervalo mínimo entre envios" field coming from the
 * builder / API. null, undefined and "" all mean "no pacing"; anything
 * else must be a whole number of seconds between 0 and 24h. Returns
 * `undefined` for an invalid value so callers can answer 400 instead
 * of silently storing garbage.
 */
export function parseSendInterval(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 86_400) return undefined;
  return n === 0 ? null : n;
}
