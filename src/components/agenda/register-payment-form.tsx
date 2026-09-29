"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildPaymentRow,
  computeFee,
  defaultCategory,
  isIncomeType,
  PAYMENT_CATEGORIES,
  PAYMENT_TYPE_LABELS,
  parseMoneyInput,
  type PaymentEntryStatus,
  type PaymentEntryType,
  type PaymentMethodRef,
} from "@/lib/finance/payment-entry";

interface MethodOption extends PaymentMethodRef {
  name: string;
}

interface RegisterPaymentFormProps {
  clinicId: string;
  patientId: string;
  patientName?: string;
  onSaved: () => void;
  onCancel: () => void;
}

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * "Registrar pagamento" — logs a payment (or deposit, or refund) on the
 * patient's Financeiro tab without going through a sale. Uses the
 * clinic's configured payment methods, so the method's fee is recorded
 * at the moment of the payment and shows up in the DRE's net revenue.
 */
export function RegisterPaymentForm({ clinicId, patientId, patientName, onSaved, onCancel }: RegisterPaymentFormProps) {
  const supabase = createClient();

  const [methods, setMethods] = useState<MethodOption[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [methodId, setMethodId] = useState("");
  const [type, setType] = useState<PaymentEntryType>("receita");
  const [description, setDescription] = useState("");
  const [valueText, setValueText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState<PaymentEntryStatus>("paid");
  const [category, setCategory] = useState(defaultCategory("receita"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("payment_method_configs")
        .select("id, name, method_type, fee_percent")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("sort_order");
      if (cancelled) return;
      const list = (data ?? []) as MethodOption[];
      setMethods(list);
      const preferred = list.find((m) => m.method_type === "pix") ?? list[0];
      if (preferred) setMethodId(preferred.id);
      setLoadingMethods(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const value = parseMoneyInput(valueText);
  const fee = useMemo(() => (value ? computeFee(type, value, method?.fee_percent) : 0), [type, value, method]);

  const changeType = (next: PaymentEntryType) => {
    // Keep a category the person picked themselves; only swap the
    // auto-suggested one when they haven't changed it.
    if (category === defaultCategory(type)) setCategory(defaultCategory(next));
    setType(next);
  };

  const handleSave = async () => {
    const built = buildPaymentRow({ clinicId, patientId, type, description, valueText, date, status, category, method });
    if (built.row === undefined) {
      toast.error(built.error);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("financial_transactions").insert(built.row);
    setSaving(false);
    if (error) {
      console.error("Error registering payment:", error);
      toast.error("Não foi possível registrar o pagamento. Tente de novo.");
      return;
    }
    toast.success(type === "despesa" ? "Saída registrada." : "Pagamento registrado.");
    onSaved();
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary-soft-2 bg-primary-soft p-4 text-left">
      <div>
        <p className="text-xs font-black text-foreground">Registrar pagamento</p>
        {patientName && <p className="text-[10px] text-muted-foreground">Paciente: {patientName}</p>}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentEntryType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeType(t)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
              type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-neutral-50"
            }`}
          >
            {PAYMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Descrição *</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Sessão de Botox, sinal do preenchimento..."
          className="h-8 text-xs"
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Valor (R$) *</Label>
          <Input
            inputMode="decimal"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            placeholder="0,00"
            className="h-8 text-xs"
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" disabled={saving} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Forma de pagamento</Label>
          {loadingMethods ? (
            <div className="flex h-8 items-center"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
          ) : (
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              disabled={saving || methods.length === 0}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
            >
              {methods.length === 0 && <option value="">Outro</option>}
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.fee_percent > 0 ? ` (${m.fee_percent}% taxa)` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-muted-foreground">Categoria</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
          >
            {PAYMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {(["paid", "pending"] as PaymentEntryStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
              status === s
                ? s === "paid"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-amber-500 bg-amber-500 text-white"
                : "border-border bg-card text-muted-foreground hover:bg-neutral-50"
            }`}
          >
            {s === "paid" ? "Já foi pago" : "Ainda pendente"}
          </button>
        ))}
      </div>

      {isIncomeType(type) && value && fee > 0 && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          Taxa da forma de pagamento: <strong>{money(fee)}</strong> (custo da clínica — o paciente paga {money(value)}). Líquido: {money(value - fee)}.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-neutral-100 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}
