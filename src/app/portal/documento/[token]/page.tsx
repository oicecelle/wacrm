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
  const [templateVariables, setTemplateVariables] = useState<
    { key: string; label: string; type: "text" | "procedure"; fill_by: "staff" | "patient" }[]
  >([]);
  const [patientFormValues, setPatientFormValues] = useState<Record<string, string>>({});
  const [savingVariables, setSavingVariables] = useState(false);
  const [variablesResolved, setVariablesResolved] = useState(false);
  const [procedureOptions, setProcedureOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Signature pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [signatureProof, setSignatureProof] = useState<{ ip?: string; contentHash?: string; signedAt?: string } | null>(null);

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

        // If this document came from a template, load its variable
        // definitions — needed to know which {{placeholders}}, if
        // any, are meant to be filled in by the contact themselves
        // before they see the document at all.
        if (doc.template_id) {
          const { data: tmpl } = await supabase
            .from("document_templates")
            .select("variables")
            .eq("id", doc.template_id)
            .maybeSingle();
          const vars = tmpl?.variables || [];
          setTemplateVariables(vars);

          const needsProcedures = vars.some(
            (v: { type: string; fill_by: string }) => v.type === "procedure" && v.fill_by === "patient",
          );
          if (needsProcedures && doc.clinic_id) {
            const { data: procs } = await supabase
              .from("procedures")
              .select("id, name")
              .eq("clinic_id", doc.clinic_id)
              .eq("ativo", true)
              .order("name");
            setProcedureOptions(procs || []);
          }
        }

        // First open of this link — mark it viewed (fire-and-forget;
        // the signing flow shouldn't block or fail on this).
        fetch("/api/documents/mark-viewed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => {});

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

    ctx.strokeStyle = "#2563eb";
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

      const res = await fetch("/api/documents/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao registrar a assinatura.");

      setSignatureProof({ ip: data.ip, contentHash: data.contentHash, signedAt: data.signedAt });
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
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4">
        <Loader2Icon className="h-10 w-10 animate-spin text-primary mb-3" />
        <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">
          Verificando Link de Assinatura...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xl">
          <ShieldCheckIcon className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-black text-slate-800">Falha na Verificação</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary-hover transition-colors shadow-xs"
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

  // Only variables that (a) are meant for the contact to fill and
  // (b) still literally appear as {{key}} in the text — a document
  // reloaded after already being resolved once shouldn't ask again.
  const pendingPatientVars = templateVariables.filter(
    (v) => v.fill_by === "patient" && documentText.includes(`{{${v.key}}}`),
  );
  const needsPatientForm = pendingPatientVars.length > 0 && !variablesResolved && !isSigned;

  async function handleSubmitPatientForm() {
    const missing = pendingPatientVars.find((v) => !patientFormValues[v.key]?.trim());
    if (missing) {
      alert(`Preencha "${missing.label}" antes de continuar.`);
      return;
    }
    setSavingVariables(true);
    try {
      let filledText = documentText;
      for (const v of pendingPatientVars) {
        filledText = filledText.replace(
          new RegExp(`\\{\\{${v.key}\\}\\}`, "gi"),
          patientFormValues[v.key] || "",
        );
      }
      const mergedValues = { ...(document.variable_values || {}), ...patientFormValues };
      const { error: updateErr } = await supabase
        .from("documents")
        .update({ content: { text: filledText }, variable_values: mergedValues })
        .eq("id", document.id);
      if (updateErr) throw updateErr;

      setDocument((prev: any) => ({ ...prev, content: { text: filledText }, variable_values: mergedValues }));
      setVariablesResolved(true);
    } catch (err) {
      console.error("Error saving patient-filled variables:", err);
      alert("Não conseguimos salvar essas informações. Tente novamente.");
    } finally {
      setSavingVariables(false);
    }
  }

  if (needsPatientForm) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="text-center space-y-1">
            <ShieldCheckIcon className="h-8 w-8 text-primary mx-auto" />
            <h1 className="text-base font-black text-slate-800">Antes de continuar</h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              Preencha essas informações pra gente montar o documento certinho pra você.
            </p>
          </div>

          <div className="space-y-3">
            {pendingPatientVars.map((v) => (
              <div key={v.key}>
                <label className="text-xs font-semibold text-slate-700">{v.label}</label>
                {v.type === "procedure" ? (
                  <select
                    value={patientFormValues[v.key] || ""}
                    onChange={(e) => setPatientFormValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">Selecione...</option>
                    {procedureOptions.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={patientFormValues[v.key] || ""}
                    onChange={(e) => setPatientFormValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                    placeholder={v.label}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSubmitPatientForm}
            disabled={savingVariables}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {savingVariables ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Continuar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-slate-800 flex flex-col font-sans bg-slate-50"
    >
      {/* Header */}
      <header
        className="border-b sticky top-0 z-50 bg-white/95 backdrop-blur-md border-slate-200"
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-sm font-black text-primary-foreground shadow-lg">
              {clinic?.name?.charAt(0)?.toUpperCase() || "C"}
            </div>
            <div>
              <p className="text-xs font-black leading-tight text-slate-800">
                {clinic?.name || "Clínica"}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Assinatura Eletrônica
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100">
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
            className="rounded-2xl p-8 text-center space-y-5 bg-white border border-slate-200 shadow-sm animate-fade-in"
          >
            <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto bg-emerald-50 border border-emerald-100">
              <CheckCircle2Icon className="h-10 w-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-900">Documento Assinado com Sucesso!</h1>
              <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                Olá, <strong className="text-slate-800">{patient?.name}</strong>. Seu documento{" "}
                <strong className="text-slate-800">&ldquo;{document.title}&rdquo;</strong> foi assinado
                eletronicamente e registrado com segurança.
              </p>
            </div>
            <div
              className="rounded-xl p-4 text-[10px] text-left text-slate-500 font-semibold space-y-1 max-w-md mx-auto bg-slate-50 border border-slate-200"
            >
              <p className="text-slate-700 font-bold uppercase tracking-wider border-b pb-1.5 mb-1.5 border-slate-200">
                Comprovante de Validação Digital
              </p>
              <p>• ID do Documento: {document.id}</p>
              <p>• Assinatura: Desenhada digitalmente pelo signatário</p>
              <p>• Data / Hora: {new Date(signatureProof?.signedAt || document.signed_at || new Date()).toLocaleString("pt-BR")}</p>
              <p>• IP de Origem: {signatureProof?.ip || "não disponível"}</p>
              {signatureProof?.contentHash && (
                <p className="break-all">• Hash SHA-256 do conteúdo: {signatureProof.contentHash}</p>
              )}
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Você pode fechar esta guia. A equipe da clínica já foi notificada.
            </p>
          </div>
        ) : (
          /* ── Document Review & Sign ── */
          <div className="space-y-5 flex-1 flex flex-col">
            {/* Meta */}
            <div
              className="rounded-2xl p-5 space-y-3 bg-white border border-slate-200 shadow-xs"
            >
              <span
                className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block bg-primary-soft text-primary border border-primary-soft-2"
              >
                {document.type?.toUpperCase() || "CONTRATO"}
              </span>
              <h1 className="text-lg font-black text-slate-900 leading-snug">{document.title}</h1>
              <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t text-slate-500 border-slate-100">
                <div>
                  <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Contratante / Paciente</p>
                  <p className="font-bold text-slate-800 truncate">{patient?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Prestadora / Clínica</p>
                  <p className="font-bold text-slate-800 truncate">{clinic?.name || "—"}</p>
                </div>
              </div>
            </div>

            {/* Document body */}
            <div
              className="rounded-2xl flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 shadow-xs"
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider select-none border-b bg-slate-50 border-slate-100"
              >
                <ShieldCheckIcon className="h-4 w-4 text-primary" />
                Conteúdo do Documento para Revisão
              </div>
              {document.pdf_url ? (
                <iframe
                  src={document.pdf_url}
                  title={document.title || "Documento"}
                  className="w-full h-[420px] border-0"
                />
              ) : (
                <div className="p-6 overflow-y-auto max-h-[360px] leading-relaxed text-xs text-slate-700 font-sans space-y-4 whitespace-pre-wrap select-none text-justify">
                  {documentText || (
                    <span className="text-slate-400 italic">Carregando conteúdo do documento...</span>
                  )}
                </div>
              )}
            </div>

            {/* Signature area */}
            <div
              className="rounded-2xl p-5 space-y-4 bg-white border border-slate-200 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <PenToolIcon className="h-4 w-4 text-primary" />
                  Assinatura Digital do Cliente
                </h3>
                {isSigned ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100"
                  >
                    Assinado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 font-bold transition-colors"
                  >
                    <RotateCcwIcon className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>

              {isSigned ? (
                <div
                  className="h-40 rounded-xl flex flex-col items-center justify-center p-4 gap-2 bg-slate-50 border border-slate-200"
                >
                  {document.content?.signature_image ? (
                    <img
                      src={document.content.signature_image}
                      alt="Assinatura registrada"
                      className="max-h-24 object-contain opacity-90"
                    />
                  ) : (
                    <p className="text-[10px] text-slate-400 font-semibold italic">
                      Registro de assinatura digital eletrônica arquivado.
                    </p>
                  )}
                  <p className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wide flex items-center gap-1">
                    <LockIcon className="h-3 w-3" />
                    Assinado eletronicamente em{" "}
                    {document.signed_at
                      ? new Date(document.signed_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Desenhe sua assinatura dentro do retângulo abaixo com o dedo (celular) ou mouse (computador).
                  </p>
                  <div
                    className="h-40 rounded-xl overflow-hidden relative bg-white border border-slate-200 shadow-inner"
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
                    className="w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-60 bg-primary hover:bg-primary/90 text-primary-foreground"
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
