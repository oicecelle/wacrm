"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { describeHistoryImport } from "@/lib/whatsapp/history-import-ui";

const POLL_MS = 5000;

/**
 * Progress note for the first-pairing history import. Polls only while
 * the import is open (pending/importing) and stops once it's done, so an
 * old connection costs nothing.
 */
export function HistoryImportNote() {
  const { accountId } = useAuth();
  const [state, setState] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Whether THIS screen watched the import be open — set where the data
  // is read (not during render), so "done" is announced only to someone
  // who was actually waiting for it.
  const [sawOpen, setSawOpen] = useState(false);

  const open = state === "pending" || state === "importing";

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await createClient()
        .from("whatsapp_config")
        .select("history_import_state, history_import_started_at")
        .eq("account_id", accountId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { history_import_state: string | null; history_import_started_at: string | null } | null;
      const next = row?.history_import_state ?? null;
      if (next === "pending" || next === "importing") setSawOpen(true);
      setState(next);
      setStartedAt(row?.history_import_started_at ?? null);
      setNow(Date.now());
    };
    void load();
    // First read always runs; keep polling only while the import is open.
    const t = setInterval(() => {
      if (state === "pending" || state === "importing" || state === null) void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accountId, state]);

  const text = describeHistoryImport(state, startedAt, sawOpen, now);
  if (!text) return null;
  return (
    <p className="flex max-w-sm items-start gap-1.5 text-xs text-slate-500">
      {open && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />}
      {text}
    </p>
  );
}
