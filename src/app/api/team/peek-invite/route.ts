import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account_id = searchParams.get("account_id");

    if (!account_id) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 });
    }

    // Connect using service role to bypass RLS for public peek
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select("name")
      .eq("id", account_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    return NextResponse.json({ clinic_name: data.name });
  } catch (err: unknown) {
    console.error("[/api/team/peek-invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
