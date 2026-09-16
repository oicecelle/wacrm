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
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[clinics/create] SUPABASE_SERVICE_ROLE_KEY is not set')
      return NextResponse.json(
        { error: 'Configuração do servidor incompleta (SUPABASE_SERVICE_ROLE_KEY ausente). Contate o suporte.' },
        { status: 500 },
      )
    }

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
      console.error('[clinics/create] accounts insert failed:', accountError)
      return NextResponse.json(
        { error: `Falha ao criar a clínica (accounts): ${accountError?.message ?? 'erro desconhecido'}` },
        { status: 500 },
      )
    }

    // clinic_users.clinic_id is a leftover FK pointing at a separate,
    // older `clinics` table — not `accounts` — from before this app
    // moved to the accounts/profiles model. Nothing currently keeps
    // the two in sync for freshly-created accounts, so every new
    // clinic needs a matching `clinics` row purely to satisfy that FK.
    const slug = `${name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'clinica'}-${account.id.slice(0, 8)}`

    const { data: clinic, error: clinicError } = await admin
      .from('clinics')
      // Same id as the accounts row — the clinic switcher's "which
      // clinics can this user reach" query treats clinic_users.clinic_id
      // as an accounts.id when looking the clinic up (matching how
      // pre-existing, migrated data lines up the two tables), so this
      // has to be identical for the new clinic to show up there later.
      .insert({ id: account.id, name, slug })
      .select('id')
      .single()

    if (clinicError || !clinic) {
      console.error('[clinics/create] clinics insert failed:', clinicError)
      await admin.from('accounts').delete().eq('id', account.id)
      return NextResponse.json(
        { error: `Falha ao criar a clínica (clinics): ${clinicError?.message ?? 'erro desconhecido'}` },
        { status: 500 },
      )
    }

    const displayName = profile?.full_name || profile?.email || user.email || 'Proprietário'

    const { error: clinicUserError } = await admin.from('clinic_users').insert({
      clinic_id: clinic.id,
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
      console.error('[clinics/create] clinic_users insert failed:', clinicUserError)
      // Roll back both rows rather than leaving a clinic nobody
      // (including its own owner) can see in the switcher.
      await admin.from('clinics').delete().eq('id', clinic.id)
      await admin.from('accounts').delete().eq('id', account.id)
      return NextResponse.json(
        { error: `Falha ao criar a clínica (clinic_users): ${clinicUserError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, account_id: account.id })
  } catch (err) {
    console.error('Error creating clinic:', err)
    const message = err instanceof Error ? err.message : 'Falha ao criar a clínica.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
