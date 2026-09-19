import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ProviderType = 'meta' | 'uazapi';

// Module-scoped, not React state: several independent components on the
// same page (template pickers, automation builders, inbox, the broadcast
// wizard) each used to fetch whatsapp_config.provider_type separately —
// same row, same account, refetched every time any of them mounted. This
// value changes only when someone saves WhatsApp settings, so caching it
// for the lifetime of the tab and sharing it across every caller cuts
// that down to one fetch per account per session instead of one per
// component per mount. Keyed by account_id so switching clinics doesn't
// serve a stale provider.
const cache = new Map<string, ProviderType>();
const inFlight = new Map<string, Promise<ProviderType>>();

async function fetchProviderType(accountId: string): Promise<ProviderType> {
  const supabase = createClient();
  const { data } = await supabase
    .from('whatsapp_config')
    .select('provider_type')
    .eq('account_id', accountId)
    .maybeSingle();
  const provider = (data?.provider_type as ProviderType | undefined) ?? 'uazapi';
  cache.set(accountId, provider);
  return provider;
}

/**
 * Returns the account's configured WhatsApp provider ('meta' | 'uazapi'),
 * cached across every component using this hook so the same row isn't
 * re-fetched on every mount. Defaults to 'uazapi' (this app's primary
 * path) while loading or if nothing is configured yet.
 *
 * Call `refresh()` after saving WhatsApp settings so already-mounted
 * consumers pick up the change instead of holding a stale cached value
 * for the rest of the session.
 */
export function useWhatsappProvider(accountId: string | null | undefined) {
  const [providerType, setProviderType] = useState<ProviderType>(
    accountId ? (cache.get(accountId) ?? 'uazapi') : 'uazapi',
  );
  const [loading, setLoading] = useState(!!accountId && !cache.has(accountId));

  useEffect(() => {
    if (!accountId) return;
    if (cache.has(accountId)) {
      // Cache already has this account (e.g. another component fetched
      // it first, or accountId just changed to one already resolved) —
      // sync it in without a network round trip.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProviderType(cache.get(accountId)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const existing = inFlight.get(accountId) ?? fetchProviderType(accountId);
    inFlight.set(accountId, existing);
    existing.then((provider) => {
      inFlight.delete(accountId);
      if (cancelled) return;
      setProviderType(provider);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return {
    providerType,
    loading,
    refresh: () => {
      if (accountId) cache.delete(accountId);
    },
  };
}
