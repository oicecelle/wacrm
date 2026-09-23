import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "mock-openai-key-for-build" });

// POST /api/copilot/transcribe
// Accepts a recorded voice message (multipart/form-data, field "audio")
// and returns its transcript via Whisper, so the person can talk to
// LIA the same way they'd dictate a message here in this chat. Auth
// is just "is signed in" — same bar as the rest of the copilot API,
// no separate account check needed since this endpoint never touches
// account data, only converts audio to text.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Nenhum áudio enviado." }, { status: 400 });
    }
    if (audio.size > 16 * 1024 * 1024) {
      return NextResponse.json({ error: "Áudio grande demais (máximo 16 MB)." }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language: "pt",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error("[copilot/transcribe] error:", err);
    return NextResponse.json({ error: "Não consegui transcrever o áudio. Tenta de novo?" }, { status: 500 });
  }
}
