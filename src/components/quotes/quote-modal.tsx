"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  XIcon,
  PlusIcon,
  Loader2Icon,
  SendIcon,
  DollarSignIcon,
  TagIcon,
  PackageIcon,
  ClipboardListIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  CopyIcon,
  ChevronDownIcon,
  FileTextIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ─── Types ──────────────────────────────────────────────── */
/** One line of a (possibly split) payment arrangement — e.g. "Sinal
 *  — Pix — R$200" plus "Restante em 3x — Cartão de crédito". Several
 *  lines together describe entrada/sinal/parcelamento/mixed methods
 *  on the same quote; a single line with no value is just "pay this
 *  way", the simple case. */
interface PaymentLine {
  label: string;
  method: string;
  value: string;
}

const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência"];

interface QuoteItem {
  item_type: "procedure" | "package";
  item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sessions?: number;
}

interface Procedure {
  id: string;
  name: string;
  valor: number;
  price: number;
}

interface Package {
  id: string;
  name: string;
  price: number;
  validity_days: number | null;
}

interface QuoteModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill contact when opened from Contatos/Agenda */
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  onQuoteCreated?: (quoteId: string) => void;
}

/* ─── Helpers ────────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const DEFAULT_TEMPLATE = `Olá, {{nome}}! 👋

Preparei um orçamento especial para você:

{{itens}}

💰 *Total: {{total}}*
{{condicao}}

📤 Enviado em: {{data_envio}}
Este orçamento é válido até {{validade}}.
Qualquer dúvida, estou à disposição! 😊`;

/* ─── Component ──────────────────────────────────────────── */
export function QuoteModal({
  open,
  onClose,
  contactId,
  contactName = "",
  contactPhone = "",
  onQuoteCreated,
}: QuoteModalProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState("0");
  const [specialCondition, setSpecialCondition] = useState("");
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"build" | "message">("build");
  const [loading, setLoading] = useState(true);

  /* ─── Resolve patient ID to contacts.id if needed ─── */
  useEffect(() => {
    if (!open || !accountId) return;

    const resolveContact = async () => {
      if (!contactId) return;
      try {
        // 1. Check if contact exists by ID in contacts
        const { data: existingById } = await supabase
          .from("contacts")
          .select("id")
          .eq("id", contactId)
          .maybeSingle();

        if (existingById) {
          setResolvedContactId(existingById.id);
          return;
        }

        // 2. If it does not exist, insert it into contacts with the same ID
        const cleanPhone = contactPhone ? contactPhone.replace(/\D/g, "") : "";
        const { error: insertErr } = await supabase
          .from("contacts")
          .insert({
            id: contactId,
            user_id: user?.id,
            account_id: accountId,
            name: contactName || "Paciente Sem Nome",
            phone: cleanPhone,
            contact_type: "client",
          });

        if (insertErr) {
          console.error("Error inserting matching contact for quote:", insertErr);
          // fallback to lookup by phone if constraint failed
          if (cleanPhone) {
            const { data: existingByPhone } = await supabase
              .from("contacts")
              .select("id")
              .eq("account_id", accountId)
              .eq("phone", cleanPhone)
              .maybeSingle();
            if (existingByPhone) {
              setResolvedContactId(existingByPhone.id);
              return;
            }
          }
          throw insertErr;
        }

        setResolvedContactId(contactId);
      } catch (err) {
        console.error("Error resolving contact for quote:", err);
      }
    };

    resolveContact();
  }, [open, contactId, contactPhone, contactName, accountId, user, supabase]);

  /* ─── Load procedures & packages ─── */
  const loadOptions = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [procRes, pkgRes] = await Promise.all([
        supabase.from("procedures").select("id, name, valor, price").eq("clinic_id", accountId).eq("ativo", true).order("name"),
        supabase.from("packages").select("id, name, price, validity_days").eq("account_id", accountId).eq("is_active", true).order("name"),
      ]);
      setProcedures(procRes.data || []);
      setPackages(pkgRes.data || []);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    if (open) {
      loadOptions();
      setItems([]);
      setDiscountValue("0");
      setSpecialCondition("");
      setPaymentLines([]);
      setExpiresAt("");
      setResolvedContactId(null);
      setStep("build");
    }
  }, [open, loadOptions]);

  /* ─── Calculations ───────────────────────────────────────── */
  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const discountNum = parseFloat(discountValue.replace(",", ".")) || 0;
  const discountAmount = discountType === "percent" ? (subtotal * discountNum) / 100 : discountNum;
  const total = Math.max(0, subtotal - discountAmount);

  /* ─── Item management ─────────────────────────────────────── */
  const addProcedure = (proc: Procedure) => {
    const existing = items.findIndex((i) => i.item_type === "procedure" && i.item_id === proc.id);
    if (existing >= 0) {
      const updated = [...items];
      updated[existing].quantity += 1;
      updated[existing].total_price = updated[existing].quantity * updated[existing].unit_price;
      setItems(updated);
    } else {
      const price = proc.valor || proc.price || 0;
      setItems((prev) => [...prev, {
        item_type: "procedure", item_id: proc.id, name: proc.name,
        quantity: 1, unit_price: price, total_price: price,
      }]);
    }
  };

  const addPackage = (pkg: Package) => {
    const existing = items.findIndex((i) => i.item_type === "package" && i.item_id === pkg.id);
    if (existing >= 0) return; // packages are unique
    setItems((prev) => [...prev, {
      item_type: "package", item_id: pkg.id, name: pkg.name,
      quantity: 1, unit_price: pkg.price, total_price: pkg.price,
    }]);
  };

  const updateItemQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    const updated = [...items];
    updated[idx].quantity = qty;
    updated[idx].total_price = qty * updated[idx].unit_price;
    setItems(updated);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ─── Payment plan (entrada, sinal, parcelas, formas mescladas) ─── */
  const addPaymentLine = () => {
    setPaymentLines((prev) => [...prev, { label: prev.length === 0 ? "À vista" : "", method: "Pix", value: "" }]);
  };

  const updatePaymentLine = (idx: number, patch: Partial<PaymentLine>) => {
    setPaymentLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removePaymentLine = (idx: number) => {
    setPaymentLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const paymentLinesTotal = paymentLines.reduce((s, l) => s + (parseFloat(l.value.replace(",", ".")) || 0), 0);

  /* ─── Generate WhatsApp message ───────────────────────────── */
  const buildMessage = () => {
    const itemsText = items.map((i) =>
      `• ${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""} — ${fmt(i.total_price)}`
    ).join("\n");

    const paymentText =
      paymentLines.length > 0
        ? paymentLines
            .filter((l) => l.label.trim() || l.method)
            .map((l) => {
              const val = parseFloat(l.value.replace(",", ".")) || 0;
              const label = l.label.trim() || l.method;
              return `   ◦ ${label}${l.method && l.label.trim() ? ` (${l.method})` : ""}${val > 0 ? ` — ${fmt(val)}` : ""}`;
            })
            .join("\n")
        : "";

    const condParts = [
      specialCondition ? `✅ *Condição especial:* ${specialCondition}` : "",
      paymentText ? `💳 *Forma de pagamento:*\n${paymentText}` : "",
    ].filter(Boolean);
    const condText = condParts.length > 0 ? `\n${condParts.join("\n")}` : "";

    // Defaults to 7 days out when no explicit validity was set — same
    // default the old hardcoded "válido por 7 dias" text implied,
    // just now reflected as a real date instead of a fixed phrase.
    const expiryDate = expiresAt
      ? new Date(expiresAt + "T12:00:00")
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const sentDate = new Date();

    let msg = DEFAULT_TEMPLATE
      .replace("{{nome}}", contactName || "cliente")
      .replace("{{itens}}", itemsText)
      .replace("{{total}}", fmt(total))
      .replace("{{condicao}}", condText)
      .replace("{{data_envio}}", sentDate.toLocaleDateString("pt-BR"))
      .replace("{{validade}}", expiryDate.toLocaleDateString("pt-BR"));

    if (discountAmount > 0) {
      msg = msg.replace("💰", `🎁 *Desconto:* -${fmt(discountAmount)}\n💰`);
    }

    setMessageText(msg);
    setStep("message");
  };

  /* ─── Save quote ──────────────────────────────────────────── */
  const saveQuote = async (status: "draft" | "sent") => {
    const targetContactId = resolvedContactId || contactId;
    if (!accountId || !targetContactId) return null;
    
    const { data, error } = await supabase.from("quotes").insert({
      account_id: accountId,
      contact_id: targetContactId,
      status,
      total_value: total,
      discount_value: discountAmount,
      discount_type: discountType,
      special_condition: specialCondition || null,
      payment_plan: paymentLines.filter((l) => l.label.trim() || l.method),
      message_text: messageText,
      expires_at: expiresAt || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }).select("id").single();

    if (error) throw error;

    // Insert items
    if (items.length > 0) {
      await supabase.from("quote_items").insert(
        items.map((i) => ({
          quote_id: data.id,
          item_type: i.item_type,
          item_id: i.item_id,
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
        }))
      );
    }

    return data.id;
  };

  const handleSendWhatsApp = async () => {
    if (!contactPhone) {
      toast.error("Este contato não tem WhatsApp cadastrado.");
      return;
    }
    setSending(true);
    try {
      // Saved as a draft first — only flipped to "sent" by the send
      // route itself, and only once the WhatsApp dispatch actually
      // succeeds. Marking it sent before confirming delivery would
      // misrepresent a failed send as a successful one.
      const quoteId = await saveQuote("draft");
      if (!quoteId) throw new Error("Falha ao salvar orçamento");

      const portalLink = `${window.location.origin}/portal/orcamento/${quoteId}`;
      const finalMessage = `${messageText}\n\n🔗 Visualize e aprove seu orçamento clicando aqui:\n${portalLink}`;

      const res = await fetch("/api/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quoteId, message_text: finalMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar pelo WhatsApp.");

      if (onQuoteCreated) onQuoteCreated(quoteId);

      toast.success(`Orçamento enviado para ${contactName} pelo WhatsApp!`);
      onClose();
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSending(false);
    }
  };

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Mensagem copiada!");
  };

  const handleSaveDraft = async () => {
    if (!contactId) return;
    setSaving(true);
    try {
      const quoteId = await saveQuote("draft");
      if (quoteId && onQuoteCreated) onQuoteCreated(quoteId);
      toast.success("Orçamento salvo como rascunho!");
      onClose();
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50 shrink-0">
          <div className="flex items-center gap-2">
            {step === "build" ? (
              <>
                <FileTextIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-black text-foreground">Novo Orçamento</h2>
                  {contactName && <p className="text-xs text-muted-foreground">para {contactName}</p>}
                </div>
              </>
            ) : (
              <>
                <MessageSquareIcon className="h-5 w-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-black text-foreground">Mensagem do Orçamento</h2>
                  <p className="text-xs text-muted-foreground">Revise antes de enviar</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              <span className={`h-2 w-6 rounded-full transition-colors ${step === "build" ? "bg-blue-600" : "bg-neutral-200"}`} />
              <span className={`h-2 w-6 rounded-full transition-colors ${step === "message" ? "bg-emerald-600" : "bg-neutral-200"}`} />
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-neutral-700">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : step === "build" ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 divide-x divide-neutral-100">
                {/* Left: Service selection */}
                <div className="p-4 space-y-4">
                  {/* Procedures */}
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <TagIcon className="h-3 w-3" /> Procedimentos
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {procedures.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addProcedure(p)}
                          className="w-full flex items-center justify-between text-xs rounded-lg px-3 py-2 hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200 transition-all text-left"
                        >
                          <span className="font-semibold truncate">{p.name}</span>
                          <span className="text-muted-foreground font-mono ml-2 shrink-0">{fmt(p.valor || p.price || 0)}</span>
                        </button>
                      ))}
                      {procedures.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum procedimento cadastrado.</p>
                      )}
                    </div>
                  </div>

                  {/* Packages */}
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <PackageIcon className="h-3 w-3" /> Pacotes
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {packages.map((pkg) => (
                        <button
                          key={pkg.id}
                          onClick={() => addPackage(pkg)}
                          className="w-full flex items-center justify-between text-xs rounded-lg px-3 py-2 hover:bg-violet-50 hover:text-violet-700 border border-transparent hover:border-violet-200 transition-all text-left"
                        >
                          <span className="font-semibold truncate">{pkg.name}</span>
                          <span className="text-muted-foreground font-mono ml-2 shrink-0">{fmt(pkg.price)}</span>
                        </button>
                      ))}
                      {packages.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum pacote cadastrado.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Cart */}
                <div className="p-4 space-y-4 flex flex-col">
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <ClipboardListIcon className="h-3 w-3" /> Itens Selecionados
                    </p>
                    <div className="space-y-2 min-h-16">
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-6">
                          Selecione procedimentos ou pacotes ao lado →
                        </p>
                      )}
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">{fmt(item.unit_price)} cada</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => updateItemQty(idx, item.quantity - 1)}
                              className="h-5 w-5 rounded bg-neutral-200 hover:bg-neutral-300 text-xs font-bold flex items-center justify-center"
                            >−</button>
                            <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                            <button
                              onClick={() => updateItemQty(idx, item.quantity + 1)}
                              className="h-5 w-5 rounded bg-neutral-200 hover:bg-neutral-300 text-xs font-bold flex items-center justify-center"
                            >+</button>
                          </div>
                          <span className="text-xs font-black text-blue-700 w-16 text-right shrink-0">{fmt(item.total_price)}</span>
                          <button onClick={() => removeItem(idx)} className="text-rose-400 hover:text-rose-600 shrink-0">
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">Desconto</p>
                    <div className="flex gap-2">
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
                        className="text-xs h-8 rounded-lg border border-border bg-card px-2"
                      >
                        <option value="fixed">R$ Fixo</option>
                        <option value="percent">% Percentual</option>
                      </select>
                      <Input
                        placeholder="0"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Condição especial (opcional)</Label>
                    <Input
                      placeholder="Ex: Parcelado em 3x sem juros"
                      value={specialCondition}
                      onChange={(e) => setSpecialCondition(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Payment plan — entrada, sinal, parcelas, formas mescladas */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Forma de pagamento (opcional)</Label>
                      <button
                        type="button"
                        onClick={addPaymentLine}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        <PlusIcon className="h-3 w-3" /> Adicionar linha
                      </button>
                    </div>
                    {paymentLines.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Ex: sinal + parcelas, ou uma forma só. Adicione uma ou mais linhas.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {paymentLines.map((line, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <Input
                            placeholder="Ex: Sinal, 1ª parcela, À vista..."
                            value={line.label}
                            onChange={(e) => updatePaymentLine(idx, { label: e.target.value })}
                            className="h-8 text-xs flex-1 min-w-0"
                          />
                          <select
                            value={line.method}
                            onChange={(e) => updatePaymentLine(idx, { method: e.target.value })}
                            className="h-8 rounded-lg border border-border bg-card px-1.5 text-xs shrink-0 w-[92px]"
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <Input
                            placeholder="R$"
                            value={line.value}
                            onChange={(e) => updatePaymentLine(idx, { value: e.target.value })}
                            className="h-8 text-xs w-16 shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => removePaymentLine(idx)}
                            className="text-rose-400 hover:text-rose-600 shrink-0"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {paymentLines.length > 0 && paymentLinesTotal > 0 && (
                      <p className={`text-[10px] font-bold ${Math.abs(paymentLinesTotal - total) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
                        Soma das linhas com valor: {fmt(paymentLinesTotal)}
                        {Math.abs(paymentLinesTotal - total) >= 0.01 && ` (total do orçamento: ${fmt(total)})`}
                      </p>
                    )}
                  </div>

                  {/* Validity */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Validade do Orçamento (opcional)</Label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full rounded-xl border border-border h-8 px-3 text-xs bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>

                  {/* Total */}
                  <div className="mt-auto border-t border-neutral-100 pt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">{fmt(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-xs text-emerald-600">
                        <span>Desconto</span>
                        <span className="font-mono">-{fmt(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-foreground">
                      <span>Total</span>
                      <span className="text-blue-700">{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center gap-3 shrink-0">
              {contactId && (
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || items.length === 0}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                >
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </button>
              )}
              <Button
                onClick={buildMessage}
                disabled={items.length === 0}
                className="ml-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl"
              >
                Gerar mensagem WhatsApp →
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={14}
                className="w-full text-sm font-mono rounded-xl border border-border bg-neutral-50 px-4 py-3 focus:ring-1 focus:ring-blue-400 focus:outline-none resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Você pode editar o texto acima antes de enviar.
                Variáveis disponíveis: <code className="bg-neutral-100 px-1 rounded">{"{{nome}}"}</code>{" "}
                <code className="bg-neutral-100 px-1 rounded">{"{{total}}"}</code>
              </p>

              {/* Summary */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-blue-900">{items.length} item{items.length > 1 ? "ns" : ""} — Total: {fmt(total)}</p>
                  {specialCondition && <p className="text-[10px] text-blue-600 mt-0.5">{specialCondition}</p>}
                </div>
                <span className="text-xs font-bold text-blue-600">{contactName}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center gap-3 shrink-0">
              <button
                onClick={() => setStep("build")}
                className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Voltar
              </button>

              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-foreground border border-border rounded-lg px-3 py-2 hover:bg-neutral-100 transition-colors"
              >
                {copied ? <CheckCircle2Icon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar"}
              </button>

              <Button
                onClick={handleSendWhatsApp}
                disabled={sending || !contactPhone}
                className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-2"
              >
                {sending ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin" /> Enviando...</>
                ) : (
                  <><SendIcon className="h-4 w-4" /> Enviar pelo WhatsApp</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
