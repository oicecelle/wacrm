"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";

interface PatientRecord {
  id: string;
  type: "note" | "image" | "pdf" | "video" | "audio";
  title: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
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
};

const TYPE_LABELS: Record<string, string> = {
  note: "Anotação",
  image: "Imagem",
  pdf: "PDF/Documento",
  video: "Vídeo",
  audio: "Áudio",
};

const TYPE_COLORS: Record<string, string> = {
  note: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  image: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  pdf: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  video: "text-violet-500 bg-violet-500/10 border-violet-500/20",
  audio: "text-amber-500 bg-amber-500/10 border-amber-500/20",
};

export function ProntuarioTab({ patientId }: ProntuarioTabProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formType, setFormType] = useState<"note" | "image" | "pdf">("note");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      alert("Escreva pelo menos um título ou conteúdo para a anotação.");
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
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este registro do prontuário?")) return;
    await supabase.from("patient_records").delete().eq("id", id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">
          Prontuário Clínico
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black text-white transition-all"
          style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {showForm ? "Cancelar" : "Novo Registro"}
        </button>
      </div>

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
                <p className="text-[10px] text-neutral-400 font-semibold">
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
          <Loader2Icon className="h-6 w-6 animate-spin text-indigo-400" />
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
            const clr = TYPE_COLORS[rec.type] || "text-neutral-500 bg-neutral-100/5 border-neutral-700";
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
                    {rec.file_url && (
                      <a
                        href={rec.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
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
                  <p className="text-[10px] text-neutral-500 font-semibold">
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
