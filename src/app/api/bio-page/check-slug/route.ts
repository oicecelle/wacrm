import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isReservedSlug } from '@/lib/bio-page/reserved-slugs'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 })
    }

    const { slug } = await request.json()
    const normalized = String(slug || '').toLowerCase().trim()

    if (normalized.length < 3) {
      return NextResponse.json({ available: false, reason: 'O slug precisa ter pelo menos 3 caracteres.' })
    }
    if (normalized.length > 60) {
      return NextResponse.json({ available: false, reason: 'O slug pode ter no máximo 60 caracteres.' })
    }
    if (!SLUG_RE.test(normalized)) {
      return NextResponse.json({
        available: false,
        reason: 'Use só letras minúsculas, números e hífen (ex: clinica-abc).',
      })
    }
    if (isReservedSlug(normalized)) {
      return NextResponse.json({ available: false, reason: 'Esse endereço é reservado pelo sistema.' })
    }

    // Checked against both clinics.slug (the portal-login link) and
    // bio_pages.slug (the bio-link page) — they're meant to share the
    // same value per account, but checking both keeps this route
    // correct even if they ever drift apart for some account.
    const [{ data: clinicMatch }, { data: bioMatch }] = await Promise.all([
      supabase.from('clinics').select('id').eq('slug', normalized).maybeSingle(),
      supabase.from('bio_pages').select('account_id').eq('slug', normalized).maybeSingle(),
    ])

    const takenByClinic = clinicMatch && clinicMatch.id !== accountId
    const takenByBioPage = bioMatch && bioMatch.account_id !== accountId

    if (takenByClinic || takenByBioPage) {
      return NextResponse.json({ available: false, reason: 'Esse endereço já está em uso por outra clínica.' })
    }

    return NextResponse.json({ available: true })
  } catch (err) {
    console.error('Error in bio-page/check-slug:', err)
    return NextResponse.json({ error: 'Falha ao verificar o slug.' }, { status: 500 })
  }
}
