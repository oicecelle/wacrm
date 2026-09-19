/**
 * Every real top-level route in the app, so a clinic's public bio-link
 * slug (leadpluz.com/{slug}) can never collide with one and get
 * shadowed by it. Next.js always resolves an exact static folder
 * (e.g. /agenda) before falling through to a dynamic catch-all like
 * /[slug] — a colliding slug would simply be unreachable, silently.
 *
 * Keep this in sync with the top-level folders under src/app (both
 * directly and inside the (auth) / (dashboard) route groups, which
 * don't add a path segment of their own but do claim the ones
 * beneath them).
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'join',
  'landing',
  'onboarding',
  'portal',
  'selecionar-clinica',
  'agenda',
  'automations',
  'broadcasts',
  'comunicacao',
  'contacts',
  'dashboard',
  'documentos',
  'equipe',
  'financeiro',
  'flows',
  'inbox',
  'pipelines',
  'relatorios',
  'servicos',
  'settings',
  'forgot-password',
  'login',
  'signup',
  // Common squatting/confusion targets worth blocking pre-emptively
  // even though nothing under these names exists yet.
  'app',
  'www',
  'favicon.ico',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase().trim())
}
