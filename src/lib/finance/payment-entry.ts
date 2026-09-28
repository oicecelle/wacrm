import { parseNumber } from "@/lib/import/coerce";

/**
 * Rules for registering a payment by hand from a patient's Financeiro
 * tab. Kept apart from the form so the parts that touch money — how the
 * value is read, when a payment-method fee applies, what row is written —
 * can be unit-tested.
 */

export type PaymentEntryType = "receita" | "sinal" | "despesa";
export type PaymentEntryStatus = "paid" | "pending";

export const PAYMENT_TYPE_LABELS: Record<PaymentEntryType, string> = {
  receita: "Pagamento recebido",
  sinal: "Sinal / entrada",
  despesa: "Saída / estorno",
};

export const PAYMENT_CATEGORIES = ["Procedimento", "Produto", "Sinal", "Estorno", "Outro"] as const;

export function defaultCategory(type: PaymentEntryType): string {
  if (type === "sinal") return "Sinal";
  if (type === "despesa") return "Estorno";
  return "Procedimento";
}

/** Types that money comes IN for (and so can carry a payment-method fee). */
export function isIncomeType(type: string | null | undefined): boolean {
  return type === "receita" || type === "sinal";
}

/**
 * The payment method's fee, as a value in R$. Only money coming in pays
 * a processor fee — a refund/outflow never does. Rounded to cents.
 */
export function computeFee(type: PaymentEntryType, value: number, feePercent: number | null | undefined): number {
  if (!isIncomeType(type) || !feePercent || feePercent <= 0 || !(value > 0)) return 0;
  return Math.round(value * (feePercent / 100) * 100) / 100;
}

/** Reads what a person typed into a money field: "1.200,50", "350", "R$ 90,5". */
export function parseMoneyInput(text: string): number | null {
  const n = parseNumber(text);
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export interface PaymentMethodRef {
  id: string;
  method_type: string;
  fee_percent: number;
}

export interface PaymentEntryInput {
  clinicId: string;
  patientId: string;
  type: PaymentEntryType;
  description: string;
  valueText: string;
  /** YYYY-MM-DD */
  date: string;
  status: PaymentEntryStatus;
  category: string;
  method: PaymentMethodRef | null;
}

export type PaymentEntryResult = { row: Record<string, unknown>; error?: undefined } | { row?: undefined; error: string };

/** Validates the form and builds the financial_transactions row. */
export function buildPaymentRow(input: PaymentEntryInput): PaymentEntryResult {
  const description = input.description.trim();
  if (!description) return { error: "Informe uma descrição." };

  const value = parseMoneyInput(input.valueText);
  if (value === null || value <= 0) return { error: "Informe um valor maior que zero." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(new Date(`${input.date}T12:00:00`).getTime())) {
    return { error: "Informe uma data válida." };
  }

  return {
    row: {
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      date: input.date,
      description,
      category: input.category.trim() || defaultCategory(input.type),
      method: input.method?.method_type ?? "outro",
      payment_method_config_id: input.method?.id ?? null,
      fee_amount: computeFee(input.type, value, input.method?.fee_percent),
      type: input.type,
      value,
      status: input.status,
    },
  };
}
