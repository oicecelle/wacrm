import { supabaseAdmin } from '@/lib/automations/admin-client'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'
import { sendUazapiTextMessage, sendUazapiMediaMessage } from '@/lib/whatsapp/uazapi-api'

/**
 * A campaign fires once per calendar day: today's weekday is in
 * days_of_week, the current time has reached time_of_day (within a
 * tolerance window so a polling interval doesn't miss it), and
 * last_run_date isn't already today. Each matching contact (found
 * live via contact_tags or the agenda, not a saved list) gets the
 * configured message, then the "after" tag bookkeeping so the same
 * contact isn't re-sent tomorrow.
 *
 * Exported standalone so any cron entry point can call it — the
 * automations cron (already polled frequently for `wait`-step
 * resumption) calls this too, so one existing cron-job.org entry
 * covers both jobs instead of needing a second one registered.
 */
export async function runScheduledCampaigns() {
  const admin = supabaseAdmin()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const todayDow = now.getDay() // 0=Sun..6=Sat, matches days_of_week storage
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // How late after time_of_day a run is still considered "on time" —
  // covers the gap between cron polls plus any brief platform delay.
  const TOLERANCE_MINUTES = 30

  const results = {
    campaigns_checked: 0,
    campaigns_run: 0,
    contacts_messaged: 0,
    contacts_failed: 0,
  }

  const { data: campaigns, error: campaignsErr } = await admin
    .from('scheduled_campaigns')
    .select('*')
    .eq('is_active', true)

  if (campaignsErr) {
    console.error('[scheduled-campaigns] Error fetching campaigns:', campaignsErr.message)
    return { error: campaignsErr.message, ...results }
  }

  for (const campaign of campaigns ?? []) {
    results.campaigns_checked++

    if (campaign.last_run_date === todayStr) continue
    if (!campaign.days_of_week?.includes(todayDow)) continue

    const [h, m] = String(campaign.time_of_day).split(':').map(Number)
    const targetMinutes = h * 60 + m
    if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + TOLERANCE_MINUTES) continue

    // Claim the run immediately (before sending) so a slow campaign
    // running past the next cron tick can't get picked up twice.
    await admin
      .from('scheduled_campaigns')
      .update({ last_run_date: todayStr })
      .eq('id', campaign.id)

    results.campaigns_run++

    const stats = { sent: 0, failed: 0, skipped_no_phone: 0 }

    try {
      const { data: wsConfig } = await admin
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', campaign.account_id)
        .maybeSingle()

      if (!wsConfig) {
        console.error(`[scheduled-campaigns] No WhatsApp config for account ${campaign.account_id}`)
        await admin
          .from('scheduled_campaigns')
          .update({ last_run_stats: { error: 'WhatsApp não configurado', ...stats } })
          .eq('id', campaign.id)
        continue
      }

      let contactIds: string[] = []
      if (campaign.audience_type === 'appointments_relative') {
        // "Everyone with an appointment tomorrow" — computed fresh
        // every run from real scheduling data, not a tag anyone has
        // to remember to apply. Day boundaries in the clinic's own
        // local sense aren't tracked per-account here, so this uses
        // UTC calendar days; a clinic whose day genuinely spans a UTC
        // boundary at an inconvenient moment could see a same-day
        // shift, an acceptable tradeoff against real timezone data
        // this table doesn't store.
        const targetDate = new Date(now)
        targetDate.setUTCDate(targetDate.getUTCDate() + (campaign.appointment_day_offset ?? 1))
        const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()))
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

        const { data: appts } = await admin
          .from('appointments')
          .select('patient_id')
          .eq('clinic_id', campaign.account_id)
          .neq('status', 'cancelled')
          .gte('start_time', dayStart.toISOString())
          .lt('start_time', dayEnd.toISOString())
        contactIds = [...new Set((appts ?? []).map((a) => a.patient_id).filter(Boolean))]
      } else if (campaign.filter_tag_id) {
        const { data: tagged } = await admin
          .from('contact_tags')
          .select('contact_id')
          .eq('tag_id', campaign.filter_tag_id)
        contactIds = (tagged ?? []).map((t) => t.contact_id)
      }

      if (contactIds.length === 0) {
        await admin
          .from('scheduled_campaigns')
          .update({ last_run_stats: stats })
          .eq('id', campaign.id)
        continue
      }

      const { data: contacts } = await admin
        .from('contacts')
        .select('id, phone, name')
        .in('id', contactIds)
        .eq('account_id', campaign.account_id)

      const config = {
        provider_type: wsConfig.provider_type,
        phone_number_id: wsConfig.phone_number_id,
        access_token: wsConfig.access_token,
        uazapi_token: wsConfig.uazapi_token,
        uazapi_base_url: wsConfig.uazapi_base_url,
        uazapi_instance_name: wsConfig.uazapi_instance_name,
      }
      const actionConfig = (campaign.action_config ?? {}) as Record<string, unknown>

      for (const contact of contacts ?? []) {
        if (!contact.phone) {
          stats.skipped_no_phone++
          continue
        }

        try {
          let sendResult: { success: boolean; error?: string }

          if (campaign.action_type === 'send_template') {
            const templateName = actionConfig.template_name as string | undefined
            if (!templateName) throw new Error('Modelo não configurado')

            const { data: templateRow } = await admin
              .from('message_templates')
              .select('body_text, parts')
              .eq('account_id', campaign.account_id)
              .eq('name', templateName)
              .maybeSingle()
            if (!templateRow) throw new Error(`Modelo "${templateName}" não encontrado`)

            const parts = Array.isArray(templateRow.parts) ? templateRow.parts : []
            if (config.provider_type === 'uazapi' && parts.length > 0) {
              sendResult = { success: true }
              for (const part of parts) {
                const baseUrl = config.uazapi_base_url || 'https://customix.uazapi.com'
                const r =
                  part.type === 'text'
                    ? await sendUazapiTextMessage(baseUrl, config.uazapi_token!, contact.phone, part.text ?? '')
                    : part.media_url
                      ? await sendUazapiMediaMessage(baseUrl, config.uazapi_token!, contact.phone, part.media_url, part.type, undefined, part.filename)
                      : { success: true }
                if (!r.success) { sendResult = r; break }
              }
            } else if (config.provider_type === 'uazapi') {
              sendResult = await sendUazapiTextMessage(
                config.uazapi_base_url || 'https://customix.uazapi.com',
                config.uazapi_token!,
                contact.phone,
                templateRow.body_text,
              )
            } else {
              sendResult = await dispatchSendMessage({
                config,
                to: contact.phone,
                messageType: 'template',
                template_name: templateName,
              })
            }
          } else {
            sendResult = config.provider_type === 'uazapi'
              ? await sendUazapiMediaMessage(
                  config.uazapi_base_url || 'https://customix.uazapi.com',
                  config.uazapi_token!,
                  contact.phone,
                  actionConfig.media_url as string,
                  actionConfig.media_type as string,
                  actionConfig.caption as string | undefined,
                  actionConfig.filename as string | undefined,
                )
              : await dispatchSendMessage({
                  config,
                  to: contact.phone,
                  messageType: (actionConfig.media_type as 'image' | 'video' | 'document' | 'audio') ?? 'image',
                  media_url: actionConfig.media_url as string,
                  content_text: actionConfig.caption as string | undefined,
                })
          }

          if (!sendResult.success) throw new Error(sendResult.error || 'Falha no envio')

          // Tag bookkeeping — the whole point of "apply tag after" is
          // so this same contact drops out of tomorrow's run (assuming
          // the follow-up tag differs from the filter tag, or
          // remove_filter_tag is set).
          if (campaign.apply_tag_id) {
            await admin.from('contact_tags').upsert(
              { contact_id: contact.id, tag_id: campaign.apply_tag_id },
              { onConflict: 'contact_id,tag_id' },
            )
          }
          if (campaign.remove_filter_tag && campaign.filter_tag_id) {
            await admin
              .from('contact_tags')
              .delete()
              .eq('contact_id', contact.id)
              .eq('tag_id', campaign.filter_tag_id)
          }

          await admin.from('patient_timeline').insert({
            patient_id: contact.id,
            event_type: 'scheduled_campaign_sent',
            title: `Campanha agendada: ${campaign.name}`,
            payload: { campaign_id: campaign.id },
          })

          stats.sent++
          results.contacts_messaged++
        } catch (err) {
          console.error(`[scheduled-campaigns] Failed for contact ${contact.id}:`, err)
          stats.failed++
          results.contacts_failed++
        }
      }

      await admin
        .from('scheduled_campaigns')
        .update({ last_run_stats: stats })
        .eq('id', campaign.id)
    } catch (err) {
      console.error(`[scheduled-campaigns] Campaign ${campaign.id} failed:`, err)
      await admin
        .from('scheduled_campaigns')
        .update({ last_run_stats: { error: String(err), ...stats } })
        .eq('id', campaign.id)
    }
  }

  return results
}
