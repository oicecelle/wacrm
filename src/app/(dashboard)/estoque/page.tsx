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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

type Tab = "products" | "movements";

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

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [prodRes, movRes] = await Promise.all([
        supabase.from("stock_products").select("*").eq("clinic_id", accountId).order("name"),
        supabase
          .from("stock_movements")
          .select("*, stock_products(name)")
          .eq("clinic_id", accountId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (movRes.error) throw movRes.error;

      setProducts(prodRes.data || []);
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
        min_quantity: parseInt(pMinQuantity, 10) || 0,
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
    setIsMovementModalOpen(true);
  }

  async function handleSaveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !mProductId) {
      toast.error("Selecione um produto.");
      return;
    }
    const qty = parseInt(mQuantity, 10);
    if (!qty) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setSaving(true);
    try {
      const product = products.find((p) => p.id === mProductId);
      if (!product) throw new Error("Produto não encontrado.");

      // "ajuste" sets the stock straight to the typed quantity (a
      // correction), while entrada/saída are deltas on top of what's
      // already there — same convention a physical count-and-fix
      // session would use.
      let newQuantity: number;
      const movementQuantity = Math.abs(qty);
      if (mType === "entrada") newQuantity = product.current_quantity + movementQuantity;
      else if (mType === "saida") newQuantity = Math.max(0, product.current_quantity - movementQuantity);
      else newQuantity = movementQuantity;

      const { error: movErr } = await supabase.from("stock_movements").insert({
        clinic_id: accountId,
        product_id: mProductId,
        type: mType,
        quantity: movementQuantity,
        reason: mReason.trim() || null,
      });
      if (movErr) throw movErr;

      const { error: updErr } = await supabase
        .from("stock_products")
        .update({ current_quantity: newQuantity })
        .eq("id", mProductId);
      if (updErr) throw updErr;

      toast.success("Movimentação registrada!");
      setIsMovementModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar movimentação.");
    } finally {
      setSaving(false);
    }
  }

  const lowStockCount = products.filter((p) => p.is_active && p.current_quantity <= p.min_quantity).length;
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-lg font-black text-foreground">{products.filter((p) => p.is_active).length}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Produtos ativos</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${lowStockCount > 0 ? "border-red-300 bg-red-50" : "border-border bg-card"}`}>
          <p className={`text-lg font-black ${lowStockCount > 0 ? "text-red-600" : "text-foreground"}`}>{lowStockCount}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Abaixo do mínimo</p>
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
      ) : (
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
                  <Input type="number" value={pMinQuantity} onChange={(e) => setPMinQuantity(e.target.value)} disabled={saving} className="mt-1" />
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
                <Input type="number" min={0} value={mQuantity} onChange={(e) => setMQuantity(e.target.value)} disabled={saving} className="mt-1" />
              </div>
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
