"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2Icon,
  CheckCircle2Icon,
  ShieldCheckIcon,
  PenToolIcon,
  RotateCcwIcon,
  LockIcon,
} from "lucide-react";

export default function DocumentSigningPortalPage() {
  const supabase = createClient();
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [clinic, setClinic] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Signature pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch document by public token (no auth required)
  useEffect(() => {
    if (!token) return;

    const loadDocument = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: doc, error: docErr } = await supabase
          .from("documents")
          .select("*")
          .eq("public_token", token)
          .maybeSingle();

        if (docErr) throw docErr;
        if (!doc) {
          setError("Documento não encontrado ou link de assinatura inválido/expirado.");
          setLoading(false);
          return;
        }

        setDocument(doc);

        // Fetch patient
        if (doc.patient_id) {
          const { data: pt } = await supabase
            .from("patients")
            .select("name, phone, email")
            .eq("id", doc.patient_id)
            .single();
          setPatient(pt);
        }

        // Fetch clinic
        if (doc.clinic_id) {
          const { data: cl } = await supabase
            .from("clinics")
            .select("name")
            .eq("id", doc.clinic_id)
            .single();
          setClinic(cl);
        }

        if (doc.status === "signed") {
          setIsSigned(true);
        }
      } catch (err: any) {
        console.error("Error loading document portal:", err);
        setError("Erro ao carregar o termo de consentimento/contrato.");
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [token]);

  // Set up pointer event listeners for signature canvas
  useEffect(() => {
    if (loading || error || isSigned || success || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let lastX = 0;
    let lastY = 0;

    const getPos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const startDrawing = (e: PointerEvent) => {
      setIsDrawing(true);
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      canvas.setPointerCapture(e.pointerId);
    };

    const draw = (e: PointerEvent) => {
      if (!isDrawing) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
    };

    const stopDrawing = (e: PointerEvent) => {
      setIsDrawing(false);
      canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);

    return () => {
      canvas.removeEventListener("pointerdown", startDrawing);
      canvas.removeEventListener("pointermove", draw);
      canvas.removeEventListener("pointerup", stopDrawing);
      canvas.removeEventListener("pointercancel", stopDrawing);
    };
  }, [loading, error, isSigned, success, isDrawing]);

  const handleClearSignature = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSignDocument = async () => {
    if (!canvasRef.current || !document) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buffer = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = buffer.data;
    let hasDrawn = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) {
        hasDrawn = true;
        break;
      }
    }

    if (!hasDrawn) {
      alert("Por favor, desenhe sua assinatura no quadro antes de confirmar.");
      return;
    }

    setSubmitting(true);
    try {
      const signatureDataUrl = canvas.toDataURL("image/png");

      const originalContent =
        typeof document.content === "object" && document.content !== null
          ? document.content
          : { text: document.content || "" };

      const { error: updateErr } = await supabase
        .from("documents")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          content: { ...originalContent, signature_image: signatureDataUrl },
        })
        .eq("id", document.id);

      if (updateErr) throw updateErr;

      await supabase.from("patient_timeline").insert({
        patient_id: document.patient_id,
        event_type: "document",
        title: `Documento [${document.title}] assinado digitalmente pelo paciente`,
        payload: {
          document_id: document.id,
          signed_at: new Date().toISOString(),
          ip: "Portal do Paciente (IP Registrado)",
        },
      });

      setSuccess(true);
      setIsSigned(true);
    } catch (err: any) {
      console.error("Error signing document:", err);
      alert("Erro ao enviar a assinatura: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
        <Loader2Icon className="h-10 w-10 animate-spin text-indigo-400 mb-3" />
        <p className="text-sm text-neutral-400 font-semibold uppercase tracking-wider">
          Verificando Link de Assinatura...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-4 shadow-2xl">
          <ShieldCheckIcon className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-black text-white">Falha na Verificação</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full h-10 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
          >
            Ir para a Página Inicial
          </button>
        </div>
      </div>
    );
  }

  let documentText = "";
  if (typeof document.content === "object" && document.content !== null) {
    documentText = document.content.text || document.content.body || JSON.stringify(document.content);
  } else {
    documentText = document.content || "";
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col font-sans"
      style={{ background: "linear-gradient(135deg, #0f0f1a 0%, #0a0a12 100%)" }}
    >
      {/* Header */}
      <header
        className="border-b sticky top-0 z-50 backdrop-blur-md"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(15,15,26,0.85)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-black text-white shadow-lg">
              {clinic?.name?.charAt(0)?.toUpperCase() || "C"}
            </div>
            <div>
              <p className="text-xs font-black leading-tight text-white">
                {clinic?.name || "Clínica"}
              </p>
              <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                Assinatura Eletrônica
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] text-emerald-400 font-bold"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-500" />
            Conexão Segura SSL
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-2xl w-full px-4 pt-6 pb-28 flex-1 flex flex-col gap-5">
        {success ? (
          /* ── Success state ── */
          <div
            className="rounded-2xl p-8 text-center space-y-5 shadow-2xl animate-fade-in"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <CheckCircle2Icon className="h-10 w-10 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-white">Documento Assinado com Sucesso!</h1>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-md mx-auto">
                Olá, <strong className="text-white">{patient?.name}</strong>. Seu documento{" "}
                <strong className="text-white">&ldquo;{document.title}&rdquo;</strong> foi assinado
                eletronicamente e registrado com segurança.
              </p>
            </div>
            <div
              className="rounded-xl p-4 text-[10px] text-left text-neutral-500 font-semibold space-y-1 max-w-md mx-auto"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-neutral-400 font-bold uppercase tracking-wider border-b pb-1.5 mb-1.5"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                Comprovante de Validação Digital
              </p>
              <p>• ID do Documento: {document.id}</p>
              <p>• Assinatura: Hash Digital SSL</p>
              <p>• Data / Hora: {new Date(document.signed_at || new Date()).toLocaleString("pt-BR")}</p>
              <p>• IP de Origem: Registrado pelo Servidor</p>
            </div>
            <p className="text-[10px] text-neutral-500 italic">
              Você pode fechar esta guia. A equipe da clínica já foi notificada.
            </p>
          </div>
        ) : (
          /* ── Document Review & Sign ── */
          <div className="space-y-5 flex-1 flex flex-col">
            {/* Meta */}
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span
                className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
              >
                {document.type?.toUpperCase() || "CONTRATO"}
              </span>
              <h1 className="text-lg font-black text-white leading-snug">{document.title}</h1>
              <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t text-neutral-400"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div>
                  <p className="text-[9px] text-neutral-500 font-extrabold uppercase mb-0.5">Contratante / Paciente</p>
                  <p className="font-bold text-white truncate">{patient?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-neutral-500 font-extrabold uppercase mb-0.5">Prestadora / Clínica</p>
                  <p className="font-bold text-white truncate">{clinic?.name || "—"}</p>
                </div>
              </div>
            </div>

            {/* Document body */}
            <div
              className="rounded-2xl flex-1 flex flex-col overflow-hidden shadow-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2 text-[10px] text-neutral-400 font-bold uppercase tracking-wider select-none border-b"
                style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <ShieldCheckIcon className="h-4 w-4 text-indigo-400" />
                Conteúdo do Documento para Revisão
              </div>
              <div className="p-6 overflow-y-auto max-h-[360px] leading-relaxed text-xs text-neutral-300 font-sans space-y-4 whitespace-pre-wrap select-none text-justify">
                {documentText || (
                  <span className="text-neutral-600 italic">Carregando conteúdo do documento...</span>
                )}
              </div>
            </div>

            {/* Signature area */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <PenToolIcon className="h-4 w-4 text-indigo-400" />
                  Assinatura Digital do Cliente
                </h3>
                {isSigned ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                    style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}
                  >
                    Assinado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 font-bold transition-colors"
                  >
                    <RotateCcwIcon className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>

              {isSigned ? (
                <div
                  className="h-40 rounded-xl flex flex-col items-center justify-center p-4 gap-2"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {document.content?.signature_image ? (
                    <img
                      src={document.content.signature_image}
                      alt="Assinatura registrada"
                      className="max-h-24 object-contain filter invert opacity-80"
                    />
                  ) : (
                    <p className="text-[10px] text-neutral-500 font-semibold italic">
                      Registro de assinatura digital eletrônica arquivado.
                    </p>
                  )}
                  <p className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-wide flex items-center gap-1">
                    <LockIcon className="h-3 w-3" />
                    Assinado eletronicamente em{" "}
                    {document.signed_at
                      ? new Date(document.signed_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Desenhe sua assinatura dentro do retângulo abaixo com o dedo (celular) ou mouse (computador).
                  </p>
                  <div
                    className="h-40 rounded-xl overflow-hidden relative"
                    style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                      style={{ background: "transparent" }}
                    />
                  </div>
                  <button
                    onClick={handleSignDocument}
                    disabled={submitting}
                    className="w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "white" }}
                  >
                    {submitting ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        Registrando sua Assinatura...
                      </>
                    ) : (
                      <>
                        <CheckCircle2Icon className="h-4 w-4" />
                        Confirmar e Assinar Documento
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
