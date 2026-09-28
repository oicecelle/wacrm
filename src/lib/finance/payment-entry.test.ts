import { describe, expect, it } from "vitest";
import { buildPaymentRow, computeFee, defaultCategory, isIncomeType, parseMoneyInput, type PaymentEntryInput } from "./payment-entry";

const pix = { id: "m-pix", method_type: "pix", fee_percent: 0 };
const credit3x = { id: "m-c3", method_type: "credito", fee_percent: 3.5 };

const base: PaymentEntryInput = {
  clinicId: "clinic-1",
  patientId: "patient-1",
  type: "receita",
  description: "Sessão de Botox",
  valueText: "500,00",
  date: "2026-09-28",
  status: "paid",
  category: "Procedimento",
  method: credit3x,
};

describe("parseMoneyInput", () => {
  it("reads Brazilian and plain money", () => {
    expect(parseMoneyInput("1.200,50")).toBe(1200.5);
    expect(parseMoneyInput("350")).toBe(350);
    expect(parseMoneyInput("R$ 90,5")).toBe(90.5);
    expect(parseMoneyInput("0,99")).toBe(0.99);
  });
  it("rounds to cents and rejects text", () => {
    expect(parseMoneyInput("10,999")).toBe(11);
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
  });
});

describe("computeFee", () => {
  it("applies the method's percentage to money coming in", () => {
    expect(computeFee("receita", 500, 3.5)).toBe(17.5);
    expect(computeFee("sinal", 200, 2)).toBe(4);
  });
  it("rounds to cents", () => {
    expect(computeFee("receita", 99.99, 3.33)).toBe(3.33);
  });
  it("never charges a fee on an outflow or refund", () => {
    expect(computeFee("despesa", 500, 3.5)).toBe(0);
  });
  it("is zero with no fee configured or a non-positive value", () => {
    expect(computeFee("receita", 500, 0)).toBe(0);
    expect(computeFee("receita", 500, null)).toBe(0);
    expect(computeFee("receita", 0, 3.5)).toBe(0);
    expect(computeFee("receita", -10, 3.5)).toBe(0);
  });
});

describe("categories and income types", () => {
  it("defaults the category from the type", () => {
    expect(defaultCategory("receita")).toBe("Procedimento");
    expect(defaultCategory("sinal")).toBe("Sinal");
    expect(defaultCategory("despesa")).toBe("Estorno");
  });
  it("treats receita and sinal as money in", () => {
    expect(isIncomeType("receita")).toBe(true);
    expect(isIncomeType("sinal")).toBe(true);
    expect(isIncomeType("despesa")).toBe(false);
    expect(isIncomeType(undefined)).toBe(false);
  });
});

describe("buildPaymentRow", () => {
  it("builds the row with the fee and the method reference", () => {
    const r = buildPaymentRow(base);
    expect(r.error).toBeUndefined();
    expect(r.row).toEqual({
      clinic_id: "clinic-1",
      patient_id: "patient-1",
      date: "2026-09-28",
      description: "Sessão de Botox",
      category: "Procedimento",
      method: "credito",
      payment_method_config_id: "m-c3",
      fee_amount: 17.5,
      type: "receita",
      value: 500,
      status: "paid",
    });
  });

  it("never includes a `source` column (financial_transactions has none)", () => {
    expect(buildPaymentRow(base).row).not.toHaveProperty("source");
  });

  it("zero fee for a free method", () => {
    expect(buildPaymentRow({ ...base, method: pix }).row?.fee_amount).toBe(0);
  });

  it("falls back to method 'outro' when no method is configured", () => {
    const r = buildPaymentRow({ ...base, method: null });
    expect(r.row).toMatchObject({ method: "outro", payment_method_config_id: null, fee_amount: 0 });
  });

  it("stores a refund with no fee", () => {
    const r = buildPaymentRow({ ...base, type: "despesa", category: "" });
    expect(r.row).toMatchObject({ type: "despesa", fee_amount: 0, category: "Estorno" });
  });

  it("trims the description", () => {
    expect(buildPaymentRow({ ...base, description: "  Retorno  " }).row?.description).toBe("Retorno");
  });

  it("rejects an empty description, a bad value and a bad date", () => {
    expect(buildPaymentRow({ ...base, description: "   " }).error).toMatch(/descrição/);
    expect(buildPaymentRow({ ...base, valueText: "0" }).error).toMatch(/valor/);
    expect(buildPaymentRow({ ...base, valueText: "abc" }).error).toMatch(/valor/);
    expect(buildPaymentRow({ ...base, valueText: "-5" }).error).toMatch(/valor/);
    expect(buildPaymentRow({ ...base, date: "" }).error).toMatch(/data/);
    expect(buildPaymentRow({ ...base, date: "2026-13-45" }).error).toMatch(/data/);
  });
});
