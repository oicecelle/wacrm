"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  PlusIcon,
  Loader2Icon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ImageIcon,
  CameraIcon,
  Upload,
  Trash2,
  Check,
  Sparkles,
  Hourglass,
} from "lucide-react";

interface Measurement {
  id: string;
  measured_at: string;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  arm_right: number | null;
  arm_left: number | null;
  waist: number | null;
  abdomen: number | null;
  hip: number | null;
  thigh_right: number | null;
  thigh_left: number | null;
  calf: number | null;
  body_fat_pct: number | null;
  notes: string | null;
}

interface EvolucaoTabProps {
  patientId: string;
}

const FIELDS: { key: keyof Measurement; label: string; unit: string }[] = [
  { key: "weight", label: "Peso", unit: "kg" },
  { key: "height", label: "Altura", unit: "cm" },
  { key: "bmi", label: "IMC", unit: "" },
  { key: "arm_right", label: "Braço Direito", unit: "cm" },
  { key: "arm_left", label: "Braço Esquerdo", unit: "cm" },
  { key: "waist", label: "Cintura", unit: "cm" },
  { key: "abdomen", label: "Abdômen", unit: "cm" },
  { key: "hip", label: "Quadril", unit: "cm" },
  { key: "thigh_right", label: "Coxa Direita", unit: "cm" },
  { key: "thigh_left", label: "Coxa Esquerda", unit: "cm" },
  { key: "calf", label: "Panturrilha", unit: "cm" },
  { key: "body_fat_pct", label: "% de Gordura", unit: "%" },
];

type FormData = Partial<Record<keyof Measurement, string>>;

function calcBmi(weight: string, height: string): string {
  const w = parseFloat(weight);
  const h = parseFloat(height) / 100;
  if (!w || !h || h <= 0) return "";
  return (w / (h * h)).toFixed(1);
}

function DiffChip({
  current,
  previous,
  smaller = false,
}: {
  current: number | null;
  previous: number | null;
  smaller?: boolean;
}) {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return <MinusIcon className="h-3 w-3 text-neutral-500" />;
  const better = smaller ? diff < 0 : diff > 0;
  const color = better ? "text-emerald-400" : "text-rose-400";
  const Icon = diff < 0 ? TrendingDownIcon : TrendingUpIcon;
  return (
    <span className={`text-[9px] font-black flex items-center gap-0.5 ${color}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
    </span>
  );
}

export function EvolucaoTab({ patientId }: EvolucaoTabProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'measurements' | 'photos'>('measurements');

  // Measurements State
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({});

  // Photos State
  const [photos, setPhotos] = useState<any[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoA, setSelectedPhotoA] = useState<string | null>(null);
  const [selectedPhotoB, setSelectedPhotoB] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadMeasurements = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("patient_id", patientId)
        .order("measured_at", { ascending: false });
      setMeasurements(data || []);
    } catch (err) {
      console.error("Error loading measurements:", err);
    } finally {
      setLoading(false);
    }
  }, [patientId, supabase]);

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const { data } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", patientId)
        .eq("type", "image")
        .order("created_at", { ascending: false });
      setPhotos(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPhotos(false);
    }
  }, [patientId, supabase]);

  useEffect(() => {
    loadMeasurements();
    loadPhotos();
  }, [loadMeasurements, loadPhotos]);

  // Auto-calc BMI
  useEffect(() => {
    if (form.weight && form.height) {
      const bmi = calcBmi(form.weight, form.height);
      if (bmi) setForm((prev) => ({ ...prev, bmi }));
    }
  }, [form.weight, form.height]);

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!accountId || !user) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        patient_id: patientId,
        clinic_id: accountId,
        created_by: user.id,
        measured_at: new Date().toISOString(),
      };

      FIELDS.forEach(({ key }) => {
        if (form[key]) payload[key] = parseFloat(form[key] as string);
      });
      if (form.notes) payload.notes = form.notes;

      const { error } = await supabase.from("body_measurements").insert(payload);
      if (error) throw error;

      setForm({});
      setShowForm(false);
      await loadMeasurements();
      toast.success("Medição corporal salva!");
    } catch (err: any) {
      console.error("Error saving measurement:", err);
      toast.error("Erro ao salvar medição: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    if (!accountId || !user) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "";
      const path = `prontuario/${accountId}/${patientId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(path);

      const { error: dbErr } = await supabase.from("patient_records").insert({
        patient_id: patientId,
        clinic_id: accountId,
        type: "image",
        title: "Foto de Evolução",
        content: null,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
        created_by: user.id,
      });

      if (dbErr) throw dbErr;

      toast.success("Foto de evolução adicionada!");
      await loadPhotos();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao fazer upload da foto: " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if (!confirm("Remover esta foto de evolução?")) return;
    const { error } = await supabase.from("patient_records").delete().eq("id", id).eq("patient_id", patientId);
    if (!error) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      if (selectedPhotoA === id) setSelectedPhotoA(null);
      if (selectedPhotoB === id) setSelectedPhotoB(null);
      toast.success("Foto removida!");
    } else {
      toast.error("Erro ao deletar foto");
    }
  };

  const handleSelectPhotoForCompare = (id: string) => {
    if (selectedPhotoA === id) {
      setSelectedPhotoA(null);
    } else if (selectedPhotoB === id) {
      setSelectedPhotoB(null);
    } else if (!selectedPhotoA) {
      setSelectedPhotoA(id);
    } else if (!selectedPhotoB) {
      setSelectedPhotoB(id);
    } else {
      // Both selected, override photo B
      setSelectedPhotoB(id);
    }
  };

  const previous = measurements[1] ?? null;

  return (
    <div className="space-y-4">
      {/* Sub-tab selection system */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/50">
          <button
            onClick={() => setActiveSubTab('measurements')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all cursor-pointer ${
              activeSubTab === 'measurements'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📏 Medidas
          </button>
          <button
            onClick={() => setActiveSubTab('photos')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all cursor-pointer ${
              activeSubTab === 'photos'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🖼️ Fotos Progresso
          </button>
        </div>

        {activeSubTab === 'measurements' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black text-white transition-all cursor-pointer"
            style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {showForm ? "Cancelar" : "Nova Medição"}
          </button>
        )}
      </div>

      {/* RENDER MEASUREMENTS */}
      {activeSubTab === 'measurements' && (
        <div className="space-y-4">
          {/* Form */}
          {showForm && (
            <div
              className="rounded-xl p-4 space-y-4"
              style={{
                background: "rgba(16,185,129,0.05)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <p className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">
                📏 Registrar Novas Medidas
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FIELDS.map(({ key, label, unit }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wide text-neutral-500">
                      {label} {unit && `(${unit})`}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="—"
                      value={form[key] || ""}
                      readOnly={key === "bmi"}
                      onChange={(e) => setField(key as string, e.target.value)}
                      className="w-full rounded-lg bg-background/50 border border-border/80 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Observações (opcional)..."
                rows={2}
                className="w-full rounded-lg bg-background/50 border border-border/80 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-9 rounded-lg text-xs font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
              >
                {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
                {saving ? "Salvando..." : "Salvar Medição"}
              </button>
            </div>
          )}

          {/* Latest summary card */}
          {!loading && measurements.length > 0 && (
            <div className="rounded-xl p-4 border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Última medição · {new Date(measurements[0].measured_at).toLocaleDateString("pt-BR")}
                </p>
                {measurements.length > 1 && (
                  <span className="text-[9px] text-neutral-600 font-semibold">
                    vs. medição anterior
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FIELDS.filter((f) => measurements[0][f.key] !== null).map(({ key, label, unit }) => {
                  const val = measurements[0][key] as number | null;
                  const prevVal = previous ? (previous[key] as number | null) : null;
                  return (
                    <div key={key} className="space-y-0.5">
                      <p className="text-[9px] text-neutral-500 font-bold uppercase">{label}</p>
                      <div className="flex items-end gap-1.5">
                        <p className="text-sm font-black text-foreground">
                          {val !== null ? `${val}${unit}` : "—"}
                        </p>
                        <DiffChip
                          current={val}
                          previous={prevVal}
                          smaller={["waist", "abdomen", "hip", "body_fat_pct", "weight"].includes(key)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {measurements[0].notes && (
                <p className="mt-3 text-xs text-muted-foreground italic border-t pt-2 border-border/50">
                  {measurements[0].notes}
                </p>
              )}
            </div>
          )}

          {/* History list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
          ) : measurements.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed border-border bg-card">
              <TrendingUpIcon className="h-7 w-7 mx-auto mb-2 text-neutral-400" />
              <p className="text-xs italic text-neutral-600">
                Nenhuma medição registrada ainda.
              </p>
            </div>
          ) : measurements.length > 1 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Histórico ({measurements.length} medições)
              </p>
              {measurements.slice(1).map((m) => {
                const isExpanded = expandedId === m.id;
                const filled = FIELDS.filter((f) => m[f.key] !== null);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                    className="w-full text-left rounded-xl px-4 py-3 transition-all border border-border bg-card hover:bg-muted/35 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {new Date(m.measured_at).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {filled.length} campo(s) registrado(s)
                          {m.weight ? ` · Peso: ${m.weight}kg` : ""}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUpIcon className="h-4 w-4 text-neutral-500" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
                      )}
                    </div>
                    {isExpanded && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50">
                        {filled.map(({ key, label, unit }) => (
                          <div key={key}>
                            <p className="text-[9px] text-neutral-500 font-bold uppercase">{label}</p>
                            <p className="text-xs font-bold text-foreground">
                              {(m[key] as number)}
                              {unit}
                            </p>
                          </div>
                        ))}
                        {m.notes && (
                          <div className="col-span-full">
                            <p className="text-[10px] text-muted-foreground italic">{m.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* RENDER PROGRESS PHOTOS COMPARATIVE */}
      {activeSubTab === 'photos' && (
        <div className="space-y-4">
          {/* Compare Window Box */}
          {selectedPhotoA && selectedPhotoB && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.01] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                  <Sparkles className="size-3.5" /> Comparativo Lado a Lado
                </p>
                <button
                  onClick={() => {
                    setSelectedPhotoA(null);
                    setSelectedPhotoB(null);
                  }}
                  className="text-[10px] font-bold text-neutral-500 hover:text-red-500 transition-colors cursor-pointer"
                >
                  Limpar Comparação
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Before Photo */}
                <div className="space-y-1">
                  <span className="inline-flex rounded-full bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                    Antes
                  </span>
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted">
                    <img
                      src={photos.find((p) => p.id === selectedPhotoA)?.file_url}
                      alt="Antes"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground block text-center font-semibold">
                    {new Date(photos.find((p) => p.id === selectedPhotoA)?.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {/* After Photo */}
                <div className="space-y-1">
                  <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                    Depois
                  </span>
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted">
                    <img
                      src={photos.find((p) => p.id === selectedPhotoB)?.file_url}
                      alt="Depois"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground block text-center font-semibold">
                    {new Date(photos.find((p) => p.id === selectedPhotoB)?.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upload and Camera triggers */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <p className="text-[10px] text-neutral-400 font-black uppercase tracking-wider">
              📸 Adicionar Nova Foto de Progresso
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex-1 rounded-xl py-2 text-xs font-black uppercase border border-border hover:bg-muted/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {uploadingPhoto ? <Loader2Icon className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex-1 rounded-xl py-2 text-xs font-black uppercase border border-border hover:bg-muted/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {uploadingPhoto ? <Loader2Icon className="size-3.5 animate-spin" /> : <CameraIcon className="size-3.5" />}
                Câmera
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) handleUploadPhoto(file);
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) handleUploadPhoto(file);
              }}
            />
          </div>

          {/* Photo gallery */}
          {loadingPhotos ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed border-border bg-card">
              <ImageIcon className="h-7 w-7 mx-auto mb-2 text-neutral-400" />
              <p className="text-xs italic text-neutral-600">
                Nenhuma foto registrada para este paciente ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Fotos de Evolução ({photos.length}) - Selecione 2 para Comparar
              </p>
              <div className="grid grid-cols-3 gap-3">
                {photos.map((item) => {
                  const isSelectedA = selectedPhotoA === item.id;
                  const isSelectedB = selectedPhotoB === item.id;
                  const isSelected = isSelectedA || isSelectedB;
                  return (
                    <div
                      key={item.id}
                      className={`group relative aspect-[3/4] rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02] ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                          : 'border-border bg-muted'
                      }`}
                      onClick={() => handleSelectPhotoForCompare(item.id)}
                    >
                      <img
                        src={item.file_url}
                        alt="Evolução"
                        className="absolute inset-0 w-full h-full object-cover"
                      />

                      {/* Top Check/Number Indicator */}
                      {isSelected && (
                        <span className="absolute top-1.5 left-1.5 h-4 w-4 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[9px] font-black uppercase">
                          {isSelectedA ? 'A' : 'B'}
                        </span>
                      )}

                      {/* Trash action */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePhoto(item.id);
                        }}
                        className="absolute top-1.5 right-1.5 h-6 w-6 bg-black/60 hover:bg-red-600/90 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <Trash2 className="size-3" />
                      </button>

                      {/* Bottom Date label */}
                      <div className="absolute bottom-0 inset-x-0 bg-black/65 py-1 px-1.5 text-center">
                        <span className="text-[8px] text-white font-bold block">
                          {new Date(item.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
