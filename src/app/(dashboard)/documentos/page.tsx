"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  FileTextIcon,
  SendIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
  SearchIcon,
  ShieldCheckIcon,
  Loader2Icon,
  CopyIcon
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

const STATUS_CONFIG: Record<DocStatus, { label: string; cls: string; icon: React.ElementType }> = {
  signed: { label: "Assinado", cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2Icon },
  pending: { label: "Aguardando assinatura", cls: "text-amber-600 bg-amber-500/10 border-amber-500/30", icon: ClockIcon },
  expired: { label: "Expirado", cls: "text-neutral-500 bg-neutral-100 border-neutral-200", icon: XCircleIcon },
  refused: { label: "Recusado", cls: "text-destructive bg-destructive/10 border-destructive/30", icon: XCircleIcon },
};

const TYPE_LABELS: Record<string, string> = {
  consentimento: "Consentimento",
  contrato: "Contrato",
  anamnese: "Anamnese",
  orcamento: "Orçamento",
};

export default function DocumentosPage() {
  const supabase = createClient();
  const { profile, accountId } = useAuth();
  const [documents, setDocuments] = useState<DBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");

  const loadDocuments = async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const clinicId = accountId;

      const { data: docs, error: docsErr } = await supabase
        .from("documents")
        .select(`
          id,
          title,
          type,
          status,
          patient_id,
          public_token,
          created_at,
          signed_at,
          patients (
            name,
            phone
          )
        `)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });

      if (docsErr) throw docsErr;

      const formattedDocs: DBDocument[] = (docs || []).map(d => ({
        id: d.id,
        title: d.title || "Documento Sem Nome",
        type: d.type || "contrato",
        status: (d.status || "pending") as DocStatus,
        patient_id: d.patient_id,
        public_token: d.public_token,
        created_at: d.created_at,
        signed_at: d.signed_at,
        patient_name: (d.patients as any)?.name || "Paciente Removido",
        phone: (d.patients as any)?.phone || ""
      }));

      setDocuments(formattedDocs);

    } catch (err: any) {
      console.error("Error loading documents:", err);
      setError("Erro ao carregar lista de documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [accountId]);

  const handleCopyLink = (token: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/portal/documento/${token}`;
    navigator.clipboard.writeText(url);
    alert("Link de assinatura copiado para a área de transferência!");
  };

  const handleResendWa = async (doc: DBDocument) => {
    if (!accountId || !doc.public_token) return;
    try {
      const portalUrl = `${window.location.origin}/portal/documento/${doc.public_token}`;

      // Insert timeline log
      await supabase.from("patient_timeline").insert({
        patient_id: doc.patient_id,
        event_type: "whatsapp",
        title: `Link de assinatura reenviado via WhatsApp`,
        payload: {
          sent_by: profile?.full_name || "",
          phone: doc.phone,
          message: `Olá! Reenviamos o link para assinatura digital do seu documento "${doc.title}": ${portalUrl}`,
        },
      });

      alert(`Link de assinatura para "${doc.title}" enviado com sucesso via WhatsApp!`);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao reenviar pelo WhatsApp: " + err.message);
    }
  };

  const filtered = documents.filter((d) => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.patient_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[300px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Documentos</h1>
          <p className="text-sm text-neutral-500">Acompanhe contratos, termos de consentimento e históricos de assinatura eletrônica.</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Geral", value: documents.length, cls: "text-neutral-800" },
          { label: "Assinados", value: documents.filter((d) => d.status === "signed").length, cls: "text-emerald-600" },
          { label: "Aguardando", value: documents.filter((d) => d.status === "pending").length, cls: "text-amber-600" },
          { label: "Recusados/Expirados", value: documents.filter((d) => d.status === "refused" || d.status === "expired").length, cls: "text-neutral-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm/5 text-center">
            <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-neutral-400 mt-0.5 font-bold">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou paciente..."
            className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm/5"
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
              {f === "all" ? "Todos" : STATUS_CONFIG[f]?.label.split(" ")[0] ?? f}
            </button>
          ))}
        </div>
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {filtered.map((doc) => {
          const s = STATUS_CONFIG[doc.status] || { label: doc.status, cls: "text-neutral-500 bg-neutral-100", icon: FileTextIcon };
          const Icon = s.icon;
          return (
            <div key={doc.id} className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-blue-200 transition-all shadow-sm/5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100/50">
                    <FileTextIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-extrabold text-neutral-800 truncate">{doc.title}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${s.cls}`}>
                        <Icon className="h-3 w-3" />
                        {s.label}
                      </span>
                      <span className="rounded-full bg-neutral-100 border border-neutral-200/40 px-2 py-0.5 text-[9px] font-bold text-neutral-500 uppercase">
                        {TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 font-semibold">
                      Paciente: <strong className="text-neutral-600">{doc.patient_name}</strong> · Criado em {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    {doc.status === "signed" && doc.signed_at && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
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
                      className="rounded-lg border border-neutral-200 p-2 text-neutral-500 bg-white hover:bg-neutral-50 transition-all"
                      title="Copiar Link de Assinatura"
                    >
                      <CopyIcon className="h-4 w-4" />
                    </button>
                  )}
                  {doc.status === "pending" && (
                    <button
                      onClick={() => handleResendWa(doc)}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-700 transition-colors shadow-xs"
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
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-white">
            <FileTextIcon className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-xs text-neutral-400 italic">Nenhum documento encontrado com os termos pesquisados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
