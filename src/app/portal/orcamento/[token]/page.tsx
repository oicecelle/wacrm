"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2Icon,
  CheckCircle2Icon,
  ShieldCheckIcon,
  FileTextIcon,
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function QuotePortalPage() {
  const supabase = createClient();
  const params = useParams();
  const token = params.token as string; // token is quote UUID
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [clinic, setClinic] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;

    const loadQuote = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch quote
        const { data: q, error: qErr } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", token)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!q) {
          setError("Orçamento não encontrado ou link inválido/expirado.");
          setLoading(false);
          return;
        }

        setQuote(q);

        if (q.status === "accepted" || q.status === "approved") {
          setSuccess(true);
        }

        // 2. Fetch items
        const { data: qItems } = await supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", q.id);
        setItems(qItems || []);

        // 3. Fetch patient (using contact_id)
        if (q.contact_id) {
          const { data: pt } = await supabase
            .from("patients")
            .select("name, phone, email")
            .eq("id", q.contact_id)
            .maybeSingle();
          setPatient(pt);
        }

        // 4. Fetch clinic
        if (q.account_id) {
          const { data: cl } = await supabase
            .from("clinics")
            .select("name")
            .eq("id", q.account_id)
            .maybeSingle();
          setClinic(cl);
        }
      } catch (err: any) {
        console.error("Error loading quote portal:", err);
        setError("Erro ao carregar o orçamento.");
      } finally {
        setLoading(false);
      }
    };

    loadQuote();
  }, [token]);

  const handleAcceptQuote = async () => {
    if (!quote) return;
    setSubmitting(true);
    try {
      // Update quote status
      const { error: updateErr } = await supabase
        .from("quotes")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .eq("id", quote.id);

      if (updateErr) throw updateErr;

      // Log into timeline
      await supabase.from("patient_timeline").insert({
        patient_id: quote.contact_id,
        event_type: "quote_accepted",
        title: `Orçamento #${quote.id.substring(0, 6).toUpperCase()} aprovado pelo paciente`,
        payload: {
          quote_id: quote.id,
          total_value: quote.total_value,
          accepted_at: new Date().toISOString(),
        },
      });

      setSuccess(true);
    } catch (err: any) {
      console.error("Error accepting quote:", err);
      alert("Erro ao aprovar o orçamento: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4">
        <Loader2Icon className="h-10 w-10 animate-spin text-blue-600 mb-3" />
        <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">
          Carregando Detalhes do Orçamento...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xl">
          <ShieldCheckIcon className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-black text-slate-800">Falha no Carregamento</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full h-10 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
          >
            Ir para a Página Inicial
          </button>
        </div>
      </div>
    );
  }

  // Calculate values
  const subtotal = items.reduce((acc, curr) => acc + Number(curr.total_price || 0), 0);
  const discount = Number(quote?.discount_value || 0);
  const total = Number(quote?.total_value || 0);

  return (
    <div className="min-h-screen text-slate-800 flex flex-col font-sans bg-slate-50">
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-white/95 backdrop-blur-md border-slate-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-sm font-black text-white shadow-lg">
              {clinic?.name?.charAt(0)?.toUpperCase() || "C"}
            </div>
            <div>
              <p className="text-xs font-black leading-tight text-slate-800">
                {clinic?.name || "Clínica"}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Proposta & Orçamento
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100">
            <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-500" />
            Conexão Segura SSL
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-2xl w-full px-4 pt-6 pb-28 flex-1 flex flex-col gap-5">
        {success ? (
          /* ── Success state ── */
          <div className="rounded-2xl p-8 text-center space-y-5 bg-white border border-slate-200 shadow-sm animate-fade-in">
            <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto bg-emerald-50 border border-emerald-100">
              <CheckCircle2Icon className="h-10 w-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-900">Orçamento Aprovado!</h1>
              <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                Olá, <strong className="text-slate-800">{patient?.name}</strong>. Sua aprovação para a proposta
                do orçamento <strong className="text-slate-800">#{quote.id.substring(0, 6).toUpperCase()}</strong> foi registrada com sucesso.
              </p>
            </div>
            <div className="rounded-xl p-4 text-[10px] text-left text-slate-500 font-semibold space-y-1 max-w-md mx-auto bg-slate-50 border border-slate-200">
              <p className="text-slate-700 font-bold uppercase tracking-wider border-b pb-1.5 mb-1.5 border-slate-200">
                Resumo da Transação
              </p>
              <p>• ID do Orçamento: {quote.id}</p>
              <p>• Status: Aprovado / Aceito</p>
              <p>• Valor Total: {fmt(total)}</p>
              <p>• Data / Hora: {new Date(quote.responded_at || new Date()).toLocaleString("pt-BR")}</p>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Nossa equipe entrará em contato para agendar suas sessões. Você já pode fechar esta tela.
            </p>
          </div>
        ) : (
          /* ── Proposal Review & Accept ── */
          <div className="space-y-5 flex-1 flex flex-col">
            {/* Meta */}
            <div className="rounded-2xl p-5 space-y-3 bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block bg-blue-50 text-blue-600 border border-blue-100">
                ORÇAMENTO #{quote.id.substring(0, 6).toUpperCase()}
              </span>
              <h1 className="text-lg font-black text-slate-900 leading-snug">Proposta de Tratamento / Serviços</h1>
              <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t text-slate-500 border-slate-100">
                <div>
                  <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Paciente / Cliente</p>
                  <p className="font-bold text-slate-800 truncate">{patient?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Clínica Emissora</p>
                  <p className="font-bold text-slate-800 truncate">{clinic?.name || "—"}</p>
                </div>
              </div>
            </div>

            {/* Quote items table */}
            <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-xs flex flex-col">
              <div className="px-4 py-2.5 flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider select-none border-b bg-slate-50 border-slate-100">
                <FileTextIcon className="h-4 w-4 text-blue-600" />
                Itens Inclusos na Proposta
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <div key={item.id || idx} className="p-4 flex items-center justify-between text-xs gap-4">
                    <div className="min-w-0 text-left">
                      <p className="font-bold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {fmt(Number(item.unit_price))} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-extrabold text-slate-700 shrink-0">
                      {fmt(Number(item.total_price))}
                    </span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="p-6 text-xs text-slate-400 italic text-center">Nenhum item adicionado a este orçamento.</p>
                )}
              </div>

              {/* Financial summary blocks */}
              <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Desconto Aplicado</span>
                    <span className="font-mono">-{fmt(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Valor Total da Proposta</span>
                  <span className="text-blue-600 font-mono text-base">{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Conditions & Notes */}
            {(quote.special_condition || quote.expires_at) && (
              <div className="rounded-2xl p-5 space-y-3 bg-white border border-slate-200 shadow-xs text-left text-xs">
                <h3 className="font-black text-slate-800 uppercase text-[10px] tracking-wider mb-1">Observações e Condições</h3>
                {quote.special_condition && (
                  <p className="text-slate-600">
                    <strong className="text-slate-700 font-semibold">Condição de Pagamento:</strong> {quote.special_condition}
                  </p>
                )}
                {quote.expires_at && (
                  <p className="text-slate-600">
                    <strong className="text-slate-700 font-semibold">Validade da Proposta:</strong> Válido até {new Date(quote.expires_at + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            )}

            {/* Accept Action Button */}
            <div className="pt-2">
              <button
                onClick={handleAcceptQuote}
                disabled={submitting}
                className="w-full h-12 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-60 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {submitting ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Registrando sua aprovação...
                  </>
                ) : (
                  <>
                    <CheckCircle2Icon className="h-4 w-4" />
                    Aceitar e Aprovar Orçamento
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-400 mt-2.5">
                Ao clicar em aprovar, a clínica será notificada imediatamente para prosseguir com o agendamento.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
