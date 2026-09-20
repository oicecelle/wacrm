"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import {
  FileTextIcon,
  SendIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
  ShieldAlertIcon,
  SearchIcon,
  Loader2Icon,
  CopyIcon,
  PlusIcon,
  ChevronDownIcon,
  EyeIcon,
  ChevronLeftIcon,
  LibraryIcon,
  Trash2Icon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  sent_at: string | null;
  viewed_at: string | null;
  pdf_url?: string | null;
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
  clinic_id?: string | null;
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
  const { hasPermission, loading: permsLoading } = usePermissions();

  /* Tab state */
  type TabId = "history" | "novo" | "modelos";
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
  const [pdfUrl, setPdfUrl] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);

  /* Preview */
  const [previewDoc, setPreviewDoc] = useState<{ title: string; content: string } | null>(null);

  /* Sending */
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  /* Templates management state */
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [tmplFormName, setTmplFormName] = useState("");
  const [tmplFormType, setTmplFormType] = useState("contrato");
  const [tmplFormContent, setTmplFormContent] = useState("");
  const [tmplFormIsDefault, setTmplFormIsDefault] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  /* ── Load history ── */
  const loadDocuments = async () => {
    if (!accountId) return;
    setLoadingDocs(true);
    setError(null);
    try {
      const { data: docs, error: docsErr } = await supabase
        .from("documents")
        .select(`id, title, type, status, patient_id, public_token, created_at, signed_at, sent_at, viewed_at, pdf_url, content, patients (name, phone)`)
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
          sent_at: d.sent_at,
          viewed_at: d.viewed_at,
          pdf_url: d.pdf_url,
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

  /* ── Reload Templates ── */
  const reloadTemplates = useCallback(async () => {
    if (!accountId) return;
    try {
      const { data: tmps, error: err } = await supabase
        .from("document_templates")
        .select("id, name, type, content, is_default, clinic_id")
        .or(`clinic_id.is.null,clinic_id.eq.${accountId}`)
        .order("name");

      if (err) throw err;
      setTemplates(tmps || []);
    } catch (err: any) {
      console.error("Error loading templates:", err);
      toast.error("Erro ao carregar modelos.");
    }
  }, [accountId, supabase]);

  /* ── Load patients & templates ── */
  useEffect(() => {
    if (!accountId) return;

    const loadOptions = async () => {
      const [{ data: pts }, { data: tmps }] = await Promise.all([
        supabase.from("patients").select("id, name, phone, email, document, birthday").eq("clinic_id", accountId).order("name"),
        supabase.from("document_templates").select("id, name, type, content, is_default, clinic_id").or(`clinic_id.is.null,clinic_id.eq.${accountId}`).order("name"),
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
        pdf_url: "",
      };
    }).filter(Boolean) as { title: string; type: string; content: string; template_id: string; pdf_url: string }[];

    if (addCustom && customTitle.trim() && customContent.trim()) {
      fromTemplates.push({
        title: customTitle.trim(),
        type: customType,
        content: interpolateVars(customContent, selectedPatient),
        template_id: "",
        pdf_url: "",
      });
    }

    if (pdfUrl && customTitle.trim()) {
      fromTemplates.push({
        title: customTitle.trim(),
        type: customType,
        content: "",
        template_id: "",
        pdf_url: pdfUrl,
      });
    }

    return fromTemplates;
  }, [selectedTemplateIds, templates, selectedPatient, addCustom, customTitle, customContent, customType, pdfUrl]);

  /* ── Handlers ── */
  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accountId) return;
    if (file.type !== "application/pdf") {
      toast.error("Escolha um arquivo PDF.");
      return;
    }
    setUploadingPdf(true);
    try {
      const path = `${accountId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("documentos").getPublicUrl(path);
      setPdfUrl(publicUrl);
      if (!customTitle.trim()) setCustomTitle(file.name.replace(/\.pdf$/i, ""));
      toast.success("PDF enviado com sucesso.");
    } catch (err: any) {
      toast.error("Erro ao enviar o PDF: " + err.message);
    } finally {
      setUploadingPdf(false);
    }
  };

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
          content: doc.pdf_url ? {} : { text: doc.content },
          pdf_url: doc.pdf_url || null,
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
      setPdfUrl("");
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

  /* ── Templates CRUD Handlers ── */
  const handleOpenTemplateForm = (tmpl?: DocTemplate) => {
    if (tmpl) {
      setEditingTemplate(tmpl);
      setTmplFormName(tmpl.name);
      setTmplFormType(tmpl.type);
      setTmplFormContent(tmpl.content?.text || tmpl.content?.body || "");
      setTmplFormIsDefault(tmpl.is_default || false);
    } else {
      setEditingTemplate(null);
      setTmplFormName("");
      setTmplFormType("contrato");
      setTmplFormContent("");
      setTmplFormIsDefault(false);
    }
    setTemplateFormOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !tmplFormName.trim() || !tmplFormContent.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSavingTemplate(true);
    try {
      const payload = {
        name: tmplFormName.trim(),
        type: tmplFormType,
        content: { text: tmplFormContent.trim() },
        is_default: tmplFormIsDefault,
        clinic_id: accountId,
      };

      if (editingTemplate && editingTemplate.clinic_id !== null) {
        // Update existing clinic custom template
        const { error: err } = await supabase
          .from("document_templates")
          .update(payload)
          .eq("id", editingTemplate.id);
        if (err) throw err;
        toast.success("Modelo atualizado com sucesso!");
      } else {
        // Insert as new template (auto-clones if it was a system template)
        const { error: err } = await supabase
          .from("document_templates")
          .insert(payload);
        if (err) throw err;
        toast.success(editingTemplate ? "Modelo clonado e salvo!" : "Modelo criado com sucesso!");
      }

      setTemplateFormOpen(false);
      reloadTemplates();
    } catch (err: any) {
      console.error("Error saving template:", err);
      toast.error("Erro ao salvar modelo: " + err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este modelo da sua clínica?")) return;
    try {
      const { error: err } = await supabase
        .from("document_templates")
        .delete()
        .eq("id", id);
      if (err) throw err;
      toast.success("Modelo excluído com sucesso!");
      reloadTemplates();
    } catch (err: any) {
      console.error("Error deleting template:", err);
      toast.error("Erro ao excluir modelo: " + err.message);
    }
  };

  /* ── Filtered history & patients ── */
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

  if (!permsLoading && !hasPermission("view_documentos", "view")) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlertIcon className="h-10 w-10 text-neutral-400" />
        <div>
          <h2 className="text-sm font-bold text-neutral-800">Sem acesso a Documentos</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Sua função não tem permissão pra ver essa área. Fale com um administrador se precisar
            de acesso.
          </p>
        </div>
      </div>
    );
  }

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
              <button onClick={() => setPreviewDoc(null)} className="text-neutral-400 hover:text-neutral-600 text-xs font-bold bg-transparent border-0 cursor-pointer">
                ✕
              </button>
            </div>
            <div className="rounded-xl p-4 overflow-y-auto flex-1 text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap bg-neutral-50/50 border border-neutral-100 mt-4">
              {previewDoc.content || <span className="text-neutral-400 italic">Sem conteúdo.</span>}
            </div>
          </div>
        </div>
      )}

      {/* CRUD Template Modal */}
      {templateFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveTemplate}
            className="max-w-xl w-full rounded-2xl p-6 bg-white border border-neutral-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-800">
                {editingTemplate
                  ? editingTemplate.clinic_id === null
                    ? "Clonar e Editar Modelo do Sistema"
                    : "Editar Modelo Clínico"
                  : "Criar Novo Modelo de Documento"}
              </h3>
              <button
                type="button"
                onClick={() => setTemplateFormOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-xs font-bold bg-transparent border-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <Label htmlFor="tmpl-name" className="text-xs font-semibold">Nome do Modelo *</Label>
                <Input
                  id="tmpl-name"
                  value={tmplFormName}
                  onChange={(e) => setTmplFormName(e.target.value)}
                  placeholder="Ex: Ficha de Consentimento Geral"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tmpl-type" className="text-xs font-semibold">Tipo</Label>
                  <select
                    id="tmpl-type"
                    value={tmplFormType}
                    onChange={(e) => setTmplFormType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="contrato">Contrato</option>
                    <option value="consentimento">Consentimento</option>
                    <option value="anamnese">Anamnese</option>
                    <option value="orcamento">Orçamento</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={tmplFormIsDefault}
                      onChange={(e) => setTmplFormIsDefault(e.target.checked)}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-neutral-700">Modelo Padrão</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label htmlFor="tmpl-content" className="text-xs font-semibold">Corpo do Modelo *</Label>
                  <span className="text-[9px] text-neutral-400 font-bold uppercase">
                    Tags: {"{{nome}}"} | {"{{CPF}}"} | {"{{data_atual}}"}
                  </span>
                </div>
                <textarea
                  id="tmpl-content"
                  value={tmplFormContent}
                  onChange={(e) => setTmplFormContent(e.target.value)}
                  placeholder="Prezada(o) {{nome}}, por meio deste..."
                  rows={10}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-mono resize-none"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setTemplateFormOpen(false)}
                className="rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 px-4 py-2 text-xs font-bold text-neutral-500 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingTemplate}
                className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-5 py-2 text-xs font-black transition-all cursor-pointer"
              >
                {savingTemplate ? "Salvando..." : "Salvar Modelo"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">
            Documentos
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Crie, envie e gerencie contratos, termos e fichas de anamnese com assinatura eletrônica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "modelos" && (
            <button
              onClick={() => handleOpenTemplateForm()}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer border-0"
            >
              <PlusIcon className="h-4 w-4" /> Criar Modelo
            </button>
          )}
          <button
            onClick={() => setActiveTab(activeTab === "history" ? "novo" : "history")}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-blue-200 cursor-pointer"
          >
            {activeTab === "novo" ? (
              <><ChevronLeftIcon className="h-4 w-4" /> Voltar ao Histórico</>
            ) : (
              <><PlusIcon className="h-4 w-4" /> Novo Documento</>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(["history", "novo", "modelos"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px cursor-pointer shrink-0 border-t-0 border-l-0 border-r-0 bg-transparent ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "history"
              ? "Histórico de Assinaturas"
              : tab === "novo"
              ? "Novo Documento"
              : "Biblioteca de Modelos"}
          </button>
        ))}
      </div>

      {/* Tab: History */}
      {activeTab === "history" && (
        <div className="space-y-6">
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
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all border cursor-pointer ${
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
                        <div className="flex items-start gap-4 min-w-0 text-left">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                            <FileTextIcon className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
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
                              {doc.sent_at && !doc.signed_at && ` · Enviado em ${new Date(doc.sent_at).toLocaleDateString("pt-BR")}`}
                              {doc.viewed_at && !doc.signed_at && ` · Visualizado em ${new Date(doc.viewed_at).toLocaleDateString("pt-BR")}`}
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
                            className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-500 rounded-lg transition-colors flex items-center justify-center cursor-pointer bg-transparent"
                            title="Visualizar Conteúdo"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {doc.status === "pending" && doc.public_token && (
                            <>
                              <button
                                onClick={() => handleCopyLink(doc.public_token)}
                                className="p-2 border border-neutral-200 hover:bg-neutral-50 text-blue-600 rounded-lg transition-colors flex items-center justify-center cursor-pointer bg-transparent"
                                title="Copiar Link de Assinatura"
                              >
                                <CopyIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleResendWa(doc)}
                                className="p-2 border border-neutral-200 hover:bg-neutral-50 text-emerald-600 rounded-lg transition-colors flex items-center justify-center cursor-pointer bg-transparent"
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
        </div>
      )}

      {/* Tab: New Document */}
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
                className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-xs"
              />
              
              {showPatientDropdown && filteredPatients.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 rounded-xl mt-1 overflow-y-auto max-h-52 shadow-2xl bg-white border border-neutral-200 divide-y divide-neutral-100">
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-3 text-xs transition-colors hover:bg-neutral-50 flex flex-col cursor-pointer border-0 bg-transparent"
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
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold text-neutral-800">{selectedPatient.name}</p>
                  <p className="text-[11px] text-neutral-500 font-semibold mt-0.5">
                    {selectedPatient.phone}
                    {selectedPatient.document ? ` · CPF: ${selectedPatient.document}` : ""}
                    {selectedPatient.birthday ? ` · Nasc: ${new Date(selectedPatient.birthday).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPatientId("")}
                  className="text-neutral-400 hover:text-neutral-600 text-xs font-bold p-1 hover:bg-neutral-100 rounded border-0 bg-transparent cursor-pointer"
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
                        {selected && <CheckIcon className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold text-neutral-700 truncate">{t.name}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0 ${typeClr}`}>
                        {TYPE_LABELS[t.type] || t.type}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const raw = t.content?.text || t.content?.body || "";
                          setPreviewDoc({ title: t.name, content: interpolateVars(raw, selectedPatient) });
                        }}
                        className="shrink-0 p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-500 transition-colors flex items-center justify-center cursor-pointer bg-transparent"
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

          {/* Step 3: Write document content */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">3</div>
              <h2 className="text-sm font-black text-neutral-800">Conteúdo do Documento</h2>
            </div>

            {/* Custom/Manual input */}
            {(addCustom || customContent) && (
              <div className="pt-4 space-y-4 border-t border-neutral-100">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                    Título do Documento Customizado
                  </label>
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Título do termo customizado..."
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-xs"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                    Conteúdo do Documento (Suporta tags: {"{{nome}}"}, {"{{CPF}}"}, {"{{data_atual}}"})
                  </label>
                  <textarea
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    placeholder="Escreva ou edite o conteúdo do documento..."
                    rows={8}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all resize-none font-mono shadow-xs"
                  />
                </div>
              </div>
            )}
            
            {!addCustom && !customContent && !pdfUrl && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setAddCustom(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline block bg-transparent border-0 cursor-pointer"
                >
                  + Escrever ou colar termo manualmente
                </button>
                <span className="text-neutral-300 text-xs">ou</span>
                <label className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1.5">
                  {uploadingPdf ? (
                    <><Loader2Icon className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                  ) : (
                    "+ Enviar um PDF pronto"
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleUploadPdf}
                    disabled={uploadingPdf}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {pdfUrl && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-700 underline truncate">
                    📄 {customTitle || "PDF enviado"} — ver arquivo
                  </a>
                  <button
                    type="button"
                    onClick={() => setPdfUrl("")}
                    className="text-xs font-bold text-neutral-400 hover:text-red-500 shrink-0"
                  >
                    Remover
                  </button>
                </div>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Título do documento"
                  className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Preview list to send */}
          {docsToSend.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3 shadow-xs text-left">
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
                      className="text-xs font-bold text-blue-600 hover:underline shrink-0 bg-transparent border-0 cursor-pointer"
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
              className="rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 px-5 py-3 text-xs font-bold text-neutral-500 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending || docsToSend.length === 0}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-6 py-3 text-xs font-black transition-all shadow-md shadow-blue-200 cursor-pointer border-0"
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

      {/* Tab: Document templates library */}
      {activeTab === "modelos" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por nome do modelo..."
                className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all shadow-xs"
              />
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-12 text-center text-neutral-400 bg-white shadow-xs">
              <LibraryIcon className="h-10 w-10 mx-auto text-neutral-300 mb-2" />
              <p className="text-xs font-bold">Nenhum modelo de documento cadastrado na biblioteca.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {templates
                .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
                .map((tmpl) => {
                  const typeClr = TYPE_COLORS[tmpl.type] || "bg-neutral-50 text-neutral-500 border-neutral-100";
                  const isSystem = tmpl.clinic_id === null || !tmpl.clinic_id;

                  return (
                    <div
                      key={tmpl.id}
                      className="group relative flex flex-col justify-between rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs hover:shadow-md hover:border-neutral-300 transition-all text-left"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${typeClr}`}>
                            {TYPE_LABELS[tmpl.type] || tmpl.type}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {tmpl.is_default && (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/40 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                                Padrão
                              </span>
                            )}
                            {isSystem ? (
                              <span className="inline-flex items-center rounded-full bg-neutral-100 border border-neutral-200/50 px-2.5 py-0.5 text-[9px] font-black text-neutral-500">
                                Sistema
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/40 px-2.5 py-0.5 text-[9px] font-black text-blue-700">
                                Clínica
                              </span>
                            )}
                          </div>
                        </div>

                        <h3 className="text-sm font-black text-neutral-800 tracking-tight group-hover:text-blue-600 transition-colors">
                          {tmpl.name}
                        </h3>
                        <p className="text-xs text-neutral-500 leading-relaxed mt-1.5 line-clamp-4 min-h-[64px]">
                          {tmpl.content?.text || tmpl.content?.body || ""}
                        </p>
                      </div>

                      <div className="border-t border-neutral-100 pt-4 mt-4 flex items-center justify-between">
                        <button
                          onClick={() => {
                            const raw = tmpl.content?.text || tmpl.content?.body || "";
                            setPreviewDoc({ title: tmpl.name, content: raw });
                          }}
                          className="text-xs font-bold text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer bg-transparent border-0"
                        >
                          Visualizar
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenTemplateForm(tmpl)}
                            className="text-xs font-black text-blue-600 hover:text-blue-700 transition-colors cursor-pointer bg-transparent border-0"
                          >
                            {isSystem ? "Clonar e Editar" : "Editar"}
                          </button>
                          {!isSystem && (
                            <button
                              onClick={() => handleDeleteTemplate(tmpl.id)}
                              className="text-xs font-black text-rose-600 hover:text-rose-700 transition-colors cursor-pointer bg-transparent border-0"
                            >
                              Excluir
                            </button>
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
    </div>
  );
}
