'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { getBroadcastStatus, getRecipientStatus } from '@/lib/broadcast-status';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Ban,
  Copy,
  Users,
  Search,
  PlayCircle,
  PauseCircle,
  Send,
  RotateCw,
} from 'lucide-react';

type StatusTab = 'sent' | 'failed' | 'scheduled' | 'all';

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'scheduled', label: 'Agendados' },
  { key: 'sent', label: 'Enviados' },
  { key: 'failed', label: 'Erro' },
  { key: 'all', label: 'Todos' },
];

/** Which underlying broadcasts.status values fall under each tab. */
const TAB_STATUSES: Record<StatusTab, string[] | null> = {
  scheduled: ['scheduled', 'sending', 'draft'],
  sent: ['sent'],
  failed: ['failed'],
  all: null,
};

interface RecipientRow {
  id: string;
  status: string;
  error_message: string | null;
  params: Record<string, string> | null;
  contact_id: string | null;
  contact: { name: string | null; phone: string | null } | null;
}

export default function BroadcastHistoryPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const accountId = profile?.account_id;
  const [tab, setTab] = useState<StatusTab>('scheduled');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editInterval, setEditInterval] = useState(5);
  const [savingEdit, setSavingEdit] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyRecipientId, setBusyRecipientId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; description: string; confirmLabel?: string; onConfirm: () => void } | null>(null);

  const [editingRecipient, setEditingRecipient] = useState<RecipientRow | null>(null);
  const [editRecipientName, setEditRecipientName] = useState('');
  const [editRecipientPhone, setEditRecipientPhone] = useState('');
  const [editRecipientParams, setEditRecipientParams] = useState<Record<string, string>>({});
  const [savingRecipient, setSavingRecipient] = useState(false);

  const fetchBroadcasts = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('account_id', accountId)
        .order('scheduled_at', { ascending: tab === 'scheduled' })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBroadcasts(data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar disparos');
    } finally {
      setLoading(false);
    }
  }, [tab, accountId]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  // Live progress: while anything is actively sending, poll so the
  // sent/failed count and progress bar move without a manual refresh.
  // sent_count/failed_count update in the DB the instant the cron
  // worker marks each recipient — this just needs to pull that in.
  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    if (!anySending) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchBroadcasts();
      if (expandedId) loadRecipients(expandedId);
    }, 4000);
    return () => clearInterval(interval);
  }, [anySending, fetchBroadcasts, expandedId]);

  const filtered = useMemo(() => {
    const allowedStatuses = TAB_STATUSES[tab];
    const q = searchQuery.trim().toLowerCase();
    return broadcasts.filter((b) => {
      const matchesTab = !allowedStatuses || allowedStatuses.includes(b.status);
      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.template_name.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [broadcasts, tab, searchQuery]);

  async function loadRecipients(broadcastId: string) {
    setLoadingRecipients(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select('id, status, error_message, params, contact_id, contact:contacts(name, phone)')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      setRecipients((data ?? []) as unknown as RecipientRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar contatos do disparo');
    } finally {
      setLoadingRecipients(false);
    }
  }

  async function toggleExpand(broadcast: Broadcast) {
    if (expandedId === broadcast.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(broadcast.id);
    await loadRecipients(broadcast.id);
  }

  function openEditRecipient(r: RecipientRow) {
    setEditingRecipient(r);
    setEditRecipientName(r.contact?.name ?? '');
    setEditRecipientPhone(r.contact?.phone ?? '');
    setEditRecipientParams({ ...(r.params ?? {}) });
  }

  async function saveRecipientEdit() {
    if (!editingRecipient) return;
    setSavingRecipient(true);
    try {
      const res = await fetch(`/api/broadcasts/recipients/${editingRecipient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editRecipientName.trim() || undefined,
          phone: editRecipientPhone.trim() || undefined,
          params: editRecipientParams,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      toast.success('Destinatário atualizado.');
      setEditingRecipient(null);
      if (expandedId) loadRecipients(expandedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar destinatário');
    } finally {
      setSavingRecipient(false);
    }
  }

  function requestCancelRecipient(r: RecipientRow) {
    setPendingConfirm({
      title: "Cancelar envio",
      description: `Cancelar o envio para ${r.contact?.name || r.contact?.phone || "este contato"}?`,
      confirmLabel: "Cancelar envio",
      onConfirm: () => cancelRecipient(r),
    });
  }

  async function cancelRecipient(r: RecipientRow) {
    setBusyRecipientId(r.id);
    try {
      const res = await fetch(`/api/broadcasts/recipients/${r.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar');
      toast.success('Destinatário cancelado.');
      if (expandedId) loadRecipients(expandedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao cancelar destinatário');
    } finally {
      setBusyRecipientId(null);
    }
  }

  async function sendNowRecipient(r: RecipientRow) {
    setBusyRecipientId(r.id);
    try {
      const res = await fetch(`/api/broadcasts/recipients/${r.id}/send-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      toast.success('Mensagem enviada.');
      if (expandedId) loadRecipients(expandedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar destinatário');
    } finally {
      setBusyRecipientId(null);
    }
  }

  function openEdit(broadcast: Broadcast) {
    setEditingBroadcast(broadcast);
    setEditName(broadcast.name);
    if (broadcast.scheduled_at) {
      // Local time components, not UTC — toISOString() here showed
      // the UTC-shifted value (e.g. 3h off for Brazil), which looked
      // "wrong" compared to what was actually typed in when scheduling.
      const d = new Date(broadcast.scheduled_at);
      const pad = (n: number) => String(n).padStart(2, '0');
      setEditDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setEditTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setEditDate('');
      setEditTime('');
    }
    setEditInterval(broadcast.interval_seconds ?? 5);
  }

  async function saveEdit() {
    if (!editingBroadcast) return;
    setSavingEdit(true);
    try {
      const supabase = createClient();
      const scheduledAt =
        editDate && editTime ? new Date(`${editDate}T${editTime}:00`).toISOString() : undefined;
      const { error } = await supabase
        .from('broadcasts')
        .update({
          name: editName.trim() || editingBroadcast.name,
          ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
          interval_seconds: Math.max(1, editInterval),
        })
        .eq('id', editingBroadcast.id)
        .eq('account_id', accountId);
      if (error) throw error;
      toast.success('Disparo atualizado');
      setEditingBroadcast(null);
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao atualizar disparo');
    } finally {
      setSavingEdit(false);
    }
  }

  function requestCancelBroadcast(broadcast: Broadcast) {
    setPendingConfirm({
      title: "Cancelar disparo",
      description: `Cancelar o disparo "${broadcast.name}"? Contatos que ainda não receberam a mensagem não vão mais recebê-la.`,
      confirmLabel: "Cancelar disparo",
      onConfirm: () => cancelBroadcast(broadcast),
    });
  }

  async function cancelBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .update({ status: 'cancelled' })
        .eq('id', broadcast.id)
        .eq('account_id', accountId);
      if (error) throw error;
      toast.success('Disparo cancelado');
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao cancelar disparo');
    } finally {
      setBusyId(null);
    }
  }

  async function pauseBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .update({ status: 'paused' })
        .eq('id', broadcast.id)
        .eq('account_id', accountId);
      if (error) throw error;
      toast.success('Disparo pausado. Retome quando quiser — o intervalo entre mensagens continua sendo respeitado.');
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao pausar disparo');
    } finally {
      setBusyId(null);
    }
  }

  async function resumeBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .update({ status: 'sending' })
        .eq('id', broadcast.id)
        .eq('account_id', accountId);
      if (error) throw error;
      toast.success('Disparo retomado.');
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao retomar disparo');
    } finally {
      setBusyId(null);
    }
  }

  function requestSendNowBroadcast(broadcast: Broadcast) {
    setPendingConfirm({
      title: "Enviar agora",
      description: `Enviar "${broadcast.name}" agora, pulando o horário agendado?`,
      confirmLabel: "Enviar agora",
      onConfirm: () => sendNowBroadcast(broadcast),
    });
  }

  async function sendNowBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const res = await fetch(`/api/broadcasts/${broadcast.id}/send-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar agora');
      toast.success(
        data.remaining > 0
          ? `${data.sent} enviados agora. Os ${data.remaining} restantes continuam pelo worker normal (a lista era grande demais pra terminar de uma vez).`
          : `${data.sent} mensagens enviadas.`,
      );
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar agora');
    } finally {
      setBusyId(null);
    }
  }

  function requestRetryFailedBroadcast(broadcast: Broadcast) {
    setPendingConfirm({
      title: "Tentar reenviar",
      description: `Tentar reenviar as ${broadcast.failed_count} mensagens que falharam em "${broadcast.name}"?`,
      confirmLabel: "Reenviar",
      onConfirm: () => retryFailedBroadcast(broadcast),
    });
  }

  async function retryFailedBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const res = await fetch(`/api/broadcasts/${broadcast.id}/retry-failed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao reenviar');
      toast.success(
        data.remaining > 0
          ? `${data.sent} reenviados com sucesso. ${data.remaining} continuam pelo worker normal.`
          : data.sent > 0
            ? `${data.sent} reenviados com sucesso.`
            : 'Nenhum reenvio teve sucesso — confira os erros individuais.',
      );
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao reenviar');
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateBroadcast(broadcast: Broadcast) {
    setBusyId(broadcast.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile?.account_id) throw new Error('Conta não identificada.');

      // Copies land 10 minutes out so there's a safety window to edit
      // or cancel before the cron worker would otherwise pick them up.
      const scheduledAt = new Date(Date.now() + 10 * 60_000).toISOString();

      const { data: newBroadcast, error: insertError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: profile.account_id,
          name: `${broadcast.name} (cópia)`,
          template_name: broadcast.template_name,
          template_language: broadcast.template_language,
          template_variables: broadcast.template_variables ?? null,
          audience_filter: broadcast.audience_filter ?? null,
          status: 'scheduled',
          scheduled_at: scheduledAt,
          interval_seconds: broadcast.interval_seconds ?? 5,
          total_recipients: 0,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();
      if (insertError || !newBroadcast) throw insertError;

      const { data: originalRecipients, error: recipientsError } = await supabase
        .from('broadcast_recipients')
        .select('contact_id, params')
        .eq('broadcast_id', broadcast.id);
      if (recipientsError) throw recipientsError;

      const rows = (originalRecipients ?? [])
        .filter((r) => r.contact_id)
        .map((r) => ({
          broadcast_id: newBroadcast.id,
          contact_id: r.contact_id,
          status: 'pending' as const,
          params: r.params ?? {},
        }));

      if (rows.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error: chunkError } = await supabase
            .from('broadcast_recipients')
            .insert(rows.slice(i, i + CHUNK));
          if (chunkError) throw chunkError;
        }
        await supabase
          .from('broadcasts')
          .update({ total_recipients: rows.length })
          .eq('id', newBroadcast.id);
      }

      toast.success('Disparo duplicado — revise o horário antes que ele seja enviado.');
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao duplicar disparo');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Disparos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe, edite, cancele ou duplique seus disparos.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou modelo…"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <p className="text-sm text-muted-foreground">Nenhum disparo encontrado nesta aba.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((broadcast) => {
            const status = getBroadcastStatus(broadcast.status);
            const isExpanded = expandedId === broadcast.id;
            const isBusy = busyId === broadcast.id;
            const canEditOrCancel = ['scheduled', 'sending', 'paused', 'draft'].includes(broadcast.status);

            return (
              <div key={broadcast.id} className="rounded-xl border border-border bg-card/50">
                <div className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => toggleExpand(broadcast)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{broadcast.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {broadcast.template_name}
                      {broadcast.scheduled_at &&
                        ` · ${new Date(broadcast.scheduled_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}`}
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <Users className="h-3.5 w-3.5" />
                    {(broadcast.status === 'sending' || broadcast.status === 'paused')
                      ? `${(broadcast.sent_count + broadcast.failed_count).toLocaleString()} / ${broadcast.total_recipients.toLocaleString()}`
                      : broadcast.total_recipients.toLocaleString()}
                    {broadcast.failed_count > 0 && (
                      <span className="text-red-400">({broadcast.failed_count} falhou)</span>
                    )}
                  </div>

                  {(broadcast.status === 'sending' || broadcast.status === 'paused') && broadcast.total_recipients > 0 && (
                    <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            ((broadcast.sent_count + broadcast.failed_count) /
                              broadcast.total_recipients) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                  >
                    {status.label}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    {broadcast.status === 'draft' && (
                      <button
                        onClick={() => router.push(`/broadcasts/new?draft=${broadcast.id}`)}
                        title="Continuar editando"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Continuar
                      </button>
                    )}
                    {broadcast.status === 'sending' && (
                      <button
                        onClick={() => pauseBroadcast(broadcast)}
                        title="Pausar envio"
                        disabled={isBusy}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-orange-400"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {broadcast.status === 'paused' && (
                      <button
                        onClick={() => resumeBroadcast(broadcast)}
                        title="Retomar envio"
                        disabled={isBusy}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {broadcast.status === 'scheduled' && (
                      <button
                        onClick={() => requestSendNowBroadcast(broadcast)}
                        title="Enviar agora"
                        disabled={isBusy}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {broadcast.failed_count > 0 && (
                      <button
                        onClick={() => requestRetryFailedBroadcast(broadcast)}
                        title={`Reenviar as ${broadcast.failed_count} que falharam`}
                        disabled={isBusy}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {canEditOrCancel && (
                      <>
                        <button
                          onClick={() => openEdit(broadcast)}
                          title="Editar"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => requestCancelBroadcast(broadcast)}
                          title="Cancelar"
                          disabled={isBusy}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-400"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => duplicateBroadcast(broadcast)}
                      title="Duplicar"
                      disabled={isBusy}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-3">
                    {loadingRecipients ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    ) : recipients.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">Nenhum contato neste disparo.</p>
                    ) : (
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {recipients.map((r) => {
                          const rStatus = getRecipientStatus(r.status);
                          const isPending = r.status === 'pending';
                          const isFailed = r.status === 'failed';
                          const isRecipientBusy = busyRecipientId === r.id;
                          const varEntries = Object.entries(r.params ?? {}).filter(([, v]) => v?.trim());
                          return (
                            <div
                              key={r.id}
                              className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate">
                                  <span className="font-medium text-foreground">
                                    {r.contact?.name || '(sem nome)'}
                                  </span>{' '}
                                  <span className="text-muted-foreground">{r.contact?.phone || '—'}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {r.error_message && (
                                    <span className="max-w-[180px] truncate text-red-400" title={r.error_message}>
                                      {r.error_message}
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${rStatus.classes}`}
                                  >
                                    {rStatus.label}
                                  </span>
                                  {isFailed && (
                                    <button
                                      onClick={() => sendNowRecipient(r)}
                                      title="Tentar reenviar"
                                      disabled={isRecipientBusy}
                                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                                    >
                                      {isRecipientBusy ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RotateCw className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                  {isPending && (
                                    <>
                                      <button
                                        onClick={() => openEditRecipient(r)}
                                        title="Editar"
                                        disabled={isRecipientBusy}
                                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button
                                        onClick={() => sendNowRecipient(r)}
                                        title="Enviar agora"
                                        disabled={isRecipientBusy}
                                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                                      >
                                        {isRecipientBusy ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Send className="h-3 w-3" />
                                        )}
                                      </button>
                                      <button
                                        onClick={() => requestCancelRecipient(r)}
                                        title="Cancelar"
                                        disabled={isRecipientBusy}
                                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-red-400"
                                      >
                                        <Ban className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {varEntries.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {varEntries.map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                    >
                                      {`{{${k}}}: ${v}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingBroadcast} onOpenChange={(open) => !open && setEditingBroadcast(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar disparo</DialogTitle>
            <DialogDescription>
              Só é possível editar disparos que ainda não terminaram de enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data</label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário</label>
                <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Intervalo (s)</label>
                <Input
                  type="number"
                  min={1}
                  value={editInterval}
                  onChange={(e) => setEditInterval(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBroadcast(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit recipient */}
      <Dialog open={!!editingRecipient} onOpenChange={(open) => !open && setEditingRecipient(null)}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Editar destinatário</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Ajuste os dados e as variáveis desse contato antes do envio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Nome</label>
              <Input value={editRecipientName} onChange={(e) => setEditRecipientName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Telefone</label>
              <Input value={editRecipientPhone} onChange={(e) => setEditRecipientPhone(e.target.value)} />
            </div>
            {Object.keys(editRecipientParams).length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">Variáveis</label>
                {Object.entries(editRecipientParams).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                      {`{{${key}}}`}
                    </span>
                    <Input
                      value={value}
                      onChange={(e) =>
                        setEditRecipientParams((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecipient(null)} className="border-border text-muted-foreground">
              Cancelar
            </Button>
            <Button onClick={saveRecipientEdit} disabled={savingRecipient}>
              {savingRecipient ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingConfirm}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel}
        onConfirm={() => pendingConfirm?.onConfirm()}
      />
    </div>
  );
}
