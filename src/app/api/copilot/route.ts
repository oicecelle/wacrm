import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { validateStepsForActivation, validateTriggerForActivation } from "@/lib/automations/validate";
import { validateFlowForActivation } from "@/lib/flows/validate";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "mock-openai-key-for-build" });

const LIA_LABEL = "⚡ Criado pela LIA";
const LIA_UPDATED_LABEL = "⚡ Atualizado pela LIA";

// ─── Tool definitions ────────────────────────────────────────────────────────
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Busca contatos (leads ou clientes) pelo nome ou telefone.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome, parte do nome ou telefone" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description: "Cria um agendamento para um paciente/contato. Use quando a equipe confirmar explicitamente um agendamento.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do paciente" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Hora de início no formato HH:MM" },
          end_time: { type: "string", description: "Hora de fim no formato HH:MM (opcional, padrão +1h)" },
          procedure: { type: "string", description: "Tipo/nome do procedimento (opcional)" },
          notes: { type: "string", description: "Observações (opcional)" },
        },
        required: ["contact_name", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela um agendamento de um paciente.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do paciente" },
          appointment_id: { type: "string", description: "ID do agendamento (se conhecido)" },
        },
        required: ["contact_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_hot_leads",
      description: "Retorna os leads mais quentes (alta temperatura / score alto).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Número máximo de leads (padrão 5)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Cria uma nota/lembrete para um contato específico.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do contato" },
          reminder_text: { type: "string", description: "Texto do lembrete" },
        },
        required: ["contact_name", "reminder_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_status",
      description: "Atualiza o status, interesse ou temperatura de um lead no CRM.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string" },
          temperature: { type: "string", enum: ["hot", "warm", "cold"] },
          interest: { type: "string" },
          next_action: { type: "string" },
        },
        required: ["contact_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Retorna um resumo dos indicadores do dashboard (leads, agendamentos, faturamento).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_patient_financial_summary",
      description: "Retorna um resumo financeiro de um paciente (transações, saldo devedor, histórico de pagamentos).",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do paciente" },
        },
        required: ["contact_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_payment",
      description: "Registra um pagamento recebido de um paciente no caixa da clínica.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do paciente" },
          value: { type: "number", description: "Valor pago em R$" },
          method: { type: "string", description: "Método de pagamento: pix, cartao, dinheiro, boleto" },
          description: { type: "string", description: "Descrição do pagamento (ex: Consulta de Botox)" },
        },
        required: ["contact_name", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_services",
      description: "Lista os procedimentos e serviços cadastrados na clínica.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Filtro opcional por nome" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_automations",
      description: "Lista as automações (Regras de Automação) cadastradas na clínica, com status (ativa/pausada), gatilho e quantas vezes já rodaram.",
      parameters: {
        type: "object",
        properties: {
          only_active: { type: "boolean", description: "Se true, mostra só as ativas. Padrão: mostra todas." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_automation",
      description: "Ativa ou pausa uma automação existente pelo nome. Use quando o usuário pedir pra ligar/desligar/pausar/ativar uma automação.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) da automação" },
          active: { type: "boolean", description: "true para ativar, false para pausar" },
        },
        required: ["name", "active"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_automation_performance",
      description: "Mostra o desempenho de uma automação: quantas vezes rodou, quando foi a última vez, e erros recentes se houver.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) da automação" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_automation_details",
      description: "Mostra a estrutura completa de uma automação: gatilho e cada etapa (com um id interno pra cada uma), pra poder editar depois com update_automation_step. Use antes de qualquer edição.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) da automação" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_automation_step",
      description: "Edita uma etapa específica de uma automação já existente, usando o id retornado por get_automation_details. Só envie os campos que realmente mudam.",
      parameters: {
        type: "object",
        properties: {
          step_id: { type: "string", description: "O id da etapa, obtido antes via get_automation_details" },
          text: { type: "string", description: "Novo texto (etapas de enviar mensagem)" },
          wait_amount: { type: "number", description: "Nova quantidade de espera (etapa Aguardar)" },
          wait_unit: { type: "string", enum: ["minutes", "hours", "days"], description: "Nova unidade de espera (etapa Aguardar)" },
          tag_id: { type: "string", description: "Novo id de tag (etapa Adicionar tag) — use search_contacts ou peça pro usuário confirmar o nome exato se não tiver o id" },
          template_name: { type: "string", description: "Novo nome de modelo (etapas de enviar modelo)" },
        },
        required: ["step_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_automation",
      description: "Cria uma automação nova a partir da descrição do usuário. SEMPRE criada como rascunho (pausada) — nunca ativa sozinha. Explique o resumo do que vai criar e peça confirmação antes de chamar essa função.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome curto e descritivo pra automação" },
          trigger_type: {
            type: "string",
            enum: ["keyword_match", "new_message_received", "first_inbound_message", "tag_added"],
            description: "keyword_match: dispara quando uma palavra/frase aparece na mensagem. new_message_received: qualquer mensagem nova do contato. first_inbound_message: só a primeira mensagem já enviada por esse contato. tag_added: quando uma tag é adicionada ao contato.",
          },
          trigger_keywords: { type: "array", items: { type: "string" }, description: "Palavras/frases-gatilho (só pra trigger_type=keyword_match)" },
          trigger_tag_name: { type: "string", description: "Nome da tag que dispara (só pra trigger_type=tag_added)" },
          steps: {
            type: "array",
            description: "Sequência de etapas, na ordem em que devem rodar.",
            items: {
              type: "object",
              properties: {
                step_type: {
                  type: "string",
                  enum: ["send_message", "wait", "condition", "add_tag", "update_deal_field"],
                },
                text: { type: "string", description: "Texto da mensagem (send_message)" },
                wait_amount: { type: "number", description: "Quantidade de espera (wait)" },
                wait_unit: { type: "string", enum: ["minutes", "hours", "days"], description: "Unidade de espera (wait)" },
                condition_subject: {
                  type: "string",
                  enum: ["no_reply_since", "time_of_day", "tag_presence"],
                  description: "Assunto da condição (condition). no_reply_since = ainda sem resposta desde o início da automação.",
                },
                condition_operand: { type: "string", description: "Ex: para time_of_day, algo como '09:30-23:59'; para tag_presence, o nome da tag" },
                tag_name: { type: "string", description: "Nome da tag a adicionar (add_tag)" },
                deal_field: { type: "string", enum: ["source", "interest", "crm_stage", "temperature", "main_objection", "next_action"], description: "Campo do negócio a mudar (update_deal_field)" },
                deal_value: { type: "string", description: "Novo valor do campo (update_deal_field)" },
                yes_steps: { type: "array", items: { type: "object" }, description: "Etapas do ramo 'Sim', só se step_type=condition. Mesmo formato desta lista." },
                no_steps: { type: "array", items: { type: "object" }, description: "Etapas do ramo 'Não', só se step_type=condition. Mesmo formato desta lista." },
              },
              required: ["step_type"],
            },
          },
        },
        required: ["name", "trigger_type", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_flows",
      description: "Lista os fluxos de mensagens (conversas automáticas com botões/coleta de resposta) cadastrados, com status e quantas vezes já rodaram.",
      parameters: {
        type: "object",
        properties: {
          only_active: { type: "boolean", description: "Se true, mostra só os ativos. Padrão: mostra todos." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_flow",
      description: "Ativa ou pausa um fluxo de mensagens existente pelo nome.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) do fluxo" },
          active: { type: "boolean", description: "true para ativar, false para pausar (volta a rascunho)" },
        },
        required: ["name", "active"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flow_executions",
      description: "Mostra quantas pessoas passaram por um fluxo, quantas terminaram, e em qual etapa as pessoas mais travam (não concluíram).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) do fluxo" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flow_details",
      description: "Mostra todos os nós de um fluxo de mensagens (chave, tipo, resumo do conteúdo), pra poder editar depois com update_flow_node. Use antes de qualquer edição.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome (ou parte do nome) do fluxo" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_flow_node",
      description: "Edita um nó específico de um fluxo já existente, usando a chave (node_key) retornada por get_flow_details. Só envie os campos que realmente mudam.",
      parameters: {
        type: "object",
        properties: {
          flow_name: { type: "string", description: "Nome (ou parte do nome) do fluxo" },
          node_key: { type: "string", description: "A chave do nó, obtida antes via get_flow_details" },
          text: { type: "string", description: "Novo texto (nó de enviar mensagem)" },
          prompt_text: { type: "string", description: "Nova pergunta enviada ao paciente (nó de coletar resposta)" },
          crm_stage: { type: "string", description: "Nova etapa do CRM (nó de alterar status no CRM)" },
          note: { type: "string", description: "Nova observação interna (nó de transferir pra atendente)" },
        },
        required: ["flow_name", "node_key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_flow",
      description: "Cria um fluxo de mensagens (conversa automática) novo a partir da descrição do usuário. SEMPRE criado como rascunho — nunca ativa sozinho. Explique o resumo do que vai criar e peça confirmação antes de chamar essa função.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome curto e descritivo pro fluxo" },
          trigger_type: {
            type: "string",
            enum: ["keyword", "first_inbound_message", "manual"],
            description: "keyword: dispara quando uma palavra/frase aparece na mensagem. first_inbound_message: primeira mensagem já enviada por esse contato. manual: só dispara se alguém iniciar manualmente.",
          },
          trigger_keywords: { type: "array", items: { type: "string" }, description: "Palavras/frases-gatilho (só pra trigger_type=keyword)" },
          entry_node_key: { type: "string", description: "Qual node_key (dos nós abaixo) é o primeiro a rodar" },
          nodes: {
            type: "array",
            description: "Todos os nós do fluxo. Cada um precisa de um node_key único (ex: 'pergunta_nome', 'msg_boas_vindas') escolhido por você. Nós que avançam pro próximo (send_message, send_media, collect_input, set_tag, set_crm_status) precisam apontar pro próximo node_key em 'next_node_key'. O último nó do caminho deve apontar pra um nó do tipo 'end'.",
            items: {
              type: "object",
              properties: {
                node_key: { type: "string" },
                node_type: {
                  type: "string",
                  enum: ["send_message", "collect_input", "condition", "set_tag", "set_crm_status", "handoff", "end"],
                },
                text: { type: "string", description: "Texto da mensagem (send_message)" },
                next_node_key: { type: "string", description: "Próximo nó (send_message, collect_input, set_tag, set_crm_status)" },
                prompt_text: { type: "string", description: "Pergunta enviada ao paciente (collect_input)" },
                var_key: { type: "string", description: "Nome da variável pra guardar a resposta (collect_input), ex: 'nome_paciente'" },
                condition_subject: { type: "string", enum: ["var", "tag", "contact_field", "crm_status"], description: "Assunto da condição (condition)" },
                condition_subject_key: { type: "string", description: "Nome da variável (se subject=var), nome da tag (se subject=tag), ou campo do contato (se subject=contact_field: name/email/phone/company)" },
                condition_operator: { type: "string", enum: ["equals", "contains", "present", "absent"], description: "Operador da condição" },
                condition_value: { type: "string", description: "Valor pra comparar (só operators equals/contains)" },
                condition_true_next: { type: "string", description: "Próximo nó se a condição for verdadeira (condition)" },
                condition_false_next: { type: "string", description: "Próximo nó se a condição for falsa (condition)" },
                tag_name: { type: "string", description: "Nome da tag (set_tag)" },
                tag_mode: { type: "string", enum: ["add", "remove"], description: "Adicionar ou remover a tag (set_tag)" },
                crm_stage: { type: "string", description: "Nova etapa do CRM (set_crm_status)" },
                handoff_note: { type: "string", description: "Observação interna pro atendente (handoff)" },
              },
              required: ["node_key", "node_type"],
            },
          },
        },
        required: ["name", "trigger_type", "entry_node_key", "nodes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_appointments",
      description: "Retorna os próximos agendamentos do dia ou período.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data específica YYYY-MM-DD (opcional, padrão: hoje)" },
          days: { type: "number", description: "Número de dias à frente para buscar (padrão 1)" },
        },
        required: [],
      },
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  try {
    // ── search_contacts ──────────────────────────────────────────────────────
    if (toolName === "search_contacts") {
      const q = String(args.query || "");
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone, contact_type, email")
        .eq("account_id", accountId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(5);
      if (!data?.length) return `Nenhum contato encontrado para "${q}".`;
      return `Encontrei ${data.length} contato(s):\n${data.map((c: { name: string; phone: string; contact_type: string; email: string }) => `• ${c.name} — ${c.phone} (${c.contact_type})${c.email ? ` — ${c.email}` : ""}`).join("\n")}`;
    }

    // ── create_appointment ───────────────────────────────────────────────────
    if (toolName === "create_appointment") {
      const { contact_name, date, time, end_time, procedure, notes } = args as Record<string, string>;
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("account_id", accountId)
        .ilike("name", `%${contact_name}%`)
        .limit(1);

      if (!contacts?.length) return `Não encontrei nenhum contato com nome "${contact_name}".`;

      const contact = contacts[0];
      const startTime = new Date(`${date}T${time}:00`);
      const endDateTime = end_time
        ? new Date(`${date}T${end_time}:00`)
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      // Get default professional
      const { data: prof } = await supabase
        .from("clinic_users")
        .select("user_id")
        .eq("clinic_id", accountId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from("appointments").insert({
        clinic_id: accountId,
        patient_id: contact.id,
        professional_id: prof?.user_id || null,
        start_time: startTime.toISOString(),
        end_time: endDateTime.toISOString(),
        status: "confirmed",
        type: procedure || null,
        notes: notes ? `${notes}\n\n${LIA_LABEL}` : LIA_LABEL,
        created_by_ai: true,
        ai_label: LIA_LABEL,
      });

      if (error) return `Erro ao criar agendamento: ${error.message}`;

      // Timeline
      await supabase.from("contact_timeline").insert({
        account_id: accountId,
        contact_id: contact.id,
        event_type: "appointment",
        title: `${LIA_LABEL} — Agendamento criado pelo Copiloto`,
        description: `${procedure || "Consulta"} em ${startTime.toLocaleDateString("pt-BR")} às ${time}`,
        metadata: { by: "LIA" },
      });

      return `✅ ${LIA_LABEL} — Agendamento criado!\n• Paciente: ${contact.name}\n• Data: ${startTime.toLocaleDateString("pt-BR")} às ${time}${procedure ? `\n• Procedimento: ${procedure}` : ""}`;
    }

    // ── cancel_appointment ───────────────────────────────────────────────────
    if (toolName === "cancel_appointment") {
      const { contact_name, appointment_id } = args as Record<string, string>;

      let apptToCancel: any = null;

      if (appointment_id) {
        const { data } = await supabase.from("appointments").select("id, patient_id, start_time, type").eq("id", appointment_id).single();
        apptToCancel = data;
      } else {
        const { data: contacts } = await supabase.from("contacts").select("id").eq("account_id", accountId).ilike("name", `%${contact_name}%`).limit(1);
        if (!contacts?.length) return `Não encontrei contato "${contact_name}".`;
        const { data: appts } = await supabase.from("appointments").select("id, start_time, type").eq("patient_id", contacts[0].id).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(1);
        apptToCancel = appts?.[0];
      }

      if (!apptToCancel) return `Não encontrei agendamentos futuros para "${contact_name}".`;

      await supabase.from("appointments").update({
        status: "cancelled",
        ai_label: LIA_UPDATED_LABEL,
        notes: `Cancelado via LIA Copiloto. ${LIA_UPDATED_LABEL}`,
      }).eq("id", apptToCancel.id);

      return `✅ ${LIA_UPDATED_LABEL} — Agendamento de "${contact_name}" (${new Date(apptToCancel.start_time).toLocaleDateString("pt-BR")}) cancelado.`;
    }

    // ── get_hot_leads ────────────────────────────────────────────────────────
    if (toolName === "get_hot_leads") {
      const limit = Number(args.limit) || 5;
      const { data } = await supabase
        .from("deals")
        .select("title, temperature, score, interest, next_action, contacts(name, phone)")
        .eq("account_id", accountId)
        .eq("temperature", "hot")
        .order("score", { ascending: false })
        .limit(limit);

      if (!data?.length) return "Nenhum lead quente no momento.";
      return `🔥 Leads mais quentes:\n${data.map((d: any, i: number) => {
        const c = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
        return `${i + 1}. ${c?.name || d.title} — Score: ${d.score}/100 — Interesse: ${d.interest || "N/D"}${d.next_action ? `\n   → Próxima ação: ${d.next_action}` : ""}`;
      }).join("\n")}`;
    }

    // ── create_reminder ──────────────────────────────────────────────────────
    if (toolName === "create_reminder") {
      const { contact_name, reminder_text } = args as Record<string, string>;
      const { data: contacts } = await supabase.from("contacts").select("id, name").eq("account_id", accountId).ilike("name", `%${contact_name}%`).limit(1);
      if (!contacts?.length) return `Não encontrei "${contact_name}" nos contatos.`;
      const contact = contacts[0];
      const { error } = await supabase.from("contact_notes").insert({
        contact_id: contact.id,
        account_id: accountId,
        note_text: `🔔 ${reminder_text} (${LIA_LABEL})`,
      });
      if (error) return `Erro: ${error.message}`;
      return `✅ Lembrete criado para ${contact.name}: "${reminder_text}"`;
    }

    // ── update_deal_status ───────────────────────────────────────────────────
    if (toolName === "update_deal_status") {
      const { contact_name, temperature, interest, next_action } = args as Record<string, string>;
      const { data: contacts } = await supabase.from("contacts").select("id").eq("account_id", accountId).ilike("name", `%${contact_name}%`).limit(1);
      if (!contacts?.length) return `Não encontrei "${contact_name}".`;

      const updates: Record<string, unknown> = { last_ai_update_at: new Date().toISOString() };
      const descList: string[] = [];
      if (temperature) { updates.temperature = temperature; descList.push(`temperatura → "${temperature}"`); }
      if (interest) { updates.interest = interest; descList.push(`interesse → "${interest}"`); }
      if (next_action) { updates.next_action = next_action; descList.push(`próxima ação → "${next_action}"`); }

      const { error } = await supabase.from("deals").update(updates).eq("account_id", accountId).eq("contact_id", contacts[0].id);
      if (error) return `Erro: ${error.message}`;

      await supabase.from("contact_timeline").insert({
        account_id: accountId,
        contact_id: contacts[0].id,
        event_type: "deal_stage_change",
        title: `${LIA_UPDATED_LABEL} — CRM atualizado pelo Copiloto`,
        description: descList.join(", "),
        metadata: { by: "LIA" },
      });

      return `✅ ${LIA_UPDATED_LABEL} — CRM de "${contact_name}" atualizado: ${descList.join(", ")}.`;
    }

    // ── get_dashboard_summary ────────────────────────────────────────────────
    if (toolName === "get_dashboard_summary") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const today = now.toISOString().slice(0, 10);

      const [leadsRes, apptsRes, apptsToday, hotLeads, revenue] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("contact_type", "lead"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", accountId).gte("start_time", startOfMonth),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", accountId).gte("start_time", `${today}T00:00:00`).lte("start_time", `${today}T23:59:59`),
        supabase.from("deals").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("temperature", "hot"),
        supabase.from("financial_transactions").select("value").eq("clinic_id", accountId).eq("status", "paid").gte("date", startOfMonth.slice(0, 10)),
      ]);

      const totalRevenue = (revenue.data || []).reduce((sum: number, tx: { value: number }) => sum + (tx.value || 0), 0);

      return `📊 Resumo do mês:\n• Total de Leads: ${leadsRes.count ?? 0}\n• 🔥 Leads Quentes: ${hotLeads.count ?? 0}\n• Agendamentos no mês: ${apptsRes.count ?? 0}\n• Agendamentos hoje: ${apptsToday.count ?? 0}\n• 💰 Receita do mês: R$ ${totalRevenue.toFixed(2)}`;
    }

    // ── get_patient_financial_summary ────────────────────────────────────────
    if (toolName === "get_patient_financial_summary") {
      const { contact_name } = args as Record<string, string>;
      const { data: contacts } = await supabase.from("contacts").select("id, name").eq("account_id", accountId).ilike("name", `%${contact_name}%`).limit(1);
      if (!contacts?.length) return `Não encontrei "${contact_name}".`;
      const contact = contacts[0];

      const { data: txs } = await supabase
        .from("financial_transactions")
        .select("date, description, value, status, method, type")
        .eq("clinic_id", accountId)
        .eq("patient_id", contact.id)
        .order("date", { ascending: false })
        .limit(10);

      if (!txs?.length) return `Sem transações financeiras para "${contact.name}".`;

      const total = txs.reduce((sum: number, tx: { value: number }) => sum + (tx.value || 0), 0);
      const paid = txs.filter((tx: { status: string }) => tx.status === "paid").reduce((sum: number, tx: { value: number }) => sum + (tx.value || 0), 0);

      return `💰 Financeiro de ${contact.name}:\n• Total registrado: R$ ${total.toFixed(2)}\n• Pago: R$ ${paid.toFixed(2)}\n• Pendente: R$ ${(total - paid).toFixed(2)}\n\nÚltimas transações:\n${txs.slice(0, 5).map((tx: { date: string; description: string; value: number; status: string }) => `• ${tx.date} — ${tx.description} — R$ ${tx.value?.toFixed(2)} (${tx.status})`).join("\n")}`;
    }

    // ── register_payment ─────────────────────────────────────────────────────
    if (toolName === "register_payment") {
      const { contact_name, value, method, description } = args as Record<string, string>;
      const { data: contacts } = await supabase.from("contacts").select("id, name").eq("account_id", accountId).ilike("name", `%${contact_name}%`).limit(1);
      if (!contacts?.length) return `Não encontrei "${contact_name}".`;
      const contact = contacts[0];

      const { error } = await supabase.from("financial_transactions").insert({
        clinic_id: accountId,
        patient_id: contact.id,
        date: new Date().toISOString().slice(0, 10),
        description: description ? `${description} — ${LIA_LABEL}` : `Pagamento registrado — ${LIA_LABEL}`,
        category: "Pagamento",
        method: method || "pix",
        type: "pagamento",
        value: Number(value),
        status: "paid",
      });

      if (error) return `Erro: ${error.message}`;

      await supabase.from("contact_timeline").insert({
        account_id: accountId,
        contact_id: contact.id,
        event_type: "payment",
        title: `${LIA_LABEL} — Pagamento registrado`,
        description: `R$ ${Number(value).toFixed(2)} via ${method || "pix"}`,
        metadata: { by: "LIA" },
      });

      return `✅ ${LIA_LABEL} — Pagamento de R$ ${Number(value).toFixed(2)} registrado para "${contact.name}"!`;
    }

    // ── list_services ────────────────────────────────────────────────────────
    if (toolName === "list_services") {
      const search = String(args.search || "");
      let query = supabase
        .from("procedures")
        .select("name, valor, price, category, is_active")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("name");

      if (search) query = query.ilike("name", `%${search}%`);

      const { data: procs } = await query.limit(15);
      if (!procs?.length) return `Nenhum serviço/procedimento cadastrado${search ? ` para "${search}"` : ""}.`;
      return `Serviços cadastrados:\n${procs.map((p: { name: string; valor: number; price: number; category: string }) => `• ${p.name}${p.category ? ` (${p.category})` : ""} — R$ ${(p.valor || p.price || 0).toFixed(2)}`).join("\n")}`;
    }

    // ── list_automations ─────────────────────────────────────────────────────
    if (toolName === "list_automations") {
      const onlyActive = args.only_active === true;
      let query = supabase
        .from("automations")
        .select("name, is_active, trigger_type, execution_count, last_executed_at")
        .eq("account_id", accountId)
        .order("name");
      if (onlyActive) query = query.eq("is_active", true);
      const { data } = await query;
      if (!data?.length) return onlyActive ? "Nenhuma automação ativa no momento." : "Nenhuma automação cadastrada ainda.";
      const triggerLabels: Record<string, string> = {
        keyword_match: "palavra-chave",
        new_message_received: "nova mensagem",
        first_inbound_message: "primeiro contato",
        tag_added: "tag adicionada",
        deal_stage_change: "mudança de etapa",
      };
      return `Automações (${data.length}):\n${data
        .map((a: { name: string; is_active: boolean; trigger_type: string; execution_count: number; last_executed_at: string | null }) =>
          `• ${a.name} — ${a.is_active ? "🟢 Ativa" : "⏸️ Pausada"} — gatilho: ${triggerLabels[a.trigger_type] || a.trigger_type} — rodou ${a.execution_count || 0}x${a.last_executed_at ? ` (última vez: ${new Date(a.last_executed_at).toLocaleDateString("pt-BR")})` : ""}`
        )
        .join("\n")}`;
    }

    // ── toggle_automation ────────────────────────────────────────────────────
    if (toolName === "toggle_automation") {
      const { name, active } = args as unknown as { name: string; active: boolean };
      const { data: matches } = await supabase
        .from("automations")
        .select("id, name, is_active")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!matches?.length) return `Não encontrei nenhuma automação chamada "${name}".`;
      if (matches.length > 1) {
        return `Achei mais de uma automação com "${name}": ${matches.map((m: { name: string }) => m.name).join(", ")}. Qual delas você quer dizer?`;
      }

      const automation = matches[0];
      const { error } = await supabase.from("automations").update({ is_active: active }).eq("id", automation.id);
      if (error) return `Erro ao atualizar: ${error.message}`;

      return `✅ ${LIA_UPDATED_LABEL} — Automação "${automation.name}" agora está ${active ? "🟢 ativa" : "⏸️ pausada"}.`;
    }

    // ── get_automation_performance ───────────────────────────────────────────
    if (toolName === "get_automation_performance") {
      const { name } = args as Record<string, string>;
      const { data: matches } = await supabase
        .from("automations")
        .select("id, name, is_active, execution_count, last_executed_at")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!matches?.length) return `Não encontrei nenhuma automação chamada "${name}".`;
      if (matches.length > 1) {
        return `Achei mais de uma automação com "${name}": ${matches.map((m: { name: string }) => m.name).join(", ")}. Qual delas você quer dizer?`;
      }

      const automation = matches[0];
      const { data: recentLogs } = await supabase
        .from("automation_logs")
        .select("status, error_message, created_at")
        .eq("automation_id", automation.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const errors = (recentLogs || []).filter((l: { status: string }) => l.status === "failed" || l.status === "error");

      return `📊 Desempenho de "${automation.name}":\n• Status: ${automation.is_active ? "🟢 Ativa" : "⏸️ Pausada"}\n• Total de execuções: ${automation.execution_count || 0}\n• Última execução: ${automation.last_executed_at ? new Date(automation.last_executed_at).toLocaleString("pt-BR") : "nunca rodou"}${errors.length ? `\n• ⚠️ ${errors.length} erro(s) recente(s): ${errors[0].error_message || "sem detalhe"}` : ""}`;
    }

    // ── get_automation_details ───────────────────────────────────────────────
    if (toolName === "get_automation_details") {
      const { name } = args as Record<string, string>;
      const { data: autoMatches } = await supabase
        .from("automations")
        .select("id, name, is_active, trigger_type, trigger_config")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!autoMatches?.length) return `Não encontrei nenhuma automação chamada "${name}".`;
      if (autoMatches.length > 1) {
        return `Achei mais de uma automação com "${name}": ${autoMatches.map((m: { name: string }) => m.name).join(", ")}. Qual delas você quer dizer?`;
      }

      const automation = autoMatches[0];
      const { data: steps } = await supabase
        .from("automation_steps")
        .select("id, parent_step_id, branch, step_type, step_config, position")
        .eq("automation_id", automation.id)
        .order("position");

      const stepLabels: Record<string, string> = {
        send_message: "Enviar mensagem",
        send_template: "Enviar modelo salvo",
        send_media: "Enviar foto/anexo",
        wait: "Aguardar",
        condition: "Condição",
        add_tag: "Adicionar tag",
        update_deal_field: "Mudar qualificação do negócio",
        create_appointment: "Criar agendamento",
      };

      function describeStep(s: { id: string; step_type: string; step_config: Record<string, unknown> }): string {
        const cfg = s.step_config || {};
        if (s.step_type === "wait") return `Aguardar ${cfg.amount} ${cfg.unit}`;
        if (s.step_type === "send_message") return `Enviar mensagem: "${String(cfg.text || "").slice(0, 60)}"`;
        if (s.step_type === "condition") return `Condição — assunto: ${cfg.subject}`;
        if (s.step_type === "add_tag") return `Adicionar tag (id: ${cfg.tag_id})`;
        return stepLabels[s.step_type] || s.step_type;
      }

      function renderTree(parentId: string | null, branch: string | null, indent: string): string {
        const children = (steps || []).filter(
          (s: { parent_step_id: string | null; branch: string | null }) => s.parent_step_id === parentId && s.branch === branch,
        );
        return children
          .map((s: { id: string; step_type: string; step_config: Record<string, unknown> }) => {
            let line = `${indent}[id: ${s.id}] ${stepLabels[s.step_type] || s.step_type} — ${describeStep(s)}`;
            if (s.step_type === "condition") {
              line += `\n${indent}  Sim:\n${renderTree(s.id, "yes", indent + "    ")}`;
              line += `\n${indent}  Não:\n${renderTree(s.id, "no", indent + "    ")}`;
            }
            return line;
          })
          .join("\n");
      }

      const tree = renderTree(null, null, "");

      return `Automação "${automation.name}" (${automation.is_active ? "Ativa" : "Pausada"})\nGatilho: ${automation.trigger_type}\n\n${tree || "Nenhuma etapa cadastrada ainda."}`;
    }

    // ── update_automation_step ───────────────────────────────────────────────
    if (toolName === "update_automation_step") {
      const { step_id, text, wait_amount, wait_unit, tag_id, template_name } = args as Record<string, string | number | undefined>;

      const { data: stepRow } = await supabase
        .from("automation_steps")
        .select("id, automation_id, step_type, step_config, automations!inner(account_id)")
        .eq("id", step_id)
        .maybeSingle();

      if (!stepRow) return `Não encontrei nenhuma etapa com esse id.`;
      // Guard against editing a step belonging to another account.
      const owningAccountId = Array.isArray(stepRow.automations) ? stepRow.automations[0]?.account_id : stepRow.automations?.account_id;
      if (owningAccountId !== accountId) return `Não encontrei nenhuma etapa com esse id.`;

      const newConfig: Record<string, unknown> = { ...(stepRow.step_config || {}) };
      const changed: string[] = [];
      if (text !== undefined) { newConfig.text = text; changed.push(`texto → "${text}"`); }
      if (wait_amount !== undefined) { newConfig.amount = wait_amount; changed.push(`quantidade → ${wait_amount}`); }
      if (wait_unit !== undefined) { newConfig.unit = wait_unit; changed.push(`unidade → ${wait_unit}`); }
      if (tag_id !== undefined) { newConfig.tag_id = tag_id; changed.push(`tag → ${tag_id}`); }
      if (template_name !== undefined) { newConfig.template_name = template_name; changed.push(`modelo → "${template_name}"`); }

      if (changed.length === 0) return "Nenhuma mudança informada.";

      const { error } = await supabase.from("automation_steps").update({ step_config: newConfig }).eq("id", step_id);
      if (error) return `Erro ao atualizar: ${error.message}`;

      return `✅ ${LIA_UPDATED_LABEL} — Etapa atualizada: ${changed.join(", ")}.`;
    }

    // ── create_automation ────────────────────────────────────────────────────
    if (toolName === "create_automation") {
      interface PlanStep {
        step_type: string;
        text?: string;
        wait_amount?: number;
        wait_unit?: string;
        condition_subject?: string;
        condition_operand?: string;
        tag_name?: string;
        deal_field?: string;
        deal_value?: string;
        yes_steps?: PlanStep[];
        no_steps?: PlanStep[];
      }
      const {
        name,
        trigger_type,
        trigger_keywords,
        trigger_tag_name,
        steps,
      } = args as unknown as {
        name: string;
        trigger_type: string;
        trigger_keywords?: string[];
        trigger_tag_name?: string;
        steps: PlanStep[];
      };

      // Resolve any tag NAME the model used into a real tag_id — LIA
      // reasons in names, the schema stores ids. Cache lookups since
      // the same tag can appear more than once in one plan.
      const tagCache = new Map<string, string | null>();
      async function resolveTagId(tagName: string): Promise<string | null> {
        if (tagCache.has(tagName)) return tagCache.get(tagName)!;
        const { data } = await supabase
          .from("tags")
          .select("id")
          .eq("account_id", accountId)
          .ilike("name", tagName)
          .maybeSingle();
        const id = data?.id ?? null;
        tagCache.set(tagName, id);
        return id;
      }

      // ── Build trigger_config ──
      let triggerConfig: Record<string, unknown> = {};
      if (trigger_type === "keyword_match") {
        if (!trigger_keywords?.length) return "Preciso de pelo menos uma palavra-chave pra esse tipo de gatilho.";
        triggerConfig = { keywords: trigger_keywords, match_type: "contains" };
      } else if (trigger_type === "tag_added") {
        if (!trigger_tag_name) return "Preciso saber qual tag dispara essa automação.";
        const tagId = await resolveTagId(trigger_tag_name);
        if (!tagId) return `Não encontrei nenhuma tag chamada "${trigger_tag_name}".`;
        triggerConfig = { tag_id: tagId };
      }

      // ── Build step rows (flat, with parent/branch) + a readable summary ──
      const missingTags: string[] = [];
      const rows: { step_type: string; step_config: Record<string, unknown>; parent_step_id: null; branch: null; position: number; _cid: string; _parentCid: string | null; _branch: "yes" | "no" | null }[] = [];
      let cidCounter = 0;
      const summaryLines: string[] = [];

      async function walk(list: PlanStep[], parentCid: string | null, branch: "yes" | "no" | null, indent: string) {
        let pos = 0;
        for (const s of list) {
          const cid = `s${cidCounter++}`;
          const cfg: Record<string, unknown> = {};
          let label = s.step_type;
          if (s.step_type === "send_message") {
            cfg.text = s.text ?? "";
            label = `Enviar mensagem: "${(s.text ?? "").slice(0, 50)}"`;
          } else if (s.step_type === "wait") {
            cfg.amount = s.wait_amount ?? 1;
            cfg.unit = s.wait_unit ?? "hours";
            label = `Aguardar ${cfg.amount} ${cfg.unit}`;
          } else if (s.step_type === "condition") {
            cfg.subject = s.condition_subject ?? "no_reply_since";
            cfg.operand = s.condition_operand ?? "";
            label = `Condição: ${cfg.subject}${s.condition_operand ? ` (${s.condition_operand})` : ""}`;
          } else if (s.step_type === "add_tag") {
            const tagId = s.tag_name ? await resolveTagId(s.tag_name) : null;
            if (s.tag_name && !tagId) missingTags.push(s.tag_name);
            cfg.tag_id = tagId ?? "";
            label = `Adicionar tag: ${s.tag_name ?? "?"}`;
          } else if (s.step_type === "update_deal_field") {
            cfg.field = s.deal_field ?? "temperature";
            cfg.value = s.deal_value ?? "";
            label = `Mudar ${cfg.field} → ${cfg.value}`;
          }

          rows.push({
            step_type: s.step_type,
            step_config: cfg,
            parent_step_id: null,
            branch: null,
            position: pos++,
            _cid: cid,
            _parentCid: parentCid,
            _branch: branch,
          });
          summaryLines.push(`${indent}${label}`);

          if (s.step_type === "condition") {
            if (s.yes_steps?.length) {
              summaryLines.push(`${indent}  Sim:`);
              await walk(s.yes_steps, cid, "yes", indent + "    ");
            }
            if (s.no_steps?.length) {
              summaryLines.push(`${indent}  Não:`);
              await walk(s.no_steps, cid, "no", indent + "    ");
            }
          }
        }
      }
      await walk(steps, null, null, "");

      if (missingTags.length) {
        return `Não encontrei essas tags: ${missingTags.join(", ")}. Confirma o nome exato ou crie a tag antes em Configurações → Campos e Tags.`;
      }

      // ── Validate with the same rules the builder itself enforces ──
      function toValidateTree(parentCid: string | null, branch: "yes" | "no" | null): { step_type: string; step_config: Record<string, unknown>; branches?: { yes: unknown[]; no: unknown[] } }[] {
        return rows
          .filter((r) => r._parentCid === parentCid && r._branch === branch)
          .map((r) => {
            const node: { step_type: string; step_config: Record<string, unknown>; branches?: { yes: unknown[]; no: unknown[] } } = {
              step_type: r.step_type,
              step_config: r.step_config,
            };
            if (r.step_type === "condition") {
              node.branches = { yes: toValidateTree(r._cid, "yes"), no: toValidateTree(r._cid, "no") };
            }
            return node;
          });
      }
      const stepIssues = validateStepsForActivation(toValidateTree(null, null) as never);
      const triggerIssues = validateTriggerForActivation(trigger_type as never, triggerConfig);
      if (stepIssues.length || triggerIssues.length) {
        return `Não deu pra montar essa automação: ${[...stepIssues, ...triggerIssues].map((i) => i.message).join("; ")}.`;
      }

      // ── Persist: automation row first, then steps two-pass (create
      // all rows, then patch parent_step_id using the real DB ids) ──
      const { data: newAutomation, error: autoErr } = await supabase
        .from("automations")
        .insert({
          account_id: accountId,
          name,
          trigger_type,
          trigger_config: triggerConfig,
          is_active: false, // ALWAYS created paused — see system prompt: activation is a separate, explicit step.
        })
        .select("id")
        .single();

      if (autoErr || !newAutomation) return `Erro ao criar automação: ${autoErr?.message}`;

      const cidToRealId = new Map<string, string>();
      for (const r of rows) {
        const { data: inserted, error: stepErr } = await supabase
          .from("automation_steps")
          .insert({
            automation_id: newAutomation.id,
            step_type: r.step_type,
            step_config: r.step_config,
            position: r.position,
            parent_step_id: r._parentCid ? cidToRealId.get(r._parentCid) ?? null : null,
            branch: r._branch,
          })
          .select("id")
          .single();
        if (stepErr || !inserted) {
          // Roll back the partially-created automation rather than
          // leaving a broken draft behind.
          await supabase.from("automations").delete().eq("id", newAutomation.id);
          return `Erro ao criar etapa: ${stepErr?.message}`;
        }
        cidToRealId.set(r._cid, inserted.id);
      }

      return `✅ ${LIA_LABEL} — Automação "${name}" criada como RASCUNHO (ainda pausada):\n\n${summaryLines.join("\n")}\n\nQuer que eu já ative ela?`;
    }

    // ── list_flows ────────────────────────────────────────────────────────────
    if (toolName === "list_flows") {
      const onlyActive = args.only_active === true;
      let query = supabase
        .from("flows")
        .select("name, status, trigger_type, execution_count, last_executed_at")
        .eq("account_id", accountId)
        .order("name");
      if (onlyActive) query = query.eq("status", "active");
      const { data } = await query;
      if (!data?.length) return onlyActive ? "Nenhum fluxo ativo no momento." : "Nenhum fluxo cadastrado ainda.";
      const statusEmoji: Record<string, string> = { active: "🟢 Ativo", draft: "⏸️ Rascunho/Pausado", archived: "🗄️ Arquivado" };
      return `Fluxos de mensagens (${data.length}):\n${data
        .map((f: { name: string; status: string; trigger_type: string; execution_count: number; last_executed_at: string | null }) =>
          `• ${f.name} — ${statusEmoji[f.status] || f.status} — gatilho: ${f.trigger_type} — rodou ${f.execution_count || 0}x${f.last_executed_at ? ` (última vez: ${new Date(f.last_executed_at).toLocaleDateString("pt-BR")})` : ""}`
        )
        .join("\n")}`;
    }

    // ── toggle_flow ───────────────────────────────────────────────────────────
    if (toolName === "toggle_flow") {
      const { name, active } = args as unknown as { name: string; active: boolean };
      const { data: matches } = await supabase
        .from("flows")
        .select("id, name, status")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!matches?.length) return `Não encontrei nenhum fluxo chamado "${name}".`;
      if (matches.length > 1) {
        return `Achei mais de um fluxo com "${name}": ${matches.map((m: { name: string }) => m.name).join(", ")}. Qual deles você quer dizer?`;
      }

      const flow = matches[0];
      const { error } = await supabase.from("flows").update({ status: active ? "active" : "draft" }).eq("id", flow.id);
      if (error) return `Erro ao atualizar: ${error.message}`;

      return `✅ ${LIA_UPDATED_LABEL} — Fluxo "${flow.name}" agora está ${active ? "🟢 ativo" : "⏸️ pausado"}.`;
    }

    // ── get_flow_executions ──────────────────────────────────────────────────
    if (toolName === "get_flow_executions") {
      const { name } = args as Record<string, string>;
      const { data: matches } = await supabase
        .from("flows")
        .select("id, name, status, execution_count, last_executed_at")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!matches?.length) return `Não encontrei nenhum fluxo chamado "${name}".`;
      if (matches.length > 1) {
        return `Achei mais de um fluxo com "${name}": ${matches.map((m: { name: string }) => m.name).join(", ")}. Qual deles você quer dizer?`;
      }

      const flow = matches[0];
      const { data: runs } = await supabase
        .from("flow_runs")
        .select("status, current_node_key")
        .eq("flow_id", flow.id)
        .limit(500);

      const statusCounts: Record<string, number> = {};
      const stuckAt: Record<string, number> = {};
      for (const r of runs || []) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        if (r.status === "active" || r.status === "timed_out") {
          stuckAt[r.current_node_key] = (stuckAt[r.current_node_key] || 0) + 1;
        }
      }
      const topStuck = Object.entries(stuckAt).sort((a, b) => b[1] - a[1]).slice(0, 3);

      const statusLabels: Record<string, string> = {
        active: "em andamento",
        completed: "concluídos",
        handed_off: "transferidos pra atendente",
        timed_out: "expiraram sem responder",
        paused_by_agent: "pausados por atendente",
        failed: "falharam",
      };

      return `📊 Fluxo "${flow.name}" (${flow.status}):\n• Total de execuções: ${flow.execution_count || 0}\n• Última execução: ${flow.last_executed_at ? new Date(flow.last_executed_at).toLocaleString("pt-BR") : "nunca rodou"}\n${Object.entries(statusCounts).map(([s, c]) => `• ${statusLabels[s] || s}: ${c}`).join("\n")}${topStuck.length ? `\n\n⚠️ Onde mais travam (sem concluir):\n${topStuck.map(([node, c]) => `• ${node}: ${c} pessoa(s)`).join("\n")}` : ""}`;
    }

    // ── get_flow_details ─────────────────────────────────────────────────────
    if (toolName === "get_flow_details") {
      const { name } = args as Record<string, string>;
      const { data: flowMatches } = await supabase
        .from("flows")
        .select("id, name, status, entry_node_id")
        .eq("account_id", accountId)
        .ilike("name", `%${name}%`)
        .limit(2);

      if (!flowMatches?.length) return `Não encontrei nenhum fluxo chamado "${name}".`;
      if (flowMatches.length > 1) {
        return `Achei mais de um fluxo com "${name}": ${flowMatches.map((m: { name: string }) => m.name).join(", ")}. Qual deles você quer dizer?`;
      }

      const flow = flowMatches[0];
      const { data: nodes } = await supabase
        .from("flow_nodes")
        .select("node_key, node_type, config")
        .eq("flow_id", flow.id);

      if (!nodes?.length) return `Fluxo "${flow.name}" (${flow.status}) ainda não tem nenhum nó.`;

      const nodeTypeLabels: Record<string, string> = {
        start: "Início",
        send_message: "Enviar mensagem",
        send_media: "Enviar foto/anexo",
        collect_input: "Coletar resposta",
        condition: "Condição",
        set_tag: "Adicionar tag",
        set_crm_status: "Alterar status no CRM",
        handoff: "Transferir pra atendente",
        end: "Fim",
      };

      function describeNode(n: { node_type: string; config: Record<string, unknown> }): string {
        const cfg = n.config || {};
        if (n.node_type === "send_message") return `"${String(cfg.text || "").slice(0, 60)}"`;
        if (n.node_type === "collect_input") return `pergunta: "${String(cfg.prompt_text || "").slice(0, 60)}" → guarda em {{${cfg.var_key}}}`;
        if (n.node_type === "set_crm_status") return `etapa → ${cfg.crm_stage}`;
        if (n.node_type === "handoff") return cfg.note ? `nota: "${cfg.note}"` : "sem observação";
        return "";
      }

      const list = nodes
        .map((n: { node_key: string; node_type: string; config: Record<string, unknown> }) =>
          `• [${n.node_key}] ${nodeTypeLabels[n.node_type] || n.node_type}${n.node_key === flow.entry_node_id ? " (entrada)" : ""} — ${describeNode(n)}`
        )
        .join("\n");

      return `Fluxo "${flow.name}" (${flow.status}):\n${list}`;
    }

    // ── update_flow_node ─────────────────────────────────────────────────────
    if (toolName === "update_flow_node") {
      const { flow_name, node_key, text, prompt_text, crm_stage, note } = args as Record<string, string | undefined>;

      const { data: flowMatches } = await supabase
        .from("flows")
        .select("id, name")
        .eq("account_id", accountId)
        .ilike("name", `%${flow_name}%`)
        .limit(2);

      if (!flowMatches?.length) return `Não encontrei nenhum fluxo chamado "${flow_name}".`;
      if (flowMatches.length > 1) {
        return `Achei mais de um fluxo com "${flow_name}": ${flowMatches.map((m: { name: string }) => m.name).join(", ")}. Qual deles você quer dizer?`;
      }

      const flow = flowMatches[0];
      const { data: nodeRow } = await supabase
        .from("flow_nodes")
        .select("id, node_type, config")
        .eq("flow_id", flow.id)
        .eq("node_key", node_key)
        .maybeSingle();

      if (!nodeRow) return `Não encontrei o nó "${node_key}" no fluxo "${flow.name}".`;

      const newConfig: Record<string, unknown> = { ...(nodeRow.config || {}) };
      const changed: string[] = [];
      if (text !== undefined) { newConfig.text = text; changed.push(`texto → "${text}"`); }
      if (prompt_text !== undefined) { newConfig.prompt_text = prompt_text; changed.push(`pergunta → "${prompt_text}"`); }
      if (crm_stage !== undefined) { newConfig.crm_stage = crm_stage; changed.push(`etapa do CRM → "${crm_stage}"`); }
      if (note !== undefined) { newConfig.note = note; changed.push(`observação → "${note}"`); }

      if (changed.length === 0) return "Nenhuma mudança informada.";

      const { error } = await supabase.from("flow_nodes").update({ config: newConfig }).eq("id", nodeRow.id);
      if (error) return `Erro ao atualizar: ${error.message}`;

      return `✅ ${LIA_UPDATED_LABEL} — Nó "${node_key}" do fluxo "${flow.name}" atualizado: ${changed.join(", ")}.`;
    }

    // ── create_flow ──────────────────────────────────────────────────────────
    if (toolName === "create_flow") {
      interface PlanNode {
        node_key: string;
        node_type: string;
        text?: string;
        next_node_key?: string;
        prompt_text?: string;
        var_key?: string;
        condition_subject?: string;
        condition_subject_key?: string;
        condition_operator?: string;
        condition_value?: string;
        condition_true_next?: string;
        condition_false_next?: string;
        tag_name?: string;
        tag_mode?: string;
        crm_stage?: string;
        handoff_note?: string;
      }
      const { name, trigger_type, trigger_keywords, entry_node_key, nodes } = args as unknown as {
        name: string;
        trigger_type: string;
        trigger_keywords?: string[];
        entry_node_key: string;
        nodes: PlanNode[];
      };

      if (!nodes?.length) return "Preciso de pelo menos um nó pra criar o fluxo.";

      // Same name -> id resolution pattern as create_automation.
      const tagCache = new Map<string, string | null>();
      async function resolveTagId(tagName: string): Promise<string | null> {
        if (tagCache.has(tagName)) return tagCache.get(tagName)!;
        const { data } = await supabase.from("tags").select("id").eq("account_id", accountId).ilike("name", tagName).maybeSingle();
        const id = data?.id ?? null;
        tagCache.set(tagName, id);
        return id;
      }

      const triggerConfig: Record<string, unknown> = trigger_type === "keyword" ? { keywords: trigger_keywords ?? [] } : {};

      const missingTags: string[] = [];
      const summaryLines: string[] = [];
      const nodeTypeLabels: Record<string, string> = {
        send_message: "Enviar mensagem",
        collect_input: "Coletar resposta",
        condition: "Condição",
        set_tag: "Adicionar/remover tag",
        set_crm_status: "Alterar status no CRM",
        handoff: "Transferir pra atendente",
        end: "Fim",
      };

      // Build each node's real config, resolving tag names to ids.
      const builtNodes: { node_key: string; node_type: string; config: Record<string, unknown> }[] = [];
      for (const n of nodes) {
        const cfg: Record<string, unknown> = {};
        let label = nodeTypeLabels[n.node_type] || n.node_type;
        if (n.node_type === "send_message") {
          cfg.text = n.text ?? "";
          cfg.next_node_key = n.next_node_key ?? "";
          label += `: "${(n.text ?? "").slice(0, 50)}"`;
        } else if (n.node_type === "collect_input") {
          cfg.prompt_text = n.prompt_text ?? "";
          cfg.var_key = n.var_key ?? "resposta";
          cfg.next_node_key = n.next_node_key ?? "";
          label += `: "${(n.prompt_text ?? "").slice(0, 50)}" → {{${cfg.var_key}}}`;
        } else if (n.node_type === "condition") {
          cfg.subject = n.condition_subject ?? "var";
          cfg.subject_key = n.condition_subject_key ?? "";
          cfg.operator = n.condition_operator ?? "present";
          if (n.condition_value !== undefined) cfg.value = n.condition_value;
          cfg.true_next = n.condition_true_next ?? "";
          cfg.false_next = n.condition_false_next ?? "";
          label += `: ${cfg.subject}(${cfg.subject_key}) ${cfg.operator}`;
        } else if (n.node_type === "set_tag") {
          const tagId = n.tag_name ? await resolveTagId(n.tag_name) : null;
          if (n.tag_name && !tagId) missingTags.push(n.tag_name);
          cfg.mode = n.tag_mode ?? "add";
          cfg.tag_id = tagId ?? "";
          cfg.next_node_key = n.next_node_key ?? "";
          label += `: ${cfg.mode} "${n.tag_name ?? "?"}"`;
        } else if (n.node_type === "set_crm_status") {
          cfg.crm_stage = n.crm_stage ?? "";
          cfg.next_node_key = n.next_node_key ?? "";
          label += `: → ${cfg.crm_stage}`;
        } else if (n.node_type === "handoff") {
          if (n.handoff_note) cfg.note = n.handoff_note;
        }
        // end: no config.

        builtNodes.push({ node_key: n.node_key, node_type: n.node_type, config: cfg });
        summaryLines.push(`• [${n.node_key}]${n.node_key === entry_node_key ? " (entrada)" : ""} ${label}`);
      }

      if (missingTags.length) {
        return `Não encontrei essas tags: ${missingTags.join(", ")}. Confirma o nome exato ou crie a tag antes em Configurações → Campos e Tags.`;
      }

      // Validate with the exact same rules the manual builder enforces.
      const issues = validateFlowForActivation(
        { name, trigger_type: trigger_type as "keyword" | "first_inbound_message" | "manual", trigger_config: triggerConfig, entry_node_id: entry_node_key },
        builtNodes,
      );
      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length) {
        return `Não deu pra montar esse fluxo: ${errors.map((i) => i.message).join("; ")}.`;
      }

      // Persist: flow row (draft, no entry yet — flow_nodes need the
      // flow_id first) then all nodes, then patch entry_node_id.
      const { data: newFlow, error: flowErr } = await supabase
        .from("flows")
        .insert({
          account_id: accountId,
          name,
          status: "draft", // ALWAYS created paused — same rule as create_automation.
          trigger_type,
          trigger_config: triggerConfig,
        })
        .select("id")
        .single();

      if (flowErr || !newFlow) return `Erro ao criar fluxo: ${flowErr?.message}`;

      const { error: nodesErr } = await supabase.from("flow_nodes").insert(
        builtNodes.map((n) => ({ flow_id: newFlow.id, node_key: n.node_key, node_type: n.node_type, config: n.config })),
      );
      if (nodesErr) {
        await supabase.from("flows").delete().eq("id", newFlow.id);
        return `Erro ao criar os nós: ${nodesErr.message}`;
      }

      const { error: entryErr } = await supabase.from("flows").update({ entry_node_id: entry_node_key }).eq("id", newFlow.id);
      if (entryErr) return `Fluxo criado, mas houve um erro ao definir a entrada: ${entryErr.message}`;

      return `✅ ${LIA_LABEL} — Fluxo "${name}" criado como RASCUNHO (ainda pausado):\n\n${summaryLines.join("\n")}\n\nQuer que eu já ative ele?`;
    }

    // ── get_upcoming_appointments ────────────────────────────────────────────
    if (toolName === "get_upcoming_appointments") {
      const date = String(args.date || new Date().toISOString().slice(0, 10));
      const days = Number(args.days || 1);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + days);

      const { data: appts } = await supabase
        .from("appointments")
        .select("start_time, end_time, status, type, title, patients(name)")
        .eq("clinic_id", accountId)
        .gte("start_time", `${date}T00:00:00`)
        .lte("start_time", `${endDate.toISOString().slice(0, 10)}T23:59:59`)
        .order("start_time", { ascending: true })
        .limit(20);

      if (!appts?.length) return `Sem agendamentos para ${date === new Date().toISOString().slice(0, 10) ? "hoje" : date}.`;
      return `📅 Agendamentos:\n${appts.map((a: any) => {
        const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        const hora = new Date(a.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `• ${hora} — ${patient?.name || "Paciente"} — ${a.type || a.title || "Consulta"} (${a.status})`;
      }).join("\n")}`;
    }

    return `Ação "${toolName}" não implementada.`;
  } catch (err) {
    return `Erro ao executar ${toolName}: ${err instanceof Error ? err.message : "erro desconhecido"}`;
  }
}

// ─── Fetch contact context for enriched system prompt ────────────────────────
async function fetchContactContext(contactId: string, accountId: string, supabase: any): Promise<string> {
  try {
    const [contactRes, dealRes, apptsRes, timelineRes, messagesRes] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).single(),
      supabase.from("deals").select("*").eq("contact_id", contactId).maybeSingle(),
      supabase.from("appointments").select("start_time, end_time, status, type").eq("patient_id", contactId).order("start_time", { ascending: false }).limit(5),
      supabase.from("contact_timeline").select("title, description, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(10),
      supabase.from("messages").select("sender_type, content_text, created_at")
        .eq("conversation_id",
          (await supabase.from("conversations").select("id").eq("contact_id", contactId).eq("account_id", accountId).order("created_at", { ascending: true }).limit(1).single()).data?.id || ""
        )
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const contact = contactRes.data;
    const deal = dealRes.data;
    const appts = apptsRes.data || [];
    const timeline = timelineRes.data || [];
    const msgs = (messagesRes.data || []).reverse();

    return `
=== CONTEXTO DO PACIENTE ATIVO ===
Nome: ${contact?.name || "N/A"} | Telefone: ${contact?.phone || "N/A"} | E-mail: ${contact?.email || "N/A"}
CPF: ${contact?.cpf || "N/A"} | Nascimento: ${contact?.birthday || "N/A"}

CRM:
- Temperatura: ${deal?.temperature || "N/A"} | Score: ${deal?.score || 0}/100
- Interesse: ${deal?.interest || "N/A"}
- Objeção: ${deal?.main_objection || "N/A"}
- Próxima ação: ${deal?.next_action || "N/A"}

Últimos agendamentos:
${appts.map((a: any) => `• ${new Date(a.start_time).toLocaleString("pt-BR")} — ${a.type || "Consulta"} (${a.status})`).join("\n") || "Nenhum"}

Histórico recente (timeline):
${timeline.map((t: any) => `• ${t.title}: ${t.description || ""}`).join("\n") || "Nenhum"}

Últimas mensagens do WhatsApp:
${msgs.map((m: any) => `[${m.sender_type === "customer" ? "PACIENTE" : "CLÍNICA"}]: ${m.content_text || "[mídia]"}`).join("\n") || "Nenhuma"}
=================================`;
  } catch {
    return "";
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, account_id, contact_id } = await req.json();

    if (!messages || !account_id) {
      return NextResponse.json({ error: "messages and account_id are required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Build context-enriched system prompt
    let contactContext = "";
    if (contact_id) {
      contactContext = await fetchContactContext(contact_id, account_id, supabase);
    }

    const systemPrompt = `Você é a LIA — Assistente Inteligente do LeadPluz CRM para clínicas de saúde, beleza e estética.
Você pode executar ações diretamente na plataforma: buscar contatos, criar e cancelar agendamentos, registrar pagamentos, atualizar o CRM, listar serviços, mostrar indicadores, consultar/pausar/ativar/editar/criar automações, e consultar/pausar/ativar/editar/criar fluxos de mensagens.
Responda sempre em português brasileiro. Seja direta, útil e profissional.
IMPORTANTE: Só crie agendamentos quando a equipe da clínica confirmar explicitamente que o horário está marcado.
Antes de pausar uma automação que está ativa, confirme rapidamente com o usuário se ele tem certeza — pausar pode interromper mensagens automáticas que pacientes esperam receber. A mesma cautela vale pra pausar um fluxo de mensagens ativo.
Antes de editar uma etapa de automação (update_automation_step), sempre chame get_automation_details primeiro pra ver a etapa certa, explique em uma frase o que vai mudar, e só edite depois que o usuário confirmar — nunca edite direto sem mostrar o que vai mudar.
Ao criar uma automação nova (create_automation): monte o gatilho e as etapas a partir do que o usuário descreveu, mas SEMPRE explique o resumo em linguagem simples e peça confirmação antes de chamar a função — nunca crie direto na primeira mensagem. A automação sempre nasce pausada (rascunho); depois de criar, pergunte se o usuário quer ativar agora (e só ative com toggle_automation se ele confirmar).
Antes de editar um nó de fluxo (update_flow_node), sempre chame get_flow_details primeiro pra ver o nó certo, explique em uma frase o que vai mudar, e só edite depois que o usuário confirmar — mesma cautela usada pra editar etapa de automação.
Ao criar um fluxo novo (create_flow): esse é o mais complexo dos dois (a estrutura é um grafo, cada nó precisa apontar explicitamente pro próximo pelo node_key) — monte com cuidado, dê node_keys curtos e descritivos, e SEMPRE explique o resumo do fluxo (a sequência de nós, na ordem) em linguagem simples antes de chamar a função, pedindo confirmação. Nunca crie direto na primeira mensagem. O fluxo sempre nasce pausado (rascunho); depois de criar, pergunte se o usuário quer ativar agora (e só ative com toggle_flow se ele confirmar). Se a criação falhar por erro de validação, ajuste a estrutura e explique a mudança antes de tentar de novo — nunca insista silenciosamente.

Após executar qualquer ação, informe que foi feita com o rótulo "⚡ Criado pela LIA" ou "⚡ Atualizado pela LIA".
${contactContext ? contactContext : ""}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 1500,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const toolResults = await Promise.all(
        choice.message.tool_calls
          .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
          .map(async (tc) => {
            const args = JSON.parse(tc.function.arguments);
            const result = await executeTool(tc.function.name, args, account_id, supabase);
            return { tool_call_id: tc.id, result };
          })
      );

      const followUp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
          choice.message,
          ...toolResults.map((tr) => ({
            role: "tool" as const,
            tool_call_id: tr.tool_call_id,
            content: tr.result,
          })),
        ],
        max_tokens: 800,
      });

      return NextResponse.json({
        reply: followUp.choices[0].message.content,
        tool_calls: toolResults,
      });
    }

    return NextResponse.json({ reply: choice.message.content });
  } catch (err) {
    console.error("[/api/copilot]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
