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
        // Handle various response schemas from Uazapi status
        const isConnected =
          data?.connected === true ||
          data?.status === 'connected' ||
          data?.state === 'connected' ||
          data?.connectionState === 'connected' ||
          data?.instance?.state === 'connected';

        return {
          connected: isConnected,
          state: data?.state || data?.status || data?.connectionState || (isConnected ? 'connected' : 'disconnected'),
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

  // Attempt global webhook setting
  try {
    const res = await fetch(`${cleanUrl}/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: webhookUrl,
        enabled: true,
        events: [
          'messages.upsert',
          'messages.update',
          'connection.update',
          'send.message',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'SEND_MESSAGE'
        ]
      }),
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
      body: JSON.stringify({
        url: webhookUrl,
      }),
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

