'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Gift,
  UserPlus,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  MessageSquareCode,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  FileText,
  DollarSign,
  HeartHandshake,
  Loader2,
  Settings,
  HelpCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { PersonalizarModal } from '@/components/comunicacao/personalizar-modal';
import { TemplateManager } from '@/components/settings/template-manager';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface SystemTemplateRow {
  event_type: string;
  is_active: boolean;
  provider_type: 'meta' | 'uazapi';
}

interface CardTemplate {
  type: string;
  name: string;
  description: string;
  icon: any;
  color: string;
}

const EVENT_TEMPLATES: CardTemplate[] = [
  {
    type: 'aniversario',
    name: 'Aniversariantes',
    description: 'Parabenize e ofereça mimos aos seus pacientes no dia do aniversário.',
    icon: Gift,
    color: 'from-pink-500/20 to-rose-500/20 text-rose-500 border-rose-500/30'
  },
  {
    type: 'boas_vindas',
    name: 'Boas-vindas',
    description: 'Deseje boas-vindas logo após o cadastro do paciente na ferramenta.',
    icon: UserPlus,
    color: 'from-blue-500/20 to-indigo-500/20 text-indigo-500 border-indigo-500/30'
  },
  {
    type: 'lembrete_agendamento',
    name: 'Lembrete de Consulta',
    description: 'Avise o paciente sobre o dia/hora do procedimento para diminuir faltas.',
    icon: CalendarDays,
    color: 'from-violet-500/20 to-purple-500/20 text-purple-500 border-purple-500/30'
  },
  {
    type: 'confirmacao_agendamento',
    name: 'Confirmação de Consulta',
    description: 'Solicite a confirmação da presença com antecedência programada.',
    icon: CalendarClock,
    color: 'from-amber-500/20 to-orange-500/20 text-orange-500 border-orange-500/30'
  },
  {
    type: 'agendamento_criado',
    name: 'Agendamento Criado',
    description: 'Notifique o paciente no instante em que sua consulta for marcada.',
    icon: CalendarCheck,
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-500 border-emerald-500/30'
  },
  {
    type: 'agendamento_alterado',
    name: 'Agendamento Alterado',
    description: 'Avise se a data, hora ou profissional da consulta sofrer alterações.',
    icon: Settings,
    color: 'from-cyan-500/20 to-sky-500/20 text-sky-500 border-sky-500/30'
  },
  {
    type: 'agendamento_confirmado',
    name: 'Agendamento Confirmado',
    description: 'Envie um lembrete positivo quando o agendamento for confirmado pelo time.',
    icon: CheckCircle,
    color: 'from-green-500/20 to-emerald-500/20 text-green-500 border-green-500/30'
  },
  {
    type: 'agendamento_cancelado',
    name: 'Agendamento Cancelado',
    description: 'Notifique o paciente quando a consulta for desmarcada no painel.',
    icon: CalendarX,
    color: 'from-red-500/20 to-rose-500/20 text-red-500 border-red-500/30'
  },
  {
    type: 'pre_atendimento',
    name: 'Pré-atendimento',
    description: 'Envie formulários ou instruções que devem ser preenchidas antes do atendimento.',
    icon: FileSpreadsheet,
    color: 'from-yellow-500/20 to-amber-500/20 text-amber-500 border-amber-500/30'
  },
  {
    type: 'lembrete_retorno',
    name: 'Lembrete de Retorno',
    description: 'Gere novos retornos enviando mensagens automáticas após o tempo do procedimento.',
    icon: HeartHandshake,
    color: 'from-fuchsia-500/20 to-pink-500/20 text-fuchsia-500 border-fuchsia-500/30'
  },
  {
    type: 'orcamento',
    name: 'Envio de Orçamento',
    description: 'Envie propostas, formas de pagamento e orçamentos gerados.',
    icon: DollarSign,
    color: 'from-indigo-500/20 to-cyan-500/20 text-cyan-500 border-cyan-500/30'
  },
  {
    type: 'lembrete_fatura',
    name: 'Lembrete de Fatura',
    description: 'Previna inadimplência enviando alertas automáticos sobre vencimento de parcelas.',
    icon: FileText,
    color: 'from-slate-500/20 to-neutral-500/20 text-neutral-400 border-neutral-700/30'
  },
  {
    type: 'pos_procedimento',
    name: 'Pós-procedimento',
    description: 'Envie as orientações necessárias e cuidados logo após o término da sessão.',
    icon: MessageSquareCode,
    color: 'from-rose-500/20 to-orange-500/20 text-orange-500 border-orange-500/30'
  }
];

export default function ModelosPage() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dbTemplates, setDbTemplates] = useState<SystemTemplateRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_message_templates')
        .select('event_type, is_active, provider_type');

      if (error) throw error;
      setDbTemplates(data || []);
    } catch (err) {
      console.error('Error fetching system templates status:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    if (accountId) {
      fetchTemplates();
    }
  }, [accountId, fetchTemplates]);

  // Resolves the status and channel for each card template
  const getTemplateStatus = (type: string) => {
    const matched = dbTemplates.filter((t) => t.event_type === type);
    const activeOne = matched.find((t) => t.is_active);
    
    if (matched.length === 0) {
      return { active: false, channel: 'Nenhum' };
    }

    if (activeOne) {
      return {
        active: true,
        channel: activeOne.provider_type === 'uazapi' ? 'WhatsApp Não Oficial' : 'WhatsApp Oficial'
      };
    }

    return { active: false, channel: 'Nenhum' };
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-neutral-900">Gerenciador de Modelos</h1>
        <p className="text-sm text-neutral-500">Configure os templates de disparos e lembretes automáticos do WhatsApp.</p>
      </div>

      <Tabs defaultValue="system" className="space-y-6">
        <TabsList className="bg-muted border border-border/60 p-0.5 rounded-xl w-fit flex gap-0.5">
          <TabsTrigger value="system" className="text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg cursor-pointer">
            Gatilhos do Sistema
          </TabsTrigger>
          <TabsTrigger value="campaign" className="text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg cursor-pointer">
            Templates de Campanha (Meta)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 min-h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {EVENT_TEMPLATES.map((item) => {
                const status = getTemplateStatus(item.type);
                const Icon = item.icon;

                return (
                  <div
                    key={item.type}
                    className="group relative flex flex-col justify-between rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs hover:shadow-md hover:border-neutral-300 transition-all"
                  >
                    <div>
                      {/* Top Header Card */}
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-2xl bg-gradient-to-br ${item.color} border`}>
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          {status.active ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/40 px-2.5 py-0.5 text-[9px] font-black text-emerald-700">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-neutral-100 border border-neutral-200/50 px-2.5 py-0.5 text-[9px] font-black text-neutral-500">
                              Inativo
                            </span>
                          )}
                          {status.active && (
                            <span className="text-[9px] font-bold text-neutral-400">
                              {status.channel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Body Content */}
                      <h3 className="text-sm font-black text-neutral-800 tracking-tight group-hover:text-blue-600 transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-xs text-neutral-500 leading-relaxed mt-1.5 min-h-[48px]">
                        {item.description}
                      </p>
                    </div>

                    {/* Footer Action */}
                    <div className="border-t border-neutral-100 pt-4 mt-4 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-neutral-400">Gatilho Automático</span>
                      <button
                        onClick={() => setSelectedTemplate(item)}
                        className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        Personalizar
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="campaign" className="rounded-3xl border border-border bg-card p-6 shadow-xs">
          <TemplateManager />
        </TabsContent>
      </Tabs>

      {/* Modal Integration */}
      {selectedTemplate && accountId && (
        <PersonalizarModal
          isOpen={!!selectedTemplate}
          onClose={() => {
            setSelectedTemplate(null);
            fetchTemplates(); // reload statuses
          }}
          eventType={selectedTemplate.type}
          eventName={selectedTemplate.name}
          eventDescription={selectedTemplate.description}
          accountId={accountId}
        />
      )}
    </div>
  );
}
