import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

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
Você pode executar ações diretamente na plataforma: buscar contatos, criar e cancelar agendamentos, registrar pagamentos, atualizar o CRM, listar serviços, mostrar indicadores, e consultar/pausar/ativar automações.
Responda sempre em português brasileiro. Seja direta, útil e profissional.
IMPORTANTE: Só crie agendamentos quando a equipe da clínica confirmar explicitamente que o horário está marcado.
Antes de pausar uma automação que está ativa, confirme rapidamente com o usuário se ele tem certeza — pausar pode interromper mensagens automáticas que pacientes esperam receber.
Antes de editar uma etapa de automação (update_automation_step), sempre chame get_automation_details primeiro pra ver a etapa certa, explique em uma frase o que vai mudar, e só edite depois que o usuário confirmar — nunca edite direto sem mostrar o que vai mudar.
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
