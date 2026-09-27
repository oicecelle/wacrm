"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { X, Plus, Trash2, Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaleItemDraft {
  item_type: "procedure" | "product";
  procedure_id?: string;
  stock_product_id?: string;
  professional_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

interface CloseSaleModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  appointmentId?: string | null;
  patientId: string;
  patientName: string;
  /** Pre-fills the first line item from the appointment being closed. */
  initialProcedureId?: string | null;
  initialProfessionalId?: string | null;
}

/**
 * "Fechar Compra" — the link between Agenda, Financeiro, Serviços
 * and Estoque (plan item 4). Starts from an appointment's own
 * procedure (pre-filled as the first line), lets the person add
 * more procedures or stock products that weren't in the original
 * booking, pick a payment method, and on confirm:
 *   1. records the financial transaction (with the real fee from
 *      the chosen payment method)
 *   2. deducts stock for every procedure sold (via
 *      procedure_stock_items) and every product sold directly
 *   3. records the real commission owed per professional per item
 *      (via procedure_commissions) — no more the flat 15% estimate
 */
export function CloseSaleModal({
  open,
  onClose,
  onSaved,
  appointmentId,
  patientId,
  patientName,
  initialProcedureId,
  initialProfessionalId,
}: CloseSaleModalProps) {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [procedures, setProcedures] = useState<{ id: string; name: string; valor: number; price: number }[]>([]);
  const [stockProducts, setStockProducts] = useState<{ id: string; name: string; sale_price: number | null; current_quantity: number }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string; fee_percent: number }[]>([]);
  const [items, setItems] = useState<SaleItemDraft[]>([]);
  const [paymentMethodConfigId, setPaymentMethodConfigId] = useState("");

  useEffect(() => {
    if (!open || !accountId) return;
    (async () => {
      setLoading(true);
      const [procRes, stockRes, pmRes] = await Promise.all([
        supabase.from("procedures").select("id, name, valor, price").eq("clinic_id", accountId).eq("is_active", true).order("name"),
        supabase.from("stock_products").select("id, name, sale_price, current_quantity").eq("clinic_id", accountId).eq("is_active", true).order("name"),
        supabase.from("payment_method_configs").select("id, name, fee_percent").eq("clinic_id", accountId).eq("is_active", true).order("sort_order"),
      ]);
      const procs = procRes.data || [];
      setProcedures(procs);
      setStockProducts(stockRes.data || []);
      setPaymentMethods(pmRes.data || []);
      if (pmRes.data?.[0]) setPaymentMethodConfigId(pmRes.data[0].id);

      // Pre-fill the first line from the appointment's own procedure.
      if (initialProcedureId) {
        const p = procs.find((x) => x.id === initialProcedureId);
        if (p) {
          setItems([{
            item_type: "procedure",
            procedure_id: p.id,
            professional_id: initialProfessionalId || null,
            description: p.name,
            quantity: 1,
            unit_price: p.valor || p.price || 0,
          }]);
        }
      } else {
        setItems([]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId, initialProcedureId, initialProfessionalId]);

  function addProcedureItem() {
    setItems((prev) => [...prev, { item_type: "procedure", description: "", quantity: 1, unit_price: 0, professional_id: initialProfessionalId || null }]);
  }
  function addProductItem() {
    setItems((prev) => [...prev, { item_type: "product", description: "", quantity: 1, unit_price: 0 }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, patch: Partial<SaleItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function selectProcedureForItem(idx: number, procedureId: string) {
    const p = procedures.find((x) => x.id === procedureId);
    updateItem(idx, { procedure_id: procedureId, description: p?.name || "", unit_price: p?.valor || p?.price || 0 });
  }
  function selectProductForItem(idx: number, productId: string) {
    const p = stockProducts.find((x) => x.id === productId);
    updateItem(idx, { stock_product_id: productId, description: p?.name || "", unit_price: p?.sale_price || 0 });
  }

  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const selectedPaymentMethod = paymentMethods.find((pm) => pm.id === paymentMethodConfigId);
  const feeAmount = selectedPaymentMethod ? Math.round(subtotal * (selectedPaymentMethod.fee_percent / 100) * 100) / 100 : 0;
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function handleConfirm() {
    if (!accountId) return;
    if (items.length === 0) {
      toast.error("Adicione ao menos um item.");
      return;
    }
    if (items.some((it) => !it.description.trim() || it.unit_price < 0)) {
      toast.error("Preencha todos os itens corretamente.");
      return;
    }
    setSaving(true);
    try {
      // 1. Financial transaction — value is what the PATIENT pays
      // (subtotal); fee_amount is recorded separately as the
      // clinic's own cost, same convention as the rest of Financeiro
      // (it's subtracted from gross in the report, never added to
      // the patient's charge).
      const { data: transaction, error: txErr } = await supabase
        .from("financial_transactions")
        .insert({
          clinic_id: accountId,
          patient_id: patientId,
          date: new Date().toISOString().slice(0, 10),
          description: `Venda${appointmentId ? " — atendimento" : ""} — ${patientName}`,
          category: "Procedimento",
          method: selectedPaymentMethod?.name || "outro",
          payment_method_config_id: paymentMethodConfigId || null,
          fee_amount: feeAmount,
          type: "receita",
          value: subtotal,
          status: "paid",
        })
        .select("id")
        .single();
      if (txErr) throw txErr;

      // 2. The sale itself.
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          clinic_id: accountId,
          appointment_id: appointmentId || null,
          patient_id: patientId,
          payment_method_config_id: paymentMethodConfigId || null,
          subtotal,
          fee_amount: feeAmount,
          total: subtotal,
          financial_transaction_id: transaction.id,
        })
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      // 3. Each line item.
      const { data: insertedItems, error: itemsErr } = await supabase
        .from("sale_items")
        .insert(
          items.map((it) => ({
            sale_id: sale.id,
            item_type: it.item_type,
            procedure_id: it.procedure_id || null,
            stock_product_id: it.stock_product_id || null,
            professional_id: it.professional_id || null,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.quantity * it.unit_price,
          })),
        )
        .select("id, procedure_id, stock_product_id, professional_id, quantity, total_price");
      if (itemsErr) throw itemsErr;

      // 4. Stock deduction — procedures consume whatever
      // procedure_stock_items defines per unit sold; products sold
      // directly are deducted 1:1 by the quantity sold.
      const deductions = new Map<string, number>(); // stock_product_id -> qty to subtract
      const procedureIds = [...new Set(items.filter((it) => it.procedure_id).map((it) => it.procedure_id!))];
      let procedureStockLinks: { procedure_id: string; stock_product_id: string; quantity_used: number }[] = [];
      if (procedureIds.length > 0) {
        const { data } = await supabase
          .from("procedure_stock_items")
          .select("procedure_id, stock_product_id, quantity_used")
          .in("procedure_id", procedureIds);
        procedureStockLinks = data || [];
      }
      for (const it of items) {
        if (it.item_type === "procedure" && it.procedure_id) {
          for (const link of procedureStockLinks.filter((l) => l.procedure_id === it.procedure_id)) {
            deductions.set(link.stock_product_id, (deductions.get(link.stock_product_id) || 0) + link.quantity_used * it.quantity);
          }
        } else if (it.item_type === "product" && it.stock_product_id) {
          deductions.set(it.stock_product_id, (deductions.get(it.stock_product_id) || 0) + it.quantity);
        }
      }
      for (const [productId, qty] of deductions.entries()) {
        const product = stockProducts.find((p) => p.id === productId);
        if (!product) continue;
        const newQuantity = Math.max(0, product.current_quantity - qty);
        await supabase.from("stock_movements").insert({
          clinic_id: accountId,
          product_id: productId,
          type: "saida",
          quantity: qty,
          reason: `Venda #${sale.id.slice(0, 8)} — ${patientName}`,
        });
        await supabase.from("stock_products").update({ current_quantity: newQuantity }).eq("id", productId);
      }

      // 5. Commission per professional per procedure item sold.
      if (procedureIds.length > 0) {
        const { data: commissionConfigs } = await supabase
          .from("procedure_commissions")
          .select("procedure_id, clinic_user_id, commission_type, commission_value")
          .in("procedure_id", procedureIds)
          .eq("is_active", true);

        const commissionRows: {
          clinic_id: string; sale_id: string; sale_item_id: string; professional_id: string;
          procedure_id: string; commission_type: string; commission_value: number; amount: number;
        }[] = [];
        for (const insertedItem of insertedItems || []) {
          if (!insertedItem.procedure_id || !insertedItem.professional_id) continue;
          const config = (commissionConfigs || []).find(
            (c) => c.procedure_id === insertedItem.procedure_id && c.clinic_user_id === insertedItem.professional_id,
          );
          if (!config) continue;
          const amount = config.commission_type === "percentage"
            ? Math.round(insertedItem.total_price * (config.commission_value / 100) * 100) / 100
            : config.commission_value * insertedItem.quantity;
          commissionRows.push({
            clinic_id: accountId,
            sale_id: sale.id,
            sale_item_id: insertedItem.id,
            professional_id: insertedItem.professional_id,
            procedure_id: insertedItem.procedure_id,
            commission_type: config.commission_type,
            commission_value: config.commission_value,
            amount,
          });
        }
        if (commissionRows.length > 0) {
          await supabase.from("commission_records").insert(commissionRows);
        }
      }

      // 6. If this closed an existing appointment, mark it attended.
      if (appointmentId) {
        await supabase.from("appointments").update({ status: "attended" }).eq("id", appointmentId);
      }

      toast.success("Venda fechada com sucesso!");
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error closing sale:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao fechar a venda.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-foreground">
            <ShoppingBag className="h-5 w-5 text-primary" /> Fechar Compra
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Paciente: <span className="font-semibold text-foreground">{patientName}</span></p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-card/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      {it.item_type === "procedure" ? "Procedimento" : "Produto"}
                    </span>
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {it.item_type === "procedure" ? (
                    <select
                      value={it.procedure_id || ""}
                      onChange={(e) => selectProcedureForItem(idx, e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Selecione o procedimento...</option>
                      {procedures.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={it.stock_product_id || ""}
                      onChange={(e) => selectProductForItem(idx, e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Selecione o produto...</option>
                      {stockProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} (estoque: {p.current_quantity})</option>
                      ))}
                    </select>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-muted-foreground">Qtd.</Label>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-muted-foreground">Valor unit. (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })}
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={addProcedureItem}
                className="flex-1 rounded-lg border border-dashed border-border py-1.5 text-xs font-semibold text-muted-foreground hover:bg-neutral-50"
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" /> Procedimento
              </button>
              <button
                type="button"
                onClick={addProductItem}
                className="flex-1 rounded-lg border border-dashed border-border py-1.5 text-xs font-semibold text-muted-foreground hover:bg-neutral-50"
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" /> Produto
              </button>
            </div>

            <div className="mt-4 space-y-1">
              <Label className="text-xs font-bold">Forma de pagamento</Label>
              <select
                value={paymentMethodConfigId}
                onChange={(e) => setPaymentMethodConfigId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}{pm.fee_percent > 0 ? ` (${pm.fee_percent}% taxa)` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {feeAmount > 0 && (
                <div className="flex justify-between text-[11px] text-amber-600">
                  <span>Taxa da forma de pagamento (custo interno)</span><span>-{fmt(feeAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-black text-foreground">
                <span>Total cobrado do paciente</span><span>{fmt(subtotal)}</span>
              </div>
            </div>

            <Button onClick={handleConfirm} disabled={saving || items.length === 0} className="mt-5 w-full gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar e Fechar Venda
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
