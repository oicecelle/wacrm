'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Send, X, Pencil, Loader2, CheckCircle2, Clock, Sparkles,
  RefreshCw, CalendarClock, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { DealFollowup } from '@/types';

type FilterStatus = 'pending' | 'sent' | 'cancelled' | 'all';

export function FollowupQueue() {
  const [followups, setFollowups] = useState<DealFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/followups?status=${filter}&limit=100`);
    const data = await res.json();
    setFollowups(data.followups ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function formatScheduled(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function isOverdue(dateStr: string) {
    return new Date(dateStr) < new Date();
  }

  async function handleCancel(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/followups/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Follow-up cancelado');
      load();
    } else {
      toast.error('Erro ao cancelar');
    }
    setActionLoading(null);
  }

  async function handleSendNow(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/followups/${id}/send-now`, { method: 'POST' });
    if (res.ok) {
      toast.success('Mensagem enviada!');
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Erro ao enviar');
    }
    setActionLoading(null);
  }

  async function handleSaveEdit(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/followups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: editMessage, scheduled_at: editScheduledAt || undefined }),
    });
    if (res.ok) {
      toast.success('Follow-up atualizado');
      setEditingId(null);
      load();
    } else {
      toast.error('Erro ao salvar');
    }
    setActionLoading(null);
  }

  async function handleGenerateAI(followup: DealFollowup) {
    setGeneratingAI(followup.id);
    const res = await fetch('/api/ai/followup-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_name: followup.contact?.name || followup.contact?.phone || 'lead',
        deal_title: followup.deal?.title,
      }),
    });
    const data = await res.json();
    if (data.suggestion) {
      setEditMessage(data.suggestion);
      toast.success('Sugestão gerada pela IA');
    } else {
      toast.error('Erro ao gerar sugestão');
    }
    setGeneratingAI(null);
  }

  async function handleBulk(action: 'cancel' | 'send_now', rescheduleTo?: string) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    const res = await fetch('/api/followups/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: Array.from(selected),
        action,
        scheduled_at: rescheduleTo,
      }),
    });
    const data = await res.json();
    toast.success(`${data.success} enviados, ${data.failed} falharam`);
    load();
    setBulkLoading(false);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === followups.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(followups.map(f => f.id)));
    }
  }

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'pending', label: 'Pendentes' },
    { key: 'sent', label: 'Enviados' },
    { key: 'cancelled', label: 'Cancelados' },
    { key: 'all', label: 'Todos' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 p-3 border-b border-border/50 bg-muted/30">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
          title="Atualizar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
          <span className="text-xs font-semibold text-primary">{selected.size} selecionado(s)</span>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkLoading}
            onClick={() => handleBulk('send_now')}
            className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
          >
            {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Enviar todos
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkLoading}
            onClick={() => handleBulk('cancel')}
            className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
          >
            {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            Cancelar todos
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Desmarcar
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : followups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhum follow-up {filter === 'pending' ? 'pendente' : filter === 'sent' ? 'enviado' : 'encontrado'}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {/* Header row */}
            {filter === 'pending' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
                <input
                  type="checkbox"
                  checked={selected.size === followups.length && followups.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  {followups.length} follow-up(s)
                </span>
              </div>
            )}

            {followups.map(followup => (
              <div key={followup.id} className={`p-3 transition-colors ${selected.has(followup.id) ? 'bg-primary/3' : 'hover:bg-muted/30'}`}>
                {editingId === followup.id ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate flex-1">
                        {followup.contact?.name || followup.contact?.phone || 'Lead'}
                      </span>
                      <button
                        onClick={() => handleGenerateAI(followup)}
                        disabled={generatingAI === followup.id}
                        className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        {generatingAI === followup.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Sparkles className="h-3 w-3" />}
                        Gerar IA
                      </button>
                    </div>
                    <Input
                      type="datetime-local"
                      value={editScheduledAt}
                      onChange={e => setEditScheduledAt(e.target.value)}
                      className="h-8 text-xs border-border bg-muted"
                    />
                    <Textarea
                      value={editMessage}
                      onChange={e => setEditMessage(e.target.value)}
                      className="min-h-[80px] text-xs border-border bg-muted resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(followup.id)}
                        disabled={actionLoading === followup.id}
                        className="h-7 text-xs flex-1 bg-primary text-primary-foreground"
                      >
                        {actionLoading === followup.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        className="h-7 text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex gap-2">
                    {filter === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selected.has(followup.id)}
                        onChange={() => toggleSelect(followup.id)}
                        className="mt-0.5 rounded shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {followup.contact?.name || followup.contact?.phone || 'Lead desconhecido'}
                        </span>
                        {followup.ai_generated && (
                          <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-700 font-semibold px-1 rounded">IA</span>
                        )}
                        {followup.status === 'sent' && (
                          <span className="shrink-0 text-[9px] bg-blue-100 text-blue-700 font-semibold px-1 rounded">Enviado</span>
                        )}
                        {followup.status === 'cancelled' && (
                          <span className="shrink-0 text-[9px] bg-neutral-100 text-muted-foreground font-semibold px-1 rounded">Cancelado</span>
                        )}
                        {followup.status === 'failed' && (
                          <span className="shrink-0 text-[9px] bg-red-100 text-red-600 font-semibold px-1 rounded">Falhou</span>
                        )}
                      </div>

                      {followup.deal?.title && (
                        <p className="text-[10px] text-muted-foreground truncate mb-1">{followup.deal.title}</p>
                      )}

                      <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2 mb-1.5">
                        {followup.message}
                      </p>

                      <div className="flex items-center gap-1">
                        {followup.status === 'pending' && isOverdue(followup.scheduled_at) ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-orange-600 font-semibold">
                            <AlertCircle className="h-3 w-3" />
                            Atrasado · {formatScheduled(followup.scheduled_at)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatScheduled(followup.sent_at || followup.scheduled_at)}
                          </span>
                        )}
                      </div>

                      {followup.error_message && (
                        <p className="mt-1 text-[10px] text-red-500">{followup.error_message}</p>
                      )}
                    </div>

                    {/* Actions */}
                    {followup.status === 'pending' && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => handleSendNow(followup.id)}
                          disabled={actionLoading === followup.id}
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:text-primary/80 disabled:opacity-50 py-0.5 px-1.5 rounded bg-primary/10 hover:bg-primary/15"
                          title="Enviar agora"
                        >
                          {actionLoading === followup.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Send className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(followup.id);
                            setEditMessage(followup.message);
                            setEditScheduledAt(followup.scheduled_at.substring(0, 16));
                          }}
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 py-0.5 px-1.5 rounded bg-blue-50 hover:bg-blue-100"
                          title="Editar"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleCancel(followup.id)}
                          disabled={actionLoading === followup.id}
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-red-500 hover:text-red-700 py-0.5 px-1.5 rounded bg-red-50 hover:bg-red-100"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
