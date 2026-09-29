"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { deductStock } from "@/lib/stock/stock-operations";
import {
  PlusIcon,
  Loader2Icon,
  FileTextIcon,
  ImageIcon,
  TrashIcon,
  DownloadIcon,
  PaperclipIcon,
  CameraIcon,
  ChevronDownIcon,
  SendIcon,
  CheckCircle2Icon,
  ClockIcon,
  PackageIcon,
  X as XIcon,
} from "lucide-react";

interface PatientRecord {
  id: string;
  type: "note" | "image" | "pdf" | "video" | "audio" | "products";
  title: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  patient_acknowledged?: boolean;
  acknowledged_at?: string | null;
  ciente_sent_at?: string | null;
}

interface ProntuarioTabProps {
  patientId: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  note: FileTextIcon,
  image: ImageIcon,
  pdf: FileTextIcon,
  video: FileTextIcon,
  audio: FileTextIcon,
  products: PackageIcon,
};

const TYPE_LABELS: Record<string, string> = {
  note: "Anotação",
  image: "Imagem",
  pdf: "PDF/Documento",
  video: "Vídeo",
  audio: "Áudio",
  products: "Produtos Utilizados",
};

const TYPE_COLORS: Record<string, string> = {
  note: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  image: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  pdf: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  video: "text-violet-500 bg-violet-500/10 border-violet-500/20",
  audio: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  products: "text-orange-500 bg-orange-500/10 border-orange-500/20",
};

export function ProntuarioTab({ patientId }: ProntuarioTabProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showProductsForm, setShowProductsForm] = useState(false);
  const [stockProductsList, setStockProductsList] = useState<{ id: string; name: string; unit: string; current_quantity: number }[]>([]);
  const [usedProducts, setUsedProducts] = useState<{ product_id: string; quantity: string }[]>([{ product_id: "", quantity: "1" }]);
  const [savingProducts, setSavingProducts] = useState(false);

  // Form state
  const [formType, setFormType] = useState<"note" | "image" | "pdf">("note");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestingCienteId, setRequestingCienteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleRequestCiente = async (recordId: string) => {
    setRequestingCienteId(recordId);
    try {
      const res = await fetch('/api/whatsapp/send-ciente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, patient_id: patientId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar solicitação');
      toast.success('Solicitação de ciência enviada com sucesso ao WhatsApp!');
      await loadRecords();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao solicitar ciência: ' + err.message);
    } finally {
      setRequestingCienteId(null);
    }
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      setRecords(data || []);
    } catch (err) {
      console.error("Error loading records:", err);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!accountId) return;
    supabase
      .from("stock_products")
      .select("id, name, unit, current_quantity")
      .eq("clinic_id", accountId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setStockProductsList(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Records which stock products were used in this visit AND deducts
  // them from stock in the same action — plus leaves a "Produtos
  // Utilizados" entry in the chart itself, so there's a permanent
  // clinical trail of what was used, not just a number that moved
  // in Estoque.
  const handleSaveUsedProducts = async () => {
    if (!accountId || !user) return;
    const valid = usedProducts.filter((u) => u.product_id && parseFloat(u.quantity.replace(",", ".")) > 0);
    if (valid.length === 0) {
      toast.error("Selecione ao menos um produto com quantidade.");
      return;
    }
    setSavingProducts(true);
    try {
      const lines: string[] = [];
      for (const item of valid) {
        const product = stockProductsList.find((p) => p.id === item.product_id);
        if (!product) continue;
        const qty = parseFloat(item.quantity.replace(",", "."));

        await deductStock(supabase, {
          clinicId: accountId,
          productId: product.id,
          quantity: qty,
          reason: "Uso em atendimento (prontuário)",
          createdBy: user.id,
        });

        lines.push(`• ${product.name} — ${qty} ${product.unit || "un"}`);
      }

      const { error: recErr } = await supabase.from("patient_records").insert({
        patient_id: patientId,
        clinic_id: accountId,
        type: "products",
        title: "Produtos utilizados",
        content: lines.join("\n"),
        created_by: user.id,
      });
      if (recErr) throw recErr;

      toast.success("Produtos registrados e abatidos do estoque.");
      setUsedProducts([{ product_id: "", quantity: "1" }]);
      setShowProductsForm(false);
      await loadRecords();
      // Refresh local stock quantities so a second registration in
      // the same session sees the already-reduced numbers.
      const { data: refreshed } = await supabase
        .from("stock_products")
        .select("id, name, unit, current_quantity")
        .eq("clinic_id", accountId)
        .eq("is_active", true)
        .order("name");
      setStockProductsList(refreshed || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar produtos utilizados.");
    } finally {
      setSavingProducts(false);
    }
  };

  const handleFileChange = (file: File | null) => {
    setFileToUpload(file);
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSave = async () => {
    if (!accountId || !user) return;

    if (formType === "note" && !formContent.trim() && !formTitle.trim()) {
      toast.error("Escreva pelo menos um título ou conteúdo para a anotação.");
      return;
    }

    setSaving(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;

      if (fileToUpload) {
        const ext = fileToUpload.name.split(".").pop() || "";
        const path = `prontuario/${accountId}/${patientId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, fileToUpload, { upsert: false });

        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage
          .from("attachments")
          .getPublicUrl(path);

        fileUrl = urlData.publicUrl;
        fileName = fileToUpload.name;
        fileSize = fileToUpload.size;
      }

      await supabase.from("patient_records").insert({
        patient_id: patientId,
        clinic_id: accountId,
        type: formType,
        title: formTitle.trim() || null,
        content: formContent.trim() || null,
        file_url: fileUrl,
        file_name: fileName,
        file_size: fileSize,
        created_by: user.id,
      });

      setFormTitle("");
      setFormContent("");
      setFileToUpload(null);
      setPreviewUrl(null);
      setShowForm(false);
      await loadRecords();
    } catch (err: any) {
      console.error("Error saving record:", err);
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este registro do prontuário?")) return;
    await supabase.from("patient_records").delete().eq("id", id).eq("patient_id", patientId);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Prontuário Clínico
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProductsForm(!showProductsForm)}
            className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-700 transition-all hover:bg-orange-100"
          >
            <PackageIcon className="h-3.5 w-3.5" />
            {showProductsForm ? "Cancelar" : "Produtos Utilizados"}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black text-white transition-all"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {showForm ? "Cancelar" : "Novo Registro"}
          </button>
        </div>
      </div>

      {showProductsForm && (
        <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <p className="text-[11px] text-orange-800/80">
            Registre os produtos usados neste atendimento — eles são abatidos do estoque na hora e
            ficam anotados no prontuário.
          </p>
          {usedProducts.map((item, idx) => {
            const product = stockProductsList.find((p) => p.id === item.product_id);
            return (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={item.product_id}
                  onChange={(e) => {
                    const next = [...usedProducts];
                    next[idx] = { ...next[idx], product_id: e.target.value };
                    setUsedProducts(next);
                  }}
                  className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione o produto...</option>
                  {stockProductsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (estoque: {p.current_quantity} {p.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...usedProducts];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setUsedProducts(next);
                  }}
                  className="h-8 w-20 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {product && (
                  <span className="w-8 shrink-0 text-[10px] text-muted-foreground">{product.unit}</span>
                )}
                {usedProducts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setUsedProducts(usedProducts.filter((_, i) => i !== idx))}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setUsedProducts([...usedProducts, { product_id: "", quantity: "1" }])}
            className="w-full rounded-lg border border-dashed border-orange-300 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100/60"
          >
            + Adicionar outro produto
          </button>
          {stockProductsList.length === 0 && (
            <p className="text-[11px] italic text-orange-800/70">
              Nenhum produto cadastrado no estoque ainda.
            </p>
          )}
          <button
            onClick={handleSaveUsedProducts}
            disabled={savingProducts}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:opacity-50"
          >
            {savingProducts && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            Registrar e Abater do Estoque
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {(["note", "image", "pdf"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFormType(t)}
                className="rounded-lg py-2 text-[10px] font-black uppercase tracking-wide transition-all"
                style={{
                  background:
                    formType === t
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(255,255,255,0.03)",
                  border:
                    formType === t
                      ? "1px solid rgba(99,102,241,0.4)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color: formType === t ? "#a5b4fc" : "#6b7280",
                }}
              >
                {t === "note" ? "📝 Anotação" : t === "image" ? "🖼️ Imagem" : "📎 Arquivo"}
              </button>
            ))}
          </div>

          {/* Title */}
          <input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Título (opcional)..."
            className="w-full rounded-lg px-3 py-2 text-xs outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e5e7eb",
            }}
          />

          {/* Content or file upload */}
          {formType === "note" ? (
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Escreva suas observações clínicas..."
              rows={5}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-y"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e5e7eb",
              }}
            />
          ) : (
            <div className="space-y-2">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Prévia"
                  className="max-h-36 w-auto rounded-lg object-cover"
                />
              )}
              {fileToUpload && !previewUrl && (
                <p className="text-[10px] text-muted-foreground font-semibold">
                  📎 {fileToUpload.name}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-lg py-2.5 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#9ca3af",
                  }}
                >
                  <PaperclipIcon className="h-3.5 w-3.5" />
                  Selecionar Arquivo
                </button>
                {formType === "image" && (
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 rounded-lg py-2.5 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#9ca3af",
                    }}
                  >
                    <CameraIcon className="h-3.5 w-3.5" />
                    Tirar Foto
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={formType === "image" ? "image/*" : ".pdf,.doc,.docx"}
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-9 rounded-lg text-xs font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
          >
            {saving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Salvando..." : "Salvar Registro"}
          </button>
        </div>
      )}

      {/* Record list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : records.length === 0 ? (
        <div
          className="text-center py-10 rounded-xl"
          style={{
            border: "1px dashed rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <FileTextIcon className="h-7 w-7 mx-auto mb-2 text-neutral-700" />
          <p className="text-xs italic text-neutral-600">
            Nenhum registro no prontuário ainda.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((rec) => {
            const Icon = TYPE_ICONS[rec.type] || FileTextIcon;
            const clr = TYPE_COLORS[rec.type] || "text-muted-foreground bg-neutral-100/5 border-neutral-700";
            return (
              <div
                key={rec.id}
                className="rounded-xl p-4 space-y-2"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${clr}`}>
                      {TYPE_LABELS[rec.type]}
                    </span>
                    {rec.title && (
                      <span className="text-xs font-bold text-white">{rec.title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleRequestCiente(rec.id)}
                      disabled={requestingCienteId !== null || rec.patient_acknowledged}
                      title="Solicitar Ciência via WhatsApp"
                      className="h-7 px-2 rounded-lg flex items-center justify-center text-xs font-bold text-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      {requestingCienteId === rec.id ? (
                        <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <SendIcon className="h-3 w-3 mr-1" />
                      )}
                      Pedir Ciente
                    </button>
                    {rec.file_url && (
                      <a
                        href={rec.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(rec.id)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-neutral-600 hover:text-rose-400 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Science Status Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.patient_acknowledged ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <CheckCircle2Icon className="h-3 w-3" /> Ciente Confirmado
                    </span>
                  ) : rec.ciente_sent_at ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                      <ClockIcon className="h-3 w-3 animate-pulse" /> Aguardando Ciente
                    </span>
                  ) : null}
                </div>

                {rec.type === "image" && rec.file_url && (
                  <img
                    src={rec.file_url}
                    alt={rec.title || "Imagem"}
                    className="max-h-48 w-auto rounded-lg object-cover"
                  />
                )}
                {rec.content && (
                  <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {rec.content}
                  </p>
                )}
                {rec.file_name && rec.type !== "image" && (
                  <p className="text-[10px] text-muted-foreground font-semibold">
                    📎 {rec.file_name}
                  </p>
                )}

                <p className="text-[9px] text-neutral-600 font-semibold">
                  {new Date(rec.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
