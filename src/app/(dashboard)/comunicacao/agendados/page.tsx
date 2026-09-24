'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CalendarClock,
  Search,
  Trash2,
  Edit,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  Phone,
  RefreshCw,
  Ban,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const EVENT_TYPE_LABELS: Record<string, string> = {
  aniversario: 'Aniversariantes',
  boas_vindas: 'Boas-vindas',
  lembrete_retorno: 'Lembrete de Retorno',
  lembrete_agendamento: 'Lembrete de Consulta',
  agendamento_criado: 'Agendamento Criado',
  agendamento_alterado: 'Agendamento Alterado',
  confirmacao_agendamento: 'Confirmação de Consulta',
  agendamento_confirmado: 'Agendamento Confirmado',
  agendamento_cancelado: 'Agendamento Cancelado',
  pre_atendimento: 'Pré-atendimento',
  orcamento: 'Envio de Orçamento',
  lembrete_fatura: 'Lembrete de Fatura',
  pos_procedimento: 'Pós-procedimento',
};

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: any }> = {
  pending: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200/40', icon: Clock },
  sent: { label: 'Enviado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200/40', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', classes: 'bg-neutral-50 text-neutral-600 border-border/40', icon: XCircle },
  failed: { label: 'Falhou', classes: 'bg-red-50 text-red-700 border-red-200/40', icon: AlertTriangle },
};

export default function ScheduledNotificationsPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'sent' | 'cancelled' | 'failed' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; description: string; confirmLabel?: string; onConfirm: () => void } | null>(null);

  // Edit State
  const [editingNotif, setEditingNotif] = useState<any | null>(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [editScheduledFor, setEditScheduledFor] = useState('');
  const [updating, setUpdating] = useState(false);

  // Sync Trigger State
  const [syncing, setSyncing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_notifications')
        .select('*')
        .eq('account_id', accountId)
        .order('scheduled_for', { ascending: statusFilter === 'pending' });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching scheduled notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, statusFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Filters notifications based on query & status
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      const matchesStatus = statusFilter === 'all' || notif.status === statusFilter;
      const cleanQuery = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !cleanQuery ||
        notif.recipient_name.toLowerCase().includes(cleanQuery) ||
        notif.recipient_phone.includes(cleanQuery) ||
        (notif.message_text && notif.message_text.toLowerCase().includes(cleanQuery));

      return matchesStatus && matchesSearch;
    });
  }, [notifications, statusFilter, searchQuery]);

  // Bulk actions handling
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const requestBulkCancel = () => {
    if (selectedIds.size === 0) return;
    setPendingConfirm({
      title: "Cancelar envios selecionados",
      description: `Deseja mesmo cancelar os ${selectedIds.size} envios selecionados?`,
      confirmLabel: "Cancelar envios",
      onConfirm: handleBulkCancel,
    });
  };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { error } = await supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} envios cancelados com sucesso`);
      setSelectedIds(new Set());
      fetchNotifications();
    } catch (err) {
      console.error('Error cancelling in bulk:', err);
      toast.error('Falha ao cancelar envios em massa');
    }
  };

  // Action actions
  const requestCancelOne = (id: string) => {
    setPendingConfirm({
      title: "Cancelar envio",
      description: "Deseja mesmo cancelar este envio?",
      confirmLabel: "Cancelar envio",
      onConfirm: () => handleCancelOne(id),
    });
  };

  const handleCancelOne = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      toast.success('Envio cancelado com sucesso');
      fetchNotifications();
    } catch (err) {
      console.error('Error cancelling notification:', err);
      toast.error('Falha ao cancelar o envio');
    }
  };

  const handleReactivateOne = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_notifications')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      toast.success('Envio reativado com sucesso');
      fetchNotifications();
    } catch (err) {
      console.error('Error reactivating notification:', err);
      toast.error('Falha ao reativar o envio');
    }
  };

  const requestDeleteOne = (id: string) => {
    setPendingConfirm({
      title: "Excluir registro",
      description: "Deseja excluir permanentemente este registro do histórico?",
      confirmLabel: "Excluir",
      onConfirm: () => handleDeleteOne(id),
    });
  };

  const handleDeleteOne = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Registro excluído com sucesso');
      fetchNotifications();
    } catch (err) {
      console.error('Error deleting notification:', err);
      toast.error('Falha ao excluir o registro');
    }
  };

  const startEditing = (notif: any) => {
    setEditingNotif(notif);
    setEditMessageText(notif.message_text);
    
    // Parse timestamp to datetime-local format
    const date = new Date(notif.scheduled_for);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    setEditScheduledFor(localISOTime);
  };

  const saveEdit = async () => {
    if (!editingNotif) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('scheduled_notifications')
        .update({
          message_text: editMessageText,
          scheduled_for: new Date(editScheduledFor).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNotif.id);

      if (error) throw error;
      toast.success('Envio atualizado com sucesso');
      setEditingNotif(null);
      fetchNotifications();
    } catch (err) {
      console.error('Error saving edits:', err);
      toast.error('Falha ao atualizar o envio');
    } finally {
      setUpdating(false);
    }
  };

  const triggerCronSync = async () => {
    setSyncing(true);
    try {
      const secret = process.env.AUTOMATION_CRON_SECRET || 'sync-bypass';
      const res = await fetch(`/api/cron/notifications?secret=${secret}`, {
        method: 'GET',
      });
      if (res.ok) {
        toast.success('Envios sincronizados com sucesso');
        fetchNotifications();
      } else {
        toast.error('Erro na resposta da sincronização');
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
      toast.error('Falha ao acionar a sincronização');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Agenda de Envios</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as mensagens automáticas de lembretes e aniversariantes programadas pelo sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerCronSync}
            disabled={syncing}
            className="border-border text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
            )}
            Sincronizar Agora
          </Button>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-3xl border border-neutral-100 shadow-xs">
        {/* Status Filters */}
        <div className="flex flex-wrap gap-1.5">
          {(['pending', 'sent', 'cancelled', 'failed', 'all'] as const).map((tab) => {
            const isActive = statusFilter === tab;
            const labels: Record<string, string> = {
              pending: 'Agendados',
              sent: 'Enviados',
              cancelled: 'Cancelados',
              failed: 'Falhas',
              all: 'Todos',
            };

            return (
              <button
                key={tab}
                onClick={() => {
                  setStatusFilter(tab);
                  setSelectedIds(new Set());
                }}
                className={`rounded-2xl px-4 py-2 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 border-blue-200/50'
                    : 'text-muted-foreground hover:bg-neutral-50 border-transparent'
                } border`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-md sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por paciente ou texto..."
            className="pl-9 pr-4 py-2 border-border bg-neutral-50 text-xs text-foreground rounded-2xl placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-200/50 p-3 rounded-2xl animate-fade-in">
          <span className="text-xs font-bold text-blue-800">
            {selectedIds.size} {selectedIds.size === 1 ? 'item selecionado' : 'itens selecionados'}
          </span>
          <div className="flex items-center gap-2">
            {statusFilter === 'pending' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={requestBulkCancel}
                className="bg-red-600 text-white hover:bg-red-700 h-8 rounded-xl text-xs font-bold"
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Cancelar Selecionados
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="border-border text-neutral-700 h-8 rounded-xl text-xs font-bold hover:bg-neutral-50"
            >
              Desmarcar
            </Button>
          </div>
        </div>
      )}

      {/* Table Section */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] border border-neutral-100 rounded-3xl bg-card">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-neutral-100 rounded-3xl bg-card p-8 text-center">
          <CalendarClock className="h-10 w-10 text-neutral-300 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Nenhum envio encontrado</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Nenhuma mensagem agendada corresponde aos filtros selecionados neste momento.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-100 rounded-3xl bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-100 hover:bg-transparent">
                {statusFilter === 'pending' && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredNotifications.length}
                      onChange={toggleSelectAll}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs font-bold text-muted-foreground">Paciente</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Gatilho</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Agendado para</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Texto Mensagem</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Status</TableHead>
                <TableHead className="w-24 text-right text-xs font-bold text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNotifications.map((notif) => {
                const status = STATUS_CONFIG[notif.status] || STATUS_CONFIG.pending;
                const StatusIcon = status.icon;
                const isSelected = selectedIds.has(notif.id);

                return (
                  <TableRow
                    key={notif.id}
                    className={`border-neutral-100 transition-colors ${
                      isSelected ? 'bg-blue-500/5 hover:bg-blue-500/10' : 'hover:bg-neutral-50/50'
                    }`}
                  >
                    {statusFilter === 'pending' && (
                      <TableCell className="w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(notif.id)}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div>
                        <p className="text-xs font-black text-foreground">{notif.recipient_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {notif.recipient_phone}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-bold text-neutral-700">
                          {EVENT_TYPE_LABELS[notif.event_type] || notif.event_type}
                        </p>
                        {notif.template?.name && (
                          <p className="text-[9px] text-muted-foreground mt-0.5 font-medium">
                            Template: {notif.template.name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-neutral-700 font-medium">
                        {new Date(notif.scheduled_for).toLocaleString('pt-BR')}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-xs text-muted-foreground truncate leading-relaxed" title={notif.message_text}>
                        {notif.message_text}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.classes}`}
                      >
                        <StatusIcon className="h-3 w-3 shrink-0" />
                        {status.label}
                      </span>
                      {notif.status === 'failed' && notif.error_message && (
                        <p className="text-[9px] text-red-500 mt-1 max-w-xs truncate" title={notif.error_message}>
                          {notif.error_message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {notif.status === 'pending' && (
                          <>
                            <button
                              onClick={() => startEditing(notif)}
                              title="Editar Envio"
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => requestCancelOne(notif.id)}
                              title="Cancelar Envio"
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-neutral-100 hover:text-red-600 transition-colors"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {notif.status === 'cancelled' && (
                          <button
                            onClick={() => handleReactivateOne(notif.id)}
                            title="Reativar Envio"
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-neutral-100 hover:text-blue-600 transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(notif.status === 'sent' || notif.status === 'cancelled' || notif.status === 'failed') && (
                          <button
                            onClick={() => requestDeleteOne(notif.id)}
                            title="Excluir Registro"
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-neutral-100 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editingNotif} onOpenChange={(open) => !open && setEditingNotif(null)}>
        <DialogContent className="border-border bg-card sm:max-w-lg rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-foreground font-black tracking-tight text-lg">
              Editar Mensagem Agendada
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Modifique a data de disparo ou personalize a mensagem final que será enviada.
            </DialogDescription>
          </DialogHeader>

          {editingNotif && (
            <div className="space-y-4 py-4 text-left">
              {/* Recipient summary */}
              <div className="flex gap-2 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">{editingNotif.recipient_name}</p>
                  <p className="text-[10px] text-muted-foreground">{editingNotif.recipient_phone}</p>
                </div>
              </div>

              {/* Datepicker */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600">Data e Hora de Disparo</label>
                <Input
                  type="datetime-local"
                  value={editScheduledFor}
                  onChange={(e) => setEditScheduledFor(e.target.value)}
                  className="border-border bg-neutral-50 text-xs text-foreground rounded-xl"
                />
              </div>

              {/* Message text area */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600">Mensagem Personalizada</label>
                <textarea
                  value={editMessageText}
                  onChange={(e) => setEditMessageText(e.target.value)}
                  rows={6}
                  className="w-full border border-border bg-neutral-50 text-xs text-foreground rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
                  placeholder="Escreva a mensagem personalizada..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingNotif(null)}
              disabled={updating}
              className="border-border text-neutral-700 rounded-xl text-xs font-bold hover:bg-neutral-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={saveEdit}
              disabled={updating || !editMessageText.trim() || !editScheduledFor}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Salvar Alterações
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
