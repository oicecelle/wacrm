'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  MessageSquare,
  Calendar,
  CreditCard,
  Users,
  Zap,
  ShieldCheck,
  Menu,
  X,
  Sparkles,
  ChevronDown,
  DollarSign,
  Bot,
  RefreshCw,
  Clock,
  CheckCircle2,
  FileSignature,
  LayoutDashboard,
  Mic,
  Search,
  CheckSquare,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  UserCheck
} from 'lucide-react';
import { FeaturePreview } from '@/components/landing/feature-previews';

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleCarouselScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -340 : 340;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const triggerTags = [
    { label: "Follow-up", color: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Resgate", color: "bg-red-50 border-red-200 text-red-700" },
    { label: "Aniversário", color: "bg-pink-50 border-pink-200 text-pink-700" },
    { label: "Manutenção", color: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Pós-procedimento", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Lembrete", color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  ];

  const marqueeTips = [
    { text: "+4h poupadas de trabalho por semana", icon: Clock },
    { text: "100% das conversas viram dado estruturado", icon: Sparkles },
    { text: "Zero digitação manual no CRM", icon: Zap },
    { text: "Follow-up automático 24/7", icon: Bot },
    { text: "Agenda inteligente sempre atualizada", icon: Calendar },
    { text: "Assinatura digital direto no WhatsApp", icon: FileSignature },
    { text: "Prontuário e evolução do paciente no chat", icon: MessageSquare },
    { text: "Isolamento total de dados por clínica (RLS)", icon: ShieldCheck },
  ];

  const carouselCards = [
    {
      icon: DollarSign,
      title: "Financeiro Completo",
      badge: "Gestão Financeira",
      desc: "Controle de receita prevista, histórico de sinais pagos, cálculo automático de comissões de profissionais e fluxo de caixa em tempo real.",
      bullets: ["Receita prevista vs. realizada", "Controle automático de sinal", "Comissões de especialistas"]
    },
    {
      icon: FileSignature,
      title: "Assinatura Digital no WhatsApp",
      badge: "Documentos & Termos",
      desc: "Envio e assinatura jurídica de contratos e termos de consentimento direto na conversa do WhatsApp, sem precisar de apps externos.",
      bullets: ["Validade jurídica completa", "Assinatura em 1 clique pelo celular", "Armazenamento automático no CRM"]
    },
    {
      icon: LayoutDashboard,
      title: "Feed Inteligente & Dashboard",
      badge: "Métricas ao Vivo",
      desc: "Acompanhe os principais indicadores da clínica em tempo real: taxa de conversão, volume de leads e receita acumulada.",
      bullets: ["Painel visual intuitivo", "Comparativo diário e mensal", "Exportação de relatórios"]
    },
    {
      icon: Calendar,
      title: "Agenda Autônoma no WhatsApp",
      badge: "Marcações Inteligentes",
      desc: "Agendamento, remarcação e lembretes de consultas processados direto pelo assistente no WhatsApp da clínica.",
      bullets: ["Reagendamento automático", "Confirmação por mensagem", "Leads organizados no Kanban"]
    },
    {
      icon: Zap,
      title: "CRM Autônomo Kanban",
      badge: "Pipeline de Vendas",
      desc: "Linha do tempo atualizada ao vivo. A cada interação do cliente, a IA move o lead de estágio e atribui tarefas.",
      bullets: ["Zero digitação de dados", "Histórico completo da conversa", "Alertas de follow-up"]
    }
  ];

  const liaCommands = [
    { icon: Calendar, cmd: '"LIA, agende avaliação para Juliana quinta às 15h"', action: "Cria agendamento e notifica o profissional responsável" },
    { icon: CheckSquare, cmd: '"LIA, crie tarefa para enviar orçamento do Dr. Marcelo"', action: "Cria tarefa com prazo e lembrete automático" },
    { icon: Search, cmd: '"LIA, busca o histórico e telefone da paciente Camila"', action: "Retorna instantaneamente os dados do lead cadastrado" },
    { icon: BarChart2, cmd: '"LIA, me envie o relatório de faturamento deste mês"', action: "Gera e envia resumo completo com métricas e conversões" }
  ];

  // REMOVIDO MULTICLÍNICA CONFORME SOLICITADO NO PROMPT E PRINT
  const allFeatures = [
    { icon: Zap, title: "CRM 100% Autônomo", desc: "Kanban visual com atualização automatizada em tempo real. A conversa acontece no WhatsApp e a IA organiza o funil." },
    { icon: Calendar, title: "Agenda Inteligente Autônoma", desc: "Agendamento, confirmações e reagendamentos efetuados automaticamente direto na conversa com o cliente." },
    { icon: DollarSign, title: "Gestão Financeira Completa", desc: "Controle de receita prevista, sinais de consulta, fluxo de caixa e comissionamento de profissionais." },
    { icon: FileSignature, title: "Assinatura Digital no WhatsApp", desc: "Envio e assinatura jurídica de contratos e termos de consentimento diretamente no chat sem apps terceiros." },
    { icon: Bot, title: "Disparos & Automações 24/7", desc: "Sequências com gatilhos de follow-up, resgate, aniversários, manutenção e lembretes de pós-procedimento." },
    { icon: MessageSquare, title: "LIA — Assistente Interna", desc: "Comande a plataforma por mensagem de texto ou áudio no WhatsApp da própria equipe." },
    { icon: CheckCircle2, title: "Prontuário & Evolução", desc: "Registro estruturado do histórico clínico do paciente, observações e arquivos anexados ao perfil." },
    { icon: BarChart2, title: "Relatórios Periódicos", desc: "Relatórios diários, quinzenais e mensais automáticos enviados direto no grupo do WhatsApp da equipe." },
    { icon: ShieldCheck, title: "Isolamento de Dados (RLS)", desc: "Padrão Enterprise com isolamento por conta, criptografia de credenciais e segurança de nível médico." }
  ];

  const faqs = [
    { q: "O que torna o LeadPluz diferente de outros sistemas?", a: "Ao contrário dos CRMs tradicionais que exigem alimentação manual de dados o dia todo, o LeadPluz é inteligente e conectado ao WhatsApp. Ele escuta as conversas, atualiza a ficha dos contatos, insere consultas na agenda, gera faturas financeiras e envia links de termos para assinatura de forma 100% autônoma." },
    { q: "Preciso instalar algo no meu computador?", a: "Não. O LeadPluz roda inteiramente na nuvem. Basta ler o QR Code do seu WhatsApp para conectar a conta e ter acesso a todo o painel de forma instantânea." },
    { q: "O que é a LIA e como minha equipe a utiliza?", a: "A LIA é a assistente de IA interna da sua equipe. Ela funciona diretamente dentro de uma conversa no WhatsApp da clínica e aceita comandos de voz ou texto para criar agendamentos, tarefas, buscar histórico de pacientes e enviar relatórios." },
    { q: "Como funciona a gestão de agenda da clínica?", a: "A IA cria e gerencia a agenda de forma totalmente autônoma. Se um cliente solicitar reagendamento ou troca de horário no WhatsApp, a própria IA reajusta a vaga e notifica sua equipe." },
    { q: "Como o paciente assina o contrato ou termo de consentimento?", a: "O robô gera o link único e envia pelo WhatsApp. O paciente clica, confere os dados e assina desenhando com o dedo no próprio celular. A assinatura fica registrada na timeline do contato na hora." },
    { q: "Consigo testar gratuitamente?", a: "Com certeza! Você pode criar sua conta e testar por 7 dias grátis sem precisar cadastrar cartão de crédito." }
  ];

  return (
    <div className="min-h-screen bg-[#FAFBFF] text-[#10182B] font-sans antialiased text-left selection:bg-blue-100 overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        body { font-family: 'Outfit', sans-serif; }
        .fade-up { animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .glow-blue { box-shadow: 0 0 60px -10px rgba(108, 155, 255, 0.25); }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .float { animation: float 4s ease-in-out infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .animate-marquee { display: flex; width: max-content; animation: marquee 35s linear infinite; }
      `}</style>

      {/* ── Navbar (Somente os 4 itens solicitados: Recursos, Planos, Demonstração, FAQ - Item 3.13) ── */}
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/85 backdrop-blur-md border-b border-[#E3E9F5] shadow-xs py-3" : "bg-transparent py-5"}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#3B6BE0] to-[#6C9BFF] flex items-center justify-center text-white shadow-xs font-bold">
              <Zap className="w-4 h-4 text-white fill-white/20" />
            </div>
            <span className="text-lg font-black tracking-tight text-[#10182B] uppercase font-sans">
              LEAD<span className="text-[#6C9BFF]">PLUZ</span>
            </span>
          </Link>

          {/* Menu Desktop: 4 Itens Exatos (Item 3.13) */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#recursos" className="text-xs font-bold text-[#5B6478] hover:text-[#5486F0] transition-colors">Recursos</a>
            <a href="#planos" className="text-xs font-bold text-[#5B6478] hover:text-[#5486F0] transition-colors">Planos</a>
            <a href="#demonstracao" className="text-xs font-bold text-[#5B6478] hover:text-[#5486F0] transition-colors">Demonstração</a>
            <a href="#faq" className="text-xs font-bold text-[#5B6478] hover:text-[#5486F0] transition-colors">FAQ</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="rounded-xl px-4 py-2 text-xs font-bold text-[#5B6478] hover:bg-[#F0F4FC] transition-colors">Login</Link>
            <Link href="/signup" className="rounded-xl bg-[#6C9BFF] px-4 py-2 text-xs font-bold text-white hover:bg-[#5486F0] transition-all shadow-xs">
              Começar Grátis →
            </Link>
          </div>

          <button className="md:hidden p-2 rounded-lg hover:bg-[#F0F4FC]" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-t border-[#E3E9F5] px-6 py-4 space-y-3 text-xs font-bold uppercase tracking-wider text-[#5B6478]">
            <a href="#recursos" onClick={() => setMenuOpen(false)} className="block py-1">Recursos</a>
            <a href="#planos" onClick={() => setMenuOpen(false)} className="block py-1">Planos</a>
            <a href="#demonstracao" onClick={() => setMenuOpen(false)} className="block py-1">Demonstração</a>
            <a href="#faq" onClick={() => setMenuOpen(false)} className="block py-1">FAQ</a>
            <div className="flex gap-2 pt-2">
              <Link href="/login" className="flex-1 text-center rounded-xl border border-[#E3E9F5] py-2.5 text-[#5B6478]">Login</Link>
              <Link href="/signup" className="flex-1 text-center rounded-xl bg-[#6C9BFF] py-2.5 text-white">Criar Conta</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero (MANTIDO TÍTULO ORIGINAL EXACTO: "Seu WhatsApp alimenta o CRM, tudo de forma autônoma.") ── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DCE7FF]/40 via-transparent to-violet-50/20 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-[#DCE7FF]/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-5xl">
          <div className="text-center mb-12 fade-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#DCE7FF] border border-[#6C9BFF]/20 px-4 py-1.5 text-xs font-bold text-[#3B6BE0] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6C9BFF] animate-pulse" />
              CRM 100% Autônomo e Integrado ao WhatsApp
            </div>

            {/* TÍTULO ORIGINAL MANTIDO 100% INTACTO */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-[#10182B] leading-[1.08] mb-6">
              Seu WhatsApp alimenta o CRM,<br />
              <span className="text-[#6C9BFF]">tudo de forma autônoma.</span>
            </h1>

            <p className="text-base sm:text-lg text-[#5B6478] max-w-2xl mx-auto leading-relaxed mb-8">
              Diga adeus à alimentação manual de planilhas. Nosso diferencial é um <strong className="font-bold text-neutral-800">CRM inteligente e automatizado</strong> onde cada conversa pelo WhatsApp vira dado estruturado na hora. Acompanhe a <strong className="font-bold text-neutral-800">agenda, assinaturas digitais, financeiro</strong> e o progresso do lead sem levantar um dedo.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl bg-[#6C9BFF] px-6 py-3.5 text-xs font-bold text-white hover:bg-[#5486F0] transition-all shadow-md shadow-blue-300/35 glow-blue"
              >
                Iniciar meu teste grátis de 7 dias
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#demonstracao" className="flex items-center gap-2 rounded-xl border border-[#E3E9F5] px-6 py-3.5 text-xs font-bold text-[#5B6478] hover:bg-[#F0F4FC] transition-colors bg-white">
                Ver Demonstração
              </a>
            </div>

            {/* Texto "Teste sem compromisso" maior e destacado (Item 3.5) */}
            <p className="text-xs sm:text-sm font-semibold text-[#3B6BE0] bg-[#DCE7FF]/70 border border-[#6C9BFF]/30 px-5 py-2.5 rounded-xl max-w-fit mx-auto mt-6 shadow-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#6C9BFF] shrink-0" />
              <span>Teste sem compromisso por 7 dias grátis · Sem cartão de crédito · Integração em 5 min</span>
            </p>
          </div>

          {/* Hero Mockup (Item 3.6: Conversa Real + Status "Sinal ainda não pago") */}
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-3xl mx-auto">
            
            {/* Esquerda: Chat Atendimento Clínica WhatsApp */}
            <div className="bg-white rounded-3xl border border-[#E3E9F5] shadow-lg overflow-hidden max-w-sm mx-auto text-left w-full">
              <div className="flex items-center gap-3 px-4 py-3 bg-[#5486F0] text-white">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">JC</div>
                <div>
                  <div className="text-xs font-bold">Juliana Costa</div>
                  <div className="text-[10px] text-blue-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Atendimento de Avaliação
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3 min-h-[250px] bg-[#f0f4fc]/40">
                <div className="bg-white rounded-xl p-3 border border-neutral-100 shadow-2xs max-w-[85%] text-xs text-neutral-800">
                  Olá! Gostaria de agendar uma consulta de avaliação estética para esta semana.
                  <span className="text-[8px] text-neutral-400 block text-right mt-1">14:32</span>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 max-w-[90%] ml-auto text-xs text-blue-900">
                  <div className="text-[9px] font-bold text-blue-600 flex items-center gap-1 mb-1">
                    <Sparkles className="w-3 h-3 text-[#6C9BFF]" /> Resposta Natural da Clínica
                  </div>
                  Com certeza, Juliana! Temos disponibilidade para Quinta-feira às 15:00. Posso reservar para você?
                  <span className="text-[8px] text-blue-400 block text-right mt-1">14:32 ✓✓</span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-neutral-100 shadow-2xs max-w-[85%] text-xs text-neutral-800">
                  Perfeito! Pode confirmar na quinta às 15h.
                  <span className="text-[8px] text-neutral-400 block text-right mt-1">14:33</span>
                </div>
              </div>
            </div>

            {/* Direita: Timeline CRM com Status "Sinal ainda não pago" (Item 3.6) */}
            <div className="bg-white rounded-3xl border border-[#E3E9F5] shadow-lg p-5 max-w-xs text-left mx-auto w-full">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-100">
                <div className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Timeline Estruturada ao Vivo</div>
                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                  ✓ Sem Digitação
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">JC</div>
                <div>
                  <div className="text-sm font-bold text-neutral-900">Juliana Costa</div>
                  <div className="text-[10px] text-neutral-500">Estágio: Agendada · Score: 95</div>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-100">
                  <span className="text-[8px] text-neutral-400 uppercase tracking-wider block">Agendamento</span>
                  <span className="text-xs font-bold text-neutral-800">Quinta-feira · 15:00h</span>
                </div>

                {/* Status do Sinal: Sinal AINDA NÃO PAGO (Ajustado item 3.6) */}
                <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" /> Status do Sinal
                    </span>
                    <span className="bg-amber-100 text-amber-800 font-bold text-[8px] px-1.5 py-0.5 rounded">PENDENTE</span>
                  </div>
                  <span className="text-xs font-bold text-amber-900 block mt-1">Sinal ainda não pago · Lembrete enviado</span>
                </div>
              </div>

              <div className="text-[9px] text-blue-700 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-start gap-1.5">
                <Bot className="w-3.5 h-3.5 shrink-0 text-[#6C9BFF] mt-0.5" />
                <span><b>IA da LeadPluz:</b> Conversa estruturada e agendamento salvo sem que a recepção precise digitar dados no sistema.</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 3. Tips Horizontais (Marquee de Benefícios) (Item 3.7) ── */}
      <section className="py-8 bg-white border-y border-[#E3E9F5] overflow-hidden w-full select-none">
        <div className="max-w-4xl mx-auto px-6 mb-3 text-center">
          <span className="text-[10px] font-bold text-[#5486F0] uppercase tracking-widest flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Benefícios e Facilidades da Plataforma
          </span>
        </div>

        <div className="relative w-full flex items-center overflow-x-hidden">
          <div className="animate-marquee">
            {[...marqueeTips, ...marqueeTips, ...marqueeTips].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F0F4FC] border border-[#E3E9F5] text-xs font-bold text-[#10182B] shrink-0 mr-4 shadow-2xs">
                  <Icon className="w-4 h-4 text-[#5486F0] shrink-0" />
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 4. Segunda Seção — Follow-up com Card de Exemplo + Tags (Item 3.8 & 3.9) ── */}
      <section id="recursos" className="py-24 px-6 border-b border-[#E3E9F5] bg-white">
        <div className="mx-auto max-w-5xl space-y-20">
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Texto + Tags (Item 3.8) */}
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] border border-[#6C9BFF]/20 uppercase">
                <Bot className="w-3 h-3" /> CRM Inteligente e Follow-up
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B] leading-tight">
                Você nunca mais vai perder um lead por falta de resposta.
              </h2>
              <p className="text-xs text-[#5B6478] leading-relaxed">
                O bot inteligente monitora os leads frios e atua enviando disparos personalizados de acompanhamento. Defina os gatilhos e deixe a IA cuidar do resgate e nutrição.
              </p>

              {/* Linha de Tags Coloridas de Disparo (Item 3.8) */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-extrabold text-[#5B6478] uppercase tracking-wider block">
                  Tipos de Disparos Automáticos Configuráveis:
                </span>
                <div className="flex flex-wrap gap-2">
                  {triggerTags.map((tag, idx) => (
                    <span key={idx} className={`px-3 py-1 rounded-full text-xs font-bold border ${tag.color}`}>
                      • {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Card de Exemplo de Follow-up Programado (Item 3.8) */}
            <div className="glow-blue rounded-3xl p-6 bg-white border border-[#E3E9F5] shadow-lg text-left max-w-md mx-auto w-full">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                    MS
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900">Dr. Marcelo Silva</h4>
                    <span className="text-[10px] text-[#5B6478]">Interesse: Tratamento Ortodôntico</span>
                  </div>
                </div>
                
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                  24h sem resposta
                </span>
              </div>

              <div className="mt-4 bg-[#F0F4FC]/60 border border-[#E3E9F5] rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-[#3B6BE0] uppercase flex items-center gap-1">
                    <Bot className="w-3 h-3 text-[#6C9BFF]" /> Follow-up Automático
                  </span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Pronto para Envio</span>
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed font-sans bg-white p-3 rounded-xl border border-neutral-100">
                  "Olá Dr. Marcelo! Vi que você ficou de confirmar o horário de avaliação da clínica. Conseguimos reservar uma vaga especial para amanhã às 16h. Vamos confirmar?"
                </p>
                <div className="text-[9px] text-neutral-400 text-right">Agendado para disparo via WhatsApp</div>
              </div>
            </div>
          </div>

          {/* Agenda Autônoma SEM MENÇÃO AO GOOGLE CALENDAR (Item 3.9) */}
          <div className="grid md:grid-cols-2 gap-12 items-center pt-12 border-t border-[#E3E9F5]">
            {/* Visual preview da agenda */}
            <div className="order-2 md:order-1 glow-blue rounded-3xl p-6 bg-white border border-[#E3E9F5] shadow-lg text-left max-w-md mx-auto w-full">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#6C9BFF]" />
                  <span className="text-xs font-bold text-neutral-900 uppercase">Agenda Autônoma no WhatsApp</span>
                </div>
                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full font-bold">
                  100% Automático
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-[#5486F0] block">14:00h · Confirmado</span>
                    <span className="font-bold text-neutral-800">Juliana Costa — Estética Facial</span>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Lembrete Enviado</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 block flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 text-amber-600" /> Remarcado via WhatsApp
                    </span>
                    <span className="font-bold text-neutral-800">Camila Rocha — Limpeza de Pele</span>
                  </div>
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Reagendado pela IA</span>
                </div>
              </div>
            </div>

            {/* Copy da Agenda (Item 3.9: Reforçar IA e remover Google Calendar) */}
            <div className="space-y-5 order-1 md:order-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                <Calendar className="w-3 h-3" /> Gestão de Agenda Autônoma
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B] leading-tight">
                A IA cria e gerencia a agenda da sua clínica de forma 100% autônoma.
              </h2>
              <p className="text-xs text-[#5B6478] leading-relaxed">
                O assistente cria e gerencia consultas de forma autônoma. Se o cliente solicitar troca de horário ou desmarcar diretamente pelo WhatsApp, a agenda é ajustada e liberada instantaneamente sem intervenção humana.
              </p>
              <div className="space-y-2.5 pt-1 text-xs text-[#5B6478]">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Confirmação de presenças automatizada 24h antes da consulta</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Reagendamento automático direto pela conversa do WhatsApp</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Histórico completo de retornos e procedimentos registrados</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 5. Quinta Seção — Carrossel de Funcionalidades Arredondadas (Item 3.10) ── */}
      <section className="py-24 px-6 bg-[#F0F4FC]/40 border-b border-[#E3E9F5]">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-xl text-left">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] uppercase">
                Recursos da Plataforma
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B]">
                Tudo o que sua clínica precisa, <span className="text-[#6C9BFF]">em um único sistema</span>
              </h2>
              <p className="text-xs text-[#5B6478]">Arraste os cards para explorar todas as funcionalidades da LeadPluz.</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => handleCarouselScroll('left')} className="w-10 h-10 rounded-full bg-white border border-[#E3E9F5] shadow-xs flex items-center justify-center text-[#5B6478] hover:bg-[#F0F4FC] transition-colors cursor-pointer">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => handleCarouselScroll('right')} className="w-10 h-10 rounded-full bg-white border border-[#E3E9F5] shadow-xs flex items-center justify-center text-[#5B6478] hover:bg-[#F0F4FC] transition-colors cursor-pointer">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cards do Carrossel */}
          <div ref={scrollRef} className="flex gap-6 overflow-x-auto pb-6 pt-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {carouselCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <div key={idx} className="w-[310px] md:w-[340px] shrink-0 bg-white border border-[#E3E9F5] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6 text-left">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-2xl bg-[#DCE7FF] border border-[#6C9BFF]/20 flex items-center justify-center text-[#3B6BE0]">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B6BE0] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-neutral-900">{card.title}</h3>
                    <p className="text-xs text-[#5B6478] leading-relaxed">{card.desc}</p>
                  </div>

                  <div className="border-t border-neutral-100 pt-4 space-y-2">
                    {card.bullets.map((b, bIdx) => (
                      <div key={bIdx} className="flex items-center gap-2 text-[11px] text-neutral-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6C9BFF] shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 6. Seção Destacada — LIA (Assistente no WhatsApp) (Item 3.11) ── */}
      <section className="py-24 px-6 bg-[#10182B] text-white rounded-[40px] mx-4 my-8 relative overflow-hidden text-left">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
          
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
              <Sparkles className="w-3.5 h-3.5" /> Assistente Interna da Equipe
            </span>

            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Conheça a <span className="text-[#6C9BFF]">LIA</span>: Sua Assistente de IA dentro do WhatsApp
            </h2>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              A LIA não fala com o seu cliente — <strong>ela é o copiloto da sua equipe</strong>. Dentro do WhatsApp da própria clínica, você ou seus atendentes comandam o CRM usando <strong>mensagens de texto ou áudio</strong>.
            </p>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
                <BarChart2 className="w-4 h-4 text-[#6C9BFF]" />
                <span>Relatórios Automáticos no seu WhatsApp</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Receba os relatórios dos principais indicadores da clínica de forma 100% automática: <strong>diariamente, quinzenalmente e mensalmente</strong>, direto no grupo da sua equipe.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md bg-[#1e293b]/90 border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="w-10 h-10 rounded-2xl bg-[#6C9BFF] flex items-center justify-center text-white font-bold shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    LIA — Copiloto LeadPluz
                    <span className="bg-blue-500/20 text-blue-300 text-[8px] px-1.5 py-0.5 rounded font-bold border border-blue-400/30">IA Ativa</span>
                  </h4>
                  <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                    <Mic className="w-3 h-3 text-[#6C9BFF]" /> Aceita comandos por texto e áudio
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Exemplos de comandos executados no chat:
                </span>
                {liaCommands.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
                        <Icon className="w-3.5 h-3.5 text-[#6C9BFF] shrink-0" />
                        <span>{c.cmd}</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 pl-5">
                        ↳ <b>Ação executada:</b> {c.action}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 7. Nova Seção — "Todos os Recursos" (Grid Completo - MULTICLÍNICA REMOVIDO CONFORME PEDIDO) (Item 3.14) ── */}
      <section className="py-24 px-6 bg-white border-b border-[#E3E9F5] text-left">
        <div className="mx-auto max-w-5xl space-y-16">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] uppercase">
              Todos os Recursos
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-[#10182B]">
              Ecossistema completo para <span className="text-[#6C9BFF]">escalar sua clínica</span>
            </h2>
            <p className="text-xs md:text-sm text-[#5B6478] leading-relaxed">
              Desenvolvido especificamente para o mercado de saúde, beleza e estética.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allFeatures.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div key={idx} className="p-6 rounded-3xl bg-[#F0F4FC]/40 border border-[#E3E9F5] hover:border-[#6C9BFF]/50 transition-all space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#DCE7FF] flex items-center justify-center text-[#3B6BE0]">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-neutral-900">{feat.title}</h3>
                  <p className="text-xs text-[#5B6478] leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 8. Seção de Demonstração em Vídeo ── */}
      <section id="demonstracao" className="py-24 px-6 bg-[#F0F4FC]/30 border-b border-[#E3E9F5] text-center">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] uppercase">
              Demonstração ao Vivo
            </span>
            <h2 className="text-3xl font-black text-[#10182B]">Veja a LeadPluz em Ação</h2>
            <p className="text-xs text-[#5B6478]">Assista como a esteira de atendimento e agendamento roda de forma 100% autônoma.</p>
          </div>

          <div className="bg-white rounded-3xl border border-[#E3E9F5] p-6 max-w-2xl mx-auto shadow-md space-y-6">
            <div className="aspect-video bg-[#10182B] rounded-2xl flex items-center justify-center relative overflow-hidden group">
              <div className="w-14 h-14 rounded-full bg-[#6C9BFF] text-white flex items-center justify-center font-bold text-lg shadow-xl group-hover:scale-110 transition-transform cursor-pointer">
                ▶
              </div>
              <span className="absolute bottom-4 left-4 text-xs font-bold text-white bg-black/50 px-3 py-1 rounded-full backdrop-blur-xs">
                Demonstração da Plataforma · 2:15 min
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Faixa Chamativa — Fale com um Especialista (Item 3.15) ── */}
      <section className="py-16 px-6 bg-gradient-to-r from-[#10182B] via-[#1e293b] to-[#10182B] text-white text-left">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase">
              <Sparkles className="w-3 h-3" /> Consultoria Especializada LeadPluz
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Quer ver como a LeadPluz se adapta à sua clínica?
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              Fale diretamente com um de nossos especialistas no WhatsApp. Tiramos suas dúvidas e montamos uma demonstração adaptada.
            </p>
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            <a href="https://wa.me/5521976640033?text=Quero%20falar%20com%20um%20especialista%20sobre%20o%20LeadPluz" target="_blank" className="w-full sm:w-auto px-8 py-4 bg-white text-[#10182B] hover:bg-neutral-100 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all hover:scale-105">
              <MessageSquare className="w-4 h-4 text-[#5486F0]" />
              <span>Falar com especialista no WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── 10. Área de Planos (Item 3.12: Tag "Completo", Bullet da IA ajustado, LIA inclusa, sem Google Agenda) ── */}
      <section id="planos" className="py-20 px-6 bg-white border-t border-[#E3E9F5]">
        <div className="mx-auto max-w-4xl space-y-12">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] uppercase">
              <CreditCard className="w-3 h-3" /> Nossos Planos
            </span>
            <h2 className="text-3xl font-black tracking-tight text-[#10182B]">
              Escolha o plano ideal para a sua clínica
            </h2>
            <p className="text-xs text-[#5B6478] max-w-xl mx-auto leading-relaxed">
              Todos os planos incluem acesso completo a todos os recursos do LeadPluz. Teste grátis por 7 dias.
            </p>

            <div className="flex justify-center pt-2">
              <div className="bg-[#F0F4FC] p-1.5 rounded-full border border-[#E3E9F5] flex items-center gap-1">
                <button onClick={() => setBillingPeriod("monthly")} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${billingPeriod === "monthly" ? "bg-[#6C9BFF] text-white shadow-xs" : "text-[#5B6478]"}`}>
                  Faturamento Mensal
                </button>
                <button onClick={() => setBillingPeriod("yearly")} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${billingPeriod === "yearly" ? "bg-[#6C9BFF] text-white shadow-xs" : "text-[#5B6478]"}`}>
                  <span>Faturamento Anual</span>
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">2 MESES GRÁTIS</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-2xl mx-auto text-left">
            {/* Mensal (Tag Completo - Item 3.12) */}
            <div className="bg-white border border-[#E3E9F5] rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-neutral-400 uppercase">Mensal</span>
                  {/* Trocar "Básico" por "Completo" (Item 3.12) */}
                  <span className="text-xs bg-[#DCE7FF] text-[#3B6BE0] px-2.5 py-0.5 rounded-full font-bold">Completo</span>
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-[#10182B]">{billingPeriod === "monthly" ? "R$ 397" : "R$ 327"}</span>
                  <span className="text-xs text-[#5B6478]"> /mês</span>
                </div>
                <p className="text-xs text-[#5B6478] mt-2 leading-relaxed">
                  Perfeito para clínicas e consultórios que querem agilidade sem compromisso de fidelidade.
                </p>
              </div>

              <ul className="text-xs text-[#5B6478] space-y-2 border-t border-[#E3E9F5] pt-4">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> CRM 100% autônomo Kanban no WhatsApp</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Agenda inteligente autônoma</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> LIA — Assistente de IA direto no WhatsApp da equipe</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Assinaturas eletrônicas ilimitadas no chat</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Financeiro e Receita Prevista</li>
              </ul>

              <Link href="/signup" className="block text-center rounded-xl border border-[#E3E9F5] bg-white hover:bg-[#F0F4FC] px-6 py-3 text-xs font-bold text-[#5B6478] transition-colors">
                Inicie seu teste grátis de 7 dias
              </Link>
            </div>

            {/* Anual (Item 3.12: Bullet da IA ajustado) */}
            <div className="bg-white border-2 border-[#6C9BFF] rounded-3xl p-6 shadow-md flex flex-col justify-between space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#6C9BFF] text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Melhor Custo-Benefício
              </div>
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-neutral-400 uppercase">Anual</span>
                  <span className="text-xs bg-blue-50 text-[#6C9BFF] px-2.5 py-0.5 rounded-full font-bold">25% OFF</span>
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-[#10182B]">{billingPeriod === "monthly" ? "R$ 297" : "R$ 247"}</span>
                  <span className="text-xs text-[#5B6478]"> /mês</span>
                  <span className="text-[10px] text-[#5B6478] block mt-1">(Faturamento anual)</span>
                </div>
                <p className="text-xs text-[#5B6478] mt-2 leading-relaxed">
                  Para quem deseja o melhor preço e suporte premium prioritário.
                </p>
              </div>

              <ul className="text-xs text-[#5B6478] space-y-2 border-t border-[#E3E9F5] pt-4">
                <li className="flex items-start gap-2 font-semibold text-neutral-900">
                  <Sparkles className="w-4 h-4 text-[#6C9BFF] shrink-0 mt-0.5" />
                  <span>IA que cria documentos, sugere disparos e estratégias comerciais</span>
                </li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Todos os recursos do plano mensal</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> LIA com prioridade de velocidade</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Suporte VIP dedicado no WhatsApp</li>
              </ul>

              <Link href="/signup" className="block text-center rounded-xl bg-[#6C9BFF] hover:bg-[#5486F0] px-6 py-3 text-xs font-bold text-white transition-all shadow-md">
                Começar agora gratuitamente
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 11. FAQ ── */}
      <section id="faq" className="py-20 px-6 bg-[#F0F4FC]/20 border-t border-[#E3E9F5]">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-[#10182B] mb-4">Perguntas Frequentes</h2>
            <p className="text-xs text-[#5B6478]">Esclareça suas principais dúvidas sobre o funcionamento do LeadPluz.</p>
          </div>
          <div className="space-y-3 text-left">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E3E9F5]/80 overflow-hidden hover:border-[#6C9BFF]/50 transition-all shadow-2xs">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-xs font-bold text-neutral-800 hover:text-[#5486F0] transition-colors focus:outline-none"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                >
                  {faq.q}
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${activeFaq === i ? "rotate-180 text-[#6C9BFF]" : ""}`} />
                </button>
                {activeFaq === i && (
                  <div className="px-5 pb-4 text-xs text-[#5B6478] leading-relaxed border-t border-neutral-50 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. CTA Final ── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#10182B] to-[#1e293b] text-white text-center relative overflow-hidden">
        <div className="relative mx-auto max-w-2xl space-y-6 z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-bold text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            7 dias de teste grátis · Conecte em 2 min
          </div>
          <h2 className="text-4xl font-black">
            Seu WhatsApp mais inteligente.<br />
            <span className="text-[#6C9BFF]">Seu CRM rodando sozinho.</span>
          </h2>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">
            Esqueça digitações e processos manuais. Comece agora a economizar tempo e fechar mais atendimentos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/signup" className="group inline-flex items-center gap-2 bg-[#6C9BFF] hover:bg-[#5486F0] text-white font-bold rounded-xl px-8 py-3.5 text-xs transition-all shadow-xl shadow-blue-900/50">
              Começar agora gratuitamente
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 border border-white/20 hover:bg-white/10 text-white font-bold rounded-xl px-8 py-3.5 text-xs transition-all">
              Já Tenho Conta
            </Link>
          </div>
        </div>
      </section>

      {/* ── 13. Footer ── */}
      <footer className="bg-[#10182B] text-neutral-500 border-t border-white/5 py-8 px-6 text-xs">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#3B6BE0] to-[#6C9BFF] flex items-center justify-center text-white font-bold text-xs">
              <Zap className="w-3 h-3 text-white fill-white/20" />
            </div>
            <span className="text-sm font-bold text-neutral-300 uppercase">LEADPLUZ</span>
          </div>
          <p>© {new Date().getFullYear()} LeadPluz. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <Link href="/termos" className="hover:text-white transition-colors">Termos</Link>
            <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            <Link href="/login" className="hover:text-white transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
