"use client";

import { useMemo } from "react";
import { Check, Calendar, CreditCard, Sparkles, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SettingsPanelHead } from "./settings-panel-head";
import { Button } from "@/components/ui/button";

export function SubscriptionPanel() {
  const { user } = useAuth();

  const trialInfo = useMemo(() => {
    if (!user?.created_at) return { day: 1, startedAt: new Date().toLocaleDateString("pt-BR"), nextPayment: new Date().toLocaleDateString("pt-BR") };
    
    const started = new Date(user.created_at);
    const today = new Date();
    const diffTime = today.getTime() - started.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const day = Math.min(Math.max(diffDays, 1), 7);
    
    const paymentDate = new Date(started.getTime());
    paymentDate.setDate(paymentDate.getDate() + 7);
    
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    
    return {
      day,
      startedAt: started.toLocaleDateString("pt-BR", options),
      nextPayment: paymentDate.toLocaleDateString("pt-BR", options),
    };
  }, [user]);

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead
        title="Planos & Assinatura"
        description="Gerencie a assinatura do seu workspace, altere o seu plano de faturamento ou consulte os dados do seu período de testes."
      />

      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-10">
          <CreditCard className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 border border-white/30 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" /> Período de Testes
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold">Você está no dia {trialInfo.day} de 7 do seu teste grátis</h2>
            <p className="text-xs text-white/80 mt-1 leading-relaxed">
              Aproveite todos os recursos liberados (CRM, Agenda, WhatsApp Oficial, Assinaturas Digitais e Financeiro).
            </p>
          </div>
          <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-white/60 block mb-0.5">Iniciado em</span>
              <span className="font-bold">{trialInfo.startedAt}</span>
            </div>
            <div>
              <span className="text-white/60 block mb-0.5">Fim do teste / Pagamento</span>
              <span className="font-bold">{trialInfo.nextPayment}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          Escolha o seu plano de faturamento
        </h3>
        
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Monthly */}
          <div className="bg-card border rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-neutral-400 uppercase">Mensal</span>
                <span className="text-xs bg-muted px-2.5 py-0.5 rounded-full font-bold">Básico</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-foreground">R$ 397</span>
                <span className="text-xs text-muted-foreground"> /mês</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Ideal para clínicas de crescimento rápido. Acesso a todas as ferramentas sem taxas de setup.
              </p>
            </div>
            <ul className="text-[10px] text-muted-foreground space-y-1.5 border-t pt-3">
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> CRM inteligente e autônomo</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> API WhatsApp (Oficial/Não-Oficial)</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Agenda e Google Agenda integrada</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Assinaturas digitais de termos/fichas</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Financeiro e Receita Prevista</li>
            </ul>
            <Button className="w-full text-xs font-bold" variant="outline">
              Assinar Plano Mensal
            </Button>
          </div>

          {/* Annual */}
          <div className="bg-card border-2 border-primary rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 relative">
            <span className="absolute -top-3 right-4 bg-primary text-primary-foreground text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Melhor Custo-Benefício
            </span>
            <div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-neutral-400 uppercase">Anual</span>
                <span className="text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">25% OFF</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-foreground">R$ 297</span>
                <span className="text-xs text-muted-foreground"> /mês</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">(Faturado anualmente por R$ 3.564)</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Para clínicas consolidadas. Economize R$ 1.200 por ano assinando a recorrência anual.
              </p>
            </div>
            <ul className="text-[10px] text-muted-foreground space-y-1.5 border-t pt-3">
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0" /> Tudo incluso do plano mensal</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0" /> Suporte VIP dedicado por WhatsApp</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0" /> Treinamento de equipe gratuito</li>
            </ul>
            <Button className="w-full text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground">
              Assinar Plano Anual
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
