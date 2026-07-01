import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "mock-openai-key-for-build" });

// Supabase Admin bypass client
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
    );
  }
  return _adminClient;
}

// ─── Administrative Tool Definitions ──────────────────────────
const ADMIN_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_clinics",
      description: "Busca clínicas cadastradas na plataforma pelo nome.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou parte do nome da clínica" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_clinic_status",
      description: "Atualiza o status de uma clínica (ativa ou suspensa/suspended).",
      parameters: {
        type: "object",
        properties: {
          clinic_id: { type: "string", description: "ID único (UUID) da clínica" },
          status: { type: "string", enum: ["active", "suspended"], description: "Novo status da clínica" },
        },
        required: ["clinic_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_clinic_plan",
      description: "Altera o plano de assinatura da clínica e o prazo de expiração.",
      parameters: {
        type: "object",
        properties: {
          clinic_id: { type: "string", description: "ID único (UUID) da clínica" },
          plan: { type: "string", enum: ["basic", "professional", "enterprise", "master"], description: "Nome do plano" },
          expires_in_days: { type: "number", description: "Quantidade de dias de validade (ex: 30, 90, 180)" },
        },
        required: ["clinic_id", "plan", "expires_in_days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_user_role",
      description: "Altera a função/role de um usuário pelo email (ex: promover a system_admin ou rebaixar para user).",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email completo do usuário" },
          role: { type: "string", enum: ["system_admin", "user"], description: "Novo papel atribuído" },
        },
        required: ["email", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_system_alert",
      description: "Gera um alerta/notificação de sistema para uma clínica específica, que aparecerá no dashboard dela.",
      parameters: {
        type: "object",
        properties: {
          clinic_id: { type: "string", description: "ID único (UUID) da clínica (ou deixe vazio para alerta global)" },
          title: { type: "string", description: "Título curto do alerta" },
          message: { type: "string", description: "Mensagem detalhada do alerta" },
          severity: { type: "string", enum: ["info", "warning", "error"], description: "Gravidade do alerta" },
        },
        required: ["title", "message", "severity"],
      },
    },
  },
];

// Tool Executors
async function executeAdminTool(toolName: string, args: any): Promise<any> {
  const db = supabaseAdmin();

  switch (toolName) {
    case "search_clinics": {
      const { data, error } = await db
        .from("clinics")
        .select("id, name, status, plan, created_at")
        .ilike("name", `%${args.query}%`);
      if (error) throw error;
      return data;
    }
    case "update_clinic_status": {
      const { data, error } = await db
        .from("clinics")
        .update({ status: args.status })
        .eq("id", args.clinic_id)
        .select()
        .single();
      if (error) throw error;
      return { success: true, clinic: data };
    }
    case "update_clinic_plan": {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(args.expires_in_days));

      const { data, error } = await db
        .from("clinics")
        .update({ 
          plan: args.plan,
          plan_expires_at: expiresAt.toISOString()
        })
        .eq("id", args.clinic_id)
        .select()
        .single();
      if (error) throw error;
      return { success: true, clinic: data };
    }
    case "update_user_role": {
      const { data: userProfile, error: getErr } = await db
        .from("profiles")
        .select("id, email")
        .eq("email", args.email)
        .maybeSingle();

      if (getErr || !userProfile) {
        return { success: false, error: `Usuário com email ${args.email} não foi encontrado.` };
      }

      const { data, error } = await db
        .from("profiles")
        .update({ role: args.role })
        .eq("id", userProfile.id)
        .select()
        .single();
      if (error) throw error;
      return { success: true, profile: data };
    }
    case "create_system_alert": {
      const { data, error } = await db
        .from("system_alerts")
        .insert({
          clinic_id: args.clinic_id || null,
          title: args.title,
          message: args.message,
          severity: args.severity,
          occurrence_count: 1,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return { success: true, alert: data };
    }
    default:
      throw new Error(`Ferramenta administrativa não reconhecida: ${toolName}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = supabaseAdmin();
    
    // Validate session RLS bypass roles
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    let adminUser = null;
    if (token) {
      const { data: { user: u } } = await db.auth.getUser(token);
      adminUser = u;
    }

    if (!adminUser) {
      return NextResponse.json({ error: "Sessão expirada ou não autenticada." }, { status: 401 });
    }

    // Double check system admin role
    const { data: prof } = await db
      .from("profiles")
      .select("role")
      .eq("user_id", adminUser.id)
      .single();

    const hasAccess =
      prof?.role === "system_admin" ||
      adminUser.email === "marcelle@leadpluz.com.br" ||
      adminUser.email === "m.portela@live.com";

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado. Apenas administradores do sistema." }, { status: 403 });
    }

    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }

    // Call OpenAI GPT with tools config
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é o Copiloto do Backoffice Administrativo da LeadPluz.
Seu objetivo é auxiliar a equipe de suporte e fundadores a gerenciar clínicas, planos de assinatura, suspensões de contas, promoção de papéis de usuários (roles) e envio de alertas do sistema.

Você tem acesso a ferramentas especiais para consultar e alterar informações do banco de dados com bypass administrativo.
Sempre que o usuário solicitar uma alteração (como suspender conta, mudar plano, alterar role ou criar alerta), identifique a ferramenta correta e execute.
Responda sempre em português, de forma profissional, direta e clara.`
        },
        ...messages
      ],
      tools: ADMIN_TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0] as any;
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      try {
        const result = await executeAdminTool(name, args);
        
        // Return natural response explaining tool outcome
        const finalResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            ...messages,
            message,
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            }
          ]
        });

        return NextResponse.json({
          message: finalResponse.choices[0].message,
          toolRun: { name, args, result }
        });
      } catch (err: any) {
        return NextResponse.json({
          message: {
            role: "assistant",
            content: `Erro ao executar ação no banco de dados: ${err.message}`
          }
        });
      }
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("Error in admin copilot POST:", error);
    return NextResponse.json({ error: error.message || "Erro interno do servidor." }, { status: 500 });
  }
}
