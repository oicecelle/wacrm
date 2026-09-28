import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES } from "@/lib/import/entities";
import type { EntityKey } from "@/lib/import/types";

// POST /api/import/ai-map
//
// Optional AI assist for the spreadsheet importer: given the column
// headers (and, only if the user opted in, up to 3 sample values per
// column), returns which system field each column most likely is.
//
// The deterministic detector (src/lib/import/detect.ts) always runs
// first and needs no AI; this only refines what it couldn't place.
// The model's answer is treated as untrusted input: only known field
// keys are accepted, and each field at most once.

const MAX_COLUMNS = 80;
const MAX_HEADER_LEN = 120;
const MAX_SAMPLE_LEN = 60;
const MODEL = process.env.IMPORT_AI_MODEL || "gpt-4o-mini";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "IA indisponível no momento." }, { status: 503 });
    }

    const body = await request.json();
    const entityKey = body?.entity as EntityKey;
    const entity = ENTITIES[entityKey];
    const headers: unknown = body?.headers;
    if (!entity || !Array.isArray(headers) || headers.length === 0 || headers.length > MAX_COLUMNS) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }
    const cleanHeaders = headers.map((h) => String(h ?? "").slice(0, MAX_HEADER_LEN));

    // Samples are optional and opt-in (they contain real patient data).
    const rawSamples: unknown = body?.samples;
    const samples: string[][] | null =
      Array.isArray(rawSamples) && rawSamples.length === cleanHeaders.length
        ? rawSamples.map((col) =>
            (Array.isArray(col) ? col : []).slice(0, 3).map((v) => String(v ?? "").slice(0, MAX_SAMPLE_LEN)),
          )
        : null;

    const fieldList = entity.fields
      .map((f) => `- ${f.key}: ${f.label} (tipo: ${f.type})${f.help ? ` — ${f.help}` : ""}`)
      .join("\n");
    const columnList = cleanHeaders
      .map((h, i) => {
        const ex = samples?.[i]?.filter(Boolean);
        return `${i}: "${h}"${ex && ex.length ? `  exemplos: ${ex.map((e) => `"${e}"`).join(" | ")}` : ""}`;
      })
      .join("\n");

    const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você associa colunas de planilhas de clínicas de estética/saúde (exportadas de outros sistemas, em português ou inglês) aos campos de um sistema de gestão. Responda SOMENTE com JSON.",
        },
        {
          role: "user",
          content:
            `Tipo de dado sendo importado: ${entity.label}.\n\nCampos disponíveis:\n${fieldList}\n\nColunas da planilha (índice: cabeçalho):\n${columnList}\n\n` +
            `Regras: cada coluna recebe no máximo UM campo, e cada campo pode ser usado em no máximo UMA coluna. ` +
            `Use null quando nenhuma opção servir ou houver dúvida real — não invente. ` +
            `Responda exatamente neste formato: {"mapping": {"0": "chave_do_campo_ou_null", "1": null, ...}} com todas as colunas.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { mapping?: Record<string, unknown> } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "A IA devolveu uma resposta inválida." }, { status: 502 });
    }

    const allowed = new Set(entity.fields.map((f) => f.key));
    const used = new Set<string>();
    const mapping: (string | null)[] = cleanHeaders.map((_, i) => {
      const v = parsed.mapping?.[String(i)];
      if (typeof v !== "string" || !allowed.has(v) || used.has(v)) return null;
      used.add(v);
      return v;
    });

    return NextResponse.json({ mapping });
  } catch (err) {
    console.error("[import/ai-map] error:", err);
    return NextResponse.json({ error: "Não foi possível consultar a IA agora." }, { status: 500 });
  }
}
