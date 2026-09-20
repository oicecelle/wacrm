import type {
  AutomationStepConfig,
  AutomationStepType,
  AutomationTriggerConfig,
  AutomationTriggerType,
} from '@/types'

export type TemplateSlug =
  | 'appointment_confirmation'
  | 'follow_up_reminder'
  | 'send_template_on_keyword'
  | 'mark_lead_hot'

export interface TemplateStepSeed {
  step_type: AutomationStepType
  step_config: AutomationStepConfig
  branch?: 'yes' | 'no' | null
  /** Index (within this seed list) of the Condition parent, if nested. */
  parent_index?: number | null
}

export interface AutomationTemplateDefinition {
  slug: TemplateSlug
  name: string
  description: string
  trigger_type: AutomationTriggerType
  trigger_config: AutomationTriggerConfig
  steps: TemplateStepSeed[]
}

export const AUTOMATION_TEMPLATES: Record<TemplateSlug, AutomationTemplateDefinition> = {
  appointment_confirmation: {
    slug: 'appointment_confirmation',
    name: 'Confirmar Agendamento',
    description: 'Quando o paciente responde "sim"/"confirmo", marca o próximo agendamento como confirmado sozinho.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['sim', 'confirmo', 'confirmado', 'confirmar'],
      match_type: 'contains',
      from: 'lead',
    },
    steps: [
      {
        step_type: 'update_appointment_status',
        step_config: { action: 'confirm', appointment_selector: 'next_upcoming' },
      },
    ],
  },
  follow_up_reminder: {
    slug: 'follow_up_reminder',
    name: 'Follow-up Sem Resposta',
    description: 'Espera 24h e só manda a mensagem de retomada se o contato ainda não tiver respondido.',
    trigger_type: 'new_message_received',
    trigger_config: {},
    steps: [
      {
        step_type: 'wait',
        step_config: { amount: 1, unit: 'days' },
      },
      {
        step_type: 'condition',
        step_config: { subject: 'no_reply_since' },
      },
      {
        step_type: 'send_message',
        step_config: {
          text: 'Oi! Passando aqui pra saber se ficou alguma dúvida. Estou à disposição! 😊',
        },
        branch: 'yes',
        parent_index: 1,
      },
    ],
  },
  send_template_on_keyword: {
    slug: 'send_template_on_keyword',
    name: 'Enviar Modelo por Palavra-Chave',
    description: 'Quando o paciente demonstra interesse (ex: "orçamento", "preço"), já envia um modelo automático — sem precisar disparar manualmente.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['orçamento', 'preço', 'valor'],
      match_type: 'contains',
      from: 'lead',
    },
    steps: [
      {
        step_type: 'send_template',
        step_config: { template_name: '', language: 'pt_BR' },
      },
    ],
  },
  mark_lead_hot: {
    slug: 'mark_lead_hot',
    name: 'Marcar Lead Como Quente',
    description: 'Quando o paciente usa palavras de urgência (ex: "quero agora", "hoje mesmo"), marca o negócio como quente no funil automaticamente.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['quero agora', 'hoje mesmo', 'urgente'],
      match_type: 'contains',
      from: 'lead',
    },
    steps: [
      {
        step_type: 'update_deal_field',
        step_config: { field: 'temperature', value: 'hot' },
      },
    ],
  },
}

export function getTemplate(slug: string): AutomationTemplateDefinition | null {
  return AUTOMATION_TEMPLATES[slug as TemplateSlug] ?? null
}
