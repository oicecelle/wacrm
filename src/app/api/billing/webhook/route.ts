import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
    );
  }
  return _adminClient;
}

/**
 * POST /api/billing/webhook
 *
 * Process incoming subscription billing webhooks from ASAAS, Stripe, or custom triggers
 * to upgrade clinic subscription state and extend expiration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Billing Webhook payload received:", body);

    const eventType = body.event || body.type;
    const payment = body.payment || body.data?.object;

    if (!eventType) {
      return NextResponse.json({ error: "Missing event type" }, { status: 400 });
    }

    const isSuccess =
      eventType === "PAYMENT_RECEIVED" ||
      eventType === "PAYMENT_CONFIRMED" ||
      eventType === "invoice.payment_succeeded" ||
      eventType === "checkout.session.completed";

    if (isSuccess && payment) {
      // Resolve clinic ID from payload metadata
      const clinicId = 
        payment.externalReference || 
        payment.customFields?.find((f: any) => f.name === "clinic_id")?.value ||
        payment.metadata?.clinic_id ||
        body.clinic_id;

      const planId = 
        payment.metadata?.plan_id || 
        body.plan_id || 
        "professional";

      if (!clinicId) {
        console.error("Clinic ID not identified in webhook metadata.");
        return NextResponse.json({ error: "Clinic ID not found in metadata" }, { status: 400 });
      }

      const db = supabaseAdmin();
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30); // 30 days subscription duration

      // 1. Update clinics status
      const { data: updatedClinic, error: clinicErr } = await db
        .from("clinics")
        .update({
          status: "active",
          plan: planId,
          plan_expires_at: newExpiry.toISOString()
        })
        .eq("id", clinicId)
        .select()
        .single();

      if (clinicErr) throw clinicErr;

      // 2. Update subscriptions table
      const { error: subErr } = await db
        .from("subscriptions")
        .upsert({
          clinic_id: clinicId,
          status: "active",
          plan_id: planId,
          expires_at: newExpiry.toISOString(),
          created_at: new Date().toISOString()
        }, { onConflict: "clinic_id" });

      if (subErr) throw subErr;

      console.log(`Billing Hook success: clinic ${clinicId} set to active [plan: ${planId}].`);

      return NextResponse.json({
        success: true,
        message: `Plan upgraded successfully to ${planId}`,
        clinic: updatedClinic
      });
    }

    return NextResponse.json({ success: true, message: "Webhook received but no action required." });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
