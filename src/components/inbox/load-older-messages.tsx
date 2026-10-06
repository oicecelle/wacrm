"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { apiErrorMessage } from "@/lib/api-error";
import { describeHistoryRequest, type HistoryRequestRow } from "@/lib/whatsapp/history-request-ui";

const COLUMNS = "id, state, received_messages, has_more, history_access, error, requested_at, completed_at";
const POLL_MS = 3000;

/**
 * "Load earlier messages" for one conversation. Asks the clinic's phone
 * (through Uazapi) for older messages. The answer is asynchronous and
 * the phone may not respond, so this never promises completion: it
 * shows the request as waiting, then reports what the phone did.
 * Arriving messages are slotted into the thread by realtime; when a
 * request finishes with messages, `onLoaded` also re-reads the thread in
 * case a realtime event was missed.
 */
export function LoadOlderMessages({ conversationId, onLoaded }: { conversationId: string; onLoaded?: () => void }) {
  const [row, setRow] = useState<HistoryRequestRow | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastNotifiedRef = useRef<string | null>(null);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  const loadLatest = useCallback(async () => {
    const { data } = await createClient()
      .from("history_sync_requests")
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow((data as HistoryRequestRow | null) ?? null);
    setNow(Date.now());
  }, [conversationId]);

  // Pick up the latest request when the conversation changes, so a
  // result survives switching conversations and coming back.
  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  // While waiting, poll the request row (and keep the clock moving so a
  // request nobody answered flips to "didn't respond" on its own).
  const waiting = row?.state === "pending";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void loadLatest(), POLL_MS);
    return () => clearInterval(t);
  }, [waiting, loadLatest]);

  // When a request finishes with messages, re-read the thread once.
  useEffect(() => {
    if (row?.state === "completed" && (row.received_messages ?? 0) > 0 && lastNotifiedRef.current !== row.id) {
      lastNotifiedRef.current = row.id;
      onLoadedRef.current?.();
    }
  }, [row]);

  async function request() {
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/history-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(res.status, body, "Não foi possível pedir as mensagens anteriores."));
      await loadLatest();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível pedir as mensagens anteriores.");
    } finally {
      setSending(false);
    }
  }

  const view = describeHistoryRequest(row, now);
  if (view.reachedStart && !view.text) return null;

  return (
    <div className="mb-3 flex flex-col items-center gap-1.5">
      {view.canRequest && (
        <button
          type="button"
          onClick={request}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
          Carregar mensagens anteriores
        </button>
      )}
      {view.phase === "waiting" && (
        <p className="flex max-w-sm items-start gap-1.5 text-center text-[11px] text-muted-foreground">
          <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
          {view.text}
        </p>
      )}
      {view.phase !== "waiting" && view.text && (
        <p
          className={`max-w-sm text-center text-[11px] ${view.phase === "problem" ? "text-amber-600" : "text-muted-foreground"}`}
        >
          {view.text}
        </p>
      )}
    </div>
  );
}
