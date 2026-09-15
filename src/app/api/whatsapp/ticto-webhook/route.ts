import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { handleTictoEvent } from '@/lib/ticto/handler';

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    );
  }
  return _adminClient;
}

export async function GET() {
  return NextResponse.json({ status: 'active', service: 'ticto-webhook' }, { status: 200 });
}

export async function POST(request: Request) {
  const db = supabaseAdmin();
  let body: any;
  let headersObj: Record<string, string> = {};

  try {
    request.headers.forEach((val, key) => {
      headersObj[key] = val;
    });

    const { searchParams } = new URL(request.url);
    let clinicIdParam = searchParams.get('clinic_id') || searchParams.get('account_id');

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // 1. Validate payload token from multiple sources
    const bodyToken = body.token || body.api_key || body.ticto_token;
    const urlToken = searchParams.get('token') || searchParams.get('api_key');
    const headerToken = request.headers.get('X-Ticto-Token') || request.headers.get('Authorization')?.replace('Bearer ', '').trim();
    const token = (bodyToken || urlToken || headerToken || '').trim();

    const expectedToken = getEnv(
      'TICTO_WEBHOOK_TOKEN',
      'ybQmIZCZZOKrgsUGnVWDnhjanKYl0p0Zb6Pe1Keh8mF0xZBmIWLWCrgkd3vorvbemq9vyDPtJdu04l5O8IZTad8DGgUrVbnD7xQJ'
    );

    const isAuthorized = token === expectedToken;

    // 2. Resolve clinic_id if not supplied in query params
    let clinicId = clinicIdParam;
    if (isAuthorized) {
      if (!clinicId) {
        const ddi = body.customer?.phone?.ddi || '55';
        const ddd = body.customer?.phone?.ddd || '';
        const num = body.customer?.phone?.number || '';
        const fullPhone = `${ddi}${ddd}${num}`.replace(/\D/g, '');
        if (fullPhone) {
          const suffix = fullPhone.slice(-8);
          const { data: contacts } = await db
            .from('contacts')
            .select('account_id')
            .like('phone', `%${suffix}`)
            .limit(1);
          if (contacts && contacts.length > 0) {
            clinicId = contacts[0].account_id;
          }
        }
      }

      // Fallback: search for first clinic
      if (!clinicId) {
        const { data: cl } = await db.from('clinics').select('id').limit(1);
        if (cl && cl.length > 0) {
          clinicId = cl[0].id;
        }
      }
    }

    const orderHash = body.order?.hash || '';
    const status = body.status || '';

    // Insert initial log row (before executing logic, so we always audit everything)
    const { data: logRecord, error: logErr } = await db
      .from('ticto_webhook_logs')
      .insert({
        clinic_id: clinicId || null,
        event_status: status || 'unknown',
        order_hash: orderHash || null,
        transaction_hash: body.order?.transaction_hash || null,
        payload: body,
        received_at: new Date().toISOString(),
        error: isAuthorized ? null : 'Unauthorized access attempt. Token mismatch.'
      })
      .select('id')
      .single();

    if (!isAuthorized) {
      console.warn('[Ticto Webhook] Unauthorized access attempt. Token mismatch.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (logErr) {
      console.error('[Ticto Webhook] Error writing webhook log:', logErr);
      return NextResponse.json({ error: 'Database logging error' }, { status: 500 });
    }

    if (!clinicId) {
      console.warn('[Ticto Webhook] Could not resolve clinic_id.');
      await db.from('ticto_webhook_logs').update({ error: 'Could not resolve clinic_id' }).eq('id', logRecord.id);
      return NextResponse.json({ error: 'Clinic not found' }, { status: 400 });
    }

    // 3. Prevent duplicate executions (Idempotency)
    if (orderHash) {
      const { data: existingLog } = await db
        .from('ticto_webhook_logs')
        .select('id, processed_at')
        .eq('order_hash', orderHash)
        .eq('event_status', status)
        .not('processed_at', 'is', null)
        .neq('id', logRecord.id)
        .limit(1)
        .maybeSingle();

      if (existingLog) {
        console.log(`[Ticto Webhook] Event ${status} for order hash ${orderHash} already received. Ignoring.`);
        await db.from('ticto_webhook_logs').update({ error: 'Duplicate ignored' }).eq('id', logRecord.id);
        return NextResponse.json({ status: 'success', message: 'Event already processed' });
      }
    }

    // 5. Process event business logic
    try {
      await handleTictoEvent(db, body, clinicId);
      
      // Update log as successfully processed
      await db
        .from('ticto_webhook_logs')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', logRecord.id);

      return NextResponse.json({ status: 'success', message: 'Event processed' });
    } catch (procErr: any) {
      console.error('[Ticto Webhook] Event processing failed:', procErr);
      
      // Save error message to log
      await db
        .from('ticto_webhook_logs')
        .update({ error: procErr.message || String(procErr) })
        .eq('id', logRecord.id);

      return NextResponse.json({ error: 'Event processing error', details: procErr.message }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[Ticto Webhook] Webhook error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
