"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { waLabelColor } from "@/lib/whatsapp/label-colors";
import { buildContactTagMap, type ContactTagInfo, type TagChip } from "@/lib/inbox/contact-tag-map";

interface State {
  crmTags: TagChip[];
  crmPairs: Array<{ contact_id: string; tag_id: string }>;
  waLabels: TagChip[];
  waPairs: Array<{ contact_id: string; wa_label_id: string }>;
  loading: boolean;
}

const EMPTY: State = { crmTags: [], crmPairs: [], waLabels: [], waPairs: [], loading: true };

/**
 * Everything the inbox needs to show and filter by tag: CRM tags and
 * WhatsApp labels, kept apart. The pairs are loaded for the whole
 * account (paginated — a plain select is cut at 1,000 rows) so the
 * filter is exact rather than limited to what happens to be on screen.
 *
 * `resyncToken` is bumped by the inbox when the tab regains focus or
 * realtime reconnects, so labels changed in the phone meanwhile show up.
 */
export function useContactTags(accountId: string | null | undefined, resyncToken = 0) {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const [crmTagRows, waLabelRows, crmPairRows, waPairRows] = await Promise.all([
          fetchAllRows<{ id: string; name: string; color: string }>((from, to) =>
            supabase.from("tags").select("id, name, color").eq("account_id", accountId).order("id").range(from, to) as never,
          ),
          fetchAllRows<{ wa_label_id: string; name: string; color: number | null }>((from, to) =>
            supabase
              .from("whatsapp_labels")
              .select("wa_label_id, name, color")
              .eq("account_id", accountId)
              .eq("deleted", false)
              .order("wa_label_id")
              .range(from, to) as never,
          ),
          fetchAllRows<{ id: string; contact_id: string; tag_id: string }>((from, to) =>
            supabase
              .from("contact_tags")
              .select("id, contact_id, tag_id, tags!inner(account_id)")
              .eq("tags.account_id", accountId)
              .order("id")
              .range(from, to) as never,
          ),
          fetchAllRows<{ contact_id: string; wa_label_id: string }>((from, to) =>
            supabase
              .from("contact_whatsapp_labels")
              .select("contact_id, wa_label_id")
              .eq("account_id", accountId)
              .order("contact_id")
              .order("wa_label_id")
              .range(from, to) as never,
          ),
        ]);
        if (cancelled) return;
        setState({
          crmTags: crmTagRows.map((t) => ({ kind: "crm", id: t.id, name: t.name, color: t.color || "#64748b" })),
          crmPairs: crmPairRows.map((p) => ({ contact_id: p.contact_id, tag_id: p.tag_id })),
          waLabels: waLabelRows.map((l) => ({
            kind: "wa",
            id: l.wa_label_id,
            name: l.name || `Etiqueta ${l.wa_label_id}`,
            color: waLabelColor(l.color),
          })),
          waPairs: waPairRows,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        // Tags are decoration on top of the inbox: failing to load them
        // must never take the conversation list down with it.
        console.error("Failed to load contact tags:", err instanceof Error ? err.message : err);
        setState((s) => ({ ...s, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, resyncToken]);

  const byContact = useMemo<Map<string, ContactTagInfo>>(() => buildContactTagMap(state), [state]);
  return { byContact, crmTags: state.crmTags, waLabels: state.waLabels, loading: state.loading };
}
