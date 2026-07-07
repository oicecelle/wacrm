import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

// POST /api/ai/followup-suggestion
// body: { contact_name, last_message, deal_title?, deal_stage?, agent_name? }
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const body = await request.json()
    const { contact_name, last_message, deal_title, deal_stage, agent_name } = body

    if (!contact_name) {
      return NextResponse.json({ error: 'contact_name is required' }, { status: 400 })
    }

    const systemPrompt = `Você é um assistente especializado em comunicação para clínicas e negócios. 
Escreva mensagens de follow-up no WhatsApp que sejam:
- Curtas (máximo 3 linhas)
- Calorosas e profissionais
- Naturais, como se fossem escritas por um humano
- Em português brasileiro informal mas respeitoso
- Sem emojis excessivos (máximo 1)
- Diretas ao ponto, com um call-to-action suave`

    const userPrompt = `Crie uma mensagem curta de follow-up no WhatsApp para o lead "${contact_name}".
${last_message ? `A última mensagem recebida foi: "${last_message}"` : 'O lead não respondeu.'}
${deal_title ? `Contexto: ${deal_title}` : ''}
${deal_stage ? `Etapa do funil: ${deal_stage}` : ''}
${agent_name ? `O atendente é ${agent_name}.` : ''}

A mensagem deve ser natural, breve e incentivar o retorno do lead.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.7,
    })

    const suggestion = completion.choices[0]?.message?.content?.trim() || ''

    return NextResponse.json({ suggestion })
  } catch (e: any) {
    console.error('[ai/followup-suggestion] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
