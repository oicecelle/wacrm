import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  dispatchSendMessage,
  interpolateNamedTemplateBody,
  namedParamsToPositional,
} from '@/lib/whatsapp/sender-dispatcher'
import { sendUazapiTextMessage, sendUazapiMediaMessage } from '@/lib/whatsapp/uazapi-api'
import { supabaseAdmin } from './admin-client'

interface SendTextArgs {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  text: string
}

interface SendTemplateArgs {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  templateName: string
  language?: string
  /** Name -> value, e.g. { nome: 'Maria', servico: 'Avaliação' } —
   *  same shape the broadcast flow uses. Converted to Meta's
   *  positional {{1}}/{{2}} order internally when the account's
   *  provider is 'meta'; sent as-is (named substitution) for
   *  'uazapi', which has no positional contract to satisfy. */
  variables?: Record<string, string>
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  return send({ ...args, kind: 'text' })
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  return send({ ...args, kind: 'template' })
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })

async function send(input: SendInput): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('account_id', input.accountId)
    .maybeSingle()
  if (contactErr || !contact?.phone) {
    throw new Error('contact not found for this account')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', input.accountId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const attempt = async (phone: string): Promise<string> => {
    const isTemplate = input.kind === 'template'

    // Uazapi templates skip Meta's review pipeline entirely, so there's
    // no positional {{1}}/{{2}} contract — fill the named placeholders
    // directly and send as plain text, same approach the broadcast
    // cron worker uses. Meta keeps going through dispatchSendMessage's
    // template path, which still expects positional params.
    if (isTemplate && config.provider_type === 'uazapi') {
      const tplArgs = input as SendTemplateArgs
      const { data: templateRow } = await db
        .from('message_templates')
        .select('body_text, parts')
        .eq('account_id', input.accountId)
        .eq('name', tplArgs.templateName)
        .eq('language', tplArgs.language || 'pt_BR')
        .maybeSingle()

      if (!templateRow) throw new Error(`template not found: ${tplArgs.templateName}`)
      if (!config.uazapi_token) throw new Error('Uazapi token not configured')

      const parts = Array.isArray(templateRow.parts) ? templateRow.parts : []
      const baseUrl = config.uazapi_base_url || 'https://customix.uazapi.com'

      if (parts.length > 0) {
        let lastMessageId = ''
        for (const part of parts) {
          const partResult =
            part.type === 'text'
              ? await sendUazapiTextMessage(
                  baseUrl,
                  config.uazapi_token,
                  phone,
                  interpolateNamedTemplateBody(part.text ?? '', tplArgs.variables ?? {}),
                )
              : part.media_url
                ? await sendUazapiMediaMessage(baseUrl, config.uazapi_token, phone, part.media_url, part.type, undefined, part.filename)
                : { success: true, messageId: lastMessageId }
          if (!partResult.success) throw new Error(partResult.error || 'Failed to dispatch message part')
          lastMessageId = partResult.messageId || lastMessageId
        }
        return lastMessageId
      }

      const text = interpolateNamedTemplateBody(templateRow.body_text, tplArgs.variables ?? {})
      const result = await sendUazapiTextMessage(baseUrl, config.uazapi_token, phone, text)
      if (!result.success) throw new Error(result.error || 'Failed to dispatch message')
      return result.messageId || ''
    }

    const result = await dispatchSendMessage({
      config: {
        provider_type: config.provider_type,
        phone_number_id: config.phone_number_id,
        access_token: config.access_token,
        uazapi_token: config.uazapi_token,
        uazapi_base_url: config.uazapi_base_url,
        uazapi_instance_name: config.uazapi_instance_name,
      },
      to: phone,
      messageType: isTemplate ? 'template' : 'text',
      content_text: isTemplate ? null : (input as SendTextArgs).text,
      template_name: isTemplate ? (input as SendTemplateArgs).templateName : null,
      template_language: isTemplate ? (input as SendTemplateArgs).language || 'pt_BR' : null,
      template_params: isTemplate ? namedParamsToPositional((input as SendTemplateArgs).variables ?? {}) : [],
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to dispatch message')
    }
    return result.messageId || ''
  }

  const variants = phoneVariants(sanitized)
  let workingPhone = sanitized
  let waMessageId = ''
  let lastError: unknown = null
  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (config.provider_type !== 'meta' || !isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  const content_type = input.kind === 'template' ? 'template' : 'text'
  const content_text = input.kind === 'text' ? (input as SendTextArgs).text : null
  const template_name = input.kind === 'template' ? (input as SendTemplateArgs).templateName : null

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    template_name,
    message_id: waMessageId,
    status: 'sent',
  })
  if (msgErr) {
    throw new Error(`sent but DB insert failed: ${msgErr.message}`)
  }

  await db
    .from('conversations')
    .update({
      last_message_text:
        input.kind === 'template' ? `[template:${(input as SendTemplateArgs).templateName}]` : (input as SendTextArgs).text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)

  return { whatsapp_message_id: waMessageId }
}
