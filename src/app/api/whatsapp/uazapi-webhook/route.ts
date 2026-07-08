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
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
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

    // 2. Handle connection status updates
    const dataObj = body.data || body || {}
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

    // 3. Process incoming messages
    const msg = dataObj.message || {}
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

    const messageId = msg.messageId || msg.key?.id || dataObj.key?.id || `uaz-in-${Date.now()}`
    const mediaType = msg.mediaType || msg.type || dataObj.messageType || 'text'
    
    // Determine content text and content type
    let contentText = (msg.text || msg.content || dataObj.message?.conversation || dataObj.message?.extendedTextMessage?.text || '').trim()
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
    const contactOutcome = await findOrCreateContact(
      accountId,
      configOwnerUserId,
      phone,
      pushName,
      config.uazapi_token,
      config.uazapi_base_url
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

    // Insert message record into Database (saving as 'agent' for messages sent by Marcelle/team, or 'customer' for incoming)
    const { error: msgError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: fromMe ? 'agent' : 'customer',
      sender_id: fromMe ? configOwnerUserId : null,
      content_type: contentType,
      content_text: contentText || null,
      media_url: msg.mediaUrl || msg.url || null,
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
  uazapiBaseUrl?: string | null
): Promise<ContactOutcome | null> {
  const db = supabaseAdmin()
  const existingContact = await findExistingContact(db, accountId, phone)

  if (existingContact) {
    const updateFields: any = {}
    if (name && name !== existingContact.name) {
      updateFields.name = name
    }

    // Fetch profile picture if not already present
    if (!existingContact.avatar_url && uazapiToken && uazapiBaseUrl) {
      try {
        const avatarUrl = await getUazapiProfilePicture(uazapiBaseUrl, uazapiToken, phone)
        if (avatarUrl) {
          updateFields.avatar_url = avatarUrl
          existingContact.avatar_url = avatarUrl
        }
      } catch (err) {
        console.error('[uazapi-webhook] Error fetching profile picture for existing contact:', err)
      }
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updated_at = new Date().toISOString()
      await db
        .from('contacts')
        .update(updateFields)
        .eq('id', existingContact.id)
    }
    return { contact: existingContact, wasCreated: false }
  }

  let avatarUrl: string | null = null
  if (uazapiToken && uazapiBaseUrl) {
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
      avatar_url: avatarUrl || null
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

  return { contact: newContact, wasCreated: true }
}

// Helper: Find or Create Conversation
async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  const db = supabaseAdmin()
  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (!findError && existing) {
    return existing
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
