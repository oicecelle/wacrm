"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateAIDocument } from "@/app/actions/ai-actions";
import {
  FileTextIcon,
  SendIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
  SearchIcon,
  ShieldCheckIcon,
  Loader2Icon,
  CopyIcon,
  PlusIcon,
  SparklesIcon,
  UserIcon,
  ChevronDownIcon,
  EyeIcon,
  ChevronLeftIcon,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */
type DocStatus = "pending" | "signed" | "expired" | "refused";

interface DBDocument {
  id: string;
  title: string;
  type: string;
  status: DocStatus;
  patient_id: string;
  public_token: string | null;
  created_at: string;
  signed_at: string | null;
  patient_name: string;
  phone?: string;
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  document?: string;
  birthday?: string;
}

interface DocTemplate {
  id: string;
  name: string;
  type: string;
  content: { text?: string; body?: string } | null;
  is_default?: boolean;
}

/* ─── Constants ──────────────────────────────────────────── */
const STATUS_CONFIG: Record<DocStatus, { label: string; cls: string; icon: React.ElementType }> = {
  signed: { label: "Assinado", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2Icon },
  pending: { label: "Aguardando", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: ClockIcon },
  expired: { label: "Expirado", cls: "text-neutral-400 bg-neutral-100/5 border-neutral-700", icon: XCircleIcon },
  refused: { label: "Recusado", cls: "text-rose-400 bg-rose-500/10 border-rose-500/20", icon: XCircleIcon },
};

const TYPE_LABELS: Record<string, string> = {
  consentimento: "Consentimento",
  contrato: "Contrato",
  anamnese: "Anamnese",
  orcamento: "Orçamento",
};

const TYPE_COLORS: Record<string, string> = {
  consentimento: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  contrato: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  anamnese: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  orcamento: "bg-amber-500/10 text-amber-300 border-amber-500/20",
};

/* ─── Variable interpolation ─────────────────────────────── */
function interpolateVars(text: string, patient: Patient | null): string {
  if (!patient) return text;
  const today = new Date().toLocaleDateString("pt-BR");
  return text
    .replace(/\{\{nome\}\}/gi, patient.name || "")
    .replace(/\{\{CPF\}\}/gi, patient.document || "—")
    .replace(/\{\{data_nascimento\}\}/gi,
      patient.birthday ? new Date(patient.birthday).toLocaleDateString("pt-BR") : "—")
    .replace(/\{\{telefone\}\}/gi, patient.phone || "—")
    .replace(/\{\{data_atual\}\}/gi, today);
}

/* ─── Main Component ─────────────────────────────────────── */
export default function DocumentosPage() {
  const supabase = createClient();
  const { profile, accountId } = useAuth();

  /* Tab state */
  type TabId = "history" | "novo";
  const [activeTab, setActiveTab] = useState<TabId>("history");

  /* History */
  const [documents, setDocuments] = useState<DBDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");

  /* New document form */
  const [patients, setPatients] = useState<Patient[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  /* Manual / AI doc */
  const [customTitle, setCustomTitle] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customType, setCustomType] = useState("contrato");
  const [addCustom, setAddCustom] = useState(false);

  /* AI generation */
  const [aiProcedure, setAiProcedure] = useState("");
  const [aiRisks, setAiRisks] = useState("");
  const [aiCuidados, setAiCuidados] = useState("");
  const [aiDocType, setAiDocType] = useState("consentimento");
  const [aiGenerating, setAiGenerating] = useState(false);

  /* Preview */
  const [previewDoc, setPreviewDoc] = useState<{ title: string; content: string } | null>(null);

  /* Sending */
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  /* ── Load history ── */
  const loadDocuments = async () => {
    if (!accountId) return;
    setLoadingDocs(true);
    setError(null);
    try {
      const { data: docs, error: docsErr } = await supabase
        .from("documents")
        .select(`id, title, type, status, patient_id, public_token, created_at, signed_at, patients (name, phone)`)
        .eq("clinic_id", accountId)
        .order("created_at", { ascending: false });

      if (docsErr) throw docsErr;

      setDocuments(
        (docs || []).map((d) => ({
          id: d.id,
          title: d.title || "Documento Sem Nome",
          type: d.type || "contrato",
          status: (d.status || "pending") as DocStatus,
          patient_id: d.patient_id,
          public_token: d.public_token,
          created_at: d.created_at,
          signed_at: d.signed_at,
          patient_name: (d.patients as any)?.name || "Paciente Removido",
          phone: (d.patients as any)?.phone || "",
        }))
      );
    } catch (err: any) {
      setError("Erro ao carregar documentos.");
    } finally {
      setLoadingDocs(false);
    }
  };

  /* ── Load patients & templates ── */
  useEffect(() => {
    if (!accountId) return;

    const loadOptions = async () => {
      const [{ data: pts }, { data: tmps }] = await Promise.all([
        supabase.from("patients").select("id, name, phone, email, document, birthday").eq("clinic_id", accountId).order("name"),
        supabase.from("document_templates").select("id, name, type, content, is_default").order("name"),
      ]);
      setPatients(pts || []);
      setTemplates(tmps || []);
    };

    loadOptions();
    loadDocuments();
  }, [accountId]);

  /* Sync selectedPatient object */
  useEffect(() => {
    const pt = patients.find((p) => p.id === selectedPatientId) || null;
    setSelectedPatient(pt);
  }, [selectedPatientId, patients]);

  /* ── Computed docs for preview ── */
  const docsToSend = useMemo(() => {
    const fromTemplates = selectedTemplateIds.map((id) => {
      const tmpl = templates.find((t) => t.id === id);
      if (!tmpl) return null;
      const raw = tmpl.content?.text || tmpl.content?.body || "";
      return {
        title: tmpl.name,
        type: tmpl.type,
        content: interpolateVars(raw, selectedPatient),
        template_id: tmpl.id,
      };
    }).filter(Boolean) as { title: string; type: string; content: string; template_id: string }[];

    if (addCustom && customTitle.trim() && customContent.trim()) {
      fromTemplates.push({
        title: customTitle.trim(),
        type: customType,
        content: interpolateVars(customContent, selectedPatient),
        template_id: "",
      });
    }

    return fromTemplates;
  }, [selectedTemplateIds, templates, selectedPatient, addCustom, customTitle, customContent, customType]);

  /* ── Handlers ── */
  const handleCopyLink = (token: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/portal/documento/${token}`;
    navigator.clipboard.writeText(url);
    alert("Link de assinatura copiado!");
  };

  const handleResendWa = async (doc: DBDocument) => {
    if (!accountId || !doc.public_token) return;
    try {
      const portalUrl = `${window.location.origin}/portal/documento/${doc.public_token}`;
      await supabase.from("patient_timeline").insert({
        patient_id: doc.patient_id,
        event_type: "whatsapp",
        title: `Link de assinatura reenviado via WhatsApp`,
        payload: {
          sent_by: profile?.full_name || "Equipe",
          phone: doc.phone,
          message: `Olá! Reenviamos o link para assinatura digital do documento "${doc.title}": ${portalUrl}`,
        },
      });
      alert(`Link de "${doc.title}" reenviado com sucesso!`);
    } catch (err: any) {
      alert("Erro ao reenviar: " + err.message);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiProcedure.trim()) {
      alert("Informe o nome do procedimento.");
      return;
    }
    setAiGenerating(true);
    try {
      const generated = await generateAIDocument(aiProcedure, aiRisks, aiCuidados, "", aiDocType);
      setCustomContent(generated);
      setCustomTitle(`${TYPE_LABELS[aiDocType] || aiDocType} — ${aiProcedure}`);
      setCustomType(aiDocType);
      setAddCustom(true);
    } catch (err: any) {
      alert("Erro ao gerar com IA: " + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!selectedPatientId) {
      alert("Selecione um paciente.");
      return;
    }
    if (docsToSend.length === 0) {
      alert("Selecione ao menos um modelo de documento ou crie um personalizado.");
      return;
    }

    setSending(true);
    setSentOk(false);
    try {
      for (const doc of docsToSend) {
        const token = "doc_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const { error: insertErr } = await supabase.from("documents").insert({
          clinic_id: accountId,
          patient_id: selectedPatientId,
          title: doc.title,
          type: doc.type,
          template_id: doc.template_id || null,
          status: "pending",
          sent_via: "whatsapp",
          sent_at: new Date().toISOString(),
          public_token: token,
          content: { text: doc.content },
        });
        if (insertErr) throw insertErr;

        const portalUrl = `${window.location.origin}/portal/documento/${token}`;

        await supabase.from("patient_timeline").insert({
          patient_id: selectedPatientId,
          event_type: "document",
          title: `Documento [${doc.title}] enviado para assinatura`,
          payload: { sent_by: profile?.full_name || "Equipe", public_token: token },
        });

        await supabase.from("patient_timeline").insert({
          patient_id: selectedPatientId,
          event_type: "whatsapp",
          title: `Link de assinatura enviado via WhatsApp`,
          payload: {
            sent_by: profile?.full_name || "Equipe",
            phone: selectedPatient?.phone,
            message: `Olá ${selectedPatient?.name}! Por favor assine o documento "${doc.title}" acessando: ${portalUrl}`,
          },
        });
      }

      setSentOk(true);
      setSelectedTemplateIds([]);
      setSelectedPatientId("");
      setAddCustom(false);
      setCustomContent("");
      setCustomTitle("");
      setAiProcedure("");
      setAiRisks("");
      setAiCuidados("");
      loadDocuments();
      setTimeout(() => {
        setActiveTab("history");
        setSentOk(false);
      }, 2200);
    } catch (err: any) {
      alert("Erro ao enviar documentos: " + err.message);
    } finally {
      setSending(false);
    }
  };

  /* ── Filtered history ── */
  const filtered = documents.filter((d) => {
    const matchSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.patient_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(patientSearch.toLowerCase())
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, #0d0d1a 0%, #0a0a14 100%)", color: "#e5e7eb" }}
    >
      {/* Preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="max-w-lg w-full rounded-2xl p-6 space-y-4 max-h-[80vh] flex flex-col shadow-2xl"
            style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="text-neutral-400 hover:text-white text-xs font-bold">
                Fechar ✕
              </button>
            </div>
            <div
              className="rounded-xl p-4 overflow-y-auto flex-1 text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {previewDoc.content || <span className="text-neutral-600 italic">Sem conteúdo.</span>}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-7">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "#f9fafb" }}>
              Documentos
            </h1>
            <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
              Crie, envie e acompanhe contratos, termos e fichas de anamnese com assinatura eletrônica.
            </p>
          </div>
          <button
            onClick={() => setActiveTab(activeTab === "history" ? "novo" : "history")}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all shadow-lg"
            style={{
              background: activeTab === "novo"
                ? "rgba(99,102,241,0.15)"
                : "linear-gradient(135deg, #4f46e5, #7c3aed)",
              color: "white",
              border: activeTab === "novo" ? "1px solid rgba(99,102,241,0.4)" : "none",
            }}
          >
            {activeTab === "novo" ? (
              <><ChevronLeftIcon className="h-4 w-4" /> Voltar ao Histórico</>
            ) : (
              <><PlusIcon className="h-4 w-4" /> Novo Documento</>
            )}
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: documents.length, color: "#e5e7eb" },
            { label: "Assinados", value: documents.filter((d) => d.status === "signed").length, color: "#34d399" },
            { label: "Aguardando", value: documents.filter((d) => d.status === "pending").length, color: "#fbbf24" },
            {
              label: "Recusados/Expirados",
              value: documents.filter((d) => d.status === "refused" || d.status === "expired").length,
              color: "#9ca3af",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-4 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: "#6b7280" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ─── TAB: HISTORY ─── */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="relative flex-1 min-w-52">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#4b5563" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por título ou paciente..."
                  className="w-full rounded-xl pl-9 pr-3 py-2.5 text-xs transition-all outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "#e5e7eb",
                  }}
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "pending", "signed", "expired"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all border"
                    style={
                      statusFilter === f
                        ? { background: "#4f46e5", color: "white", borderColor: "#4f46e5" }
                        : { background: "rgba(255,255,255,0.04)", color: "#6b7280", borderColor: "rgba(255,255,255,0.08)" }
                    }
                  >
                    {f === "all" ? "Todos" : STATUS_CONFIG[f]?.label ?? f}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {loadingDocs ? (
              <div className="flex items-center justify-center py-20">
                <Loader2Icon className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((doc) => {
                  const s = STATUS_CONFIG[doc.status] || { label: doc.status, cls: "text-neutral-400 bg-white/5 border-white/10", icon: FileTextIcon };
                  const Icon = s.icon;
                  const typeClr = TYPE_COLORS[doc.type] || "bg-white/5 text-neutral-400 border-white/10";
                  return (
                    <div
                      key={doc.id}
                      className="rounded-xl p-5 transition-all"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}
                          >
                            <FileTextIcon className="h-5 w-5 text-indigo-400" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-extrabold text-white truncate">{doc.title}</h3>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${s.cls}`}>
                                <Icon className="h-3 w-3" />
                                {s.label}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${typeClr}`}>
                                {TYPE_LABELS[doc.type] ?? doc.type}
                              </span>
                            </div>
                            <p className="text-xs font-semibold" style={{ color: "#6b7280" }}>
                              Paciente:{" "}
                              <strong style={{ color: "#9ca3af" }}>{doc.patient_name}</strong> · Criado em{" "}
                              {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                            </p>
                            {doc.status === "signed" && doc.signed_at && (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                <ShieldCheckIcon className="h-4 w-4" />
                                Assinado digitalmente em {new Date(doc.signed_at).toLocaleString("pt-BR")}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2 items-center self-end md:self-center">
                          {doc.public_token && (
                            <button
                              onClick={() => handleCopyLink(doc.public_token)}
                              className="rounded-lg p-2 transition-all"
                              style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#6b7280" }}
                              title="Copiar link de assinatura"
                            >
                              <CopyIcon className="h-4 w-4" />
                            </button>
                          )}
                          {doc.status === "pending" && (
                            <button
                              onClick={() => handleResendWa(doc)}
                              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-black text-white transition-colors"
                              style={{ background: "#4f46e5" }}
                            >
                              <SendIcon className="h-3.5 w-3.5" />
                              Reenviar via WhatsApp
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div
                    className="text-center py-16 rounded-xl"
                    style={{ border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
                  >
                    <FileTextIcon className="h-8 w-8 mx-auto mb-3" style={{ color: "#374151" }} />
                    <p className="text-xs italic" style={{ color: "#4b5563" }}>
                      {documents.length === 0
                        ? "Nenhum documento emitido ainda. Clique em \u201cNovo Documento\u201d para começar."
                        : "Nenhum documento encontrado com os filtros aplicados."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: NOVO DOCUMENTO ─── */}
        {activeTab === "novo" && (
          <div className="space-y-6">
            {/* ── Step 1: Select Patient ── */}
            <section
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">1</div>
                <h2 className="text-sm font-black text-white">Selecionar Paciente</h2>
              </div>

              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#4b5563" }} />
                <input
                  value={patientSearch || selectedPatient?.name || ""}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setSelectedPatientId("");
                    setShowPatientDropdown(true);
                  }}
                  onFocus={() => setShowPatientDropdown(true)}
                  placeholder="Buscar paciente pelo nome..."
                  className="w-full rounded-xl pl-9 pr-3 py-3 text-sm outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e5e7eb",
                  }}
                />
                {showPatientDropdown && filteredPatients.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 z-30 rounded-xl mt-1 overflow-y-auto max-h-52 shadow-2xl"
                    style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-indigo-600/20"
                        style={{ color: "#e5e7eb", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                        onClick={() => {
                          setSelectedPatientId(p.id);
                          setPatientSearch("");
                          setShowPatientDropdown(false);
                        }}
                      >
                        <p className="font-bold">{p.name}</p>
                        <p style={{ color: "#6b7280" }}>{p.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedPatient && (
                <div
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-black text-white shrink-0">
                    {selectedPatient.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{selectedPatient.name}</p>
                    <p className="text-[11px]" style={{ color: "#6b7280" }}>
                      {selectedPatient.phone}
                      {selectedPatient.document ? ` · CPF: ${selectedPatient.document}` : ""}
                      {selectedPatient.birthday ? ` · Nasc: ${new Date(selectedPatient.birthday).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <CheckCircle2Icon className="h-5 w-5 text-emerald-400 shrink-0" />
                </div>
              )}
            </section>

            {/* ── Step 2: Select Templates ── */}
            <section
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">2</div>
                <h2 className="text-sm font-black text-white">Selecionar Modelos</h2>
                <span className="text-[10px] font-bold ml-auto" style={{ color: "#6b7280" }}>
                  {selectedTemplateIds.length} selecionado(s)
                </span>
              </div>

              {templates.length === 0 ? (
                <p className="text-xs italic" style={{ color: "#4b5563" }}>Nenhum modelo de documento cadastrado.</p>
              ) : (
                <div className="grid gap-2">
                  {templates.map((t) => {
                    const selected = selectedTemplateIds.includes(t.id);
                    const typeClr = TYPE_COLORS[t.type] || "bg-white/5 text-neutral-400 border-white/10";
                    return (
                      <button
                        key={t.id}
                        onClick={() =>
                          setSelectedTemplateIds((prev) =>
                            selected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                        className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all"
                        style={{
                          background: selected ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
                          border: selected ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <div
                          className="h-4 w-4 rounded shrink-0 flex items-center justify-center"
                          style={{
                            border: selected ? "2px solid #6366f1" : "2px solid rgba(255,255,255,0.2)",
                            background: selected ? "#6366f1" : "transparent",
                          }}
                        >
                          {selected && <CheckCircle2Icon className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{t.name}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${typeClr}`}>
                          {TYPE_LABELS[t.type] || t.type}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const raw = t.content?.text || t.content?.body || "";
                            setPreviewDoc({ title: t.name, content: interpolateVars(raw, selectedPatient) });
                          }}
                          className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/10"
                          title="Pré-visualizar"
                        >
                          <EyeIcon className="h-3.5 w-3.5" style={{ color: "#4b5563" }} />
                        </button>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Step 3: AI Generator ── */}
            <section
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">3</div>
                <h2 className="text-sm font-black text-white">Gerar com IA ou Escrever Manualmente</h2>
              </div>
              <p className="text-[11px]" style={{ color: "#6b7280" }}>
                Opcional — use o assistente de IA para gerar um novo termo ou escreva/cole diretamente.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#6b7280" }}>
                    Tipo de Documento
                  </label>
                  <select
                    value={aiDocType}
                    onChange={(e) => setAiDocType(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                  >
                    <option value="consentimento">Consentimento</option>
                    <option value="contrato">Contrato</option>
                    <option value="anamnese">Anamnese</option>
                    <option value="orcamento">Orçamento</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#6b7280" }}>
                    Procedimento *
                  </label>
                  <input
                    value={aiProcedure}
                    onChange={(e) => setAiProcedure(e.target.value)}
                    placeholder="Ex: Botox, Preenchimento labial..."
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#6b7280" }}>
                    Riscos
                  </label>
                  <input
                    value={aiRisks}
                    onChange={(e) => setAiRisks(e.target.value)}
                    placeholder="Descreva riscos conhecidos..."
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#6b7280" }}>
                    Cuidados Pós-Procedimento
                  </label>
                  <input
                    value={aiCuidados}
                    onChange={(e) => setAiCuidados(e.target.value)}
                    placeholder="Cuidados necessários..."
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateAI}
                disabled={aiGenerating}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white" }}
              >
                {aiGenerating ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin" /> Gerando com IA...</>
                ) : (
                  <><SparklesIcon className="h-4 w-4" /> Gerar Documento com IA</>
                )}
              </button>

              {/* Manual editor */}
              <div className="space-y-3 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="addCustom"
                    checked={addCustom}
                    onChange={(e) => setAddCustom(e.target.checked)}
                    className="rounded accent-indigo-500"
                  />
                  <label htmlFor="addCustom" className="text-xs font-bold" style={{ color: "#9ca3af" }}>
                    Adicionar documento personalizado / editado
                  </label>
                </div>
                {addCustom && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="Título do documento *"
                        className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                      />
                      <select
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                      >
                        <option value="consentimento">Consentimento</option>
                        <option value="contrato">Contrato</option>
                        <option value="anamnese">Anamnese</option>
                        <option value="orcamento">Orçamento</option>
                      </select>
                    </div>
                    <textarea
                      value={customContent}
                      onChange={(e) => setCustomContent(e.target.value)}
                      placeholder={`Conteúdo do documento...\n\nVariáveis disponíveis: {{nome}}, {{CPF}}, {{data_nascimento}}, {{telefone}}, {{data_atual}}`}
                      rows={10}
                      className="w-full rounded-xl px-3 py-2.5 text-xs outline-none font-mono resize-y"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "#d1d5db" }}
                    />
                    {customContent && selectedPatient && (
                      <button
                        onClick={() =>
                          setPreviewDoc({
                            title: customTitle || "Documento Personalizado",
                            content: interpolateVars(customContent, selectedPatient),
                          })
                        }
                        className="flex items-center gap-1.5 text-xs font-bold transition-colors"
                        style={{ color: "#818cf8" }}
                      >
                        <EyeIcon className="h-4 w-4" /> Pré-visualizar com dados do paciente
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Step 4: Review & Send ── */}
            <section
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">4</div>
                <h2 className="text-sm font-black text-white">Revisar e Enviar</h2>
              </div>

              {docsToSend.length === 0 ? (
                <p className="text-xs italic" style={{ color: "#4b5563" }}>
                  Selecione ao menos um modelo ou crie um documento personalizado acima.
                </p>
              ) : (
                <div className="space-y-2">
                  {docsToSend.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
                    >
                      <FileTextIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{d.title}</p>
                        <p className="text-[10px]" style={{ color: "#6b7280" }}>
                          {TYPE_LABELS[d.type] || d.type} · Variáveis: ✅ preenchidas
                        </p>
                      </div>
                      <button
                        onClick={() => setPreviewDoc({ title: d.title, content: d.content })}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <EyeIcon className="h-3.5 w-3.5" style={{ color: "#4b5563" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedPatient && docsToSend.length > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-xs"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}
                >
                  <p style={{ color: "#a5b4fc" }}>
                    📱 <strong>{docsToSend.length}</strong> documento(s) serão gerados e o link de assinatura
                    enviado para <strong>{selectedPatient.name}</strong> ({selectedPatient.phone}) via WhatsApp.
                  </p>
                </div>
              )}

              {sentOk && (
                <div
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold"
                  style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
                >
                  <CheckCircle2Icon className="h-5 w-5" />
                  Documentos enviados com sucesso! Redirecionando para o histórico...
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending || sentOk || !selectedPatientId || docsToSend.length === 0}
                className="w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg"
                style={{ background: "linear-gradient(135deg, #059669, #10b981)", color: "white" }}
              >
                {sending ? (
                  <><Loader2Icon className="h-5 w-5 animate-spin" /> Enviando documentos...</>
                ) : sentOk ? (
                  <><CheckCircle2Icon className="h-5 w-5" /> Enviados com sucesso!</>
                ) : (
                  <><SendIcon className="h-5 w-5" /> Gerar e Enviar {docsToSend.length > 0 ? `(${docsToSend.length} doc${docsToSend.length > 1 ? "s" : ""})` : ""} via WhatsApp</>
                )}
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
