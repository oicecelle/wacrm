"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Boxes,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  SlidersHorizontal,
  Package,
  X,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { addStockEntry, deductStock } from "@/lib/stock/stock-operations";

/* ─── Types ─────────────────────────────────────────────── */
interface StockProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  current_quantity: number;
  min_quantity: number;
  cost_price: number | null;
  sale_price: number | null;
  is_active: boolean;
}

interface StockMovement {
  id: string;
  product_id: string;
  type: "entrada" | "saida" | "ajuste";
  quantity: number;
  reason: string | null;
  created_at: string;
}

type Tab = "products" | "movements" | "expiry";

interface StockBatch {
  id: string;
  product_id: string;
  batch_number: string | null;
  manufacture_date: string | null;
  expiry_date: string | null;
  quantity: number;
  product_name?: string;
  product_unit?: string | null;
}

/** How close a batch is to expiring, relative to today. Thresholds
 *  (30 / 60 days) match the two warning levels shown on the page. */
type ExpiryStatus = "expired" | "soon" | "warning" | "ok" | "none";

function getExpiryStatus(expiryDate: string | null): { status: ExpiryStatus; days: number | null } {
  if (!expiryDate) return { status: "none", days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { status: "expired", days };
  if (days <= 30) return { status: "soon", days };
  if (days <= 60) return { status: "warning", days };
  return { status: "ok", days };
}

const EXPIRY_STYLES: Record<ExpiryStatus, { label: (d: number | null) => string; cls: string }> = {
  expired: { label: (d) => `Vencido há ${Math.abs(d ?? 0)} dia(s)`, cls: "text-red-700 bg-red-500/10 border-red-500/30" },
  soon: { label: (d) => (d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`), cls: "text-orange-700 bg-orange-500/10 border-orange-500/30" },
  warning: { label: (d) => `Vence em ${d} dias`, cls: "text-amber-700 bg-amber-500/10 border-amber-500/30" },
  ok: { label: (d) => `Vence em ${d} dias`, cls: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30" },
  none: { label: () => "Sem validade", cls: "text-muted-foreground bg-neutral-100 border-border" },
};

const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: typeof ArrowUpCircle }> = {
  entrada: { label: "Entrada", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", icon: ArrowUpCircle },
  saida: { label: "Saída", color: "text-red-600 bg-red-500/10 border-red-500/20", icon: ArrowDownCircle },
  ajuste: { label: "Ajuste", color: "text-amber-600 bg-amber-500/10 border-amber-500/20", icon: SlidersHorizontal },
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-neutral-300"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export default function EstoquePage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [movements, setMovements] = useState<(StockMovement & { product_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ─── Product form state ─── */
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StockProduct | null>(null);
  const [pName, setPName] = useState("");
  const [pSku, setPSku] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [pBrand, setPBrand] = useState("");
  const [pUnit, setPUnit] = useState("un");
  const [pMinQuantity, setPMinQuantity] = useState("0");
  const [pCostPrice, setPCostPrice] = useState("");
  const [pSalePrice, setPSalePrice] = useState("");
  const [pActive, setPActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StockProduct | null>(null);

  /* ─── Movement form state ─── */
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [mProductId, setMProductId] = useState("");
  const [mType, setMType] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [mQuantity, setMQuantity] = useState("1");
  const [mReason, setMReason] = useState("");
  const [mExpiry, setMExpiry] = useState("");
  const [mBatchNumber, setMBatchNumber] = useState("");
  const [mManufacture, setMManufacture] = useState("");

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [prodRes, movRes, batchRes] = await Promise.all([
        supabase.from("stock_products").select("*").eq("clinic_id", accountId).order("name"),
        supabase
          .from("stock_movements")
          .select("*, stock_products(name)")
          .eq("clinic_id", accountId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("stock_batches")
          .select("*, stock_products(name, unit)")
          .eq("clinic_id", accountId)
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true, nullsFirst: false }),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (movRes.error) throw movRes.error;
      if (batchRes.error) throw batchRes.error;

      setProducts(prodRes.data || []);
      setBatches(
        (batchRes.data || []).map((b: StockBatch & { stock_products?: { name: string; unit: string | null } | { name: string; unit: string | null }[] }) => {
          const sp = Array.isArray(b.stock_products) ? b.stock_products[0] : b.stock_products;
          return { ...b, product_name: sp?.name, product_unit: sp?.unit };
        }),
      );
      setMovements(
        (movRes.data || []).map((m: StockMovement & { stock_products?: { name: string } | { name: string }[] }) => ({
          ...m,
          product_name: Array.isArray(m.stock_products) ? m.stock_products[0]?.name : m.stock_products?.name,
        })),
      );
    } catch (err) {
      console.error("Error loading stock data:", err);
      toast.error("Erro ao carregar o estoque.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetProductForm() {
    setEditingProduct(null);
    setPName(""); setPSku(""); setPCategory(""); setPBrand("");
    setPUnit("un"); setPMinQuantity("0"); setPCostPrice(""); setPSalePrice("");
    setPActive(true);
  }

  function openEditProduct(p: StockProduct) {
    setEditingProduct(p);
    setPName(p.name);
    setPSku(p.sku || "");
    setPCategory(p.category || "");
    setPBrand(p.brand || "");
    setPUnit(p.unit || "un");
    setPMinQuantity(String(p.min_quantity ?? 0));
    setPCostPrice(p.cost_price != null ? String(p.cost_price) : "");
    setPSalePrice(p.sale_price != null ? String(p.sale_price) : "");
    setPActive(p.is_active !== false);
    setIsProductModalOpen(true);
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !pName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        clinic_id: accountId,
        name: pName.trim(),
        sku: pSku.trim() || null,
        category: pCategory.trim() || null,
        brand: pBrand.trim() || null,
        unit: pUnit.trim() || "un",
        min_quantity: parseFloat(pMinQuantity.replace(",", ".")) || 0,
        cost_price: pCostPrice ? parseFloat(pCostPrice.replace(",", ".")) : null,
        sale_price: pSalePrice ? parseFloat(pSalePrice.replace(",", ".")) : null,
        is_active: pActive,
      };
      if (editingProduct) {
        const { error } = await supabase.from("stock_products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase.from("stock_products").insert({ ...payload, current_quantity: 0 });
        if (error) throw error;
        toast.success("Produto cadastrado! Registre uma entrada pra dar quantidade a ele.");
      }
      setIsProductModalOpen(false);
      resetProductForm();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("stock_products").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Não foi possível excluir — pode ter movimentação ou vínculo com algum procedimento.");
    } else {
      toast.success("Produto excluído.");
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  }

  function openMovementModal(productId?: string) {
    setMProductId(productId || "");
    setMType("entrada");
    setMQuantity("1");
    setMReason("");
    setMExpiry("");
    setMBatchNumber("");
    setMManufacture("");
    setIsMovementModalOpen(true);
  }

  async function handleSaveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !mProductId) {
      toast.error("Selecione um produto.");
      return;
    }
    const qty = parseFloat(mQuantity.replace(",", "."));
    if (!qty || qty < 0 || (mType !== "ajuste" && qty <= 0)) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setSaving(true);
    try {
      const product = products.find((p) => p.id === mProductId);
      if (!product) throw new Error("Produto não encontrado.");

      if (mType === "entrada") {
        // Entry: optionally records the lot + expiry so it shows up in
        // the Validades tab and feeds the expiring-soon warnings.
        await addStockEntry(supabase, {
          clinicId: accountId,
          productId: mProductId,
          quantity: qty,
          reason: mReason.trim() || null,
          batchNumber: mBatchNumber.trim() || null,
          expiryDate: mExpiry || null,
          manufactureDate: mManufacture || null,
          costPrice: product.cost_price,
        });
      } else if (mType === "saida") {
        // Exit: FIFO by expiry — the lot that expires soonest goes first.
        await deductStock(supabase, {
          clinicId: accountId,
          productId: mProductId,
          quantity: qty,
          reason: mReason.trim() || "Saída manual",
        });
      } else {
        // Adjustment sets the stock straight to the typed quantity (a
        // physical-count correction). Lots aren't touched — a count
        // fix says how much is there, not which lot it came from.
        const { error: movErr } = await supabase.from("stock_movements").insert({
          clinic_id: accountId,
          product_id: mProductId,
          type: "ajuste",
          quantity: qty,
          reason: mReason.trim() || null,
        });
        if (movErr) throw movErr;
        const { error: updErr } = await supabase
          .from("stock_products")
          .update({ current_quantity: qty })
          .eq("id", mProductId);
        if (updErr) throw updErr;
      }

      toast.success("Movimentação registrada!");
      setIsMovementModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar movimentação.");
    } finally {
      setSaving(false);
    }
  }

  const lowStockProducts = products.filter((p) => p.is_active && p.current_quantity <= p.min_quantity);
  const lowStockCount = lowStockProducts.length;
  const batchesWithStatus = batches.map((b) => ({ ...b, ...getExpiryStatus(b.expiry_date) }));
  const expiredBatches = batchesWithStatus.filter((b) => b.status === "expired");
  const expiringSoonBatches = batchesWithStatus.filter((b) => b.status === "soon");
  const hasAlerts = lowStockCount > 0 || expiredBatches.length > 0 || expiringSoonBatches.length > 0;
  const totalInvestedValue = products.reduce((sum, p) => sum + p.current_quantity * (p.cost_price || 0), 0);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
            <Boxes className="h-6 w-6 text-primary" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground">Produtos, insumos e o histórico de movimentações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openMovementModal()} className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" /> Registrar Movimentação
          </Button>
          <Button onClick={() => { resetProductForm(); setIsProductModalOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        </div>
      </div>

      {/* Alerts: expired / expiring / running out */}
      {hasAlerts && (
        <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Atenção no estoque
          </p>
          <ul className="space-y-1 text-xs text-amber-900">
            {expiredBatches.length > 0 && (
              <li>
                <button onClick={() => setActiveTab("expiry")} className="text-left hover:underline">
                  <strong className="text-red-700">{expiredBatches.length} lote(s) vencido(s)</strong> —{" "}
                  {expiredBatches.slice(0, 3).map((b) => b.product_name).join(", ")}
                  {expiredBatches.length > 3 ? "…" : ""}
                </button>
              </li>
            )}
            {expiringSoonBatches.length > 0 && (
              <li>
                <button onClick={() => setActiveTab("expiry")} className="text-left hover:underline">
                  <strong>{expiringSoonBatches.length} lote(s) vencendo em até 30 dias</strong> —{" "}
                  {expiringSoonBatches.slice(0, 3).map((b) => b.product_name).join(", ")}
                  {expiringSoonBatches.length > 3 ? "…" : ""}
                </button>
              </li>
            )}
            {lowStockCount > 0 && (
              <li>
                <button onClick={() => setActiveTab("products")} className="text-left hover:underline">
                  <strong>{lowStockCount} produto(s) acabando ou abaixo do mínimo</strong> —{" "}
                  {lowStockProducts.slice(0, 3).map((p) => p.name).join(", ")}
                  {lowStockCount > 3 ? "…" : ""}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-lg font-black text-foreground">{products.filter((p) => p.is_active).length}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Produtos ativos</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${lowStockCount > 0 ? "border-red-300 bg-red-50" : "border-border bg-card"}`}>
          <p className={`text-lg font-black ${lowStockCount > 0 ? "text-red-600" : "text-foreground"}`}>{lowStockCount}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Abaixo do mínimo</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${expiredBatches.length + expiringSoonBatches.length > 0 ? "border-orange-300 bg-orange-50" : "border-border bg-card"}`}>
          <p className={`text-lg font-black ${expiredBatches.length + expiringSoonBatches.length > 0 ? "text-orange-600" : "text-foreground"}`}>
            {expiredBatches.length + expiringSoonBatches.length}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">Vencidos ou vencendo (30 dias)</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-card p-4 shadow-xs sm:col-span-1">
          <p className="text-lg font-black text-foreground">{fmt(totalInvestedValue)}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Valor investido em estoque (custo)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === "products" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Produtos ({products.length})
        </button>
        <button
          onClick={() => setActiveTab("movements")}
          className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === "movements" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Histórico de Movimentações
        </button>
        <button
          onClick={() => setActiveTab("expiry")}
          className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === "expiry" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Validades ({batches.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === "products" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Qtd. Atual</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Custo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Venda</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => {
                const low = p.current_quantity <= p.min_quantity;
                return (
                  <tr key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="font-semibold text-foreground">{p.name}</p>
                          {p.sku && <p className="text-[10px] text-muted-foreground">SKU: {p.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 font-semibold ${low ? "text-red-600" : "text-foreground"}`}>
                        {low && <AlertTriangle className="h-3.5 w-3.5" />}
                        {p.current_quantity} {p.unit}
                      </span>
                      <p className="text-[10px] text-muted-foreground">mín: {p.min_quantity}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.cost_price ? fmt(p.cost_price) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sale_price ? fmt(p.sale_price) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openMovementModal(p.id)} title="Registrar movimentação" className="rounded-lg p-1.5 text-muted-foreground hover:bg-neutral-100">
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEditProduct(p)} title="Editar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-neutral-100">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} title="Excluir" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                    Nenhum produto cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === "movements" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Quantidade</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m) => {
                const meta = MOVEMENT_LABELS[m.type] || MOVEMENT_LABELS.ajuste;
                const Icon = meta.icon;
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{m.product_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{m.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.reason || "—"}</td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                    Nenhuma movimentação registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Lote</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Quantidade</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Validade</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batchesWithStatus.map((b) => {
                const style = EXPIRY_STYLES[b.status];
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold text-foreground">{b.product_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.batch_number || "—"}</td>
                    <td className="px-4 py-3 text-foreground">
                      {b.quantity} {b.product_unit || ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.expiry_date ? new Date(`${b.expiry_date}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.cls}`}>
                        <CalendarClock className="h-3 w-3" /> {style.label(b.days)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                    Nenhum lote com validade registrado. Ao registrar uma Entrada, informe a validade pra ela aparecer aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ PRODUCT MODAL ═══ */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveProduct}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-foreground">
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </h2>
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold">Nome *</Label>
                <Input required value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Ex: Toxina Botulínica 100u" disabled={saving} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">SKU</Label>
                  <Input value={pSku} onChange={(e) => setPSku(e.target.value)} disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Categoria</Label>
                  <Input value={pCategory} onChange={(e) => setPCategory(e.target.value)} placeholder="Ex: Toxinas" disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Marca</Label>
                  <Input value={pBrand} onChange={(e) => setPBrand(e.target.value)} disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Unidade</Label>
                  <Input value={pUnit} onChange={(e) => setPUnit(e.target.value)} placeholder="un, ml, cx..." disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Estoque mínimo</Label>
                  <Input type="number" step="0.001" value={pMinQuantity} onChange={(e) => setPMinQuantity(e.target.value)} disabled={saving} className="mt-1" />
                </div>
                <div />
                <div>
                  <Label className="text-xs font-bold">Preço de custo (R$)</Label>
                  <Input value={pCostPrice} onChange={(e) => setPCostPrice(e.target.value)} placeholder="0,00" disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Preço de venda (R$)</Label>
                  <Input value={pSalePrice} onChange={(e) => setPSalePrice(e.target.value)} placeholder="0,00" disabled={saving} className="mt-1" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-neutral-50 p-3">
                <div>
                  <p className="text-xs font-bold text-foreground">Produto Ativo</p>
                  <p className="text-[10px] text-muted-foreground">Inativos não aparecem pra vincular a procedimentos.</p>
                </div>
                <Toggle checked={pActive} onChange={() => setPActive(!pActive)} />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="mt-5 w-full gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar Produto
            </Button>
          </form>
        </div>
      )}

      {/* ═══ MOVEMENT MODAL ═══ */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveMovement}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-foreground">Registrar Movimentação</h2>
              <button type="button" onClick={() => setIsMovementModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold">Produto *</Label>
                <select
                  required
                  value={mProductId}
                  onChange={(e) => setMProductId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione...</option>
                  {products.filter((p) => p.is_active).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (atual: {p.current_quantity} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold">Tipo</Label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {(["entrada", "saida", "ajuste"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMType(t)}
                      className={`rounded-lg border py-1.5 text-xs font-bold transition-colors ${mType === t ? MOVEMENT_LABELS[t].color : "border-border text-muted-foreground"}`}
                    >
                      {MOVEMENT_LABELS[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold">
                  {mType === "ajuste" ? "Nova quantidade (corrigida)" : "Quantidade"}
                </Label>
                <Input type="number" min={0} step="0.001" value={mQuantity} onChange={(e) => setMQuantity(e.target.value)} disabled={saving} className="mt-1" />
              </div>
              {mType === "entrada" && (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-neutral-50 p-3">
                  <p className="col-span-2 text-[10px] font-semibold text-muted-foreground">
                    Lote e validade (opcional) — informe pra receber avisos de vencimento.
                  </p>
                  <div>
                    <Label className="text-xs font-bold">Validade</Label>
                    <Input type="date" value={mExpiry} onChange={(e) => setMExpiry(e.target.value)} disabled={saving} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Nº do lote</Label>
                    <Input value={mBatchNumber} onChange={(e) => setMBatchNumber(e.target.value)} disabled={saving} className="mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs font-bold">Data de fabricação</Label>
                    <Input type="date" value={mManufacture} onChange={(e) => setMManufacture(e.target.value)} disabled={saving} className="mt-1" />
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs font-bold">Motivo (opcional)</Label>
                <Input value={mReason} onChange={(e) => setMReason(e.target.value)} placeholder="Ex: Compra de reposição, perda por validade..." disabled={saving} className="mt-1" />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="mt-5 w-full gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar
            </Button>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir produto"
        description={`Excluir "${deleteTarget?.name}" do estoque? Isso não remove o histórico de movimentações já registrado.`}
        confirmLabel="Excluir"
        onConfirm={handleDeleteProduct}
      />
    </div>
  );
}
