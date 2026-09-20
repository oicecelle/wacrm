'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X,
  Plus,
  Trash2,
  Save,
  MessageSquare,
  Smartphone,
  Info,
  Clock,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface PersonalizarModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: string;
  eventName: string;
  eventDescription: string;
  accountId: string;
}

interface TemplateAutomation {
  id?: string;
  event_type: string;
  provider_type: 'meta' | 'uazapi';
  name: string;
  message_text: string;
  is_active: boolean;
  trigger_config: {
    type?: 'relative' | 'absolute';
    offset_value?: number; // e.g. 2, 24
    offset_unit?: 'hours' | 'days';
    send_time?: string; // e.g. "09:00"
  };
  meta_template_name?: string;
  meta_template_language?: string;
}

const VARIABLE_GUIDES = {
  aniversario: ['{{paciente}}', '{{clinica}}'],
  boas_vindas: ['{{paciente}}', '{{clinica}}'],
  lembrete_agendamento: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}', '{{link}}'],
  lembrete_retorno: ['{{paciente}}', '{{procedimento}}', '{{clinica}}', '{{link}}'],
  agendamento_criado: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}'],
  agendamento_alterado: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}'],
  confirmacao_agendamento: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}', '{{link}}'],
  agendamento_confirmado: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}'],
  agendamento_cancelado: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}'],
  pre_atendimento: ['{{paciente}}', '{{data}}', '{{hora}}', '{{procedimento}}', '{{clinica}}', '{{link}}'],
  orcamento: ['{{paciente}}', '{{valor}}', '{{clinica}}', '{{link}}'],
  lembrete_fatura: ['{{paciente}}', '{{valor}}', '{{vencimento}}', '{{clinica}}', '{{link}}'],
  pos_procedimento: ['{{paciente}}', '{{procedimento}}', '{{clinica}}', '{{link}}'],
};

const DEFAULT_PREVIEW_VALUES = {
  '{{paciente}}': 'Maria Oliveira',
  '{{data}}': '28/06/2026',
  '{{hora}}': '14:30',
  '{{procedimento}}': 'Aplicação de Botox',
  '{{clinica}}': 'Dra. Ellen Barros',
  '{{valor}}': 'R$ 350,00',
  '{{vencimento}}': '30/06/2026',
  '{{link}}': 'https://pluz.tech/c/8j2a9',
};

export function PersonalizarModal({
  isOpen,
  onClose,
  eventType,
  eventName,
  eventDescription,
  accountId,
}: PersonalizarModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [automations, setAutomations] = useState<TemplateAutomation[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Variables list for the current event
  const variables = VARIABLE_GUIDES[eventType as keyof typeof VARIABLE_GUIDES] || ['{{paciente}}', '{{clinica}}'];

  useEffect(() => {
    if (!isOpen || !accountId) return;

    const loadAutomations = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_message_templates')
          .select('*')
          .eq('account_id', accountId)
          .eq('event_type', eventType)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setAutomations(data.map((item: any) => ({
            id: item.id,
            event_type: item.event_type,
            provider_type: item.provider_type,
            name: item.name,
            message_text: item.message_text,
            is_active: item.is_active,
            trigger_config: item.trigger_config || {},
            meta_template_name: item.meta_template_name || '',
            meta_template_language: item.meta_template_language || 'pt_BR',
          })));
        } else {
          // Initialize with a default automation
          setAutomations([{
            event_type: eventType,
            provider_type: 'uazapi',
            name: 'Automação Principal',
            message_text: `Olá {{paciente}}, passando para lembrar do seu compromisso na clínica {{clinica}}.`,
            is_active: true,
            trigger_config: {
              type: 'relative',
              offset_value: 24,
              offset_unit: 'hours',
              send_time: '09:00',
            },
            meta_template_name: '',
            meta_template_language: 'pt_BR',
          }]);
        }
        setActiveIndex(0);
      } catch (err: any) {
        console.error('Error loading templates:', err);
        toast.error('Erro ao carregar configurações de mensagens.');
      } finally {
        setLoading(false);
      }
    };

    loadAutomations();
  }, [isOpen, eventType, accountId, supabase]);

  const handleSave = async () => {
    if (!accountId) return;

    // Validation
    for (const aut of automations) {
      if (!aut.name.trim()) {
        toast.error('Dê um nome para todas as automações.');
        return;
      }
      if (!aut.message_text.trim()) {
        toast.error('Insira o texto da mensagem.');
        return;
      }
      if (aut.provider_type === 'meta' && !aut.meta_template_name?.trim()) {
        toast.error('Informe o nome do template da Meta.');
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Delete ones that were deleted if we implemented a deletion list,
      // but for simplicity, we will upsert current and let the user delete single ones.
      // To perform a robust sync, we will fetch what is currently in DB, and delete whatever ID is missing from our list.
      const { data: dbItems } = await supabase
        .from('system_message_templates')
        .select('id')
        .eq('account_id', accountId)
        .eq('event_type', eventType);

      if (dbItems) {
        const currentIds = automations.map(a => a.id).filter(Boolean);
        const toDelete = dbItems.filter(item => !currentIds.includes(item.id)).map(item => item.id);

        if (toDelete.length > 0) {
          await supabase
            .from('system_message_templates')
            .delete()
            .in('id', toDelete);
        }
      }

      // 2. Upsert current
      for (const aut of automations) {
        const payload: any = {
          account_id: accountId,
          event_type: aut.event_type,
          provider_type: aut.provider_type,
          name: aut.name.trim(),
          message_text: aut.message_text,
          is_active: aut.is_active,
          trigger_config: aut.trigger_config,
          meta_template_name: aut.meta_template_name || null,
          meta_template_language: aut.meta_template_language || 'pt_BR',
          updated_at: new Date().toISOString()
        };

        if (aut.id) {
          const { error } = await supabase
            .from('system_message_templates')
            .update(payload)
            .eq('id', aut.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('system_message_templates')
            .insert(payload);
          if (error) throw error;
        }
      }

      toast.success('Configurações salvas com sucesso!');
      onClose();
    } catch (err: any) {
      console.error('Error saving templates:', err);
      toast.error('Erro ao salvar as automações.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAutomation = () => {
    setAutomations([...automations, {
      event_type: eventType,
      provider_type: 'uazapi',
      name: `Nova Automação ${automations.length + 1}`,
      message_text: 'Nova mensagem...',
      is_active: true,
      trigger_config: {
        type: 'relative',
        offset_value: 2,
        offset_unit: 'hours',
        send_time: '09:00',
      },
      meta_template_name: '',
      meta_template_language: 'pt_BR',
    }]);
    setActiveIndex(automations.length);
  };

  const handleRemoveAutomation = (index: number) => {
    if (automations.length === 1) {
      toast.error('Você precisa manter pelo menos uma configuração de disparo.');
      return;
    }
    const newAut = automations.filter((_, idx) => idx !== index);
    setAutomations(newAut);
    setActiveIndex(Math.max(0, index - 1));
  };

  const updateActiveAut = (fields: Partial<TemplateAutomation>) => {
    const updated = [...automations];
    updated[activeIndex] = { ...updated[activeIndex], ...fields };
    setAutomations(updated);
  };

  const updateActiveTriggerConfig = (fields: any) => {
    const updated = [...automations];
    updated[activeIndex] = {
      ...updated[activeIndex],
      trigger_config: { ...updated[activeIndex].trigger_config, ...fields }
    };
    setAutomations(updated);
  };

  const insertVariable = (variable: string) => {
    const active = automations[activeIndex];
    if (!active) return;
    updateActiveAut({
      message_text: active.message_text + ' ' + variable
    });
  };

  // Compile preview text substituting variables
  const getPreviewText = () => {
    const active = automations[activeIndex];
    if (!active) return '';
    let text = active.message_text;
    Object.entries(DEFAULT_PREVIEW_VALUES).forEach(([key, value]) => {
      text = text.replaceAll(key, value);
    });
    return text;
  };

  if (!isOpen) return null;

  const activeAutomation = automations[activeIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-left">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh] md:h-[80vh] animate-in fade-in-50 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h2 className="text-lg font-black text-white">{eventName}</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1">{eventDescription}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-xs font-semibold text-neutral-400">Carregando automações...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Left side settings editor */}
            <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 border-r border-neutral-800 bg-neutral-900">
              
              {/* Tab Selector for multiple automations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Regras de Disparo</span>
                  <Button
                    onClick={handleAddAutomation}
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] border-neutral-700 hover:bg-neutral-800 text-white font-extrabold gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Novo Disparo
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {automations.map((aut, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIndex(idx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                        activeIndex === idx
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                          : 'bg-neutral-800 border-neutral-700/50 text-neutral-300 hover:border-neutral-600'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${aut.is_active ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                      <span>{aut.name}</span>
                      {automations.length > 1 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAutomation(idx);
                          }}
                          className="hover:text-red-300 text-neutral-400 text-[10px]"
                        >
                          ✕
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeAutomation && (
                <div className="space-y-4 pt-2 border-t border-neutral-800 animate-in fade-in duration-200">
                  {/* Basic Automation Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-neutral-400">Nome do Disparo</Label>
                      <Input
                        value={activeAutomation.name}
                        onChange={(e) => updateActiveAut({ name: e.target.value })}
                        className="bg-neutral-800 border-neutral-700 text-white text-xs h-9 rounded-xl placeholder:text-neutral-500"
                        placeholder="Ex: Lembrete 24h antes"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-neutral-800/40 border border-neutral-800 px-4 rounded-xl mt-6">
                      <span className="text-xs font-bold text-neutral-200">Status Ativo</span>
                      <button
                        onClick={() => updateActiveAut({ is_active: !activeAutomation.is_active })}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          activeAutomation.is_active ? 'bg-blue-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                          activeAutomation.is_active ? 'translate-x-4' : ''
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Channel Selection */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-neutral-400">Canal de Envio</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'uazapi', title: 'WhatsApp Não Oficial (Uazapi)' },
                        { id: 'meta', title: 'WhatsApp Oficial (Meta)' }
                      ].map((prov) => {
                        const isSelected = activeAutomation.provider_type === prov.id;
                        return (
                          <button
                            key={prov.id}
                            type="button"
                            onClick={() => updateActiveAut({ provider_type: prov.id as any })}
                            className={`p-3 text-xs font-bold text-left rounded-xl border transition-all ${
                              isSelected
                                ? 'bg-neutral-800 border-blue-600 text-white shadow-xs'
                                : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{prov.title}</span>
                              {isSelected && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trigger Configuration depending on eventType */}
                  <div className="space-y-2.5 p-4 bg-neutral-950/20 border border-neutral-800/60 rounded-2xl">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs font-extrabold text-white">Configuração de Agendamento</span>
                    </div>

                    {/* Lembretes with offset options */}
                    {eventType.includes('lembrete') || eventType.includes('confirmacao') || eventType.includes('pre_atendimento') ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-3">
                          <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Fórmula de Tempo</Label>
                          <select
                            value={activeAutomation.trigger_config.type || 'relative'}
                            onChange={(e) => updateActiveTriggerConfig({ type: e.target.value })}
                            className="w-full bg-neutral-800 border border-neutral-700 text-white text-xs h-8 rounded-lg px-2 mt-1"
                          >
                            <option value="relative">Tempo relativo (Antes do agendamento)</option>
                            <option value="absolute">Tempo fixo (No dia anterior)</option>
                          </select>
                        </div>

                        {(activeAutomation.trigger_config.type || 'relative') === 'relative' ? (
                          <>
                            <div>
                              <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Quantidade</Label>
                              <Input
                                type="number"
                                value={activeAutomation.trigger_config.offset_value ?? 24}
                                onChange={(e) => updateActiveTriggerConfig({ offset_value: parseInt(e.target.value) || 0 })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-xs h-8 mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Unidade</Label>
                              <select
                                value={activeAutomation.trigger_config.offset_unit || 'hours'}
                                onChange={(e) => updateActiveTriggerConfig({ offset_unit: e.target.value })}
                                className="w-full bg-neutral-800 border border-neutral-700 text-white text-xs h-8 rounded-lg px-2 mt-1"
                              >
                                <option value="hours">Horas antes</option>
                                <option value="days">Dias antes</option>
                              </select>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-3">
                            <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Horário de Envio (Fixo)</Label>
                            <Input
                              type="time"
                              value={activeAutomation.trigger_config.send_time || '09:00'}
                              onChange={(e) => updateActiveTriggerConfig({ send_time: e.target.value })}
                              className="bg-neutral-800 border border-neutral-700 text-white text-xs h-8 mt-1 max-w-[120px]"
                            />
                            <p className="text-[10px] text-neutral-500 mt-1">O disparo será feito pontualmente às {activeAutomation.trigger_config.send_time} do dia anterior.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Aniversário or Boas vindas - Fixo Time
                      <div>
                        <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Horário de Envio</Label>
                        <Input
                          type="time"
                          value={activeAutomation.trigger_config.send_time || '09:00'}
                          onChange={(e) => updateActiveTriggerConfig({ send_time: e.target.value })}
                          className="bg-neutral-800 border border-neutral-700 text-white text-xs h-8 mt-1 max-w-[120px]"
                        />
                        <p className="text-[10px] text-neutral-500 mt-1">Disparo agendado no fuso horário local configurado na clínica.</p>
                      </div>
                    )}
                  </div>

                  {/* Meta Template specific fields */}
                  {activeAutomation.provider_type === 'meta' && (
                    <div className="space-y-3 p-4 border border-blue-900/40 bg-blue-950/10 rounded-2xl animate-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center gap-1">
                        <Info className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-200">Configuração da API Meta</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-neutral-300">Nome do Modelo (Meta ID)</Label>
                          <Input
                            value={activeAutomation.meta_template_name}
                            onChange={(e) => updateActiveAut({ meta_template_name: e.target.value })}
                            placeholder="Ex: lembrete_consulta"
                            className="bg-neutral-850 border-neutral-750 text-white text-xs h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-neutral-300">Idioma do Modelo</Label>
                          <Input
                            value={activeAutomation.meta_template_language}
                            onChange={(e) => updateActiveAut({ meta_template_language: e.target.value })}
                            placeholder="pt_BR"
                            className="bg-neutral-850 border-neutral-750 text-white text-xs h-8"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-400/80 leading-normal">
                        Para a Meta API, o texto abaixo serve como o fallback e preview. A mensagem entregue usará o layout aprovado no Meta Manager.
                      </p>
                    </div>
                  )}

                  {/* Message Text Editor */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-neutral-400">Texto do Disparo</Label>
                    <Textarea
                      value={activeAutomation.message_text}
                      onChange={(e) => updateActiveAut({ message_text: e.target.value })}
                      rows={5}
                      className="bg-neutral-800 border-neutral-700 text-white text-xs rounded-xl focus:ring-blue-500 placeholder:text-neutral-600 resize-none leading-relaxed"
                      placeholder="Escreva a mensagem..."
                    />
                    
                    {/* Variable Guide buttons */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider">Variáveis Disponíveis (Clique para inserir)</span>
                      <div className="flex flex-wrap gap-1.5">
                        {variables.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable(v)}
                            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700/60 hover:bg-neutral-750 hover:border-neutral-600 text-neutral-300 text-[10px] font-mono transition-colors"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Right side smartphone mockup preview */}
            <div className="w-full md:w-[360px] p-6 bg-neutral-950 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-neutral-800 overflow-y-auto">
              
              <div className="flex flex-col items-center max-w-[280px]">
                <div className="flex items-center gap-1.5 text-neutral-400 mb-4">
                  <Smartphone className="h-4 w-4" />
                  <span className="text-xs font-bold">Visualização no WhatsApp</span>
                </div>

                {/* Smartphone Device Mockup */}
                <div className="relative border-4 border-neutral-800 rounded-[36px] bg-neutral-900 w-[260px] h-[480px] overflow-hidden flex flex-col shadow-2xl">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-neutral-800 rounded-b-xl z-20" />

                  {/* StatusBar */}
                  <div className="h-6 bg-neutral-950 flex items-center justify-between px-5 text-[8px] font-bold text-white/80 select-none z-10 shrink-0">
                    <span>09:41</span>
                    <div className="flex items-center gap-1">
                      <span>LTE</span>
                      <div className="h-2 w-4 border border-white/80 rounded-sm p-[1px] flex"><span className="bg-white/80 h-full w-2.5 rounded-2xs" /></div>
                    </div>
                  </div>

                  {/* Chat Header */}
                  <div className="bg-neutral-800/80 border-b border-neutral-800 p-2.5 flex items-center gap-1.5 shrink-0 select-none">
                    <div className="h-6 w-6 rounded-full bg-blue-600/30 text-[9px] flex items-center justify-center text-blue-400 font-extrabold border border-blue-500/20">
                      LP
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white tracking-tight">LeadPluz</p>
                      <p className="text-[7px] text-emerald-400 font-semibold leading-none mt-0.5">Online</p>
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="flex-1 bg-[url('/chat-bg-dark.png')] bg-cover p-3 flex flex-col justify-end space-y-2 overflow-y-auto select-none">
                    
                    {/* Message bubble */}
                    <div className="bg-neutral-850 border border-neutral-750 text-neutral-100 p-3 rounded-2xl rounded-tr-none max-w-[210px] text-[10px] leading-relaxed shadow-md self-end text-left break-words">
                      <p className="whitespace-pre-wrap">{getPreviewText() || 'Digite seu texto...'}</p>
                      <span className="text-[7px] text-neutral-500 font-bold block text-right mt-1.5">09:41 ✓✓</span>
                    </div>

                  </div>

                </div>
              </div>

            </div>

          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-end gap-3 shrink-0">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-neutral-700 hover:bg-neutral-850 text-neutral-300 font-bold h-10 px-4 text-xs rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold h-10 px-5 text-xs rounded-xl gap-1 shadow-lg shadow-blue-500/10"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
