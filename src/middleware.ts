import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getEnv } from '@/lib/env'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NTcsImV4cCI6MjA4OTQ2MTQ1N30.i-3m5p8w1NCNMtgP3TgoqbioauYWcQsY9imiNxD709o'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Supabase's auth endpoint has had an ongoing intermittent slowness
  // incident (401s from JWT rejections, degraded API Gateway — see
  // status.supabase.com) that isn't fully resolved by Supabase's own
  // side; some projects need a manual upgrade to pick up the fix.
  // Until then, and as a permanent safeguard regardless of Supabase's
  // health, this call must never be allowed to hang the whole
  // middleware — that's exactly what produces Vercel's uncontrollable
  // 504 MIDDLEWARE_INVOCATION_TIMEOUT screen, which we can't brand or
  // recover from. Racing it against a short timeout means a slow
  // auth check degrades to "treat as unknown session" instead of
  // freezing the request. Every page already re-checks auth
  // client-side via useAuth(), so letting a request through
  // unresolved here isn't a real security gap — worst case a
  // protected page's own client-side check redirects a beat later.
  let user = null
  let authCheckTimedOut = false
  try {
    const getUserPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 4000)
    )
    const result = await Promise.race([getUserPromise, timeoutPromise])
    if (result === 'timeout') {
      authCheckTimedOut = true
    } else {
      user = result.data.user
    }
  } catch {
    authCheckTimedOut = true
  }

  const host = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  // Configuração de Domínios
  const mainDomain = 'leadpluz.com'
  const appSubdomain = 'go.leadpluz.com'

  const isMainDomain = host === mainDomain || host === `www.${mainDomain}` || host === 'wacrm.app' || host === 'www.wacrm.app'
  const isAppSubdomain = host === appSubdomain || host === 'app.leadpluz.com' || host === 'go.wacrm.app'

  // 1. Subdomínio de App: Rota raiz "/" redireciona para a agenda ou login
  if (isAppSubdomain && (pathname === '/' || pathname === '/landing')) {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/agenda' : '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // 2. Domínio Principal: Acesso a rotas autenticadas ou fluxos internos redireciona para o subdomínio
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings', '/agenda', '/financeiro', '/documentos', '/equipe', '/servicos', '/relatorios', '/onboarding', '/selecionar-clinica', '/comunicacao']
  const isAuthRoute = pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password'
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path))

  if (isMainDomain && (isAuthRoute || isProtectedRoute)) {
    const url = request.nextUrl.clone()
    url.host = appSubdomain
    url.protocol = 'https:'
    return NextResponse.redirect(url)
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/agenda'
      url.search = ''
    }
    return NextResponse.redirect(url)
  }

  // Protected pages - redirect to login if not authenticated. Skipped
  // entirely when the auth check itself timed out — we genuinely
  // don't know this user's status then, and assuming "logged out"
  // would wrongly bounce a real, signed-in user during a Supabase
  // hiccup. The page's own client-side useAuth() check still applies.
  if (!authCheckTimedOut && !user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // API routes that need auth (not webhooks)
  // Note: 'webhook' (without leading slash) catches both /webhook and /uazapi-webhook
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('webhook')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
