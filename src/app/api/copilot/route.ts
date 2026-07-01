import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "mock-openai-key-for-build" });

// ─── Tool definitions for the Copilot ──────────────────────────
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Busca contatos (leads ou clientes) pelo nome ou telefone.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou parte do nome ou telefone" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description: "Cria um agendamento para um paciente.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nome do paciente" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Hora no formato HH:MM" },
          procedure: { type: "string", description: "Nome do procedimento (opcional)" },
          notes: { type: "string", description: "Observações adicionais (opcional)" },
        },
        required: ["contact_name", "date", "time"],
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
          limit: { type: "number", description: "Número máximo de leads a retornar (padrão 5)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Cria um lembrete/nota para um contato específico.",
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
      description: "Atualiza o status, interesse ou temperatura de um deal/lead no CRM.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string" },
          temperature: { type: "string", enum: ["hot", "warm", "cold"] },
          interest: { type: "string" },
          status: { type: "string" },
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
];

// ─── Tool executors ──────────────────────────────────────────────
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  try {
    if (toolName === "search_contacts") {
      const q = String(args.query || "");
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone, contact_type")
        .eq("account_id", accountId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(5);
      if (!data?.length) return `Nenhum contato encontrado para "${q}".`;
      return `Encontrei ${data.length} contato(s): ${data.map((c: { name: string; phone: string; contact_type: string }) => `${c.name} (${c.phone}) — ${c.contact_type}`).join("; ")}`;
    }

    if (toolName === "create_appointment") {
      const { contact_name, date, time, procedure, notes } = args as Record<string, string>;
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("account_id", accountId)
        .ilike("name", `%${contact_name}%`)
        .limit(1);

      if (!contacts?.length) return `Não encontrei nenhum contato com nome "${contact_name}". Verifique o nome e tente novamente.`;

      const contact = contacts[0];
      const startTime = new Date(`${date}T${time}:00`);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1h default

      const { error } = await supabase.from("appointments").insert({
        clinic_id: accountId,
        patient_id: contact.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "confirmed",
        type: procedure || null,
        notes: notes || null,
      });

      if (error) return `Erro ao criar agendamento: ${error.message}`;
      return `✅ Agendamento criado! ${contact.name} — ${new Date(startTime).toLocaleDateString("pt-BR")} às ${time}${procedure ? ` (${procedure})` : ""}.`;
    }

    if (toolName === "get_hot_leads") {
      const limit = Number(args.limit) || 5;
      const { data } = await supabase
        .from("deals")
        .select("title, temperature, score, interest, contacts(name, phone)")
        .eq("account_id", accountId)
        .eq("temperature", "hot")
        .order("score", { ascending: false })
        .limit(limit);

      if (!data?.length) return "Nenhum lead quente no momento.";
      return `Leads mais quentes:\n${data.map((d: { title: string; temperature: string; score: number; interest: string; contacts: unknown }, i: number) => {
        const c = Array.isArray(d.contacts) ? (d.contacts as Array<{ name: string }>)[0] : d.contacts as { name: string };
        return `${i + 1}. ${c?.name || d.title} — interesse: ${d.interest || "N/D"} — score: ${d.score}`;
      }).join("\n")}`;
    }

    if (toolName === "create_reminder") {
      const { contact_name, reminder_text } = args as Record<string, string>;
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("account_id", accountId)
        .ilike("name", `%${contact_name}%`)
        .limit(1);

      if (!contacts?.length) return `Não encontrei "${contact_name}" nos contatos.`;
      const contact = contacts[0];

      const { error } = await supabase.from("contact_notes").insert({
        contact_id: contact.id,
        account_id: accountId,
        note_text: `🔔 Lembrete: ${reminder_text}`,
      });

      if (error) return `Erro: ${error.message}`;
      return `✅ Lembrete criado para ${contact.name}: "${reminder_text}"`;
    }

    if (toolName === "update_deal_status") {
      const { contact_name, temperature, interest, status: dealStatus } = args as Record<string, string>;
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("account_id", accountId)
        .ilike("name", `%${contact_name}%`)
        .limit(1);

      if (!contacts?.length) return `Não encontrei "${contact_name}".`;

      const updates: Record<string, unknown> = {};
      if (temperature) updates.temperature = temperature;
      if (interest) updates.interest = interest;
      if (dealStatus) updates.status = dealStatus;

      const { error } = await supabase
        .from("deals")
        .update(updates)
        .eq("account_id", accountId)
        .eq("contact_id", contacts[0].id);

      if (error) return `Erro: ${error.message}`;
      return `✅ CRM de ${contact_name} atualizado: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ")}.`;
    }

    if (toolName === "get_dashboard_summary") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [leadsRes, apptsRes] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("contact_type", "lead"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", accountId).gte("start_time", startOfMonth),
      ]);

      return `📊 Resumo do mês:\n• Leads: ${leadsRes.count ?? 0}\n• Agendamentos no mês: ${apptsRes.count ?? 0}`;
    }

    return `Ação "${toolName}" não implementada.`;
  } catch (err) {
    return `Erro ao executar ${toolName}: ${err instanceof Error ? err.message : "erro desconhecido"}`;
  }
}

// ─── Main handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, account_id } = await req.json();

    if (!messages || !account_id) {
      return NextResponse.json({ error: "messages and account_id are required" }, { status: 400 });
    }

    const supabase = await createClient();

    const systemPrompt = `Você é o Copiloto do LeadPluz, um assistente inteligente para clínicas e profissionais da saúde, beleza e estética.
Você pode executar ações diretamente na plataforma: buscar contatos, criar agendamentos, criar lembretes, atualizar o CRM, e mostrar indicadores.
Responda sempre em português brasileiro. Seja direto, útil e profissional.
Quando o usuário pedir para agendar, lembrar, buscar ou atualizar algo, use as ferramentas disponíveis.
Após executar uma ação, confirme o resultado de forma clara.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 800,
    });

    const choice = response.choices[0];

    // Handle tool calls
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

      // Second call to get final text response after tools
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
        max_tokens: 500,
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
