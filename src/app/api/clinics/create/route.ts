import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Lets an already-authenticated user spin up an additional, fully
 * isolated clinic account under their own login — for people like an
 * agency/secretary managing several independent clinics (each with
 * its own contacts, inbox, WhatsApp instance and broadcasts) without
 * needing a separate signup per clinic.
 *
 * Mirrors the account-creation shape used by remove_account_member()
 * in migration 018 (accounts row owned by the caller), plus a
 * clinic_users row so the new clinic shows up in the clinic switcher
 * — same insert shape already used by the team invite flow in
 * equipe/page.tsx, just pre-activated since the caller IS the user
 * (no email invite round-trip needed).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Informe um nome para a clínica.' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', user.id)
      .maybeSingle()

    // Service role: creating an account row and a clinic_users row for
    // a *different* account than the one currently in the caller's
    // JWT-derived RLS context isn't something the anon-key client can
    // do — accounts has no public INSERT policy by design (see
    // migration 017's comment), same as every other account-creation
    // path in this codebase (signup trigger, remove_account_member).
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: account, error: accountError } = await admin
      .from('accounts')
      .insert({ name, owner_user_id: user.id })
      .select('id')
      .single()

    if (accountError || !account) {
      throw accountError ?? new Error('Failed to create account')
    }

    const displayName = profile?.full_name || profile?.email || user.email || 'Proprietário'

    const { error: clinicUserError } = await admin.from('clinic_users').insert({
      clinic_id: account.id,
      user_id: user.id,
      name: displayName,
      role: 'admin',
      email: profile?.email || user.email || null,
      invite_status: 'active',
      is_active: true,
      permissions_json: {
        view_crm: true,
        edit_crm: true,
        view_agenda: true,
        edit_agenda: true,
        view_financeiro: true,
        edit_financeiro: true,
        view_documentos: true,
        generate_documentos: true,
        view_relatorios: true,
        configurar_marketing: true,
        gerenciar_equipe: true,
        acessar_configuracoes: true,
      },
      commission_model: 'percentage',
      commission_rate: 0,
      commission_fixed: 0,
    })

    if (clinicUserError) {
      // Roll back the orphaned account rather than leaving a clinic
      // nobody (including its own owner) can see in the switcher.
      await admin.from('accounts').delete().eq('id', account.id)
      throw clinicUserError
    }

    return NextResponse.json({ success: true, account_id: account.id })
  } catch (err) {
    console.error('Error creating clinic:', err)
    return NextResponse.json({ error: 'Falha ao criar a clínica.' }, { status: 500 })
  }
}
