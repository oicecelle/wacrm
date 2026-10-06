/**
 * Whether the middleware should answer 401 itself for an API request.
 *
 * Applies to `/api/whatsapp/*` except the webhooks (those authenticate
 * with their own tokens and are called by outside servers, never by a
 * logged-in browser).
 *
 * The important case is `authCheckTimedOut`. The middleware races
 * `supabase.auth.getUser()` against a 4-second timer so a slow Supabase
 * can't hang every request; when the timer wins, `user` is simply
 * unknown (null) — NOT "logged out". The page-redirect rule already
 * treats that correctly. The API rule did not, so during a Supabase
 * slowdown every signed-in user got `401 Unauthorized` from
 * /api/whatsapp/* (label sync, send, config…) with a perfectly valid
 * session. Letting an unknown session through is safe here because
 * every non-webhook route under /api/whatsapp authenticates the caller
 * itself (audited) and answers its own 401.
 */
export function shouldBlockUnauthenticatedApi(input: {
  pathname: string;
  hasUser: boolean;
  authCheckTimedOut: boolean;
}): boolean {
  const { pathname, hasUser, authCheckTimedOut } = input;
  if (hasUser || authCheckTimedOut) return false;
  return pathname.startsWith("/api/whatsapp/") && !pathname.includes("webhook");
}
