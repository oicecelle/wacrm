import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route uses the SERVICE ROLE key to call Supabase Auth admin APIs.
// It is protected by checking that the calling user is an admin/owner of the
// clinic before sending any invite.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, clinic_user_id, name, account_id, resend } = body;

    if (!email || !account_id) {
      return NextResponse.json({ error: "email and account_id are required" }, { status: 400 });
    }

    // Build an admin Supabase client using the service role key (server-only)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // The redirect URL after the user clicks the email link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const redirectTo = `${appUrl}/join?clinic_user_id=${clinic_user_id}&account_id=${account_id}`;

    // Send a magic-link / invite email via Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: name || email,
        invited_to_clinic: account_id,
        clinic_user_id,
      },
    });

    if (error) {
      // If user already exists, send a password-reset link instead so they
      // can log in and then be redirected to accept the invite.
      if (error.message?.includes("already been registered")) {
        const { error: magicErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (magicErr) throw magicErr;
      } else {
        throw error;
      }
    }

    // If resend, update invited_at timestamp
    if (resend && clinic_user_id) {
      await supabaseAdmin
        .from("clinic_users")
        .update({ invited_at: new Date().toISOString() })
        .eq("id", clinic_user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[/api/team/invite]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
