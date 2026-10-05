import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUazapiProfilePicture } from "@/lib/whatsapp/uazapi-api";

// GET /api/whatsapp/profile-picture?phone=5511999999999&account_id=...
//
// The capability (getUazapiProfilePicture) already existed in the
// Uazapi integration layer — it just wasn't wired into any UI yet.
// Called lazily from the client (the appointment/contact modal's
// avatar circle) rather than cached on the contact record, so a
// changed WhatsApp photo is always reflected next time the modal
// opens, at the cost of one extra request per open.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const accountId = searchParams.get("account_id");
    if (!phone || !accountId) {
      return NextResponse.json({ error: "phone e account_id são obrigatórios." }, { status: 400 });
    }

    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("provider_type, uazapi_base_url, uazapi_token")
      .eq("account_id", accountId)
      .maybeSingle();

    // Only Uazapi exposes this — a Meta-official connection has no
    // equivalent endpoint available to us, so this just quietly
    // returns "no picture" rather than erroring for those accounts.
    if (!config || config.provider_type !== "uazapi" || !config.uazapi_token) {
      return NextResponse.json({ url: null });
    }

    // `patients.phone` is usually stored the way a person typed it, with
    // no country code. WhatsApp looks numbers up by their full form, so
    // a bare 10/11-digit Brazilian number is sent as 55 + number.
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = `55${cleanPhone}`;
    const url = await getUazapiProfilePicture(
      config.uazapi_base_url || "https://customix.uazapi.com",
      config.uazapi_token,
      cleanPhone,
    );

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[whatsapp/profile-picture] error:", err);
    return NextResponse.json({ url: null });
  }
}
