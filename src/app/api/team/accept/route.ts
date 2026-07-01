import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clinic_user_id, account_id } = body;

    if (!clinic_user_id || !account_id) {
      return NextResponse.json(
        { error: "clinic_user_id and account_id are required" },
        { status: 400 }
      );
    }

    // Get current authenticated user
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize admin client to bypass RLS for invite acceptance updates
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Fetch clinic user invitation record
    const { data: clinicUser, error: fetchError } = await supabaseAdmin
      .from("clinic_users")
      .select("*")
      .eq("id", clinic_user_id)
      .eq("clinic_id", account_id)
      .single();

    if (fetchError || !clinicUser) {
      return NextResponse.json(
        { error: "Convite não encontrado ou inválido." },
        { status: 404 }
      );
    }

    if (clinicUser.invite_status === "active" && clinicUser.user_id === user.id) {
      return NextResponse.json({ success: true, message: "Já aceito" });
    }

    // 2. Link clinic_user to auth user and set active status
    const { error: updateCuError } = await supabaseAdmin
      .from("clinic_users")
      .update({
        user_id: user.id,
        invite_status: "active",
        is_active: true,
      })
      .eq("id", clinic_user_id);

    if (updateCuError) {
      throw updateCuError;
    }

    // 3. Map role for profiles
    const roleMap: Record<string, "admin" | "agent" | "viewer"> = {
      admin: "admin",
      professional: "agent",
      receptionist: "agent",
      marketing: "agent",
      financial: "agent",
      traffic_manager: "agent",
      commercial: "agent",
    };
    const targetRole = roleMap[clinicUser.role] || "agent";

    // 4. Update the user profile with the new account_id (clinic_id) and role
    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({
        account_id,
        account_role: targetRole,
      })
      .eq("user_id", user.id);

    if (updateProfileError) {
      throw updateProfileError;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[/api/team/accept]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
