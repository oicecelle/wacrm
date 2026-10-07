/**
 * Prepares a webhook payload for the diagnostics log
 * (`whatsapp_webhook_logs`) and for console output.
 *
 * That log exists to see the SHAPE of real events — we have needed it
 * several times, because the docs and the real payloads differ. It does
 * not need secrets or what people wrote, and Uazapi's own guidance is
 * to never log tokens or message content. Before this, every row held
 * the instance token in clear text and the full text of each message
 * (clinic clients' conversations), kept forever.
 *
 * Kept: ids, types, states, timestamps, key names — everything needed to
 * understand a payload's structure. Removed or shortened:
 *  - `token` (any depth): instance credential
 *  - text-bearing fields: replaced by a marker that keeps the length
 *  - very long strings (base64 thumbnails, blobs): shortened
 */
const SECRET_KEYS = new Set(["token", "admintoken", "apikey", "authorization"]);
const TEXT_KEYS = new Set(["text", "content", "caption", "body", "conversation", "quotedtext", "wa_lastmessagetext", "contenttext"]);

/** Strings longer than this are shortened — they are blobs, not structure. */
export const MAX_LOGGED_STRING = 300;

const MAX_DEPTH = 12;

function redactValue(key: string, value: unknown, depth: number): unknown {
  const k = key.toLowerCase();
  if (SECRET_KEYS.has(k)) return undefined; // dropped entirely

  if (typeof value === "string") {
    if (TEXT_KEYS.has(k) && value.length > 0) return `[texto omitido: ${value.length} caracteres]`;
    if (value.length > MAX_LOGGED_STRING) return `${value.slice(0, 60)}…[${value.length} caracteres]`;
    return value;
  }
  if (depth >= MAX_DEPTH) return "[profundidade máxima]";

  if (Array.isArray(value)) return value.map((v) => redactValue(key, v, depth + 1));
  if (value && typeof value === "object") {
    // A text-bearing key holding an object (e.g. `content: { text, … }`):
    // the children are walked normally, so their own text keys are caught.
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const redacted = redactValue(childKey, childValue, depth + 1);
      if (redacted !== undefined) out[childKey] = redacted;
    }
    return out;
  }
  return value;
}

export function redactWebhookPayloadForLog(body: unknown): unknown {
  if (body === null || typeof body !== "object") return body;
  return redactValue("", body, 0);
}

/** Compact, redacted string for console.log (Vercel logs are readable by the whole team). */
export function redactedLogLine(body: unknown, maxChars = 1000): string {
  try {
    return JSON.stringify(redactWebhookPayloadForLog(body)).slice(0, maxChars);
  } catch {
    return "[payload não serializável]";
  }
}
