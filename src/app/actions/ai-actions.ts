import { getEnvOptional } from "@/lib/env";

export async function generateAISummary(messages: { sender: string; text: string }[]) {
  const apiKey = getEnvOptional("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Chave OpenAI não configurada no servidor.");
  }
  
  if (messages.length === 0) {
    return "Nenhuma mensagem do WhatsApp registrada para este paciente ainda. Inicie uma conversa para gerar o resumo.";
  }

  const prompt = `Você é um copiloto de inteligência artificial de uma clínica estética e médica.
Sua tarefa é analisar o histórico de conversas do WhatsApp com um paciente e criar um resumo executivo de no máximo 3 parágrafos.
Destaque:
1. O objetivo ou tratamento de interesse do paciente (ex: Botox, preenchimento, clareamento).
2. As principais objeções, dúvidas ou receios identificados (ex: preço, medo de agulha, falta de tempo).
3. Humor/estado emocional predominante e próximos passos acertados.

Responda em português de forma clara e profissional.

Conversa do WhatsApp:
${messages.map(m => `[${m.sender === 'patient' ? 'Paciente' : 'Clínica'}]: ${m.text}`).join('\n')}

Resumo Executivo:`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 400
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error response:", errText);
      throw new Error(`OpenAI retornou status ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "Não foi possível gerar o resumo.";
  } catch (err: any) {
    console.error("Error calling OpenAI:", err);
    throw new Error(err.message || "Falha na comunicação com a API do ChatGPT.");
  }
}

export async function askCopilot(question: string, contextData: any) {
  const apiKey = getEnvOptional("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Chave OpenAI não configurada no servidor.");
  }

  const prompt = `Você é o Copiloto IA interno do sistema LEAD PLUZ CRM da clínica.
Você ajuda a equipe da clínica a entender os dados de negócios, responder dúvidas operacionais e sugerir ações.
Aqui está o contexto atual de dados da clínica que você pode consultar para responder à pergunta:
${JSON.stringify(contextData, null, 2)}

Pergunta da equipe da clínica:
"${question}"

Responda em português de forma concisa, objetiva e amigável. Destaque métricas importantes ou ações recomendadas se for o caso.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error("Erro de comunicação com a OpenAI.");
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "Desculpe, não consegui formular uma resposta.";
  } catch (err: any) {
    console.error("Error in askCopilot:", err);
    throw new Error(err.message || "Erro ao consultar o Copiloto IA.");
  }
}

export async function generateAIDocument(
  procedure: string,
  risks: string,
  cuidados: string,
  observacoes: string,
  docType: string
) {
  const apiKey = getEnvOptional("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Chave OpenAI não configurada no servidor.");
  }

  const prompt = `Você é um assistente especialista em redação de documentos de saúde, estética e contratos jurídicos de prestação de serviços comerciais.
Sua tarefa é gerar um documento do tipo "${docType}" (ex: anamnese, consentimento, contrato) para o procedimento/serviço "${procedure}".

Informações inseridas pelo profissional:
- Riscos: ${risks || "Nenhum risco especial informado."}
- Cuidados necessários: ${cuidados || "Nenhum cuidado especial informado."}
- Observações adicionais: ${observacoes || "Nenhuma observação informada."}

O documento gerado deve conter:
1. Um título profissional adequado ao tipo de documento.
2. Cláusulas claras e termos formais de consentimento, riscos e deveres.
3. Seção para assinatura digital do contratante/cliente.

Responda em português de forma clara, estruturada e formal, formatado em HTML ou Markdown limpo para ser exibido diretamente.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      throw new Error(`Erro OpenAI: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "Não foi possível gerar o documento.";
  } catch (err: any) {
    console.error("Error generating AI document:", err);
    throw new Error(err.message || "Falha ao gerar documento com IA.");
  }
}
