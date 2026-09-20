import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchSendMessage,
  interpolateNamedTemplateBody,
  namedParamsToPositional,
} from '@/lib/whatsapp/sender-dispatcher'
import { sendUazapiTextMessage, sendUazapiMediaMessage } from '@/lib/whatsapp/uazapi-api'

/**
 * Sends one broadcast_recipients row right now and writes its result
 * back to the row (and bumps broadcasts.last_sent_at). Shared by the
 * cron worker's per-tick loop and the manual "enviar agora" actions
 * (both the whole-broadcast and single-recipient versions) — same
 * send path either way, just triggered at a different moment.
 */
export async function sendOneBroadcastRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  broadcast: { id: string; template_name: string; template_language: string | null },
  recipient: { id: string; params: Record<string, string>; phone: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateRow: any,
): Promise<{ success: boolean; error?: string }> {
  const phone = recipient.phone
  const namedParams =
    recipient.params && typeof recipient.params === 'object' ? recipient.params : {}

  if (!phone) {
    await admin
      .from('broadcast_recipients')
      .update({ status: 'failed', error_message: 'Contato sem número de telefone' })
      .eq('id', recipient.id)
    return { success: false, error: 'Contato sem número de telefone' }
  }

  if (config.provider_type === 'uazapi' && !config.uazapi_token) {
    await admin
      .from('broadcast_recipients')
      .update({ status: 'failed', error_message: 'Instância sem token da Uazapi configurado' })
      .eq('id', recipient.id)
    return { success: false, error: 'Instância sem token da Uazapi configurado' }
  }

  // Uazapi templates aren't Meta-approved, so there's no fixed
  // positional {{1}}/{{2}} contract to satisfy — send the body with
  // named placeholders filled in directly, skipping
  // dispatchSendMessage's Meta-shaped template path entirely.
  //
  // Multi-part templates (text/image/video/document/audio, each its
  // own message) send each part in its saved order — only the
  // built-in delay between broadcast recipients applies between
  // recipients, not between a single recipient's own parts, since
  // WhatsApp doesn't need pacing for a handful of messages to the
  // same number.
  const parts = Array.isArray(templateRow?.parts) ? templateRow.parts : []

  let result: { success: boolean; error?: string; messageId?: string }
  if (config.provider_type === 'uazapi' && parts.length > 0) {
    result = { success: true }
    for (const part of parts) {
      const partResult =
        part.type === 'text'
          ? await sendUazapiTextMessage(
              config.uazapi_base_url || 'https://customix.uazapi.com',
              config.uazapi_token,
              phone,
              interpolateNamedTemplateBody(part.text ?? '', namedParams),
            )
          : part.media_url
            ? await sendUazapiMediaMessage(
                config.uazapi_base_url || 'https://customix.uazapi.com',
                config.uazapi_token,
                phone,
                part.media_url,
                part.type,
                undefined,
                part.filename,
              )
            : { success: true } // empty media part — nothing to send, don't fail the whole sequence over it
      if (!partResult.success) {
        result = partResult
        break
      }
      result.messageId = partResult.messageId
    }
  } else {
    result =
      config.provider_type === 'uazapi'
        ? await sendUazapiTextMessage(
            config.uazapi_base_url || 'https://customix.uazapi.com',
            config.uazapi_token,
            phone,
            interpolateNamedTemplateBody(templateRow?.body_text ?? '', namedParams),
          )
        : await dispatchSendMessage({
            config,
            to: phone,
            messageType: 'template',
            template_name: broadcast.template_name,
            template_language: broadcast.template_language,
            template_params: namedParamsToPositional(namedParams),
            templateRow,
          })
  }

  if (result.success) {
    await admin
      .from('broadcast_recipients')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        whatsapp_message_id: result.messageId ?? null,
        error_message: null,
      })
      .eq('id', recipient.id)
  } else {
    await admin
      .from('broadcast_recipients')
      .update({ status: 'failed', error_message: result.error ?? 'Erro desconhecido' })
      .eq('id', recipient.id)
  }

  await admin
    .from('broadcasts')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', broadcast.id)

  return { success: result.success, error: result.success ? undefined : result.error }
}
