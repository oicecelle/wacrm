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
 * Sets the webhook URL for a Uazapi instance to receive events.
 *
 * The `events` field must be sent as a plain string (comma-separated
 * for multiple types), not an array — confirmed by inspecting this
 * exact endpoint's own settings UI on a real instance ("Escutar
 * eventos" is a single text input, placeholder 'coloque "messages"').
 * The previous array payload was silently accepted by /webhook
 * without erroring, but left the server's own Events field empty —
 * meaning inbound messages were never actually pushed to our webhook,
 * even though the URL and enabled flag saved correctly. That's why
 * sending worked but nothing ever arrived in the inbox.
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

  const webhookPayload = {
    enabled: true,
    url: webhookUrl,
    events: 'messages',
    excludeMessages: '',
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };

  // Attempt global webhook setting
  try {
    const res = await fetch(`${cleanUrl}/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload),
    });

    if (res.ok) return true;
  } catch {
    // Ignore error and try fallback
  }

  // Fallback: Instance-specific webhook setting
  try {
    const res = await fetch(`${cleanUrl}/${token}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (res.ok) return true;
  } catch {
    // Ignore error
  }

  return false;
}

/**
 * Fetches the WhatsApp profile picture for a contact from Uazapi.
 */
export async function getUazapiProfilePicture(
  baseUrl: string,
  token: string,
  phone: string
): Promise<string | null> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  // Try standard format (raw digits)
  try {
    const res = await fetch(`${cleanUrl}/get/profilePicture?number=${encodeURIComponent(phone)}`, {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.profilePicUrl || data?.url;
      if (url && url.startsWith('http')) return url;
    }
  } catch (err) {
    console.error('[getUazapiProfilePicture] failed standard number:', err);
  }

  // Try with JID format suffix
  try {
    const res = await fetch(`${cleanUrl}/get/profilePicture?number=${encodeURIComponent(phone + '@s.whatsapp.net')}`, {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.profilePicUrl || data?.url;
      if (url && url.startsWith('http')) return url;
    }
  } catch (err) {
    console.error('[getUazapiProfilePicture] failed JID format:', err);
  }

  return null;
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

