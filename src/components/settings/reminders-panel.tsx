"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2Icon, SaveIcon, BellIcon, ClockIcon, HelpCircleIcon } from 'lucide-react';

export function RemindersPanel() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [hoursBefore, setHoursBefore] = useState<number[]>([24, 2]);
  const [messageTemplate, setMessageTemplate] = useState(
    'Olá {{nome}}! Lembramos que você tem uma consulta agendada para {{data}} às {{hora}}. Confirme respondendo "Confirmar" ou cancele respondendo "Cancelar".'
  );

  useEffect(() => {
    async function loadConfig() {
      if (!accountId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('appointment_reminders_config')
          .select('*')
          .eq('clinic_id', accountId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setConfigId(data.id);
          setIsActive(data.is_active);
          setHoursBefore(data.hours_before || [24, 2]);
          setMessageTemplate(data.message_template || '');
        } else {
          // Auto-insert default configuration for this clinic
          const { data: newConfig, error: insertErr } = await supabase
            .from('appointment_reminders_config')
            .insert({
              clinic_id: accountId,
              is_active: true,
              hours_before: [24, 2],
              message_template: 'Olá {{nome}}! Lembramos que você tem uma consulta agendada para {{data}} às {{hora}}. Confirme respondendo "Confirmar" ou cancele respondendo "Cancelar".'
            })
            .select('*')
            .single();

          if (insertErr) throw insertErr;

          if (newConfig) {
            setConfigId(newConfig.id);
            setIsActive(newConfig.is_active);
            setHoursBefore(newConfig.hours_before || [24, 2]);
            setMessageTemplate(newConfig.message_template || '');
          }
        }
      } catch (err: any) {
        console.error('Error loading reminders config:', err);
        toast.error('Erro ao carregar configurações de lembretes');
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [accountId, supabase]);

  const handleToggleMilestone = (hour: number) => {
    if (hoursBefore.includes(hour)) {
      setHoursBefore(hoursBefore.filter((h) => h !== hour));
    } else {
      setHoursBefore([...hoursBefore, hour].sort((a, b) => b - a));
    }
  };

  const handleSave = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointment_reminders_config')
        .upsert({
          id: configId || undefined,
          clinic_id: accountId,
          is_active: isActive,
          hours_before: hoursBefore,
          message_template: messageTemplate,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      toast.success('Configurações de lembretes salvas com sucesso!');
    } catch (err: any) {
      console.error('Error saving reminders config:', err);
      toast.error('Erro ao salvar configurações de lembretes');
    } finally {
      setSaving(false);
    }
  };

  // Preview interpolation helper
  const getPreviewText = () => {
    return messageTemplate
      .replace(/\{\{nome\}\}/g, 'Ana Souza')
      .replace(/\{\{data\}\}/g, new Date().toLocaleDateString('pt-BR'))
      .replace(/\{\{hora\}\}/g, '14:30')
      .replace(/\{\{procedimento\}\}/g, 'Aplicação de Botox');
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const standardMilestones = [48, 24, 6, 2, 1];

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <BellIcon className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Lembretes de Consulta automáticos</h2>
            <p className="text-xs text-muted-foreground">Configure o envio de notificações de confirmação para os pacientes via WhatsApp.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Lembretes Ativos</label>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isActive ? 'bg-blue-600' : 'bg-neutral-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Milestones config */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
            Intervalos de Envio (Milestones)
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Selecione com quantas horas de antecedência ao agendamento o lembrete de confirmação deve ser disparado.
          </p>
          <div className="flex flex-wrap gap-2">
            {standardMilestones.map((hours) => {
              const checked = hoursBefore.includes(hours);
              return (
                <button
                  key={hours}
                  type="button"
                  onClick={() => handleToggleMilestone(hours)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    checked
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-border bg-muted hover:border-neutral-500 text-muted-foreground'
                  }`}
                >
                  {hours >= 24 ? `${hours / 24} dia(s) antes` : `${hours} horas antes`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Message template input */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-foreground flex items-center gap-1.5">
            <HelpCircleIcon className="h-4 w-4 text-muted-foreground" />
            Template da Mensagem
          </label>
          <p className="text-xs text-muted-foreground">
            Escreva o texto do lembrete. Use variáveis: <code className="bg-muted px-1 py-0.5 rounded text-blue-500 text-[10px]">{"{{nome}}"}</code> para o nome do paciente, <code className="bg-muted px-1 py-0.5 rounded text-blue-500 text-[10px]">{"{{data}}"}</code>, <code className="bg-muted px-1 py-0.5 rounded text-blue-500 text-[10px]">{"{{hora}}"}</code> para data/hora e <code className="bg-muted px-1 py-0.5 rounded text-blue-500 text-[10px]">{"{{procedimento}}"}</code>.
          </p>
          <textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:border-blue-500 focus:outline-none"
            placeholder="Olá {{nome}}! ..."
          />
        </div>

        {/* Live Preview block */}
        <div className="rounded-lg border border-blue-900/40 bg-[#0B1528] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
              Pré-visualização do Lembrete
            </span>
          </div>
          <div className="text-xs text-neutral-300 leading-relaxed font-sans bg-black/35 p-3 rounded-md border border-neutral-800">
            {getPreviewText()}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Nota: Se o paciente responder "Confirmar" ou "Cancelar", o robô de IA do LeadPluz detectará e atualizará o status na agenda automaticamente.
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <SaveIcon className="h-4 w-4" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
