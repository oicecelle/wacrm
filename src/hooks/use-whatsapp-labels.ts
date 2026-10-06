"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface WhatsappLabelOption {
  id: string; // WhatsApp's own label id
  name: string;
}

/** The account's WhatsApp labels (mirrored from the phone) for pickers. Empty until synced. */
export function useWhatsappLabels(): WhatsappLabelOption[] {
  const { accountId } = useAuth();
  const [labels, setLabels] = useState<WhatsappLabelOption[]>([]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("whatsapp_labels")
        .select("wa_label_id, name")
        .eq("account_id", accountId)
        .eq("deleted", false)
        .order("name");
      if (cancelled) return;
      setLabels(
        ((data ?? []) as Array<{ wa_label_id: string; name: string }>).map((l) => ({
          id: l.wa_label_id,
          name: l.name || `Etiqueta ${l.wa_label_id}`,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return labels;
}
