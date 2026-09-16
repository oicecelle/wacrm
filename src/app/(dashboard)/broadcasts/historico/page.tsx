'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  contact: { name: string | null; phone: string | null } | null;
}

export default function BroadcastHistoryPage() {
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

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('scheduled_at', { ascending: tab === 'scheduled' })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBroadcasts(data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar disparos');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

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

  async function toggleExpand(broadcast: Broadcast) {
    if (expandedId === broadcast.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(broadcast.id);
    setLoadingRecipients(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select('id, status, error_message, contact:contacts(name, phone)')
        .eq('broadcast_id', broadcast.id)
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

  function openEdit(broadcast: Broadcast) {
    setEditingBroadcast(broadcast);
    setEditName(broadcast.name);
    if (broadcast.scheduled_at) {
      const d = new Date(broadcast.scheduled_at);
      setEditDate(d.toISOString().slice(0, 10));
      setEditTime(d.toISOString().slice(11, 16));
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
        .eq('id', editingBroadcast.id);
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

  async function cancelBroadcast(broadcast: Broadcast) {
    if (!confirm(`Cancelar o disparo "${broadcast.name}"? Contatos que ainda não receberam a mensagem não vão mais recebê-la.`)) {
      return;
    }
    setBusyId(broadcast.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .update({ status: 'cancelled' })
        .eq('id', broadcast.id);
      if (error) throw error;
      toast.success('Disparo cancelado');
      fetchBroadcasts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao cancelar disparo');
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
            const canEditOrCancel = ['scheduled', 'sending', 'draft'].includes(broadcast.status);

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
                    {broadcast.total_recipients.toLocaleString()}
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                  >
                    {status.label}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
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
                          onClick={() => cancelBroadcast(broadcast)}
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
                          return (
                            <div
                              key={r.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                            >
                              <div className="min-w-0 truncate">
                                <span className="font-medium text-foreground">
                                  {r.contact?.name || '(sem nome)'}
                                </span>{' '}
                                <span className="text-muted-foreground">{r.contact?.phone || '—'}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {r.error_message && (
                                  <span className="max-w-[220px] truncate text-red-400" title={r.error_message}>
                                    {r.error_message}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${rStatus.classes}`}
                                >
                                  {rStatus.label}
                                </span>
                              </div>
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
    </div>
  );
}
