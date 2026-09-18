'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending, AudienceConfig } from '@/hooks/use-broadcast-sending';
import { Check, Loader2, Save } from 'lucide-react';

const steps = [
  { label: 'Modelo', key: 'template' },
  { label: 'Audiência', key: 'audience' },
  { label: 'Personalizar', key: 'personalize' },
  { label: 'Enviar', key: 'send' },
] as const;

export default function NewBroadcastPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft');
  const { accountId } = useAuth();
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [audience, setAudience] = useState<AudienceConfig>({ type: 'all' });
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});
  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [savingDraft, setSavingDraft] = useState(false);

  // Loading an existing draft (?draft=<id>) hydrates every field above
  // from the saved row, so "Salvar rascunho" is a real round-trip —
  // not just a one-way save with no way back in.
  const [loadingDraft, setLoadingDraft] = useState(!!draftId);

  useEffect(() => {
    if (!draftId || !accountId) return;
    let cancelled = false;
    (async () => {
      setLoadingDraft(true);
      try {
        const supabase = createClient();
        const { data: broadcast, error } = await supabase
          .from('broadcasts')
          .select('*')
          .eq('id', draftId)
          .eq('account_id', accountId)
          .maybeSingle();

        if (error || !broadcast) {
          toast.error('Rascunho não encontrado.');
          router.push('/broadcasts/historico');
          return;
        }
        if (cancelled) return;

        setName(broadcast.name ?? '');
        setVariables((broadcast.template_variables as typeof variables) ?? {});
        setAudience(
          (broadcast.audience_filter as AudienceConfig) ?? { type: 'all' },
        );
        setIntervalSeconds(broadcast.interval_seconds ?? 5);

        if (broadcast.scheduled_at) {
          // Local time components, not UTC — same fix applied to the
          // histórico edit modal; toISOString() here would show a
          // value shifted by the browser's UTC offset.
          const d = new Date(broadcast.scheduled_at);
          const pad = (n: number) => String(n).padStart(2, '0');
          setScheduledDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          setScheduledTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }

        if (broadcast.template_name) {
          const { data: tpl } = await supabase
            .from('message_templates')
            .select('*')
            .eq('account_id', accountId)
            .eq('name', broadcast.template_name)
            .eq('language', broadcast.template_language || 'pt_BR')
            .maybeSingle();
          if (!cancelled && tpl) setTemplate(tpl as MessageTemplate);
        }

        if (!cancelled) setCurrentStep(3); // land on review — everything's already filled in
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, accountId, router]);

  /** Combines the date+time pickers into an ISO string, or undefined
   *  ("send as soon as possible") when either is left blank. */
  const scheduledAtIso = useMemo(() => {
    if (!scheduledDate || !scheduledTime) return undefined;
    const local = new Date(`${scheduledDate}T${scheduledTime}:00`);
    return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
  }, [scheduledDate, scheduledTime]);

  async function handleSend() {
    if (!template) return;

    try {
      const broadcastId = await createAndSendBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        variables,
        scheduledAt: scheduledAtIso,
        intervalSeconds,
      });

      // A resumed draft becomes a real scheduled broadcast the moment
      // it's sent — the draft row itself would otherwise linger
      // alongside the new one as a dead duplicate.
      if (draftId) {
        const supabase = createClient();
        await supabase.from('broadcasts').delete().eq('id', draftId);
      }

      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      // Previously swallowed with console.error — the wizard would
      // just no-op, leaving the user confused. Surface the reason.
      const message = err instanceof Error ? err.message : 'Falha ao enviar o disparo';
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  /**
   * Writes (or updates, if resuming an existing one) a draft broadcast
   * row — no recipients, no sending. The full audience config,
   * variables, and schedule are persisted as-is so reopening the draft
   * via /broadcasts/new?draft=<id> restores the wizard exactly where
   * it was left.
   */
  const handleSaveDraft = useCallback(async () => {
    if (!template || !name.trim()) {
      toast.error('Dê um nome ao disparo antes de salvar o rascunho.');
      return;
    }
    setSavingDraft(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error('Sessão não autenticada.');
        return;
      }
      if (!accountId) {
        toast.error('Seu perfil não está vinculado a uma conta.');
        return;
      }

      const payload = {
        user_id: user.id,
        account_id: accountId,
        name: name.trim(),
        template_name: template.name,
        template_language: template.language ?? 'pt_BR',
        template_variables: variables,
        audience_filter: audience,
        scheduled_at: scheduledAtIso ?? null,
        interval_seconds: intervalSeconds,
        status: 'draft' as const,
      };

      const { error } = draftId
        ? await supabase.from('broadcasts').update(payload).eq('id', draftId).eq('account_id', accountId)
        : await supabase.from('broadcasts').insert({
            ...payload,
            total_recipients: 0,
            sent_count: 0,
            delivered_count: 0,
            read_count: 0,
            replied_count: 0,
            failed_count: 0,
          });

      if (error) {
        toast.error(`Falha ao salvar rascunho: ${error.message}`);
        return;
      }
      toast.success('Rascunho salvo — você pode continuar de onde parou pela aba Rascunhos no Histórico.');
      router.push('/broadcasts/historico');
    } finally {
      setSavingDraft(false);
    }
  }, [template, name, accountId, variables, audience, scheduledAtIso, intervalSeconds, draftId, router]);

  if (loadingDraft) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {draftId ? 'Continuar rascunho' : 'Novo Disparo'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie e envie uma mensagem em massa para seus contatos.
          </p>
        </div>
        {template && (
          <button
            onClick={handleSaveDraft}
            disabled={savingDraft || isProcessing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar rascunho
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'border border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{
            opacity: isProcessing ? 0.6 : 1,
            pointerEvents: isProcessing ? 'none' : 'auto',
          }}
        >
          {currentStep === 0 && (
            <Step1ChooseTemplate
              selectedTemplate={template}
              onSelect={setTemplate}
              onNext={() => setCurrentStep(1)}
              onBack={() => router.push('/broadcasts')}
            />
          )}
          {currentStep === 1 && (
            <Step2SelectAudience
              audience={audience}
              onUpdate={setAudience}
              template={template}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}
          {currentStep === 2 && template && (
            <Step3Personalize
              template={template}
              variables={variables}
              onUpdate={setVariables}
              audience={audience}
              onAudienceUpdate={setAudience}
              scheduledDate={scheduledDate}
              onScheduledDateChange={setScheduledDate}
              scheduledTime={scheduledTime}
              onScheduledTimeChange={setScheduledTime}
              intervalSeconds={intervalSeconds}
              onIntervalSecondsChange={setIntervalSeconds}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && template && (
            <Step4ScheduleSend
              name={name}
              onNameChange={setName}
              template={template}
              audience={audience}
              scheduledAtIso={scheduledAtIso}
              onSend={handleSend}
              onSaveDraft={handleSaveDraft}
              onBack={() => setCurrentStep(2)}
              isProcessing={isProcessing}
              progress={progress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
