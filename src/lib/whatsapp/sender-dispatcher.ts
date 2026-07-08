import {
  sendTextMessage as metaSendText,
  sendTemplateMessage as metaSendTemplate,
  sendMediaMessage as metaSendMedia,
  type MediaKind,
} from './meta-api';
import {
  sendUazapiTextMessage,
  sendUazapiMediaMessage,
} from './uazapi-api';
import { decrypt } from './encryption';
import type { MessageTemplate } from '@/types';

export interface DispatchSendArgs {
  config: {
    provider_type: 'meta' | 'uazapi';
    phone_number_id?: string | null;
    access_token?: string | null;
    uazapi_token?: string | null;
    uazapi_base_url?: string | null;
    uazapi_instance_name?: string | null;
  };
  to: string;
  messageType: 'text' | 'template' | 'image' | 'video' | 'document' | 'audio';
  content_text?: string | null;
  media_url?: string | null;
  filename?: string | null;
  template_name?: string | null;
  template_language?: string | null;
  template_params?: string[];
  templateRow?: MessageTemplate | null;
  template_message_params?: any;
  contextMessageId?: string;
}

export interface DispatchSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Interpolates positional placeholders like {{1}}, {{2}} in template body text.
 */
export function interpolateTemplateBody(bodyText: string, params: string[]): string {
  let result = bodyText;
  params.forEach((param, index) => {
    const placeholder = `{{${index + 1}}}`;
    result = result.replaceAll(placeholder, param);
  });
  return result;
}

/**
 * Routes a WhatsApp message to the configured provider (Meta or Uazapi).
 */
export async function dispatchSendMessage(args: DispatchSendArgs): Promise<DispatchSendResult> {
  const {
    config,
    to,
    messageType,
    content_text,
    media_url,
    filename,
    template_name,
    template_language,
    template_params,
    templateRow,
    template_message_params,
    contextMessageId,
  } = args;

  if (config.provider_type === 'uazapi') {
    const baseUrl = config.uazapi_base_url || 'https://customix.uazapi.com';
    const token = config.uazapi_token;
    if (!token) {
      return { success: false, error: 'Uazapi token not configured' };
    }

    if (messageType === 'template') {
      let resolvedText = '';
      const params = template_message_params?.body || template_params || [];

      if (templateRow?.body_text) {
        resolvedText = interpolateTemplateBody(templateRow.body_text, params);
      } else {
        resolvedText = `Template: ${template_name} ${params.join(', ')}`;
      }

      const res = await sendUazapiTextMessage(baseUrl, token, to, resolvedText);
      return res;
    }

    if (messageType === 'text') {
      if (!content_text) {
        return { success: false, error: 'Content text is required' };
      }
      const res = await sendUazapiTextMessage(baseUrl, token, to, content_text);
      return res;
    }

    if (!media_url) {
      return { success: false, error: 'Media URL is required' };
    }

    const res = await sendUazapiMediaMessage(
      baseUrl,
      token,
      to,
      media_url,
      messageType,
      content_text,
      filename
    );
    return res;
  }

  // Fallback to Meta Cloud API (Official API)
  try {
    if (!config.phone_number_id || !config.access_token) {
      return { success: false, error: 'Meta configuration missing' };
    }
    const accessToken = decrypt(config.access_token);

    if (messageType === 'template') {
      const result = await metaSendTemplate({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to,
        templateName: template_name!,
        language: template_language || 'en_US',
        template: templateRow ?? undefined,
        messageParams: template_message_params ?? undefined,
        params: template_params || [],
        contextMessageId,
      });
      return { success: true, messageId: result.messageId };
    }

    const MEDIA_KINDS = ['image', 'video', 'document', 'audio'];
    const isMediaKind = MEDIA_KINDS.includes(messageType);

    if (isMediaKind) {
      const result = await metaSendMedia({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to,
        kind: messageType as MediaKind,
        link: media_url!,
        caption: content_text || undefined,
        filename: filename || undefined,
        contextMessageId,
      });
      return { success: true, messageId: result.messageId };
    }

    const result = await metaSendText({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to,
      text: content_text!,
      contextMessageId,
    });
    return { success: true, messageId: result.messageId };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Meta API send error',
    };
  }
}
