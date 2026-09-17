'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'desconhecido';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it — so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('desconhecido');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Which provider tab is active. Defaults to Uazapi — this app runs
  // its broadcasts through the unofficial Uazapi API, not Meta's
  // official Cloud API, so that's the path most accounts need.
  const [providerType, setProviderType] = useState<'uazapi' | 'meta'>('uazapi');
  const [uazapiInstanceName, setUazapiInstanceName] = useState('');
  const [uazapiPhoneNumber, setUazapiPhoneNumber] = useState('');
  const [uazapiToken, setUazapiToken] = useState('');
  const [uazapiBaseUrl, setUazapiBaseUrl] = useState('https://customix.uazapi.com');
  const [showUazapiToken, setShowUazapiToken] = useState(false);
  const [savingUazapi, setSavingUazapi] = useState(false);
  const [uazapiTokenEdited, setUazapiTokenEdited] = useState(false);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event — that's the
  // multi-number bug that prompted this work.
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      // Load form values from Supabase (shows what's in DB).
      // Switched from `user_id` (which would only match the row's
      // original author) to `account_id` so every member of the
      // account sees the same saved configuration. UNIQUE(account_id)
      // on the table guarantees the .maybeSingle() return type
      // remains accurate.
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);

        setProviderType(data.provider_type === 'meta' ? 'meta' : 'uazapi');
        setUazapiInstanceName(data.uazapi_instance_name || '');
        setUazapiPhoneNumber(data.phone_number_id || '');
        setUazapiBaseUrl(data.uazapi_base_url || 'https://customix.uazapi.com');
        setUazapiToken(data.uazapi_token ? MASKED_TOKEN : '');
        setUazapiTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      }
      // Clear any stale probe result when reloading the row.
      setRegistrationProbe(null);

      // Then verify health via the API (decrypts token + pings Meta)
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Falha ao carregar a configuração do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('O ID do número de telefone é obrigatório');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('O token de acesso é obrigatório na configuração inicial');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional — only sent when the user filled it in. The server
        // requires it on first save or when changing numbers; for a
        // simple token rotation, leaving it blank skips re-register.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config — reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        toast.error('Informe o token de acesso novamente para salvar as alterações');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a configuração');
        setSaving(false);
        return;
      }

      // The route now returns a structured outcome:
      //   * registered=true   → number is live, events will flow
      //   * registered=false  → credentials saved but /register
      //                         failed; UI shows the specific error
      //                         and a retry path. registration_error
      //                         is human-readable from Meta.
      if (data.registered === false && data.registration_error) {
        toast.error(
          `Salvo, mas a Meta não conseguiu registrar o número: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        // Credentials saved + verified, but /register was skipped
        // because no PIN was supplied (e.g. a Meta test number).
        // Don't claim the number is "Live" — point at the
        // Registration status banner instead.
        toast.success(
          'Credenciais salvas e verificadas. O registro de recebimento foi pulado (sem PIN) — veja o status de registro abaixo.',
          { duration: 10000 },
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Ativo — ${data.phone_info.verified_name} já pode receber eventos.`
            : 'WhatsApp conectado. Os eventos devem começar a chegar em até um minuto.',
        );
        // Clear the PIN so subsequent saves don't accidentally
        // re-register (which would void the active subscription if
        // the PIN became stale).
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Falha ao salvar a configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUazapi() {
    if (!uazapiInstanceName.trim()) {
      toast.error('Informe o nome da instância');
      return;
    }
    if (!uazapiPhoneNumber.trim()) {
      toast.error('Informe o número de telefone');
      return;
    }
    if (!config && (!uazapiToken.trim() || !uazapiTokenEdited)) {
      toast.error('Informe o token da instância');
      return;
    }
    if (uazapiTokenEdited === false && uazapiToken === MASKED_TOKEN) {
      // Existing config, token untouched — reuse what's already saved
      // by simply not sending uazapi_token; the route only overwrites
      // it when a value is present.
    } else if (uazapiTokenEdited && !uazapiToken.trim()) {
      toast.error('Informe o token da instância');
      return;
    }

    try {
      setSavingUazapi(true);

      const payload: Record<string, unknown> = {
        provider_type: 'uazapi',
        uazapi_instance_name: uazapiInstanceName.trim(),
        uazapi_base_url: uazapiBaseUrl.trim() || 'https://customix.uazapi.com',
        phone_number: uazapiPhoneNumber.replace(/\D/g, ''),
      };

      if (uazapiTokenEdited && uazapiToken.trim() && uazapiToken !== MASKED_TOKEN) {
        payload.uazapi_token = uazapiToken.trim();
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a instância');
        return;
      }

      if (data.connected) {
        toast.success('Instância conectada e pronta para disparos.', { duration: 8000 });
      } else {
        toast.error(
          `Não conectada. Status da Uazapi: "${data.state ?? 'desconhecido'}". Detalhes técnicos no console (F12).`,
          { duration: 8000 },
        );
        console.log('[Uazapi] Resposta crua do status:', data.uazapi_raw_status);
      }
      setUazapiTokenEdited(false);
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Uazapi save error:', err);
      toast.error('Falha ao salvar a instância');
    } finally {
      setSavingUazapi(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Conectado a ${payload.phone_info.verified_name}`
            : 'Conexão da API bem-sucedida'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'Falha na conexão da API');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Falha no teste de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Número totalmente configurado — a Meta está entregando eventos.');
      } else {
        toast.error(
          'O número não está totalmente registrado. Veja abaixo qual etapa falhou.',
          { duration: 8000 },
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Não foi possível acessar o endpoint de verificação.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current WhatsApp config so you can re-enter it. Continue?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao redefinir a configuração');
        return;
      }

      toast.success('Configuração limpa. Você já pode inserir novas credenciais.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Falha ao redefinir a configuração');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada');
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Conexão do WhatsApp"
          description="Conecte a API oficial da Meta ou uma instância Uazapi. Credenciais, webhook e passo a passo, tudo aqui."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Conexão do WhatsApp"
        description="Conecte a API oficial da Meta ou uma instância Uazapi. Credenciais, webhook e passo a passo, tudo aqui."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Main config form */}
      <div className="space-y-6">
        {/* Provider tabs */}
        <div className="flex gap-1.5 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          <button
            type="button"
            onClick={() => setProviderType('uazapi')}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
              (providerType === 'uazapi'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Uazapi
          </button>
          <button
            type="button"
            onClick={() => setProviderType('meta')}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
              (providerType === 'meta'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Meta (API oficial)
          </button>
        </div>

        {providerType === 'uazapi' && (
          <div className="space-y-6">
            <Alert className="bg-card border-border">
              <div className="flex items-center gap-2">
                {connectionStatus === 'connected' ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                <AlertTitle className="text-foreground mb-0">
                  {connectionStatus === 'connected' ? 'Instância conectada' : 'Instância não conectada'}
                </AlertTitle>
              </div>
              <AlertDescription className="text-muted-foreground">
                {connectionStatus === 'connected'
                  ? 'Essa instância está pronta para enviar e receber mensagens pelos disparos.'
                  : 'Preencha os dados da sua instância Uazapi abaixo para conectar o WhatsApp.'}
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Dados da instância Uazapi</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Informe os dados da instância que você já tem conectada na Uazapi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Nome da instância</Label>
                  <Input
                    placeholder="ex: clinica-marcelle"
                    value={uazapiInstanceName}
                    onChange={(e) => setUazapiInstanceName(e.target.value)}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Número de telefone</Label>
                  <Input
                    placeholder="ex: 5511999999999"
                    value={uazapiPhoneNumber}
                    onChange={(e) => setUazapiPhoneNumber(e.target.value)}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Com DDI e DDD, só números — ex: 5511999999999.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Token da instância</Label>
                  <div className="relative">
                    <Input
                      type={showUazapiToken ? 'text' : 'password'}
                      placeholder="Cole aqui o token da sua instância na Uazapi"
                      value={uazapiToken}
                      onChange={(e) => {
                        setUazapiToken(e.target.value);
                        setUazapiTokenEdited(true);
                      }}
                      onFocus={() => {
                        if (uazapiToken === MASKED_TOKEN) {
                          setUazapiToken('');
                          setUazapiTokenEdited(true);
                        }
                      }}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUazapiToken(!showUazapiToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showUazapiToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {config && !uazapiTokenEdited && (
                    <p className="text-xs text-muted-foreground">
                      O token fica oculto por segurança. Informe-o novamente para atualizar.
                    </p>
                  )}
                </div>

                <Accordion>
                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline text-sm">
                      Avançado
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">URL do servidor Uazapi</Label>
                        <Input
                          value={uazapiBaseUrl}
                          onChange={(e) => setUazapiBaseUrl(e.target.value)}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                        />
                        <p className="text-xs text-muted-foreground">
                          Só mude isso se sua Uazapi estiver em um servidor próprio.
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleSaveUazapi}
                disabled={savingUazapi}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {savingUazapi ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar instância'
                )}
              </Button>
            </div>
          </div>
        )}

        {providerType === 'meta' && (
          <>
        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  O token salvo não pôde ser descriptografado
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Redefinindo...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      Redefinir configuração
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-card border-border">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-foreground mb-0">
              {connectionStatus === 'connected' ? 'Credenciais válidas' : 'Não conectado'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-muted-foreground">
            {connectionStatus === 'connected'
              ? 'Seu token de acesso autentica com a Meta. Veja o status de registro abaixo para saber se os webhooks estão realmente ativos.'
              : statusMessage ||
                'Configure suas credenciais da API da Meta abaixo para conectar sua conta do WhatsApp Business.'}
          </AlertDescription>
        </Alert>

        {/* Registration Status — the "is it actually live?" check.
            Credentials being valid is necessary but not sufficient;
            without a successful /register call the number won't
            receive inbound events. Surface this dimension separately
            so users don't trust a misleading green banner. */}
        {config && (
          <Alert
            className={
              isRegistered
                ? 'bg-emerald-950/30 border-emerald-700/50'
                : 'bg-amber-950/30 border-amber-700/50'
            }
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {isRegistered ? (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-400" />
                )}
                <AlertTitle
                  className={
                    'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                  }
                >
                  {isRegistered
                    ? 'Registrado — a Meta vai entregar eventos para o wacrm'
                    : 'Não registrado — a Meta não vai entregar eventos'}
                </AlertTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyRegistration}
                disabled={verifyingRegistration}
                className="border-border bg-transparent text-foreground hover:bg-muted h-7"
              >
                {verifyingRegistration ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                Verificar com a Meta
              </Button>
            </div>
            <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {isRegistered ? (
                <>
                  Inscrito desde{' '}
                  {config.registered_at
                    ? new Date(config.registered_at).toLocaleString()
                    : 'desconhecido'}
                  . Clique em <strong>Verificar com a Meta</strong> se os eventos
                  pararem de chegar.
                </>
              ) : lastRegistrationError ? (
                <>
                  Última tentativa falhou com:{' '}
                  <span className="text-red-300">
                    &quot;{lastRegistrationError}&quot;
                  </span>
                  . Informe (ou corrija) o PIN de verificação em duas etapas abaixo e clique em
                  Salvar configuração para tentar de novo.
                </>
              ) : (
                <>
                  Esse número foi salvo antes de existir o rastreamento de registro,
                  ou o registro foi pulado. Informe o PIN de verificação em duas etapas
                  abaixo e clique em Salvar configuração para inscrevê-lo.
                </>
              )}
            </AlertDescription>

            {registrationProbe && (
              <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                <p className="font-medium text-foreground">
                  Diagnóstico — última execução: {' '}
                  <span className={registrationProbe.live ? 'text-emerald-400' : 'text-amber-400'}>
                    {registrationProbe.live ? 'ativo' : 'inativo'}
                  </span>
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {Object.entries(registrationProbe.checks).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {v === true ? (
                        <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                      ) : v === false ? (
                        <XCircle className="size-3 text-red-400 shrink-0" />
                      ) : (
                        <span className="size-3 rounded-full border border-border shrink-0" />
                      )}
                      <code className="text-muted-foreground">{k}</code>
                    </li>
                  ))}
                </ul>
                {(registrationProbe.errors ?? []).length > 0 && (
                  <ul className="pt-1 space-y-0.5 text-red-300">
                    {registrationProbe.errors?.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Alert>
        )}

        {/* Credenciais da API */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Credenciais da API</CardTitle>
            <CardDescription className="text-muted-foreground">
              Informe as credenciais da API oficial do WhatsApp Business (Meta).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">ID do número de telefone</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">ID da conta do WhatsApp Business</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Token de acesso permanente</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Informe seu token de acesso"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-muted-foreground">
                  O token fica oculto por segurança. Informe-o novamente para atualizar a configuração.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Token de verificação do webhook</Label>
              <Input
                placeholder="Crie um token de verificação personalizado"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Uma string personalizada criada por você. Precisa ser igual ao token configurado nas definições de webhook da Meta.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">
                PIN de verificação em duas etapas
                <span className="ml-1 text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN de 6 dígitos do Gerenciador de WhatsApp da Meta"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Necessário apenas para ativar mensagens <strong className="text-muted-foreground">recebidas</strong>
                em um número de <strong className="text-muted-foreground">produção</strong>. Configure em{' '}
                <strong className="text-muted-foreground">
                  Meta Business Manager → Contas do WhatsApp → Números de
                  Telefone → Verificação em duas etapas
                </strong>
                , depois cole aqui para o wacrm conseguir inscrever o número —
                caso contrário a Meta encaminha os eventos recebidos para o último
                app que reivindicou o número (o sintoma que afeta números
                secundários numa WABA compartilhada).{' '}
                <strong className="text-muted-foreground">Números de teste da Meta</strong> não têm
                PIN e já vêm pré-registrados — deixe em branco para eles.
                Deixar em branco também mantém um registro existente
                sem alterações.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Configuração do webhook</CardTitle>
            <CardDescription className="text-muted-foreground">
              Use essa URL como callback do webhook no painel do app da Meta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-muted-foreground">URL de callback do webhook</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-muted border-border text-muted-foreground font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar configuração'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Testar conexão da API
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Redefinir configuração
                </>
              )}
            </Button>
          )}
        </div>
          </>
        )}
      </div>

      {/* Instruções de configuração Sidebar */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground text-base">Instruções de configuração</CardTitle>
            <CardDescription className="text-muted-foreground">
              Siga esses passos para conectar sua API do WhatsApp Business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    Criar um app na Meta
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Acesse <span className="text-primary">developers.facebook.com</span></li>
                    <li>Clique em &quot;My Apps&quot; e depois em &quot;Create App&quot;</li>
                    <li>Selecione &quot;Business&quot; como tipo de app</li>
                    <li>Preencha os detalhes do app e crie</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    Adicionar o produto WhatsApp
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>No painel do seu app, clique em &quot;Add Product&quot;</li>
                    <li>Encontre &quot;WhatsApp&quot; e clique em &quot;Set Up&quot;</li>
                    <li>Siga o assistente para vincular sua empresa</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    Get Credenciais da API
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Vá em WhatsApp &gt; API Setup</li>
                    <li>Copie o <strong className="text-foreground">ID do número de telefone</strong></li>
                    <li>Copie o <strong className="text-foreground">ID da conta do WhatsApp Business</strong></li>
                    <li>Gere um <strong className="text-foreground">Token de acesso permanente</strong> em Business Settings &gt; System Users</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                    Configurar webhooks
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Vá em WhatsApp &gt; Configuration</li>
                    <li>Clique em &quot;Edit&quot; na seção Webhook</li>
                    <li>Cole a <strong className="text-foreground">URL de callback do webhook</strong> definida acima</li>
                    <li>Informe o mesmo <strong className="text-foreground">Verify Token</strong> que você definiu aqui</li>
                    <li>Inscreva-se no campo de webhook &quot;messages&quot;</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Documentação da API do WhatsApp da Meta
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </section>
  );
}
