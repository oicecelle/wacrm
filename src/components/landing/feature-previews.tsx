"use client";

import { useEffect, useState } from "react";
import { 
  Bot, 
  Check, 
  MessageSquare, 
  Calendar, 
  DollarSign, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  TrendingUp 
} from "lucide-react";

interface FeaturePreviewProps {
  variant: "crm" | "leads" | "scheduling" | "financeiro";
}

export function FeaturePreview({ variant }: FeaturePreviewProps) {
  switch (variant) {
    case "crm":
      return <CRMPreview />;
    case "leads":
      return <LeadsPreview />;
    case "scheduling":
      return <SchedulingPreview />;
    case "financeiro":
      return <FinanceiroPreview />;
    default:
      return null;
  }
}

// ── 1. CRM & FOLLOW-UP PREVIEW ──
function CRMPreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 5);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200/60 shadow-md p-5 font-sans relative overflow-hidden h-[300px] flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
            JD
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-800">Juliana Dias (Lead)</h4>
            <p className="text-[10px] text-neutral-400">Online</p>
          </div>
        </div>
        <div className="flex gap-1">
          {step >= 2 && (
            <span className="animate-fade-in text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5" /> IA Ativa
            </span>
          )}
          {step >= 3 && (
            <span className="animate-scale-up text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">
              🔥 Quente
            </span>
          )}
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 space-y-3 overflow-y-auto text-xs pr-1 scrollbar-none">
        {step >= 0 && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-neutral-100 text-neutral-800 p-3 rounded-2xl rounded-tl-none max-w-[80%]">
              Olá! Gostaria de saber os valores para a sessão de Harmonização Facial.
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex justify-end items-center gap-1.5 text-neutral-400 animate-pulse">
            <Bot className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            <span className="text-[10px]">IA analisando intenção...</span>
          </div>
        )}

        {step >= 2 && (
          <div className="flex justify-end animate-fade-in">
            <div className="bg-blue-600 text-white p-3 rounded-2xl rounded-tr-none max-w-[80%] shadow-xs">
              Olá Juliana! A sessão de Harmonização é personalizada. Nossos procedimentos variam de R$ 800 a R$ 2.500. Vamos agendar uma avaliação cortesia amanhã às 14h?
            </div>
          </div>
        )}

        {step >= 4 && (
          <div className="flex justify-start animate-fade-in mt-2 border-t pt-2">
            <div className="bg-neutral-100 text-neutral-500 p-2.5 rounded-2xl max-w-[85%] border border-dashed flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-bold text-[10px] text-neutral-700">Follow-up Automático (IA D+1):</p>
                <p className="text-[11px] mt-0.5 italic">"Juliana, conseguimos reservar o horário das 14h de amanhã para você. Quer confirmar?"</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="border-t pt-2 mt-2 flex justify-between items-center text-[10px] text-neutral-400">
        <span>Pronto para resposta humana</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sincronizado</span>
      </div>
    </div>
  );
}

// ── 2. LEADS FUNNEL & STATS PREVIEW ──
function LeadsPreview() {
  const [progress, setProgress] = useState([0, 0, 0, 0]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress([100, 75, 52, 35]);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200/60 shadow-md p-5 font-sans h-[300px] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-bold text-neutral-800">Funil de Leads Automático</h4>
            <p className="text-[10px] text-neutral-400">Atualizado em tempo real pela IA</p>
          </div>
          <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> +45% conversão
          </span>
        </div>

        {/* Funil de Vendas */}
        <div className="space-y-3">
          {[
            { label: "Novos Leads", val: progress[0], color: "bg-blue-400", count: "120" },
            { label: "Intenção Detectada", val: progress[1], color: "bg-blue-500", count: "90" },
            { label: "Agendados", val: progress[2], color: "bg-blue-600", count: "62" },
            { label: "Convertidos", val: progress[3], color: "bg-emerald-500", count: "42" },
          ].map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-neutral-600">
                <span>{item.label}</span>
                <span>{item.count} ({item.val}%)</span>
              </div>
              <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${item.color}`}
                  style={{ width: `${item.val}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-3 flex justify-between items-center text-[10px] text-neutral-400">
        <span>Principais Objeções: <strong className="text-neutral-700 font-bold">1. Preço (18%) · 2. Horário (12%)</strong></span>
      </div>
    </div>
  );
}

// ── 3. AGENDA & RESERVAS PREVIEW ──
function SchedulingPreview() {
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setBooked((prev) => !prev);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200/60 shadow-md p-5 font-sans h-[300px] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 border-b pb-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-500" />
            <h4 className="text-xs font-bold text-neutral-800">Google Calendar Sincronizado</h4>
          </div>
          <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
            <Check className="w-2.5 h-2.5" /> Bidirecional
          </span>
        </div>

        {/* Schedule grid */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-neutral-400 w-10">09:00</span>
            <div className="flex-1 bg-neutral-50 border rounded-xl p-2 text-[10px] text-neutral-500 border-dashed text-center">
              Horário Livre
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            <span className="text-[10px] font-bold text-neutral-400 w-10">10:00</span>
            <div className={`flex-1 rounded-xl p-2 text-[10px] transition-all duration-700 flex justify-between items-center ${
              booked 
                ? "bg-blue-50 border border-blue-200 text-blue-800 scale-100 opacity-100" 
                : "bg-neutral-50 border rounded-xl border-dashed text-neutral-400 scale-95 opacity-50"
            }`}>
              {booked ? (
                <>
                  <div>
                    <span className="font-bold">Dra. Camila S. (Avaliação)</span>
                    <span className="text-[8px] text-blue-500 block">Agendado pelo Bot via WhatsApp</span>
                  </div>
                  <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-bold">
                    Confirmado
                  </span>
                </>
              ) : (
                <span className="mx-auto">Bloqueado pela IA (Aguardando resposta do lead)</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-neutral-400 w-10">11:00</span>
            <div className="flex-1 bg-neutral-100 border border-neutral-200 rounded-xl p-2 text-[10px] text-neutral-600 flex justify-between items-center">
              <div>
                <span className="font-bold">Retorno Clínico — Mariana</span>
              </div>
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Simulated notification */}
      <div className={`border-t pt-2.5 transition-all duration-500 flex items-center justify-between text-[9px] ${
        booked ? "text-emerald-600 font-bold" : "text-neutral-400"
      }`}>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" />
          {booked ? "WhatsApp: Confirmação de consulta enviada!" : "Aguardando confirmação de consulta..."}
        </span>
        {booked && <span className="animate-ping w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      </div>
    </div>
  );
}

// ── 4. FINANCEIRO PREVIEW ──
function FinanceiroPreview() {
  const [val, setVal] = useState(12450);
  const [signal, setSignal] = useState(20);

  useEffect(() => {
    const timer = setInterval(() => {
      setVal((prev) => {
        if (prev >= 15820) return 12450;
        return prev + 1120;
      });
      setSignal((prev) => {
        if (prev >= 100) return 20;
        return prev + 20;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200/60 shadow-md p-5 font-sans h-[300px] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-bold text-neutral-800">Receita Prevista</h4>
            <p className="text-[10px] text-neutral-400">Contratos & Orçamentos em andamento</p>
          </div>
          <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" /> Financeiro
          </span>
        </div>

        {/* Counter area */}
        <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/40 mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-neutral-400 uppercase font-bold">Total Estimado</p>
            <p className="text-2xl font-black text-neutral-900 transition-all duration-500">
              R$ {val.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-neutral-400 uppercase font-bold">Taxa de Sinal</p>
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 justify-end mt-0.5">
              <span>{signal}% pagos</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </p>
          </div>
        </div>

        {/* Process list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-neutral-600 border-b pb-1">
            <span className="font-medium">Orçamento Harmonização (Dra. Camila)</span>
            <span className="font-bold text-neutral-800">R$ 2.400,00</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-neutral-600 border-b pb-1">
            <span className="font-medium">Sinal de Agendamento (Juliana D. via Pix)</span>
            <span className="font-bold text-emerald-600">R$ 150,00 (Confirmado)</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-2 flex items-center gap-1 text-[10px] text-neutral-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>Previsão de caixa atualizada automaticamente</span>
      </div>
    </div>
  );
}
