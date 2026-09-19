import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { getEnv } from '@/lib/env'
import { analyseWhatsAppConversationWithAI } from '@/lib/ai/webhook-analyser'
import { getUazapiProfilePicture } from '@/lib/whatsapp/uazapi-api'

// Lazy-initialized admin client to avoid build-time issues
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    )
  }
  return _adminClient
}

export async function GET() {
  return NextResponse.json({ status: 'active', service: 'uazapi-webhook' }, { status: 200 })
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountIdParam = searchParams.get('account_id')

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    console.log('[uazapi-webhook] Received payload:', JSON.stringify(body).substring(0, 1000))

    const db = supabaseAdmin()

    // Diagnostic logging to inspect real incoming payload from UazAPI
    const { error: logErr } = await db
      .from('whatsapp_webhook_logs')
      .insert({
        payload: body,
        received_at: new Date().toISOString()
      })
    if (logErr) {
      console.error('[uazapi-webhook] Diagnostic logging failed:', logErr)
    }

    let config: any = null

    if (accountIdParam) {
      const { data, error } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountIdParam)
        .maybeSingle()
      if (error) {
        console.error('[uazapi-webhook] Error fetching config by account_id:', error)
      }
      config = data
    }

    // Fallback lookup via instanceName if account_id param was not set or config not found
    const instanceName = body.instanceName || body.instance || body.instancia
    if (!config && instanceName) {
      const { data, error } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('uazapi_instance_name', instanceName)
        .maybeSingle()
      if (error) {
        console.error('[uazapi-webhook] Error fetching config by instance name:', error)
      }
      config = data
    }

    if (!config) {
      console.warn('[uazapi-webhook] No whatsapp_config found matching the incoming request.')
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    // Validate if the message belongs to this config/instance
    const payloadToken = body.uazapiToken || body.token || body.apikey
    const payloadOwner = body.owner || (body.chat && body.chat.owner)
    
    // Normalize phone numbers for comparison
    const normalizedConfigPhone = config.phone_number_id ? config.phone_number_id.replace(/\D/g, '') : null
    const normalizedPayloadOwner = payloadOwner ? String(payloadOwner).replace(/\D/g, '') : null

    let isMatch = false
    if (payloadToken && config.uazapi_token && payloadToken === config.uazapi_token) {
      isMatch = true
    } else if (normalizedPayloadOwner && normalizedConfigPhone && normalizedPayloadOwner === normalizedConfigPhone) {
      isMatch = true
    }

    if (!isMatch && (payloadToken || normalizedPayloadOwner)) {
      console.log(`[uazapi-webhook] Ignored message from other instance. configToken=${config.uazapi_token} payloadToken=${payloadToken} configPhone=${normalizedConfigPhone} payloadOwner=${normalizedPayloadOwner}`)
      return NextResponse.json({ status: 'ignored', reason: 'instance mismatch' })
    }


    // 2. Handle connection status updates
    const dataObj = body.data || body || {}
    const msg = dataObj.message || {}
    const eventType = body.event || body.type
    const connectionState = body.connectionState || body.state || dataObj.connectionState || dataObj.state
    if (eventType === 'connection.update' || connectionState) {
      const isConnected =
        body.connected === true ||
        body.state === 'connected' ||
        body.status === 'connected' ||
        body.connectionState === 'connected' ||
        body.instance?.state === 'connected' ||
        dataObj.connected === true ||
        dataObj.state === 'connected' ||
        dataObj.status === 'connected' ||
        dataObj.connectionState === 'connected'

      await db
        .from('whatsapp_config')
        .update({
          status: isConnected ? 'connected' : 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id)

      console.log(`[uazapi-webhook] Updated config status to ${isConnected ? 'connected' : 'disconnected'}`)
      return NextResponse.json({ status: 'processed_connection_update' })
    }

    // 2.5. Handle delivery/read status updates for OUR OWN outbound
    // messages (broadcasts, mainly). Best-effort: this Uazapi
    // deployment's exact status-update payload shape hasn't been
    // observed yet in whatsapp_webhook_logs, so this checks broadly
    // for the field names/conventions Uazapi/Baileys-style servers
    // commonly use (ack codes 1-4, or string status/event names) and
    // no-ops harmlessly if none match — it will not misfire on a
    // normal inbound message, which never carries an ack/status field
    // together with fromMe: true.
    const ackRaw = body.ack ?? dataObj.ack ?? msg.ack ?? body.status ?? dataObj.status
    const updateFromMe = msg.fromMe ?? dataObj.key?.fromMe ?? body.fromMe ?? false
    const eventLooksLikeStatusUpdate =
      typeof eventType === 'string' && /messages?[._-]?update|message[._-]?ack|\back\b/i.test(eventType)

    if (ackRaw !== undefined && ackRaw !== null && (updateFromMe || eventLooksLikeStatusUpdate)) {
      const updateMessageId =
        dataObj.key?.id || dataObj.messageid || dataObj.messageId || dataObj.id ||
        body.messageid || body.messageId || body.id || msg.messageid || msg.messageId || msg.id

      const newStatus = mapAckToRecipientStatus(ackRaw)
      if (updateMessageId && newStatus) {
        await advanceBroadcastRecipientStatus(db, String(updateMessageId), newStatus)
        return NextResponse.json({ status: 'processed_status_update', mapped: newStatus })
      }
    }

    // 3. Process incoming messages
    const fromMe = msg.fromMe ?? dataObj.key?.fromMe ?? false
    const isGroup = msg.isGroup ?? dataObj.key?.remoteJid?.includes('@g.us') ?? false

    // We process both private chats and groups (as requested by user)

    // Resolve phone number
    const chatid = msg.chatid || dataObj.chat?.wa_chatid || dataObj.chat?.id || msg.key?.remoteJid || dataObj.key?.remoteJid || ''
    const phone = normalizePhone(chatid.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '').trim())
    if (!phone) {
      console.warn('[uazapi-webhook] Could not extract phone number from payload:', JSON.stringify(body))
      return NextResponse.json({ error: 'Phone number not found' }, { status: 400 })
    }

    let pushName = ''
    if (isGroup) {
      pushName = dataObj.chat?.name || dataObj.chat?.wa_name || `Grupo ${phone}`
    } else {
      pushName = dataObj.chat?.wa_name || dataObj.chat?.name || body.sender?.name || dataObj.pushName || ''
    }

    const messageId = msg.messageid || msg.messageId || msg.id || msg.key?.id || dataObj.key?.id || dataObj.messageid || dataObj.messageId || dataObj.id || `uaz-in-${Date.now()}`
    let mediaType = msg.mediaType || msg.type || dataObj.messageType || 'text'
    const msgTypeStr = String(msg.messageType || msg.type || dataObj.messageType || '').toLowerCase()
    if (msgTypeStr.includes('audio') || msgTypeStr.includes('ptt')) {
      mediaType = 'audio'
    } else if (msgTypeStr.includes('image')) {
      mediaType = 'image'
    } else if (msgTypeStr.includes('video')) {
      mediaType = 'video'
    } else if (msgTypeStr.includes('document')) {
      mediaType = 'document'
    }
    
    let rawTextContent = ''
    if (typeof msg.text === 'string') {
      rawTextContent = msg.text
    } else if (typeof msg.content === 'string') {
      rawTextContent = msg.content
    } else if (msg.content && typeof msg.content === 'object' && typeof msg.content.text === 'string') {
      rawTextContent = msg.content.text
    } else if (dataObj.message && typeof dataObj.message.conversation === 'string') {
      rawTextContent = dataObj.message.conversation
    } else if (dataObj.message?.extendedTextMessage && typeof dataObj.message.extendedTextMessage.text === 'string') {
      rawTextContent = dataObj.message.extendedTextMessage.text
    }

    let contentText = rawTextContent.trim()
    if (isGroup && !fromMe) {
      const senderName = body.sender?.name || dataObj.sender?.name || dataObj.pushName || 'Membro'
      contentText = `[${senderName}]: ${contentText}`
    }
    let contentType = 'text'

    if (mediaType === 'image') {
      contentType = 'image'
      contentText = contentText || '[Imagem]'
    } else if (mediaType === 'audio') {
      contentType = 'audio'
      contentText = contentText || '[Áudio]'
    } else if (mediaType === 'video') {
      contentType = 'video'
      contentText = contentText || '[Vídeo]'
    } else if (mediaType === 'document' || mediaType === 'documentMessage') {
      contentType = 'document'
      contentText = contentText || '[Documento]'
    }

    const accountId = config.account_id
    const configOwnerUserId = config.user_id

    // Resolve or create contact
    const payloadAvatarUrl = body.chat?.imagePreview || body.chat?.image || null
    const contactOutcome = await findOrCreateContact(
      accountId,
      configOwnerUserId,
      phone,
      pushName,
      config.uazapi_token,
      config.uazapi_base_url,
      payloadAvatarUrl,
      isGroup
    )
    if (!contactOutcome) {
      return NextResponse.json({ error: 'Failed to find/create contact' }, { status: 500 })
    }
    const contactRecord = contactOutcome.contact

    // Evaluate campaign source rules if message text matches keywords
    if (contentText && Array.isArray(config.source_rules)) {
      const matchedRule = (config.source_rules as any[]).find((rule) => {
        if (!rule.keyword || !rule.source) return false;
        return contentText.toLowerCase().includes(rule.keyword.toLowerCase());
      });
      if (matchedRule) {
        await db
          .from('contacts')
          .update({ source: matchedRule.source, updated_at: new Date().toISOString() })
          .eq('id', contactRecord.id)
        contactRecord.source = matchedRule.source
      }
    }

    // Resolve or create conversation
    const conversation = await findOrCreateConversation(
      accountId,
      configOwnerUserId,
      contactRecord.id
    )
    if (!conversation) {
      return NextResponse.json({ error: 'Failed to find/create conversation' }, { status: 500 })
    }

    // Deduplicate: check if a message with the same messageId already exists
    const { data: existingMsg } = await db
      .from('messages')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle()

    if (existingMsg) {
      console.log(`[uazapi-webhook] Message with ID ${messageId} already exists in DB. Skipping duplicate insert.`)
      return NextResponse.json({ status: 'ignored', reason: 'duplicate_message' })
    }

    // Handle reactions if it's a reaction message
    if (mediaType === 'reaction' || msg.messageType === 'ReactionMessage') {
      const emoji = msg.reaction?.emoji || msg.emoji || ''
      const targetMessageId = msg.reaction?.messageId || msg.reaction?.key?.id || ''
      if (targetMessageId) {
        await handleReaction(db, targetMessageId, emoji, conversation.id, contactRecord.id)
      }
      return NextResponse.json({ status: 'processed_reaction' })
    }

    // Check if this is the first customer inbound message
    const { count: priorCustomerMsgCount } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'customer')
    const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

    // Download and upload media to Supabase storage if it is a media message
    let mediaUrl: string | null = null
    const MEDIA_KINDS = ['image', 'video', 'document', 'audio']
    if (MEDIA_KINDS.includes(mediaType) && config.uazapi_token) {
      try {
        const uazBase = config.uazapi_base_url || 'https://customix.uazapi.com'
        const res = await fetch(`${uazBase}/downloadMediaMessage`, {
          method: 'POST',
          headers: {
            'token': config.uazapi_token,
            'apikey': config.uazapi_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: messageId })
        })
        
        if (res.ok) {
          const buffer = await res.arrayBuffer()
          const arrayBuffer = new Uint8Array(buffer)
          
          // Determine extension from mimetype
          const mimeType = msg.content?.mimetype || msg.mimetype || 'application/octet-stream'
          let ext = 'bin'
          if (mimeType.includes('ogg')) ext = 'ogg'
          else if (mimeType.includes('aac')) ext = 'aac'
          else if (mimeType.includes('mp4')) ext = 'mp4'
          else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
          else if (mimeType.includes('png')) ext = 'png'
          else if (mimeType.includes('pdf')) ext = 'pdf'
          else {
            const parts = mimeType.split('/')
            if (parts[1]) ext = parts[1].split(';')[0]
          }
          
          const path = `account-${accountId}/${Date.now()}-${messageId}.${ext}`
          const { error: uploadErr } = await db.storage.from('chat-media').upload(path, arrayBuffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true
          })
          
          if (!uploadErr) {
            const { data: urlData } = db.storage.from('chat-media').getPublicUrl(path)
            mediaUrl = urlData?.publicUrl || null
            console.log(`[uazapi-webhook] Successfully downloaded and stored incoming media. publicUrl=${mediaUrl}`)
          } else {
            console.error('[uazapi-webhook] Failed to upload downloaded media to storage:', uploadErr.message)
          }
        } else {
          console.warn(`[uazapi-webhook] UazAPI downloadMediaMessage returned status ${res.status} for msg ${messageId}`)
        }
      } catch (err: any) {
        console.error('[uazapi-webhook] Error downloading/uploading media:', err.message)
      }
    }

    // Insert message record into Database (saving as 'agent' for messages sent by Marcelle/team, or 'customer' for incoming)
    const { error: msgError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: fromMe ? 'agent' : 'customer',
      sender_id: fromMe ? configOwnerUserId : null,
      content_type: contentType,
      content_text: contentText || null,
      media_url: mediaUrl || msg.mediaUrl || msg.url || null,
      message_id: messageId,
      status: 'delivered',
      created_at: new Date().toISOString(),
    })

    if (msgError) {
      console.error('[uazapi-webhook] Error inserting message:', msgError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // Update conversation list preview. For sent messages, reset unread count to 0.
    const { error: convError } = await db
      .from('conversations')
      .update({
        last_message_text: contentText || `[${contentType}]`,
        last_message_at: new Date().toISOString(),
        unread_count: fromMe ? 0 : (conversation.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)

    if (convError) {
      console.error('[uazapi-webhook] Error updating conversation:', convError)
    }

    // Only run flows, automations, and AI analysis for customer inbound private messages (ignore if fromMe === true or it is a group message)
    if (!fromMe && !isGroup) {
      // Flip broadcast status to replied if appropriate
      await flagBroadcastReplyIfAny(accountId, contactRecord.id)

      if (isFirstInboundMessage) {
        // "Primeira conversa" on the contact's timeline — nothing
        // wrote this event before, so a brand-new lead's timeline
        // started blank until something else (an appointment, a
        // deal stage change, etc.) happened to it.
        await db.from('contact_timeline').insert({
          account_id: accountId,
          contact_id: contactRecord.id,
          event_type: 'message',
          title: 'Primeira conversa',
          description: contentText ? `"${contentText}"` : 'Primeiro contato via WhatsApp.',
          metadata: { conversation_id: conversation.id },
        })
      }

      // Dispatch to Flow Runner
      const flowResult = await dispatchInboundToFlows({
        accountId,
        userId: configOwnerUserId,
        contactId: contactRecord.id,
        conversationId: conversation.id,
        message: {
          kind: 'text',
          text: contentText,
          meta_message_id: messageId,
        },
        isFirstInboundMessage,
      })
      const flowConsumed = flowResult.consumed

      // Dispatch to Automation Engine
      const automationTriggers: ('new_contact_created' | 'first_inbound_message' | 'new_message_received' | 'keyword_match')[] = []
      if (!flowConsumed) {
        automationTriggers.push('new_message_received', 'keyword_match')
      }
      if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
      if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')

      for (const triggerType of automationTriggers) {
        runAutomationsForTrigger({
          accountId,
          triggerType,
          contactId: contactRecord.id,
          context: {
            message_text: contentText,
            conversation_id: conversation.id,
            message_direction: 'lead',
          },
        }).catch((err) => console.error('[uazapi-webhook] Automations dispatch failed:', err))
      }

      // Trigger contextual AI Analysis asynchronously
      analyseWhatsAppConversationWithAI(
        conversation.id,
        contactRecord.id,
        accountId,
        messageId
      ).catch((err) => console.error('[uazapi-webhook] AI Analysis trigger failed:', err))
    } else if (fromMe && !isGroup) {
      // The clinic's own outbound messages never used to trigger
      // anything — keyword_match automations configured with
      // from: 'us' (e.g. "we just confirmed an appointment") need
      // this side covered too, since the confirming text is
      // something the CLINIC typed, not the patient. Flows and AI
      // analysis stay customer-only; they're about reacting to what
      // the patient says, not what we say.
      runAutomationsForTrigger({
        accountId,
        triggerType: 'keyword_match',
        contactId: contactRecord.id,
        context: {
          message_text: contentText,
          conversation_id: conversation.id,
          message_direction: 'us',
        },
      }).catch((err) => console.error('[uazapi-webhook] Automations dispatch (outbound) failed:', err))
    }

    return NextResponse.json({ status: 'success', messageId })
  } catch (error: any) {
    console.error('[uazapi-webhook] Error processing webhook:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error?.message || String(error),
      stack: error?.stack || null
    }, { status: 500 })
  }
}

// Helper: Find or Create Contact
interface ContactOutcome {
  contact: any
  wasCreated: boolean
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string,
  uazapiToken?: string | null,
  uazapiBaseUrl?: string | null,
  avatarUrlFromPayload?: string | null,
  isGroup?: boolean
): Promise<ContactOutcome | null> {
  const db = supabaseAdmin()
  const existingContact = await findExistingContact(db, accountId, phone)

  if (existingContact) {
    const updateFields: any = {}
    if (name && name !== existingContact.name) {
      updateFields.name = name
    }
    if (isGroup && !existingContact.is_group) {
      updateFields.is_group = true
    }

    // Fetch profile picture if not already present
    let avatarUrl = avatarUrlFromPayload || null
    if (!avatarUrl && !existingContact.avatar_url && uazapiToken && uazapiBaseUrl) {
      try {
        avatarUrl = await getUazapiProfilePicture(uazapiBaseUrl, uazapiToken, phone)
      } catch (err) {
        console.error('[uazapi-webhook] Error fetching profile picture for existing contact:', err)
      }
    }

    if (avatarUrl && existingContact.avatar_url !== avatarUrl) {
      updateFields.avatar_url = avatarUrl
      existingContact.avatar_url = avatarUrl
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updated_at = new Date().toISOString()
      await db
        .from('contacts')
        .update(updateFields)
        .eq('id', existingContact.id)
    }

    // Ensure patient exists in patients table and push name is saved
    try {
      const { data: existingPatient } = await db
        .from('patients')
        .select('id')
        .eq('clinic_id', accountId)
        .eq('phone', phone)
        .maybeSingle()

      if (!existingPatient) {
        await db
          .from('patients')
          .insert({
            id: existingContact.id,
            clinic_id: accountId,
            name: existingContact.name || name || phone,
            phone: phone,
            lead_score: 50,
            tags: ['lead-whatsapp'],
            stage: 'novo'
          })
      }

      if (name) {
        await db
          .from('contact_whatsapp_names')
          .upsert({
            contact_id: existingContact.id,
            whatsapp_name: name
          }, { onConflict: 'contact_id' })
      }
    } catch (err) {
      console.error('[uazapi-webhook] Error syncing patient/pushName for existing contact:', err)
    }

    return { contact: existingContact, wasCreated: false }
  }

  let avatarUrl = avatarUrlFromPayload || null
  if (!avatarUrl && uazapiToken && uazapiBaseUrl) {
    try {
      avatarUrl = await getUazapiProfilePicture(uazapiBaseUrl, uazapiToken, phone)
    } catch (err) {
      console.error('[uazapi-webhook] Error fetching profile picture for new contact:', err)
    }
  }

  const { data: newContact, error: createError } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
      avatar_url: avatarUrl || null,
      is_group: isGroup || false
    })
    .select()
    .single()

  if (createError) {
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(db, accountId, phone)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('[uazapi-webhook] Error creating contact:', createError)
    return null
  }

  // Ensure patient exists in patients table and push name is saved for new contact
  try {
    await db
      .from('patients')
      .insert({
        id: newContact.id,
        clinic_id: accountId,
        name: newContact.name || name || phone,
        phone: phone,
        lead_score: 50,
        tags: ['lead-whatsapp'],
        stage: 'novo'
      })

    if (name) {
      await db
        .from('contact_whatsapp_names')
        .upsert({
          contact_id: newContact.id,
          whatsapp_name: name
        }, { onConflict: 'contact_id' })
    }
  } catch (err) {
    console.error('[uazapi-webhook] Error syncing patient/pushName for new contact:', err)
  }

  return { contact: newContact, wasCreated: true }
}

// Helper: Find or Create Conversation
async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  const db = supabaseAdmin()
  const { data: existingList, error: findError } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })

  if (!findError && existingList && existingList.length > 0) {
    return existingList[0]
  }

  const { data: newConv, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    if (createError.code === '23505') {
      const { data: retryList } = await db
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
      if (retryList && retryList.length > 0) {
        return retryList[0]
      }
    }
    console.error('[uazapi-webhook] Error creating conversation:', createError)
    return null
  }

  return newConv
}

// Helper: Handle message reaction
async function handleReaction(
  db: any,
  targetMessageId: string,
  emoji: string,
  conversationId: string,
  contactId: string
) {
  const { data: targetMessage, error } = await db
    .from('messages')
    .select('id')
    .eq('message_id', targetMessageId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (error || !targetMessage) {
    console.warn('[uazapi-webhook] Reaction target message not found:', targetMessageId)
    return
  }

  if (!emoji) {
    await db
      .from('message_reactions')
      .delete()
      .eq('message_id', targetMessage.id)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId)
    return
  }

  await db
    .from('message_reactions')
    .upsert({
      message_id: targetMessage.id,
      conversation_id: conversationId,
      actor_type: 'customer',
      actor_id: contactId,
      emoji: emoji,
    }, { onConflict: 'message_id,actor_type,actor_id' })
}

// Maps a Uazapi/Baileys-style ack/status value to our recipient
// status ladder (pending < sent < delivered < read). Covers the
// common numeric ack codes (WhatsApp Web multi-device: 1=sent to
// server, 2=delivered to device, 3=read) and the string variants
// several Uazapi forks report instead.
function mapAckToRecipientStatus(ack: unknown): 'sent' | 'delivered' | 'read' | null {
  if (typeof ack === 'number') {
    if (ack >= 3) return 'read'
    if (ack === 2) return 'delivered'
    if (ack === 1) return 'sent'
    return null
  }
  const s = String(ack).toLowerCase()
  if (s.includes('read')) return 'read'
  if (s.includes('deliver')) return 'delivered'
  if (s.includes('sent') || s.includes('server')) return 'sent'
  return null
}

const RECIPIENT_STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  replied: 4,
  failed: 0,
}

// Advances a broadcast_recipients row to `newStatus`, but only
// forward along the ladder — an out-of-order 'delivered' arriving
// after 'read' (which happens; webhooks aren't guaranteed ordered)
// must not regress the row. Matched by whatsapp_message_id, which the
// cron worker (api/cron/broadcasts) stores from the Uazapi send
// response at send time.
async function advanceBroadcastRecipientStatus(
  db: any,
  whatsappMessageId: string,
  newStatus: 'sent' | 'delivered' | 'read',
) {
  try {
    const { data: recipient, error } = await db
      .from('broadcast_recipients')
      .select('id, status')
      .eq('whatsapp_message_id', whatsappMessageId)
      .maybeSingle()

    if (error || !recipient) return // not a broadcast message — nothing to do

    const currentRank = RECIPIENT_STATUS_RANK[recipient.status] ?? 0
    const newRank = RECIPIENT_STATUS_RANK[newStatus]
    if (newRank <= currentRank) return

    const patch: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'delivered') patch.delivered_at = new Date().toISOString()
    if (newStatus === 'read') patch.read_at = new Date().toISOString()

    await db.from('broadcast_recipients').update(patch).eq('id', recipient.id)
  } catch (err) {
    console.error('[uazapi-webhook] advanceBroadcastRecipientStatus failed:', err)
  }
}

// Helper: Update broadcast statistics when customer replies
async function flagBroadcastReplyIfAny(accountId: string, contactId: string) {
  try {
    const db = supabaseAdmin()
    const { data: recs, error } = await db
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    await db
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)
  } catch (err) {
    console.error('[uazapi-webhook] flagBroadcastReplyIfAny failed:', err)
  }
}
