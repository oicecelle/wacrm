import { UAZAPI_WEBHOOK_EVENTS, UAZAPI_WEBHOOK_EXCLUDE_MESSAGES } from './uazapi-events';

export interface UazapiSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UazapiStatusResult {
  connected: boolean;
  state?: string;
  raw?: any;
}

/**
 * Normalizes phone numbers to a clean digits-only format required by Uazapi.
 */
export function formatPhoneForUazapi(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Checks connection status of a Uazapi instance.
 * Tries the '/get/status' endpoint first, then falls back to other variants.
 */
export async function getUazapiStatus(
  baseUrl: string,
  token: string
): Promise<UazapiStatusResult> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  const endpoints = ['/get/status', '/instance/status', '/status'];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const url = `${cleanUrl}${endpoint}`;
      const res = await fetch(url, { method: 'GET', headers });
      if (res.ok) {
        const data = await res.json();
        // Handle various response schemas from Uazapi status:
        // Schema 1: flat { connected, status, state, connectionState }
        // Schema 2: customix { info, status: { checked_instance: { connection_status }, server_status } }
        // Schema 3: { instance: { status: 'connected', ... }, status: { connected, loggedIn, jid } }
        //   (seen on pluztech.uazapi.com — data.status is an object
        //   here, not a string, so it must be checked as one too)
        const checkedInstance = data?.status?.checked_instance;
        const isConnected =
          data?.connected === true ||
          data?.status === 'connected' ||
          data?.state === 'connected' ||
          data?.connectionState === 'connected' ||
          data?.instance?.state === 'connected' ||
          data?.instance?.status === 'connected' ||
          data?.status?.connected === true ||
          data?.status?.loggedIn === true ||
          checkedInstance?.connection_status === 'connected' ||
          checkedInstance?.is_healthy === true ||
          data?.status?.server_status === 'running';

        const state =
          checkedInstance?.connection_status ||
          data?.state ||
          (typeof data?.status === 'string' ? data.status : null) ||
          data?.connectionState ||
          (typeof data?.instance?.status === 'string' ? data.instance.status : null) ||
          (isConnected ? 'connected' : 'disconnected');

        return {
          connected: isConnected,
          state,
          raw: data,
        };
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  return {
    connected: false,
    state: 'error',
    raw: lastError ? { error: lastError.message } : null,
  };
}


/**
 * Sends a WhatsApp text message using Uazapi.
 */
export async function sendUazapiTextMessage(
  baseUrl: string,
  token: string,
  to: string,
  text: string
): Promise<UazapiSendResult> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  const formattedNumber = formatPhoneForUazapi(to);
  const payload = {
    number: formattedNumber,
    text: text,
  };

  try {
    const res = await fetch(`${cleanUrl}/send/text`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const textResponse = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(textResponse);
    } catch {
      // non-JSON response
    }

    if (res.ok) {
      return {
        success: true,
        messageId: data?.messageId || data?.id || data?.messages?.[0]?.id || `uaz-${Date.now()}`,
      };
    } else {
      return {
        success: false,
        error: data?.message || data?.error || textResponse || `HTTP ${res.status}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown network error',
    };
  }
}

/**
 * Event names present in a `GET /webhook` response, whatever shape the
 * server uses. The docs (v2.4.4) return an array of webhooks, each with
 * `events` as an array; an older deployment kept `events` as a single
 * comma-separated string (and silently stored NOTHING when sent an
 * array). Both are read here so registration can be verified instead
 * of trusted.
 */
export function eventsFromWebhookConfig(data: unknown): string[] {
  const entries = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  const found = new Set<string>();
  for (const entry of entries) {
    const events = (entry as { events?: unknown } | null)?.events;
    if (Array.isArray(events)) {
      for (const e of events) if (typeof e === 'string' && e.trim()) found.add(e.trim());
    } else if (typeof events === 'string') {
      for (const e of events.split(/[\s,;]+/)) if (e) found.add(e);
    }
  }
  return Array.from(found);
}

async function readUazapiWebhookEvents(cleanUrl: string, headers: Record<string, string>): Promise<string[] | null> {
  try {
    const res = await fetch(`${cleanUrl}/webhook`, { method: 'GET', headers });
    if (!res.ok) return null;
    return eventsFromWebhookConfig(await res.json());
  } catch {
    return null;
  }
}

/**
 * Registers our inbound webhook on a Uazapi instance (the "modo simples"
 * of POST /webhook: one webhook per instance, created or updated).
 * Called whenever a number is connected through the system.
 *
 * Subscribes to the events listed in UAZAPI_WEBHOOK_EVENTS — everything
 * except calls, groups, stories and channels.
 *
 * Two payload formats, VERIFIED rather than assumed:
 *  1. The documented one: `events` / `excludeMessages` as arrays.
 *  2. The legacy one: plain comma-separated strings. A previous
 *     developer found that, on this deployment, an array was accepted
 *     without error yet left the server's Events field EMPTY — inbound
 *     messages silently never arrived. We don't know which server
 *     version each clinic's instance runs, so after saving we read the
 *     config back (GET /webhook) and, if `messages` is not there, retry
 *     in the legacy format. Sending only the new format blind could
 *     leave a newly connected number deaf.
 *
 * Returns true only when the server confirms `messages` is subscribed
 * (or, if the read-back itself is unavailable, when the save succeeded).
 */
export async function setUazapiWebhook(
  baseUrl: string,
  token: string,
  webhookUrl: string
): Promise<boolean> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  const base = {
    enabled: true,
    url: webhookUrl,
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };
  const attempts: Array<{ label: string; body: Record<string, unknown> }> = [
    {
      label: 'array',
      body: { ...base, events: [...UAZAPI_WEBHOOK_EVENTS], excludeMessages: [...UAZAPI_WEBHOOK_EXCLUDE_MESSAGES] },
    },
    {
      label: 'string',
      body: { ...base, events: UAZAPI_WEBHOOK_EVENTS.join(','), excludeMessages: UAZAPI_WEBHOOK_EXCLUDE_MESSAGES.join(',') },
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(`${cleanUrl}/webhook`, {
        method: 'POST',
        headers,
        body: JSON.stringify(attempt.body),
      });
      if (!res.ok) {
        console.warn(`[uazapi] setWebhook (${attempt.label}) failed: HTTP ${res.status}`);
        continue;
      }
    } catch (err) {
      console.warn(`[uazapi] setWebhook (${attempt.label}) network error:`, err);
      continue;
    }

    const stored = await readUazapiWebhookEvents(cleanUrl, headers);
    if (stored === null) {
      // Can't read it back: trust the save, but say so.
      console.warn(`[uazapi] webhook saved (${attempt.label}) but could not be verified`);
      return true;
    }
    if (stored.includes('messages')) {
      const missing = UAZAPI_WEBHOOK_EVENTS.filter((e) => !stored.includes(e));
      if (missing.length > 0) {
        console.warn(`[uazapi] webhook saved (${attempt.label}) but server did not keep: ${missing.join(', ')}`);
      }
      return true;
    }
    console.warn(`[uazapi] webhook (${attempt.label}) left events empty/without messages; trying the other format`);
  }

  return false;
}

/**
 * Fetches the WhatsApp profile picture of a chat: `POST /chat/avatar`
 * (documented). Returns a TEMPORARY url — it expires, so don't treat a
 * stored copy as permanent — or null when there is no photo (the API
 * answers 200 with an empty `url` in that case).
 */
export async function getUazapiProfilePicture(
  baseUrl: string,
  token: string,
  phone: string
): Promise<string | null> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/chat/avatar`, {
      method: 'POST',
      headers: { 'token': token, 'apikey': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, preview: true }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.url === 'string' && data.url.startsWith('http') ? data.url : null;
  } catch (err) {
    console.error('[getUazapiProfilePicture] failed:', err);
    return null;
  }
}

/**
 * Sends a WhatsApp media message (image, video, document, audio) using Uazapi.
 */
export async function sendUazapiMediaMessage(
  baseUrl: string,
  token: string,
  to: string,
  mediaUrl: string,
  type: string,
  caption?: string | null,
  filename?: string | null
): Promise<UazapiSendResult> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  const formattedNumber = formatPhoneForUazapi(to);
  
  // Normalize type: 'document' instead of 'documentMessage'
  let normalizedType = type;
  if (type === 'documentMessage') normalizedType = 'document';

  const payload: any = {
    number: formattedNumber,
    type: normalizedType,
    file: mediaUrl,
  };

  if (caption) {
    payload.caption = caption;
  }
  if (filename) {
    payload.fileName = filename;
  }

  try {
    const res = await fetch(`${cleanUrl}/send/media`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const textResponse = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(textResponse);
    } catch {
      // non-JSON response
    }

    if (res.ok) {
      return {
        success: true,
        messageId: data?.messageId || data?.id || data?.messages?.[0]?.id || `uaz-${Date.now()}`,
      };
    } else {
      return {
        success: false,
        error: data?.message || data?.error || textResponse || `HTTP ${res.status}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown network error',
    };
  }
}

// ── WhatsApp labels (etiquetas) ──────────────────────────────────

const uazapiHeaders = (token: string) => ({
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
});

export type ChatLabelAction = { add: string } | { remove: string } | { set: string[] };

/**
 * `POST /chat/labels` — add one label, remove one, or REPLACE the whole
 * set on a chat. Exactly one operation per call (the API rejects mixes),
 * and a label id that doesn't exist is rejected by the server.
 */
export async function uazapiChatLabels(
  baseUrl: string,
  token: string,
  number: string,
  action: ChatLabelAction,
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { number };
  if ('add' in action) body.add_labelid = action.add;
  else if ('remove' in action) body.remove_labelid = action.remove;
  else body.labelids = action.set;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/labels`, {
      method: 'POST',
      headers: uazapiHeaders(token),
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail?.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

/**
 * `POST /label/edit` — create (`labelid: "new"`), edit or delete a label.
 * The API does NOT return the new label's id ("Label created"); read it
 * back with GET /labels or from the `labels` webhook event.
 */
export async function uazapiEditLabel(
  baseUrl: string,
  token: string,
  label: { labelid: string; name?: string; color?: number; delete?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/label/edit`, {
      method: 'POST',
      headers: uazapiHeaders(token),
      body: JSON.stringify({ delete: false, ...label }),
    });
    if (res.ok) return { ok: true };
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail?.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

/** `POST /labels/refresh` — asks the phone to re-send labels; they arrive as `history` batches. */
export async function uazapiRefreshLabels(baseUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/labels/refresh`, {
      method: 'POST',
      headers: uazapiHeaders(token),
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}
