"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  PlusIcon,
  Loader2Icon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({});

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
  }, [patientId]);

  useEffect(() => {
    loadMeasurements();
  }, [loadMeasurements]);

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
    } catch (err: any) {
      console.error("Error saving measurement:", err);
      alert("Erro ao salvar medição: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const previous = measurements[1] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">
          Evolução Corporal
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black text-white transition-all"
          style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {showForm ? "Cancelar" : "Nova Medição"}
        </button>
      </div>

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
                  className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                  style={{
                    background:
                      key === "bmi"
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: key === "bmi" ? "#6b7280" : "#e5e7eb",
                  }}
                />
              </div>
            ))}
          </div>
          <textarea
            value={form.notes || ""}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Observações (opcional)..."
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e5e7eb",
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-9 rounded-lg text-xs font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
          >
            {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {saving ? "Salvando..." : "Salvar Medição"}
          </button>
        </div>
      )}

      {/* Latest summary card */}
      {!loading && measurements.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
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
                    <p className="text-sm font-black text-white">
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
            <p className="mt-3 text-xs text-neutral-400 italic border-t pt-2"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}>
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
        <div
          className="text-center py-10 rounded-xl"
          style={{
            border: "1px dashed rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <TrendingUpIcon className="h-7 w-7 mx-auto mb-2 text-neutral-700" />
          <p className="text-xs italic text-neutral-600">
            Nenhuma medição registrada ainda.
          </p>
        </div>
      ) : measurements.length > 1 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">
            Histórico ({measurements.length} medições)
          </p>
          {measurements.slice(1).map((m, idx) => {
            const isExpanded = expandedId === m.id;
            const filled = FIELDS.filter((f) => m[f.key] !== null);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
                className="w-full text-left rounded-xl px-4 py-3 transition-all"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">
                      {new Date(m.measured_at).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-[10px] text-neutral-500">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t"
                    style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    {filled.map(({ key, label, unit }) => (
                      <div key={key}>
                        <p className="text-[9px] text-neutral-600 font-bold uppercase">{label}</p>
                        <p className="text-xs font-bold text-neutral-300">
                          {(m[key] as number)}
                          {unit}
                        </p>
                      </div>
                    ))}
                    {m.notes && (
                      <div className="col-span-full">
                        <p className="text-[10px] text-neutral-500 italic">{m.notes}</p>
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
  );
}
