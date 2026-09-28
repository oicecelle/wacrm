import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single place every stock deduction/entry goes through — the Estoque
 * screen's manual movements, Fechar Compra, and Prontuário's "Produtos
 * Utilizados" all call these, so batch/expiry handling can't drift
 * between them.
 *
 * Deduction is FIFO by expiry: the batch that expires soonest is used
 * first (batches with no expiry date go last), which is the standard
 * way to avoid stock going bad while a later-expiring lot sits
 * untouched. Each batch consumed gets its own stock_movements row
 * (with batch_id) so the history shows exactly which lot was used.
 */

export interface DeductStockInput {
  clinicId: string;
  productId: string;
  quantity: number;
  reason: string;
  createdBy?: string | null;
  appointmentId?: string | null;
}

export async function deductStock(supabase: SupabaseClient, input: DeductStockInput): Promise<void> {
  const { clinicId, productId, quantity, reason, createdBy, appointmentId } = input;
  if (quantity <= 0) return;

  const { data: product, error: prodErr } = await supabase
    .from("stock_products")
    .select("current_quantity")
    .eq("id", productId)
    .single();
  if (prodErr || !product) throw prodErr ?? new Error("Produto não encontrado.");

  const { data: batches } = await supabase
    .from("stock_batches")
    .select("id, quantity, expiry_date")
    .eq("product_id", productId)
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  let remaining = quantity;
  for (const batch of batches || []) {
    if (remaining <= 0) break;
    const take = Math.min(Number(batch.quantity), remaining);
    const { error: batchErr } = await supabase
      .from("stock_batches")
      .update({ quantity: Number(batch.quantity) - take })
      .eq("id", batch.id);
    if (batchErr) throw batchErr;

    const { error: movErr } = await supabase.from("stock_movements").insert({
      clinic_id: clinicId,
      product_id: productId,
      batch_id: batch.id,
      type: "saida",
      quantity: take,
      reason,
      appointment_id: appointmentId ?? null,
      created_by: createdBy ?? null,
    });
    if (movErr) throw movErr;
    remaining -= take;
  }

  // Whatever no batch covered (product with no lots registered, or
  // more used than the lots hold) still leaves a movement — the
  // history has to add up to the real quantity used.
  if (remaining > 0) {
    const { error: movErr } = await supabase.from("stock_movements").insert({
      clinic_id: clinicId,
      product_id: productId,
      type: "saida",
      quantity: remaining,
      reason,
      appointment_id: appointmentId ?? null,
      created_by: createdBy ?? null,
    });
    if (movErr) throw movErr;
  }

  const newQuantity = Math.max(0, Number(product.current_quantity) - quantity);
  const { error: updErr } = await supabase
    .from("stock_products")
    .update({ current_quantity: newQuantity })
    .eq("id", productId);
  if (updErr) throw updErr;
}

export interface AddStockEntryInput {
  clinicId: string;
  productId: string;
  quantity: number;
  reason?: string | null;
  createdBy?: string | null;
  /** Optional lot info — when an expiry date or lot number is given,
   *  a stock_batches row is created and linked to the movement. */
  batchNumber?: string | null;
  expiryDate?: string | null; // YYYY-MM-DD
  manufactureDate?: string | null;
  costPrice?: number | null;
}

export async function addStockEntry(supabase: SupabaseClient, input: AddStockEntryInput): Promise<void> {
  const { clinicId, productId, quantity, reason, createdBy, batchNumber, expiryDate, manufactureDate, costPrice } = input;
  if (quantity <= 0) return;

  const { data: product, error: prodErr } = await supabase
    .from("stock_products")
    .select("current_quantity")
    .eq("id", productId)
    .single();
  if (prodErr || !product) throw prodErr ?? new Error("Produto não encontrado.");

  let batchId: string | null = null;
  if (expiryDate || batchNumber) {
    const { data: batch, error: batchErr } = await supabase
      .from("stock_batches")
      .insert({
        product_id: productId,
        clinic_id: clinicId,
        batch_number: batchNumber || null,
        expiry_date: expiryDate || null,
        manufacture_date: manufactureDate || null,
        quantity,
        cost_price: costPrice ?? null,
      })
      .select("id")
      .single();
    if (batchErr) throw batchErr;
    batchId = batch.id;
  }

  const { error: movErr } = await supabase.from("stock_movements").insert({
    clinic_id: clinicId,
    product_id: productId,
    batch_id: batchId,
    type: "entrada",
    quantity,
    reason: reason ?? null,
    created_by: createdBy ?? null,
  });
  if (movErr) throw movErr;

  const { error: updErr } = await supabase
    .from("stock_products")
    .update({ current_quantity: Number(product.current_quantity) + quantity })
    .eq("id", productId);
  if (updErr) throw updErr;
}
