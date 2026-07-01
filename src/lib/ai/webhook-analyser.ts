import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

// Helper to get admin supabase client
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL", "https://scrhexfcbtdyubehbzml.supabase.co"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    );
  }
  return _adminClient;
}

export async function analyseWhatsAppConversationWithAI(
  conversationId: string,
  contactId: string,
  accountId: string,
  triggerMessageId: string
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[AI Analyser] OPENAI_API_KEY not configured.");
    return;
  }

  const db = supabaseAdmin();

  try {
    // 1. Fetch contact current profile info
    const { data: contact } = await db
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (!contact) {
      console.warn("[AI Analyser] Contact not found:", contactId);
      return;
    }

    // 2. Fetch last 10 messages of the conversation for context
    const { data: messages } = await db
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!messages || messages.length === 0) return;

    // Order chronological
    const chronMessages = [...messages].reverse();

    // 3. Fetch upcoming appointments
    const { data: upcomingAppts } = await db
      .from("appointments")
      .select("id, start_time, end_time, status, type")
      .eq("patient_id", contactId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    // 4. Fetch the contact's deal to see CRM state
    const { data: deal } = await db
      .from("deals")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    // Prepare context for prompt
    const nowStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const isoNow = new Date().toISOString();

    const systemPrompt = `Você é a inteligência artificial do sistema LeadPluz CRM de uma clínica de saúde e estética.
Sua tarefa é analisar o histórico de conversas do WhatsApp (que contém as últimas interações do paciente e da clínica) e entender o CONTEXTO total das mensagens para identificar e tomar ações no CRM.
Hoje é dia/hora: ${nowStr} (use isso para calcular referências temporárias como "amanhã", "segunda", "14h hoje", etc.).

DADOS ATUAIS DO PACIENTE:
- Nome: ${contact.name || "Não informado"}
- E-mail: ${contact.email || "Não informado"}
- CPF: ${contact.cpf || "Não informado"}
- Data Nascimento: ${contact.birthday || "Não informado"}

AGENDAMENTOS FUTUROS ENCONTRADOS:
${JSON.stringify(upcomingAppts || [], null, 2)}

STATUS ATUAL DO NEGÓCIO (CRM):
- Interesse: ${deal?.interest || "Não informado"}
- Temperatura: ${deal?.temperature || "Não informado"}
- Objeção: ${deal?.main_objection || "Não informado"}

HISTÓRICO DA CONVERSA (Últimas mensagens):
${chronMessages
  .map(
    (m) =>
      `[${m.sender_type === "customer" ? "PACIENTE" : "CLÍNICA"} - ${new Date(
        m.created_at
      ).toLocaleTimeString("pt-BR")}]: ${m.content_text}`
  )
  .join("\n")}

Determine quais das seguintes ações estruturadas devem ser tomadas com base nas mensagens recentes. 
IMPORTANTE: Se o paciente responder "sim", "claro", "pode ser" a uma pergunta específica da clínica feita imediatamente antes, analise o contexto da pergunta da clínica para extrair os detalhes (ex: proposta de data, hora ou confirmação).

Responda APENAS com um objeto JSON válido correspondente ao seguinte esquema:
{
  "update_contact": {
    "name": "Nome Completo extraído se informado, caso contrário null",
    "email": "E-mail extraído se informado, caso contrário null",
    "cpf": "CPF extraído se informado, caso contrário null",
    "birthday": "Data de nascimento YYYY-MM-DD extraída se informada, caso contrário null"
  },
  "create_appointment": {
    "requested": true se o paciente solicitou ou confirmou o agendamento sugerido, caso contrário false,
    "start_time": "Data/Hora de início ISO YYYY-MM-DDTHH:mm:ss.sssZ calculada com base no texto, caso contrário null",
    "end_time": "Data/Hora de término ISO YYYY-MM-DDTHH:mm:ss.sssZ (geralmente 1h depois de start_time), caso contrário null",
    "type": "Procedimento ou consulta de interesse extraído, caso contrário null",
    "notes": "Resumo das preferências do paciente para a consulta, caso contrário null"
  },
  "confirm_appointment": {
    "requested": true se o paciente confirmou um agendamento futuro sugerido pela clínica nas mensagens, caso contrário false,
    "appointment_id": "UUID do agendamento a ser confirmado (escolha dos agendamentos futuros mostrados), caso contrário null"
  },
  "cancel_appointment": {
    "requested": true se o paciente solicitou o cancelamento de um agendamento futuro, caso contrário false,
    "appointment_id": "UUID do agendamento a ser cancelado, caso contrário null"
  },
  "update_deal": {
    "temperature": "hot" se demonstrou alto desejo imediato de compra, "warm" se demonstrou interesse morno, "cold" se demonstrou pouco interesse ou cancelamento, caso contrário null,
    "interest": "Procedimento de interesse detectado, caso contrário null",
    "score": 0 a 100 baseado na intenção de compra do lead, caso contrário null,
    "main_objection": "Dificuldade relatada pelo paciente (ex: preço alto, falta de horário, local longe, medo), caso contrário null",
    "next_action": "Próxima ação recomendada para a clínica comercialmente, caso contrário null"
  },
  "register_deposit": {
    "paid": true se o paciente confirmou ou enviou comprovante de pagamento de um sinal de agendamento, caso contrário false,
    "value": número correspondente ao valor pago de sinal (ex: 50.00 ou 100.00), caso contrário null,
    "notes": "Qualquer detalhe ou observação sobre o pagamento, caso contrário null"
  }
}`;

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.2, // Baixa temperatura para extração exata
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log("[AI Analyser] Analysis result:", JSON.stringify(result, null, 2));

    // 5. Execute Updates & Log Audits to contact_timeline

    // 5.1 Update Contact Profile
    const uc = result.update_contact;
    if (uc && (uc.name || uc.email || uc.cpf || uc.birthday)) {
      const updateData: any = {};
      const descList: string[] = [];

      if (uc.name && uc.name !== contact.name) {
        updateData.name = uc.name;
        descList.push(`Nome atualizado para "${uc.name}"`);
      }
      if (uc.email && uc.email !== contact.email) {
        updateData.email = uc.email;
        descList.push(`E-mail atualizado para "${uc.email}"`);
      }
      if (uc.cpf && uc.cpf !== contact.cpf) {
        updateData.cpf = uc.cpf;
        descList.push(`CPF atualizado para "${uc.cpf}"`);
      }
      if (uc.birthday && uc.birthday !== contact.birthday) {
        updateData.birthday = uc.birthday;
        descList.push(`Data de Nascimento atualizada para "${uc.birthday}"`);
      }

      if (Object.keys(updateData).length > 0) {
        await db.from("contacts").update(updateData).eq("id", contactId);

        // Audit log
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "status_change",
          title: "Dados do perfil atualizados automaticamente via WhatsApp",
          description: descList.join(", "),
          metadata: { by: "AI", trigger_message_id: triggerMessageId },
        });
      }
    }

    // 5.2 Create Appointment
    const ca = result.create_appointment;
    if (ca && ca.requested && ca.start_time) {
      const startTime = ca.start_time;
      const endTime = ca.end_time || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
      const apptType = ca.type || "Consulta";
      const { data: newAppt, error: apptErr } = await db
        .from("appointments")
        .insert({
          clinic_id: accountId,
          patient_id: contactId,
          start_time: startTime,
          end_time: endTime,
          status: "provisional", // auto-agendado como provisório
          notes: ca.notes || "Agendamento automático estruturado pela inteligência artificial a partir de conversa no WhatsApp.",
          type: apptType,
        })
        .select("id")
        .single();

      if (!apptErr && newAppt) {
        // Audit log
        const formattedDate = new Date(startTime).toLocaleString("pt-BR");
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment",
          title: "Agendamento criado automaticamente via WhatsApp",
          description: `Consulta/Procedimento de ${apptType} agendado para o dia ${formattedDate}`,
          metadata: { by: "AI", appointment_id: newAppt.id, trigger_message_id: triggerMessageId },
        });
      }
    }

    // 5.3 Confirm Appointment
    const co = result.confirm_appointment;
    if (co && co.requested && co.appointment_id) {
      const { error: confirmErr } = await db
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", co.appointment_id);

      if (!confirmErr) {
        // Audit log
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment",
          title: "Agendamento confirmado automaticamente via WhatsApp",
          description: "O paciente confirmou a presença para a consulta futura.",
          metadata: { by: "AI", appointment_id: co.appointment_id, trigger_message_id: triggerMessageId },
        });
      }
    }

    // 5.4 Cancel Appointment
    const cn = result.cancel_appointment;
    if (cn && cn.requested && cn.appointment_id) {
      const { error: cancelErr } = await db
        .from("appointments")
        .update({ status: "provisional" }) // ou marcar cancelado se status existe, ou deletar. Provisional serve como cancelado/remover se filtrado
        .eq("id", cn.appointment_id);

      if (!cancelErr) {
        // Audit log
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment_cancelled",
          title: "Agendamento desmarcado via WhatsApp",
          description: "O agendamento futuro foi removido/desmarcado por solicitação do paciente.",
          metadata: { by: "AI", appointment_id: cn.appointment_id, trigger_message_id: triggerMessageId },
        });
      }
    }

    // 5.5 Update Deal CRM Fields
    const ud = result.update_deal;
    if (ud && (ud.temperature || ud.interest || ud.score !== null || ud.main_objection || ud.next_action)) {
      if (deal) {
        const updateData: any = {};
        const descList: string[] = [];

        if (ud.temperature && ud.temperature !== deal.temperature) {
          updateData.temperature = ud.temperature;
          descList.push(`Temperatura atualizada para "${ud.temperature}"`);
        }
        if (ud.interest && ud.interest !== deal.interest) {
          updateData.interest = ud.interest;
          descList.push(`Interesse atualizado para "${ud.interest}"`);
        }
        if (ud.score !== null && ud.score !== undefined && ud.score !== deal.score) {
          updateData.score = ud.score;
          descList.push(`Pontuação de interesse atualizada para ${ud.score}%`);
        }
        if (ud.main_objection && ud.main_objection !== deal.main_objection) {
          updateData.main_objection = ud.main_objection;
          descList.push(`Objeção principal identificada: "${ud.main_objection}"`);
        }
        if (ud.next_action && ud.next_action !== deal.next_action) {
          updateData.next_action = ud.next_action;
          descList.push(`Ação recomendada pela IA: "${ud.next_action}"`);
        }
        if (ud.waiting_side) {
          updateData.waiting_side = ud.waiting_side;
          updateData.waiting_since = isoNow;
        }

        if (Object.keys(updateData).length > 0) {
          await db.from("deals").update(updateData).eq("id", deal.id);

          // Audit log
          await db.from("contact_timeline").insert({
            account_id: accountId,
            contact_id: contactId,
            event_type: "deal_stage_change",
            title: "Métricas comerciais do CRM atualizadas pela IA",
            description: descList.join(", "),
            metadata: { by: "AI", deal_id: deal.id, trigger_message_id: triggerMessageId },
          });
        }
      }
    }

    // 5.6 Register Deposit (Sinal)
    const rd = result.register_deposit;
    if (rd && rd.paid && rd.value) {
      const val = Number(rd.value);
      const { data: newTx, error: txErr } = await db
        .from("financial_transactions")
        .insert({
          clinic_id: accountId,
          patient_id: contactId,
          date: new Date().toISOString().slice(0, 10),
          description: rd.notes || "Sinal de agendamento compensado via WhatsApp",
          category: "Sinal",
          method: "pix",
          type: "sinal",
          value: val,
          status: "paid",
        })
        .select("id")
        .single();

      if (!txErr && newTx) {
        // Audit log
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "payment",
          title: "Sinal recebido via WhatsApp (Registrado no Caixa)",
          description: `Valor de sinal de R$ ${val.toFixed(2)} registrado e compensado no caixa da clínica.`,
          metadata: { by: "AI", transaction_id: newTx.id, trigger_message_id: triggerMessageId },
        });
      }
    }
  } catch (err) {
    console.error("[AI Analyser] Error running semantic analysis:", err);
  }
}
