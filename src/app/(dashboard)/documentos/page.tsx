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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  content?: { text?: string; body?: string } | null;
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
  signed: { label: "Assinado", cls: "text-emerald-600 bg-emerald-50 border-emerald-100", icon: CheckCircle2Icon },
  pending: { label: "Aguardando", cls: "text-amber-600 bg-amber-50 border-amber-100", icon: ClockIcon },
  expired: { label: "Expirado", cls: "text-neutral-500 bg-neutral-100 border-neutral-200", icon: XCircleIcon },
  refused: { label: "Recusado", cls: "text-red-600 bg-red-50 border-red-100", icon: XCircleIcon },
};

const TYPE_LABELS: Record<string, string> = {
  consentimento: "Consentimento",
  contrato: "Contrato",
  anamnese: "Anamnese",
  orcamento: "Orçamento",
};

const TYPE_COLORS: Record<string, string> = {
  consentimento: "bg-purple-50 text-purple-700 border-purple-100",
  contrato: "bg-blue-50 text-blue-700 border-blue-100",
  anamnese: "bg-emerald-50 text-emerald-700 border-emerald-100",
  orcamento: "bg-amber-50 text-amber-700 border-amber-100",
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
        .select(`id, title, type, status, patient_id, public_token, created_at, signed_at, content, patients (name, phone)`)
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
          content: d.content as any,
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
    toast.success("Link de assinatura copiado para a área de transferência!");
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
      toast.success(`Link de "${doc.title}" reenviado com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao reenviar: " + err.message);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiProcedure.trim()) {
      toast.error("Informe o nome do procedimento.");
      return;
    }
    setAiGenerating(true);
    try {
      const generated = await generateAIDocument(aiProcedure, aiRisks, aiCuidados, "", aiDocType);
      setCustomContent(generated);
      setCustomTitle(`${TYPE_LABELS[aiDocType] || aiDocType} — ${aiProcedure}`);
      setCustomType(aiDocType);
      setAddCustom(true);
      toast.success("Documento gerado com sucesso por IA!");
    } catch (err: any) {
      toast.error("Erro ao gerar com IA: " + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!selectedPatientId) {
      toast.error("Selecione um paciente.");
      return;
    }
    if (docsToSend.length === 0) {
      toast.error("Selecione ao menos um modelo de documento ou crie um personalizado.");
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
      toast.success("Documento(s) enviado(s) com sucesso!");
      setTimeout(() => {
        setActiveTab("history");
        setSentOk(false);
      }, 2000);
    } catch (err: any) {
      toast.error("Erro ao enviar documentos: " + err.message);
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

  return (
    <div className="space-y-6 text-left">
      {/* Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="max-w-xl w-full rounded-2xl p-6 bg-white border border-neutral-200 shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-800">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="text-neutral-400 hover:text-neutral-600 text-xs font-bold">
                ✕
              </button>
            </div>
            <div className="rounded-xl p-4 overflow-y-auto flex-1 text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap bg-neutral-50/50 border border-neutral-100 mt-4">
              {previewDoc.content || <span className="text-neutral-400 italic">Sem conteúdo.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">
            Documentos
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Crie, envie e acompanhe contratos, termos e fichas de anamnese com assinatura eletrônica.
          </p>
        </div>
        <button
          onClick={() => setActiveTab(activeTab === "history" ? "novo" : "history")}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"
        >
          {activeTab === "novo" ? (
            <><ChevronLeftIcon className="h-4 w-4" /> Voltar ao Histórico</>
          ) : (
            <><PlusIcon className="h-4 w-4" /> Novo Documento</>
          )}
        </button>
      </div>

      {/* Stats Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Geral", value: documents.length, cls: "text-neutral-800" },
          { label: "Assinados", value: documents.filter((d) => d.status === "signed").length, cls: "text-emerald-600" },
          { label: "Aguardando", value: documents.filter((d) => d.status === "pending").length, cls: "text-amber-600" },
          {
            label: "Recusados/Expirados",
            value: documents.filter((d) => d.status === "refused" || d.status === "expired").length,
            cls: "text-neutral-500",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs text-center"
          >
            <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-neutral-400 mt-0.5 font-bold">{s.label}</p>
          </div>
        ))}
      </div>

      {/* TAB: HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título ou paciente..."
                className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all shadow-xs"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "pending", "signed", "expired"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                    statusFilter === f
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "border-neutral-200 text-neutral-500 bg-white hover:bg-neutral-50"
                  }`}
                >
                  {f === "all" ? "Todos" : STATUS_CONFIG[f]?.label ?? f}
                </button>
              ))}
            </div>
          </div>

          {/* Document list */}
          {loadingDocs ? (
            <div className="flex items-center justify-center py-20">
              <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-12 text-center text-neutral-400 bg-white shadow-xs">
              <FileTextIcon className="h-10 w-10 mx-auto text-neutral-300 mb-2" />
              <p className="text-xs font-bold">Nenhum documento encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((doc) => {
                const s = STATUS_CONFIG[doc.status] || { label: doc.status, cls: "text-neutral-500 bg-neutral-100", icon: FileTextIcon };
                const Icon = s.icon;
                const typeClr = TYPE_COLORS[doc.type] || "bg-neutral-50 text-neutral-500 border-neutral-100";
                return (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-blue-200 transition-all shadow-xs"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                          <FileTextIcon className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-extrabold text-neutral-800 truncate">{doc.title}</h3>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${s.cls}`}>
                              <Icon className="h-3 w-3" />
                              {s.label}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${typeClr}`}>
                              {TYPE_LABELS[doc.type] || doc.type}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-neutral-500">
                            Paciente: <span className="text-neutral-700">{doc.patient_name}</span>
                          </p>
                          <p className="text-[10px] text-neutral-400">
                            Gerado em {new Date(doc.created_at).toLocaleDateString("pt-BR")} às {new Date(doc.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            {doc.signed_at && ` · Assinado em ${new Date(doc.signed_at).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          onClick={() => {
                            const raw = doc.content?.text || doc.content?.body || "";
                            setPreviewDoc({ title: doc.title, content: raw });
                          }}
                          className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-500 rounded-lg transition-colors flex items-center justify-center"
                          title="Visualizar Conteúdo"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {doc.status === "pending" && doc.public_token && (
                          <>
                            <button
                              onClick={() => handleCopyLink(doc.public_token)}
                              className="p-2 border border-neutral-200 hover:bg-neutral-50 text-blue-600 rounded-lg transition-colors flex items-center justify-center"
                              title="Copiar Link de Assinatura"
                            >
                              <CopyIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleResendWa(doc)}
                              className="p-2 border border-neutral-200 hover:bg-neutral-50 text-emerald-600 rounded-lg transition-colors flex items-center justify-center"
                              title="Reenviar por WhatsApp"
                            >
                              <SendIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: NEW DOCUMENT */}
      {activeTab === "novo" && (
        <div className="space-y-6">
          {/* Step 1: Select Patient */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">1</div>
              <h2 className="text-sm font-black text-neutral-800">Selecionar Paciente</h2>
            </div>
            
            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowPatientDropdown(true);
                }}
                onFocus={() => setShowPatientDropdown(true)}
                placeholder="Pesquise o paciente pelo nome..."
                className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all"
              />
              
              {showPatientDropdown && filteredPatients.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 rounded-xl mt-1 overflow-y-auto max-h-52 shadow-2xl bg-white border border-neutral-200 divide-y divide-neutral-100">
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-3 text-xs transition-colors hover:bg-neutral-50 flex flex-col"
                      onClick={() => {
                        setSelectedPatientId(p.id);
                        setPatientSearch("");
                        setShowPatientDropdown(false);
                      }}
                    >
                      <span className="font-extrabold text-neutral-800">{p.name}</span>
                      <span className="text-[10px] text-neutral-400 font-medium mt-0.5">{p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPatient && (
              <div className="rounded-xl px-4 py-3 flex items-center gap-3 bg-blue-50/50 border border-blue-100">
                <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-black text-white shrink-0">
                  {selectedPatient.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-800">{selectedPatient.name}</p>
                  <p className="text-[11px] text-neutral-500 font-semibold mt-0.5">
                    {selectedPatient.phone}
                    {selectedPatient.document ? ` · CPF: ${selectedPatient.document}` : ""}
                    {selectedPatient.birthday ? ` · Nasc: ${new Date(selectedPatient.birthday).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPatientId("")}
                  className="text-neutral-400 hover:text-neutral-600 text-xs font-bold p-1 hover:bg-neutral-100 rounded"
                >
                  Remover
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Select Templates */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">2</div>
              <h2 className="text-sm font-black text-neutral-800">Selecionar Modelos de Documento</h2>
              <span className="text-[10px] font-bold text-neutral-400 ml-auto">
                {selectedTemplateIds.length} selecionado(s)
              </span>
            </div>

            {templates.length === 0 ? (
              <p className="text-xs italic text-neutral-400">Nenhum modelo de documento cadastrado.</p>
            ) : (
              <div className="grid gap-2.5">
                {templates.map((t) => {
                  const selected = selectedTemplateIds.includes(t.id);
                  const typeClr = TYPE_COLORS[t.type] || "bg-neutral-50 text-neutral-500 border-neutral-100";
                  return (
                    <div
                      key={t.id}
                      onClick={() =>
                        setSelectedTemplateIds((prev) =>
                          selected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                        )
                      }
                      className={`w-full rounded-xl px-4 py-3 flex items-center gap-3 transition-all border cursor-pointer ${
                        selected
                          ? "bg-blue-50/40 border-blue-300 shadow-xs"
                          : "border-neutral-200 bg-white hover:bg-neutral-50/50"
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded shrink-0 flex items-center justify-center border transition-all ${
                          selected ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-300 bg-transparent"
                        }`}
                      >
                        {selected && <CheckCircle2Icon className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-700 truncate">{t.name}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase shrink-0 ${typeClr}`}>
                        {TYPE_LABELS[t.type] || t.type}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const raw = t.content?.text || t.content?.body || "";
                          setPreviewDoc({ title: t.name, content: interpolateVars(raw, selectedPatient) });
                        }}
                        className="shrink-0 p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-500 transition-colors flex items-center justify-center"
                        title="Pré-visualizar"
                      >
                        <EyeIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: AI Generator or Manual */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">3</div>
              <h2 className="text-sm font-black text-neutral-800">Gerar com IA ou Escrever Manualmente</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Tipo de Documento
                </label>
                <select
                  value={aiDocType}
                  onChange={(e) => setAiDocType(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none"
                >
                  <option value="consentimento">Consentimento</option>
                  <option value="contrato">Contrato</option>
                  <option value="anamnese">Anamnese</option>
                  <option value="orcamento">Orçamento</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Procedimento *
                </label>
                <input
                  value={aiProcedure}
                  onChange={(e) => setAiProcedure(e.target.value)}
                  placeholder="Ex: Botox, Preenchimento labial..."
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Riscos / Contraindicações (Opcional)
                </label>
                <textarea
                  value={aiRisks}
                  onChange={(e) => setAiRisks(e.target.value)}
                  placeholder="Ex: Alergias conhecidas, hematomas locais..."
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Cuidados Pós-Procedimento (Opcional)
                </label>
                <textarea
                  value={aiCuidados}
                  onChange={(e) => setAiCuidados(e.target.value)}
                  placeholder="Ex: Não deitar por 4 horas, aplicar gelo..."
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all resize-none"
                />
              </div>
            </div>

            <button
              onClick={handleGenerateAI}
              disabled={aiGenerating}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-4 py-2.5 text-xs font-bold w-full transition-colors"
            >
              {aiGenerating ? (
                <><Loader2Icon className="h-4 w-4 animate-spin" /> Escrevendo termo...</>
              ) : (
                <><SparklesIcon className="h-4 w-4" /> Gerar Termo Personalizado com IA</>
              )}
            </button>

            {/* Custom/Manual input */}
            {(addCustom || customContent) && (
              <div className="pt-4 space-y-4 border-t border-neutral-100">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                    Título do Documento Customizado
                  </label>
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Título do termo customizado..."
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                    Conteúdo do Documento (Suporta tags: {"{{nome}}"}, {"{{CPF}}"}, {"{{data_atual}}"})
                  </label>
                  <textarea
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    placeholder="Escreva ou edite o conteúdo do documento..."
                    rows={8}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all resize-none font-mono"
                  />
                </div>
              </div>
            )}
            
            {!addCustom && !customContent && (
              <button
                onClick={() => setAddCustom(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline block"
              >
                + Escrever ou colar termo manualmente
              </button>
            )}
          </div>

          {/* Preview list to send */}
          {docsToSend.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3 shadow-xs">
              <h3 className="text-xs font-black text-neutral-800 uppercase tracking-wide">Documentos que serão gerados:</h3>
              <div className="divide-y divide-neutral-100">
                {docsToSend.map((doc, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTextIcon className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-bold text-neutral-700 truncate">{doc.title}</span>
                    </div>
                    <button
                      onClick={() => setPreviewDoc({ title: doc.title, content: doc.content })}
                      className="text-xs font-bold text-blue-600 hover:underline shrink-0"
                    >
                      Visualizar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              onClick={() => setActiveTab("history")}
              className="rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 px-5 py-3 text-xs font-bold text-neutral-500 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending || docsToSend.length === 0}
              className="flex items-center gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 px-6 py-3 text-xs font-black transition-all shadow-md shadow-blue-200"
            >
              {sending ? (
                <><Loader2Icon className="h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><SendIcon className="h-4 w-4" /> Gerar e Enviar para Assinatura (WhatsApp)</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
