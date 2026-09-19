import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

// ─── Admin Supabase client (service role) ───────────────────────────────────
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL", "https://scrhexfcbtdyubehbzml.supabase.co"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY", '')
    );
  }
  return _adminClient;
}

// ─── LIA label for all AI-created/updated records ───────────────────────────
const LIA_LABEL = "⚡ Criado pela LIA";
const LIA_UPDATED_LABEL = "⚡ Atualizado pela LIA";

// ─── Main export ─────────────────────────────────────────────────────────────
export async function analyseWhatsAppConversationWithAI(
  conversationId: string,
  contactId: string,
  accountId: string,
  triggerMessageId: string
) {
  const db = supabaseAdmin();

  try {
    // ─── 1. Fetch contact profile ─────────────────────────────────────────
    const { data: contact } = await db
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (!contact) {
      console.warn("[LIA Analyser] Contact not found:", contactId);
      return;
    }

    // ─── 2. Fetch or create deal ──────────────────────────────────────────
    const { data: deal } = await db
      .from("deals")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    let activeDeal = deal;
    if (!activeDeal) {
      console.log(`[LIA Analyser] No deal found for contact ${contactId}. Creating default deal...`);
      activeDeal = await seedDefaultDeal(db, contact, contactId, conversationId, accountId, triggerMessageId);
    }

    // ─── 3. Fetch default professional for this account ──────────────────
    const { data: defaultProfessional } = await db
      .from("clinic_users")
      .select("id, user_id, name")
      .eq("clinic_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const defaultProfessionalId = defaultProfessional?.user_id || null;

    // ─── 4. Check for OpenAI API key ─────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[LIA Analyser] OPENAI_API_KEY not configured. Skipping AI analysis.");
      return;
    }

    // ─── 5. Fetch last 20 messages (bidirectional — both patient & clinic) 
    const { data: messages } = await db
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) return;

    // Order chronologically
    const chronMessages = [...messages].reverse();

    // Check if the CLINIC sent any message recently (last 3 messages from clinic)
    const recentClinicMessages = chronMessages
      .filter((m) => m.sender_type === "agent")
      .slice(-3)
      .map((m) => m.content_text || "");

    // ─── 6. Fetch upcoming appointments ──────────────────────────────────
    const { data: upcomingAppts } = await db
      .from("appointments")
      .select("id, start_time, end_time, status, type, title")
      .eq("patient_id", contactId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    // ─── 7. Fetch pipeline stages for move_deal_stage ────────────────────
    let pipelineStages: any[] = [];
    if (activeDeal?.pipeline_id) {
      const { data: stages } = await db
        .from("pipeline_stages")
        .select("id, name, position")
        .eq("pipeline_id", activeDeal.pipeline_id)
        .order("position", { ascending: true });
      pipelineStages = stages || [];
    }

    // ─── 8. Build AI prompt ───────────────────────────────────────────────
    const nowStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const systemPrompt = `Você é a LIA — Inteligência Artificial do sistema LeadPluz CRM de uma clínica de saúde e estética.
Sua tarefa é analisar o histórico COMPLETO de conversas do WhatsApp (mensagens da clínica E do paciente) e identificar ações específicas a serem tomadas no CRM.
Hoje é: ${nowStr} (horário de Brasília — use isso para calcular referências como "amanhã", "segunda", "14h hoje").

DADOS DO PACIENTE:
- Nome: ${contact.name || "Não informado"}
- E-mail: ${contact.email || "Não informado"}
- CPF: ${contact.cpf || "Não informado"}
- Data Nascimento: ${contact.birthday || "Não informado"}
- Endereço: ${contact.address || "Não informado"}

AGENDAMENTOS FUTUROS:
${JSON.stringify(upcomingAppts || [], null, 2)}

STATUS DO NEGÓCIO NO CRM:
- Temperatura: ${activeDeal?.temperature || "warm"}
- Interesse: ${activeDeal?.interest || "Não informado"}
- Score: ${activeDeal?.score || 50}/100
- Objeção Principal: ${activeDeal?.main_objection || "Nenhuma"}
- Stage atual ID: ${activeDeal?.stage_id || "N/A"}

ESTÁGIOS DISPONÍVEIS NO FUNIL:
${JSON.stringify(pipelineStages, null, 2)}

HISTÓRICO DA CONVERSA (mais antigas → mais recentes):
${chronMessages
  .map(
    (m) =>
      `[${m.sender_type === "customer" ? "PACIENTE" : "CLÍNICA"} - ${new Date(
        m.created_at
      ).toLocaleTimeString("pt-BR")}]: ${m.content_text || "[mídia]"}`
  )
  .join("\n")}

ÚLTIMAS MENSAGENS DA CLÍNICA:
${recentClinicMessages.join("\n") || "Nenhuma"}

=== REGRAS CRÍTICAS ===

REGRA DE AGENDAMENTO: O campo create_appointment.requested SÓ deve ser true se a CLÍNICA (não o paciente) enviou uma mensagem nas últimas trocas CONFIRMANDO explicitamente que o agendamento foi criado/marcado (ex: "Agendamento marcado!", "Confirmado para dia X às Y!", "Seu horário está reservado!"). NÃO criar apenas porque o paciente pediu.

REGRA DE CANCELAMENTO: cancel_appointment.requested SÓ deve ser true se o paciente claramente cancelou e a clínica confirmou o cancelamento — ou se a mensagem é inequívoca (ex: "preciso cancelar", "não vou conseguir ir").

REGRA DO FUNIL: move_deal_stage.stage_id só deve ser preenchido se houver uma progressão clara (ex: score > 70 → mover para "Qualificado"; mencionou pagamento → "Proposta Aceita"). Use o stage_id correto dos ESTÁGIOS DISPONÍVEIS acima.

Responda APENAS com um JSON válido seguindo este schema exato:
{
  "update_contact": {
    "name": "Nome completo extraído, caso contrário null",
    "email": "E-mail extraído, caso contrário null",
    "cpf": "CPF extraído (somente números), caso contrário null",
    "birthday": "Data YYYY-MM-DD extraída, caso contrário null",
    "address": "Endereço completo extraído, caso contrário null"
  },
  "create_appointment": {
    "requested": false,
    "start_time": "ISO YYYY-MM-DDTHH:mm:ss apenas se CLÍNICA confirmou, caso contrário null",
    "end_time": "ISO YYYY-MM-DDTHH:mm:ss (1h depois do start_time), caso contrário null",
    "type": "Tipo do procedimento confirmado pela clínica, caso contrário null",
    "notes": "Notas sobre a consulta, caso contrário null"
  },
  "confirm_appointment": {
    "requested": false,
    "appointment_id": "UUID do agendamento a confirmar, caso contrário null"
  },
  "cancel_appointment": {
    "requested": false,
    "appointment_id": "UUID do agendamento a cancelar, caso contrário null"
  },
  "reschedule_appointment": {
    "requested": false,
    "appointment_id": "UUID do agendamento a reagendar, caso contrário null",
    "new_start_time": "Novo horário ISO, caso contrário null",
    "new_end_time": "Novo horário de fim ISO, caso contrário null",
    "reason": "Motivo da remarcação se mencionado, caso contrário null"
  },
  "update_deal": {
    "temperature": "hot|warm|cold baseado na intenção atual, caso contrário null",
    "interest": "Procedimento de interesse identificado, caso contrário null",
    "score": null,
    "main_objection": "Objeção identificada (preço, horário, medo, distância, etc), caso contrário null",
    "next_action": "Próxima ação comercial recomendada para a clínica, caso contrário null",
    "waiting_side": "us se aguardamos resposta da clínica, lead se aguardamos resposta do paciente, caso contrário null"
  },
  "move_deal_stage": {
    "requested": false,
    "stage_id": "UUID do novo estágio apenas se houver progressão clara, caso contrário null",
    "reason": "Motivo da mudança de estágio, caso contrário null"
  },
  "create_quote_draft": {
    "requested": false,
    "procedures": ["nome do procedimento 1", "nome do procedimento 2"],
    "notes": "Observações sobre o orçamento solicitado, caso contrário null"
  },
  "register_deposit": {
    "paid": false,
    "value": null,
    "notes": "Detalhes do pagamento, caso contrário null"
  },
  "acknowledge_record": {
    "requested": false,
    "record_id": null
  }
}`;

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log("[LIA Analyser] Result:", JSON.stringify(result, null, 2));

    const isoNow = new Date().toISOString();
    const auditMeta = { by: "LIA", trigger_message_id: triggerMessageId };

    // ─── 9. Execute CRM updates ───────────────────────────────────────────

    // 9.1 Update Contact Profile
    const uc = result.update_contact;
    if (uc) {
      const updateData: Record<string, any> = {};
      const descList: string[] = [];

      if (uc.name && uc.name !== contact.name) { updateData.name = uc.name; descList.push(`Nome: "${uc.name}"`); }
      if (uc.email && uc.email !== contact.email) { updateData.email = uc.email; descList.push(`E-mail: "${uc.email}"`); }
      if (uc.cpf && uc.cpf !== contact.cpf) { updateData.cpf = uc.cpf; descList.push(`CPF: "${uc.cpf}"`); }
      if (uc.birthday && uc.birthday !== contact.birthday) { updateData.birthday = uc.birthday; descList.push(`Nascimento: "${uc.birthday}"`); }
      if (uc.address && uc.address !== contact.address) { updateData.address = uc.address; descList.push(`Endereço: "${uc.address}"`); }

      if (Object.keys(updateData).length > 0) {
        await db.from("contacts").update(updateData).eq("id", contactId);
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "status_change",
          title: `${LIA_UPDATED_LABEL} — Dados do perfil`,
          description: descList.join(", "),
          metadata: auditMeta,
        });
        console.log("[LIA Analyser] Updated contact profile:", descList);
      }
    }

    // 9.2 Create Appointment (ONLY when clinic confirmed)
    const ca = result.create_appointment;
    if (ca?.requested && ca.start_time) {
      const startTime = ca.start_time;
      const endTime = ca.end_time || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
      const apptType = ca.type || "Consulta";

      const { data: newAppt, error: apptErr } = await db
        .from("appointments")
        .insert({
          clinic_id: accountId,
          patient_id: contactId,
          professional_id: defaultProfessionalId,
          start_time: startTime,
          end_time: endTime,
          status: "provisional",
          type: apptType,
          notes: ca.notes
            ? `${ca.notes}\n\n${LIA_LABEL}`
            : LIA_LABEL,
          created_by_ai: true,
          ai_label: LIA_LABEL,
        })
        .select("id")
        .single();

      if (!apptErr && newAppt) {
        const formattedDate = new Date(startTime).toLocaleString("pt-BR");
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment",
          title: `${LIA_LABEL} — Agendamento criado`,
          description: `${apptType} agendado para ${formattedDate}`,
          metadata: { ...auditMeta, appointment_id: newAppt.id },
        });
        console.log("[LIA Analyser] Created appointment:", newAppt.id);
      } else if (apptErr) {
        console.error("[LIA Analyser] Error creating appointment:", apptErr);
      }
    }

    // 9.3 Confirm Appointment
    const co = result.confirm_appointment;
    if (co?.requested && co.appointment_id) {
      // Defense in depth: the AI's returned appointment_id is trusted
      // input from a probabilistic model, and this runs on the
      // service-role client (bypasses RLS entirely). Scoping the
      // update by clinic_id + patient_id means a hallucinated or
      // miscopied id can, at worst, match nothing — never touch
      // another clinic's or another patient's appointment.
      const { data: updated } = await db
        .from("appointments")
        .update({
          status: "confirmed",
          ai_label: LIA_UPDATED_LABEL,
        })
        .eq("id", co.appointment_id)
        .eq("clinic_id", accountId)
        .eq("patient_id", contactId)
        .select("id")
        .maybeSingle();

      if (updated) {
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment",
          title: `${LIA_UPDATED_LABEL} — Agendamento confirmado`,
          description: "O paciente confirmou presença via WhatsApp.",
          metadata: { ...auditMeta, appointment_id: co.appointment_id },
        });
        console.log("[LIA Analyser] Confirmed appointment:", co.appointment_id);
      } else {
        console.warn("[LIA Analyser] confirm_appointment: id not found for this clinic/patient, skipped:", co.appointment_id);
      }
    }

    // 9.4 Cancel Appointment
    const cn = result.cancel_appointment;
    if (cn?.requested && cn.appointment_id) {
      const { data: updated } = await db
        .from("appointments")
        .update({
          status: "cancelled",
          ai_label: LIA_UPDATED_LABEL,
          notes: `Cancelado pelo paciente via WhatsApp. ${LIA_UPDATED_LABEL}`,
        })
        .eq("id", cn.appointment_id)
        .eq("clinic_id", accountId)
        .eq("patient_id", contactId)
        .select("id")
        .maybeSingle();

      if (updated) {
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment_cancelled",
          title: `${LIA_UPDATED_LABEL} — Agendamento cancelado`,
          description: "O paciente solicitou cancelamento via WhatsApp.",
          metadata: { ...auditMeta, appointment_id: cn.appointment_id },
        });
        console.log("[LIA Analyser] Cancelled appointment:", cn.appointment_id);
      } else {
        console.warn("[LIA Analyser] cancel_appointment: id not found for this clinic/patient, skipped:", cn.appointment_id);
      }
    }

    // 9.5 Reschedule Appointment
    const re = result.reschedule_appointment;
    if (re?.requested && re.appointment_id && re.new_start_time) {
      const newEnd = re.new_end_time || new Date(new Date(re.new_start_time).getTime() + 60 * 60 * 1000).toISOString();
      const { data: updated } = await db
        .from("appointments")
        .update({
          start_time: re.new_start_time,
          end_time: newEnd,
          status: "provisional",
          ai_label: LIA_UPDATED_LABEL,
          notes: `Remarcado${re.reason ? ` (motivo: ${re.reason})` : ""} via WhatsApp. ${LIA_UPDATED_LABEL}`,
        })
        .eq("id", re.appointment_id)
        .eq("clinic_id", accountId)
        .eq("patient_id", contactId)
        .select("id")
        .maybeSingle();

      if (updated) {
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "appointment_rescheduled",
          title: `${LIA_UPDATED_LABEL} — Agendamento remarcado`,
          description: `Novo horário: ${new Date(re.new_start_time).toLocaleString("pt-BR")}${re.reason ? `. Motivo: ${re.reason}` : ""}`,
          metadata: { ...auditMeta, appointment_id: re.appointment_id },
        });
        console.log("[LIA Analyser] Rescheduled appointment:", re.appointment_id);
      } else {
        console.warn("[LIA Analyser] reschedule_appointment: id not found for this clinic/patient, skipped:", re.appointment_id);
      }
    }

    // 9.6 Update Deal CRM Fields
    const ud = result.update_deal;
    if (ud && activeDeal) {
      const updateData: Record<string, any> = {};
      const descList: string[] = [];

      if (ud.temperature && ud.temperature !== activeDeal.temperature) {
        updateData.temperature = ud.temperature;
        descList.push(`Temperatura → "${ud.temperature}"`);
      }
      if (ud.interest && ud.interest !== activeDeal.interest) {
        updateData.interest = ud.interest;
        descList.push(`Interesse → "${ud.interest}"`);
      }
      if (ud.score !== null && ud.score !== undefined && ud.score !== activeDeal.score) {
        updateData.score = ud.score;
        descList.push(`Score → ${ud.score}/100`);
      }
      if (ud.main_objection && ud.main_objection !== activeDeal.main_objection) {
        updateData.main_objection = ud.main_objection;
        descList.push(`Objeção → "${ud.main_objection}"`);
      }
      if (ud.next_action && ud.next_action !== activeDeal.next_action) {
        updateData.next_action = ud.next_action;
        descList.push(`Próxima ação → "${ud.next_action}"`);
      }
      if (ud.waiting_side) {
        updateData.waiting_side = ud.waiting_side;
        updateData.waiting_since = isoNow;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.last_ai_update_at = isoNow;
        await db.from("deals").update(updateData).eq("id", activeDeal.id);

        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "deal_stage_change",
          title: `${LIA_UPDATED_LABEL} — CRM atualizado`,
          description: descList.join(", "),
          metadata: { ...auditMeta, deal_id: activeDeal.id },
        });
        console.log("[LIA Analyser] Updated deal:", descList);
      }
    }

    // 9.7 Move Deal Stage
    const ms = result.move_deal_stage;
    if (ms?.requested && ms.stage_id && activeDeal && ms.stage_id !== activeDeal.stage_id) {
      const targetStage = pipelineStages.find((s) => s.id === ms.stage_id);
      if (targetStage) {
        await db.from("deals")
          .update({
            stage_id: ms.stage_id,
            last_ai_update_at: isoNow,
          })
          .eq("id", activeDeal.id);

        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "deal_stage_change",
          title: `${LIA_UPDATED_LABEL} — Movido no funil`,
          description: `Lead movido para "${targetStage.name}"${ms.reason ? `. Motivo: ${ms.reason}` : ""}`,
          metadata: { ...auditMeta, deal_id: activeDeal.id, stage_name: targetStage.name },
        });
        console.log("[LIA Analyser] Moved deal stage to:", targetStage.name);
      }
    }

    // 9.8 Create Quote Draft
    const qd = result.create_quote_draft;
    if (qd?.requested && qd.procedures && qd.procedures.length > 0) {
      // Try to look up procedure IDs by name
      const procedureNames: string[] = qd.procedures;
      const { data: foundProcedures } = await db
        .from("procedures")
        .select("id, name, valor, price")
        .eq("account_id", accountId)
        .in("name", procedureNames);

      const lineItems = procedureNames.map((pName: string) => {
        const found = (foundProcedures || []).find((fp: any) =>
          fp.name.toLowerCase().includes(pName.toLowerCase())
        );
        return {
          item_type: "procedure",
          item_id: found?.id || null,
          name: pName,
          quantity: 1,
          unit_price: found?.valor || found?.price || 0,
          total_price: found?.valor || found?.price || 0,
        };
      });

      const { data: newQuote, error: quoteErr } = await db
        .from("quotes")
        .insert({
          account_id: accountId,
          contact_id: contactId,
          status: "draft",
          items: lineItems,
          notes: qd.notes ? `${qd.notes}\n\n${LIA_LABEL}` : LIA_LABEL,
          discount_type: "fixed",
          discount_value: 0,
          created_by_ai: true,
        })
        .select("id")
        .single();

      if (!quoteErr && newQuote) {
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "quote_sent",
          title: `${LIA_LABEL} — Orçamento rascunho criado`,
          description: `Procedimentos detectados: ${procedureNames.join(", ")}`,
          metadata: { ...auditMeta, quote_id: newQuote.id },
        });
        console.log("[LIA Analyser] Created quote draft:", newQuote.id);
      } else if (quoteErr) {
        console.error("[LIA Analyser] Error creating quote draft:", quoteErr);
      }
    }

    // 9.9 Register Deposit
    const rd = result.register_deposit;
    if (rd?.paid && rd.value) {
      const val = Number(rd.value);
      const { data: newTx, error: txErr } = await db
        .from("financial_transactions")
        .insert({
          clinic_id: accountId,
          patient_id: contactId,
          date: new Date().toISOString().slice(0, 10),
          description: rd.notes
            ? `${rd.notes} — ${LIA_LABEL}`
            : `Sinal via WhatsApp — ${LIA_LABEL}`,
          category: "Sinal",
          method: "pix",
          type: "sinal",
          value: val,
          status: "paid",
        })
        .select("id")
        .single();

      if (!txErr && newTx) {
        await db.from("contact_timeline").insert({
          account_id: accountId,
          contact_id: contactId,
          event_type: "payment",
          title: `${LIA_LABEL} — Sinal recebido`,
          description: `R$ ${val.toFixed(2)} registrado no caixa.`,
          metadata: { ...auditMeta, transaction_id: newTx.id },
        });
        console.log("[LIA Analyser] Registered deposit:", val);
      }
    }

    // 9.10 Acknowledge Patient Record
    const ar = result.acknowledge_record;
    if (ar?.requested) {
      const { data: latestRec } = await db
        .from("patient_records")
        .select("id")
        .eq("patient_id", contactId)
        .not("ciente_sent_at", "is", null)
        .eq("patient_acknowledged", false)
        .order("ciente_sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const recId = ar.record_id || latestRec?.id;
      if (recId) {
        // Same defense-in-depth as the appointment actions above —
        // ar.record_id can come straight from the AI's output, so
        // scope the update to this patient regardless of source.
        const { data: updated } = await db
          .from("patient_records")
          .update({ patient_acknowledged: true, acknowledged_at: isoNow })
          .eq("id", recId)
          .eq("patient_id", contactId)
          .select("id")
          .maybeSingle();

        if (updated) {
          await db.from("contact_timeline").insert({
            account_id: accountId,
            contact_id: contactId,
            event_type: "payment",
            title: `${LIA_UPDATED_LABEL} — Ciência confirmada`,
            description: "Paciente confirmou ciência do atendimento via WhatsApp.",
            metadata: { ...auditMeta, record_id: recId },
          });
        }
      }
    }
  } catch (err) {
    console.error("[LIA Analyser] Error:", err);
  }
}

// ─── Helper: Seed default pipeline + deal when none exists ───────────────────
async function seedDefaultDeal(
  db: any,
  contact: any,
  contactId: string,
  conversationId: string,
  accountId: string,
  triggerMessageId: string
): Promise<any | null> {
  const { data: pipelines } = await db
    .from("pipelines")
    .select("id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1);

  let pipelineId = pipelines?.[0]?.id;
  let stageId = "";
  let stageName = "Novo Lead";

  if (!pipelineId) {
    const { data: newPipe } = await db
      .from("pipelines")
      .insert({
        user_id: contact.user_id,
        account_id: accountId,
        name: "Funil de Vendas",
      })
      .select()
      .single();

    if (newPipe) {
      pipelineId = newPipe.id;
      const defaultStages = [
        { name: "Novo Lead", color: "#3b82f6", position: 0 },
        { name: "Qualificado", color: "#eab308", position: 1 },
        { name: "Proposta Enviada", color: "#f97316", position: 2 },
        { name: "Negociação", color: "#8b5cf6", position: 3 },
        { name: "Ganha", color: "#22c55e", position: 4 },
      ];
      const { data: seededStages } = await db
        .from("pipeline_stages")
        .insert(defaultStages.map((s) => ({ pipeline_id: pipelineId, ...s })))
        .select();

      if (seededStages?.length) {
        const sorted = [...seededStages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        stageId = sorted[0].id;
        stageName = sorted[0].name;
      }
    }
  }

  if (pipelineId && !stageId) {
    const { data: stages } = await db
      .from("pipeline_stages")
      .select("id, name")
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true })
      .limit(1);

    if (stages?.length) {
      stageId = stages[0].id;
      stageName = stages[0].name;
    }
  }

  if (!pipelineId || !stageId) return null;

  const { data: newDeal } = await db
    .from("deals")
    .insert({
      user_id: contact.user_id,
      account_id: accountId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      contact_id: contactId,
      conversation_id: conversationId,
      title: contact.name || contact.phone || "Novo Lead",
      value: 0,
      status: "open",
      score: 50,
      temperature: "warm",
    })
    .select()
    .single();

  if (newDeal) {
    await db.from("contact_timeline").insert({
      account_id: accountId,
      contact_id: contactId,
      event_type: "deal_stage_change",
      title: "⚡ Criado pela LIA — Lead adicionado ao funil",
      description: `Lead adicionado ao funil "Funil de Vendas" na etapa "${stageName}".`,
      metadata: { by: "LIA", deal_id: newDeal.id, trigger_message_id: triggerMessageId },
    });
  }

  return newDeal || null;
}
