"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsPanelHead } from "./settings-panel-head";

interface PaymentMethodConfig {
  id: string;
  name: string;
  method_type: string;
  installments: number;
  fee_percent: number;
  is_active: boolean;
  sort_order: number;
}

const METHOD_TYPE_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outro: "Outro",
};

/**
 * Configurable payment methods + fees (issue: item 3 of the
 * Serviços/Pagamento/Estoque plan). Before this, the "registrar
 * pagamento" form in Financeiro had a fixed list (pix/credito/
 * debito/dinheiro/transferencia) with no fee attached to any of
 * them — a clinic paying, say, 3.5% on credit card installments had
 * no way to see that reflected in the financial report's net
 * revenue. Every existing clinic was seeded with the same 5 methods
 * at 0% (migration 060), so nothing changes here until someone
 * actually sets a real fee.
 */
export function PaymentMethodsPanel() {
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();

  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodConfig | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("credito");
  const [newInstallments, setNewInstallments] = useState(1);
  const [newFee, setNewFee] = useState("0");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    loadMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function loadMethods() {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_method_configs")
      .select("*")
      .eq("clinic_id", accountId)
      .order("sort_order");
    if (error) {
      toast.error("Erro ao carregar formas de pagamento.");
    } else {
      setMethods(data || []);
    }
    setLoading(false);
  }

  async function updateField(id: string, patch: Partial<PaymentMethodConfig>) {
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setSavingId(id);
    const { error } = await supabase.from("payment_method_configs").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao salvar — tente de novo.");
      loadMethods(); // revert to the real saved state
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    setCreating(true);
    try {
      const feeValue = Number(newFee.replace(",", "."));
      const { error } = await supabase.from("payment_method_configs").insert({
        clinic_id: accountId,
        name: newName.trim(),
        method_type: newType,
        installments: newInstallments,
        fee_percent: Number.isFinite(feeValue) ? feeValue : 0,
        sort_order: methods.length,
      });
      if (error) throw error;
      toast.success("Forma de pagamento criada.");
      setNewName("");
      setNewType("credito");
      setNewInstallments(1);
      setNewFee("0");
      loadMethods();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("payment_method_configs").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Não foi possível excluir — pode já estar em uso em algum pagamento registrado.");
    } else {
      toast.success("Forma de pagamento removida.");
      setMethods((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Formas de Pagamento"
        description="Configure as formas de pagamento aceitas e a taxa de cada uma. As taxas são descontadas automaticamente no relatório financeiro (receita líquida)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Formas cadastradas</CardTitle>
          <CardDescription>
            A taxa é aplicada sobre o valor recebido — por exemplo, 3,5% numa venda de R$500
            representa R$17,50 de taxa, descontada da receita líquida.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : methods.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Nenhuma forma de pagamento cadastrada ainda.</p>
          ) : (
            methods.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/50 p-3"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                <Input
                  value={m.name}
                  disabled={!canEditSettings}
                  onChange={(e) => setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => updateField(m.id, { name: e.target.value })}
                  className="h-8 flex-1 min-w-[140px] text-xs"
                />
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {METHOD_TYPE_LABELS[m.method_type] || m.method_type}
                </span>
                {m.installments > 1 && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {m.installments}x
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.fee_percent}
                    disabled={!canEditSettings}
                    onChange={(e) => setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, fee_percent: Number(e.target.value) } : x)))}
                    onBlur={(e) => updateField(m.id, { fee_percent: Number(e.target.value) || 0 })}
                    className="h-8 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">% taxa</span>
                </div>
                {savingId === m.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={m.is_active}
                    disabled={!canEditSettings}
                    onChange={(e) => updateField(m.id, { is_active: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Ativa
                </label>
                {canEditSettings && (
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="shrink-0 text-red-400 hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canEditSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Adicionar forma de pagamento</CardTitle>
            <CardDescription>
              Útil pra separar parcelamento por número de parcelas — ex: &quot;Crédito 3x&quot; com uma
              taxa, &quot;Crédito 6x&quot; com outra, já que processadoras costumam cobrar mais quanto
              mais parcelas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold">Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Crédito 3x"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Tipo</Label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(METHOD_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  value={newInstallments}
                  onChange={(e) => setNewInstallments(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Taxa (%)</Label>
                <Input
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="gap-1.5">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir forma de pagamento"
        description={`Excluir "${deleteTarget?.name}"? Pagamentos já registrados com ela mantêm o histórico, mas ela deixa de aparecer pra novos registros.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
