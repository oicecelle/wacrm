'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  CalendarIcon,
  CheckCircle2Icon,
  Loader2Icon,
  AlertTriangleIcon,
  TrashIcon,
} from 'lucide-react';
import { SettingsPanelHead } from './settings-panel-head';

export function GoogleCalendarPanel() {
  const supabase = createClient();
  const { accountId, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Check URL params for callback status notifications
  useEffect(() => {
    const success = searchParams.get('google_success');
    const error = searchParams.get('google_error');

    if (success) {
      toast.success('Google Agenda integrado com sucesso!');
      // Clear URL params
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('google_success');
      router.replace(`/settings?tab=google`, { scroll: false });
    } else if (error) {
      const errorMap: Record<string, string> = {
        auth_failed: 'Falha na autenticação com o Google.',
        secret_missing: 'Erro de configuração do servidor (client secret).',
        token_exchange_failed: 'Erro ao trocar código por tokens de acesso.',
        missing_refresh_token: 'Google não retornou a chave de atualização (refresh token). Tente desconectar e reconectar.',
        database_save_failed: 'Erro ao salvar credenciais no banco de dados.',
      };
      toast.error(errorMap[error] || 'Erro ao integrar com o Google Agenda.');
      
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('google_error');
      router.replace(`/settings?tab=google`, { scroll: false });
    }
  }, [searchParams, router]);

  const loadStatus = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('google_calendar_tokens')
        .select('id, email')
        .eq('account_id', accountId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setEmail(data.email);
        setTokenId(data.id);
      } else {
        setEmail(null);
        setTokenId(null);
      }
    } catch (err) {
      console.error('Error fetching Google token status:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId, user, supabase]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = () => {
    // Redirect to the authorization api endpoint
    window.location.href = '/api/integrations/google/auth';
  };

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleDisconnect = async () => {
    if (!tokenId) return;

    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('google_calendar_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) throw error;

      toast.success('Integração com Google Agenda removida.');
      setEmail(null);
      setTokenId(null);
    } catch (err: any) {
      toast.error('Erro ao desconectar: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Google Agenda"
        description="Sincronize seus agendamentos automaticamente entre o LeadPluz e a Google Agenda."
      />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : email ? (
          // Connected State
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle2Icon className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-bold text-foreground">Sua agenda está conectada!</h3>
                <p className="text-xs text-muted-foreground">
                  Compromissos criados no LeadPluz serão enviados para sua conta, e novos compromissos criados na Google Agenda serão importados.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1 text-xs font-bold text-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Conectado a: <span className="text-primary">{email}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={handleConnect}
                className="text-xs font-bold h-9 rounded-lg border-border"
              >
                Alterar conta / Reconectar
              </Button>
              <Button
                variant="destructive"
                disabled={disconnecting}
                onClick={() => setShowDisconnectConfirm(true)}
                className="text-xs font-bold h-9 rounded-lg gap-1.5"
              >
                {disconnecting ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <TrashIcon className="h-3.5 w-3.5" />
                )}
                Desconectar integração
              </Button>
            </div>
          </div>
        ) : (
          // Disconnected State
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <CalendarIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-bold text-foreground">Integração Desconectada</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Conecte sua agenda para enviar seus compromissos e procedimentos cadastrados diretamente ao seu celular e receber atualizações bidirecionais automáticas.
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <Button
                onClick={handleConnect}
                className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold h-10 px-5 rounded-lg"
              >
                Conectar Google Agenda
              </Button>
            </div>
          </div>
        )}
      </div>

      {email && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-800">Nota sobre Sincronização</h4>
            <p className="text-[11px] text-amber-700/90 leading-relaxed">
              O LeadPluz realiza a sincronização instantânea de saída (do sistema para o Google). A sincronização inversa (do Google para o sistema) ocorre via webhook de notificações do Google ou através do processo de sincronização periódica programada.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDisconnectConfirm}
        onOpenChange={setShowDisconnectConfirm}
        title="Desconectar Google Agenda"
        description="Deseja realmente desconectar a integração com o Google Agenda? Seus agendamentos não serão mais sincronizados."
        confirmLabel="Desconectar"
        onConfirm={handleDisconnect}
      />
    </div>
  );
}
