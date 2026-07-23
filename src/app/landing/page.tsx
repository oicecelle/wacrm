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
  Building2,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  UserCheck
} from 'lucide-react';

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
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
    { label: "Follow-up", color: "bg-purple-950/50 border-purple-700/40 text-purple-300" },
    { label: "Resgate", color: "bg-red-950/40 border-red-800/40 text-red-300" },
    { label: "Aniversário", color: "bg-pink-950/40 border-pink-800/40 text-pink-300" },
    { label: "Manutenção", color: "bg-amber-950/40 border-amber-800/40 text-amber-300" },
    { label: "Pós-procedimento", color: "bg-emerald-950/40 border-emerald-800/40 text-emerald-300" },
    { label: "Lembrete", color: "bg-blue-950/40 border-blue-800/40 text-blue-300" },
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

  const allFeatures = [
    { icon: Zap, title: "CRM 100% Autônomo", desc: "Kanban visual com atualização automatizada em tempo real. A conversa acontece no WhatsApp e a IA organiza o funil." },
    { icon: Calendar, title: "Agenda Inteligente Autônoma", desc: "Agendamento, confirmações e reagendamentos efetuados automaticamente direto na conversa com o cliente." },
    { icon: DollarSign, title: "Gestão Financeira Completa", desc: "Controle de receita prevista, sinais de consulta, fluxo de caixa e comissionamento de profissionais." },
    { icon: FileSignature, title: "Assinatura Digital no WhatsApp", desc: "Envio e assinatura jurídica de contratos e termos de consentimento diretamente no chat sem apps terceiros." },
    { icon: Bot, title: "Disparos & Automações 24/7", desc: "Sequências com gatilhos de follow-up, resgate, aniversários, manutenção e lembretes de pós-procedimento." },
    { icon: MessageSquare, title: "LIA — Assistente Interna", desc: "Comande a plataforma por mensagem de texto ou áudio no WhatsApp da própria equipe." },
    { icon: Stethoscope, title: "Prontuário & Evolução", desc: "Registro estruturado do histórico clínico do paciente, observações e arquivos anexados ao perfil." },
    { icon: Building2, title: "Suporte Multiclínica", desc: "Gerencie múltiplas unidades ou filiais dentro do mesmo painel administrativo centralizado." },
    { icon: BarChart2, title: "Relatórios Periódicos", desc: "Relatórios diários, quinzenais e mensais automáticos enviados direto no grupo do WhatsApp da equipe." },
    { icon: ShieldCheck, title: "Isolamento de Dados (RLS)", desc: "Padrão Enterprise com isolamento por conta, criptografia de credenciais e segurança de nível médico." }
  ];

  const faqs = [
    { q: "O que é a LeadPluz e como ela funciona?", a: "A LeadPluz é uma plataforma CRM 100% autônoma integrada ao WhatsApp para clínicas de saúde e estética. Ela captura, atende, agenda e gerencia o funil de leads sem que sua equipe precise digitar dados manualmente no sistema." },
    { q: "Preciso cadastrar meu cartão para testar por 7 dias?", a: "Não! Você pode criar sua conta e usar a plataforma por 7 dias totalmente grátis, sem necessidade de informar cartão de crédito ou dados bancários." },
    { q: "O que é a LIA e como minha equipe a utiliza?", a: "A LIA é a assistente de IA interna da sua equipe. Ela funciona diretamente dentro de uma conversa no WhatsApp da clínica e aceita comandos de voz ou texto para criar agendamentos, tarefas, buscar histórico de pacientes e enviar relatórios." },
    { q: "Como funciona a gestão de agenda da clínica?", a: "A IA cria e gerencia a agenda de forma totalmente autônoma. Se um cliente solicitar reagendamento ou troca de horário no WhatsApp, a própria IA reajusta a vaga e notifica sua equipe." },
    { q: "Meus dados e os dados dos pacientes ficam seguros?", a: "Sim. Adotamos o padrão Enterprise de isolamento de dados por conta (Row Level Security — RLS). Cada clínica tem acesso exclusivo às suas informações com criptografia de ponta a ponta." },
    { q: "Como funciona o envio de contratos e documentos?", a: "A LeadPluz permite enviar termos e contratos diretamente no chat do WhatsApp para assinatura digital com validade jurídica, sem precisar que o paciente instale nada." }
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-[#a0a0b8] font-sans antialiased text-left select-none overflow-x-hidden">
      
      {/* CSS Utility Keyframes */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          width: max-content;
          animation: marquee 35s linear infinite;
        }
        .gradient-text {
          background: linear-gradient(135deg, #ffffff 0%, #c084fc 50%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .btn-gradient {
          background: linear-gradient(135deg, #6b2fb5, #a855f7);
          transition: opacity 0.2s, transform 0.1s, box-shadow 0.2s;
        }
        .btn-gradient:hover {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(139, 69, 212, 0.45);
        }
        .grid-pattern {
          background-image: linear-gradient(rgba(139, 69, 212, 0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(139, 69, 212, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }
      `}</style>

      {/* Background Orbs */}
      <div className="fixed inset-0 grid-pattern opacity-10 pointer-events-none -z-20" />
      <div className="fixed top-[15%] left-[-100px] w-[500px] h-[500px] bg-purple-900/10 rounded-full filter blur-[120px] pointer-events-none -z-30" />
      <div className="fixed top-[45%] right-[-100px] w-[550px] h-[550px] bg-purple-900/10 rounded-full filter blur-[120px] pointer-events-none -z-30" />

      {/* ── 1. Header Navbar (Menu com exatamente 4 itens: Recursos, Planos, Demonstração, FAQ) ── */}
      <header className={`fixed top-0 left-0 w-full h-[70px] z-50 transition-all duration-300 flex items-center justify-between px-6 md:px-12 ${scrolled ? "bg-[#050508]/90 border-b border-[rgba(139,69,212,0.2)] backdrop-blur-lg shadow-xl" : "bg-transparent border-b border-transparent"}`}>
        {/* Logo tipografia oficial */}
        <Link href="/" className="flex items-center space-x-2 group">
          <Zap className="w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors fill-purple-400/20" />
          <span className="text-sm font-extrabold tracking-widest text-white uppercase font-sans">
            LEAD<span className="text-purple-400">PLUZ</span>
          </span>
        </Link>

        {/* Desktop Links (4 itens exatos) */}
        <nav className="hidden md:flex items-center space-x-8 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <a href="#recursos" className="hover:text-purple-300 transition-colors">Recursos</a>
          <a href="#planos" className="hover:text-purple-300 transition-colors">Planos</a>
          <a href="#demonstracao" className="hover:text-purple-300 transition-colors">Demonstração</a>
          <a href="#faq" className="hover:text-purple-300 transition-colors">FAQ</a>
        </nav>

        {/* CTAs */}
        <div className="hidden md:flex items-center space-x-4">
          <Link href="/login" className="px-5 py-2 border border-purple-800/40 rounded-lg text-xs font-bold uppercase tracking-wider text-white hover:bg-purple-950/40 transition-all">
            Login
          </Link>
          <Link href="/signup" className="btn-gradient px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white shadow-md hover:scale-105 transition-all">
            Começar agora
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="fixed top-[70px] left-0 w-full bg-[#050508]/95 border-b border-purple-900/30 backdrop-blur-lg md:hidden flex flex-col px-6 py-6 space-y-4 text-center text-xs font-bold uppercase tracking-wider text-gray-300 z-40">
          <a href="#recursos" onClick={() => setMenuOpen(false)}>Recursos</a>
          <a href="#planos" onClick={() => setMenuOpen(false)}>Planos</a>
          <a href="#demonstracao" onClick={() => setMenuOpen(false)}>Demonstração</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <div className="pt-2 flex flex-col space-y-3">
            <Link href="/login" className="py-2.5 border border-purple-800/40 rounded-lg text-white">Login</Link>
            <Link href="/signup" className="btn-gradient py-2.5 rounded-lg text-white">Começar agora</Link>
          </div>
        </div>
      )}

      {/* ── 2. Hero Section ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-28 pb-16 px-6 md:px-12 overflow-hidden grid-pattern">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
          
          <div className="flex flex-col space-y-6 text-left">
            <div>
              <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
                ✦ CRM 100% Autônomo para Clínicas & Estética
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[58px] font-extrabold tracking-tight leading-[1.1] text-white">
              <span className="gradient-text">Atendimento & Agenda</span><br />
              100% no WhatsApp.
            </h1>

            <p className="text-base md:text-lg text-gray-300 max-w-xl leading-relaxed">
              Sua clínica vende, agenda e organiza leads em tempo real direto nas conversas, sem que sua equipe precise digitar nada no CRM.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <Link href="/signup" className="btn-gradient px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-widest text-white text-center flex items-center justify-center space-x-2 shadow-lg hover:scale-[1.02] transition-all">
                <span>Começar teste grátis</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#demonstracao" className="px-8 py-4 border border-purple-800/40 rounded-xl text-xs font-bold uppercase tracking-widest text-white hover:bg-purple-950/40 transition-all text-center">
                Ver demonstração
              </a>
            </div>

            {/* Texto "Teste sem compromisso" maior e destacado (Item 3.5) */}
            <div className="flex items-center space-x-2.5 pt-1 text-sm font-semibold text-purple-300/90 bg-purple-950/40 border border-purple-800/40 px-4 py-3 rounded-xl max-w-fit shadow-md">
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Teste sem compromisso por 7 dias grátis · Sem cartão de crédito · Configuração em 5 min</span>
            </div>
          </div>

          {/* Hero Mockup (Item 3.6: WhatsApp real + Timeline com "Sinal ainda não pago") */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-[580px] bg-[#090912] border border-purple-800/30 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8),_0_0_40px_rgba(139,69,212,0.2)] flex flex-col font-sans text-left">
              
              {/* Mockup Topbar */}
              <div className="h-10 bg-[#06060c] border-b border-purple-950/40 flex items-center px-4 justify-between">
                <div className="flex space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                </div>
                <div className="flex items-center space-x-2 bg-[#0d0d18] px-3 py-1 rounded border border-purple-900/30 text-[10px] text-gray-400">
                  <Zap className="w-3 h-3 text-purple-400 fill-purple-400/20" />
                  <span className="font-semibold text-white">LeadPluz Sync ● Tempo Real</span>
                </div>
                <span className="text-[9px] text-purple-400 font-mono font-bold bg-purple-950/50 px-2 py-0.5 rounded border border-purple-800/30">
                  Sem Digitação
                </span>
              </div>

              {/* Grid 2 Cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-purple-950/30 min-h-[340px]">
                
                {/* Esquerda: Conversa WhatsApp Atendimento Clínica */}
                <div className="p-4 bg-[#0a0a14] flex flex-col justify-between space-y-3">
                  <div className="flex items-center space-x-3 pb-3 border-b border-purple-950/30">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow">
                      JC
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Juliana Costa</h4>
                      <p className="text-[9px] text-purple-400 font-semibold">• Atendimento Ativo</p>
                    </div>
                  </div>

                  <div className="space-y-3 flex-1 flex flex-col justify-end text-[11px] leading-relaxed">
                    <div className="bg-[#121222] border border-purple-900/25 rounded-2xl rounded-tl-none p-3 text-gray-200 shadow-sm max-w-[90%]">
                      <p className="text-white font-medium">Olá! Gostaria de agendar uma consulta de avaliação estética para esta semana.</p>
                      <span className="text-[8px] text-gray-500 block text-right mt-1 font-mono">14:32</span>
                    </div>

                    <div className="bg-purple-950/40 border border-purple-700/40 rounded-2xl rounded-tr-none p-3 text-purple-100 shadow-sm self-end max-w-[92%]">
                      <div className="flex items-center space-x-1 text-[8px] text-purple-300 font-semibold mb-1 uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                        <span>Resposta Natural da Clínica</span>
                      </div>
                      <p>Com certeza, Juliana! Temos disponibilidade para Quinta-feira às 15:00. Posso reservar esse horário para você?</p>
                      <span className="text-[8px] text-purple-300/60 block text-right mt-1 font-mono">14:32 ✓✓</span>
                    </div>
                  </div>

                  <div className="pt-2 text-[9px] text-gray-500 border-t border-purple-950/20 flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <MessageSquare className="w-3 h-3 text-purple-400" />
                      <span>WhatsApp Web Integrado</span>
                    </span>
                    <span className="text-emerald-400 font-semibold">● Online</span>
                  </div>
                </div>

                {/* Direita: Timeline Sincronizada com Status "Sinal ainda não pago" */}
                <div className="p-4 bg-[#080810] flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-purple-950/30">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span>Timeline Estruturada</span>
                    </span>
                    <span className="text-[8px] font-bold text-green-400 bg-green-950/40 border border-green-800/40 px-2 py-0.5 rounded-full animate-pulse">
                      Atualizando ao vivo
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1">
                    <div className="bg-[#0f0f1c] border border-purple-900/20 p-2.5 rounded-xl space-y-1">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-gray-400 font-bold uppercase flex items-center space-x-1">
                          <UserCheck className="w-3 h-3 text-purple-400" />
                          <span>Interesse Identificado</span>
                        </span>
                        <span className="text-purple-400 font-bold">Score 94/100</span>
                      </div>
                      <p className="text-xs font-bold text-white">Avaliação Estética Facial</p>
                    </div>

                    <div className="bg-[#0f0f1c] border border-purple-900/20 p-2.5 rounded-xl space-y-1">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-gray-400 font-bold uppercase flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-blue-400" />
                          <span>Agendamento Criado</span>
                        </span>
                        <span className="text-blue-400 font-mono text-[9px]">Automatizado</span>
                      </div>
                      <p className="text-xs font-bold text-white">Quinta-feira · 15:00h</p>
                    </div>

                    {/* Status do sinal AINDA NÃO PAGO (Ajustado item 3.6) */}
                    <div className="bg-amber-950/20 border border-amber-500/30 p-2.5 rounded-xl space-y-1">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-amber-400 font-bold uppercase flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                          <span>Status do Sinal</span>
                        </span>
                        <span className="bg-amber-500/20 text-amber-300 font-bold text-[8px] px-1.5 py-0.5 rounded border border-amber-500/30">
                          PENDENTE
                        </span>
                      </div>
                      <p className="text-xs font-bold text-amber-200">Sinal ainda não pago · Lembrete agendado</p>
                    </div>
                  </div>

                  <div className="bg-purple-950/30 border border-purple-800/30 p-2 rounded-lg text-[9px] text-gray-300">
                    IA estrutura dados, cadastra agendamento e agenda follow-up <strong>sem digitação manual</strong>.
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 3. Faixa de Tips Horizontais (Marquee de Benefícios) (Item 3.7) ── */}
      <section className="bg-[#080812] border-y border-purple-950/30 py-6 overflow-hidden w-full select-none relative">
        <div className="max-w-7xl mx-auto px-6 mb-3 text-center">
          <span className="text-[10px] font-extrabold text-purple-400 uppercase tracking-widest flex items-center justify-center space-x-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Vantagens Exclusivas da Plataforma LeadPluz</span>
          </span>
        </div>

        <div className="relative w-full flex items-center overflow-x-hidden py-2">
          <div className="animate-marquee">
            {[...marqueeTips, ...marqueeTips, ...marqueeTips].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="inline-flex items-center space-x-2.5 px-4 py-2 rounded-full bg-purple-950/40 border border-purple-800/35 text-xs font-semibold text-purple-200 shadow-sm shrink-0 mr-4">
                  <Icon className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 4. Segunda Seção — Follow-up & Alertas com Card de Exemplo + Tags (Item 3.8 & 3.9) ── */}
      <section id="recursos" className="py-24 px-6 md:px-12 bg-[#050508] border-b border-purple-950/20">
        <div className="max-w-6xl mx-auto space-y-24">
          
          {/* Header */}
          <div className="text-center space-y-3">
            <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
              CRM & Automação de Atendimento
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
              Follow-up Autônomo & <span className="gradient-text">Zero Leads Perdidos</span>
            </h2>
            <p className="text-sm md:text-base text-gray-400 max-w-xl mx-auto leading-relaxed">
              A IA da LeadPluz identifica o momento exato de interagir com o cliente, envia disparos personalizados e gerencia a agenda da sua clínica de forma autônoma.
            </p>
          </div>

          {/* Grid: Card de Exemplo de Follow-up + Line of Tags */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-6 text-left">
              <div className="space-y-2">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 border border-purple-800/30 px-3 py-1 rounded-full">
                  Gatilhos Inteligentes 24/7
                </span>
                <h3 className="text-2xl md:text-3xl font-extrabold text-white leading-snug">
                  Nenhum lead fica sem resposta ou é esquecido no WhatsApp
                </h3>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">
                O sistema detecta automaticamente quando o lead para de responder e agenda um disparo de acompanhamento totalmente humanizado. Você escolhe quais gatilhos ativar e a IA cuida de toda a esteira de vendas.
              </p>

              {/* Linha de Tags/Pills Coloridas de Disparos Automáticos (Item 3.8) */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">
                  Tipos de Disparos Automáticos Configuráveis:
                </span>
                <div className="flex flex-wrap gap-2">
                  {triggerTags.map((tag, idx) => (
                    <span key={idx} className={`px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${tag.color}`}>
                      • {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Card de Exemplo de Follow-up Programado com Alerta 24h (Item 3.8) */}
            <div className="flex justify-center">
              <div className="w-full max-w-md bg-[#0f0f1a] border border-purple-800/30 rounded-2xl p-6 shadow-2xl space-y-4 text-left">
                <div className="flex items-center justify-between pb-3 border-b border-purple-950/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-700 to-purple-500 flex items-center justify-center font-bold text-white text-sm shadow">
                      MS
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Dr. Marcelo Silva</h4>
                      <span className="text-[10px] text-purple-300 font-medium">Interesse: Tratamento Ortodôntico</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>24h sem resposta</span>
                  </div>
                </div>

                <div className="bg-[#080810] border border-purple-900/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-purple-400 flex items-center space-x-1">
                      <Bot className="w-3 h-3 text-purple-400" />
                      <span>Follow-up Automático Programado</span>
                    </span>
                    <span className="text-[9px] text-green-400 font-mono font-bold">Pronto para Envio</span>
                  </div>

                  <p className="text-xs text-gray-200 leading-relaxed font-sans bg-purple-950/25 p-3 rounded-lg border border-purple-900/20">
                    "Olá Dr. Marcelo! Vi que você ficou de confirmar o horário de avaliação da clínica. Conseguimos reservar uma vaga especial para amanhã às 16h. Vamos confirmar?"
                  </p>

                  <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1">
                    <span>Disparo via WhatsApp da Clínica</span>
                    <span className="text-purple-300 font-semibold">Agendado para 10:00h</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Agenda Autônoma sem Google Calendar (Item 3.9) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center pt-8 border-t border-purple-950/20">
            <div className="flex justify-center order-2 lg:order-1">
              <div className="w-full max-w-md bg-[#0f0f1a] border border-purple-800/30 rounded-2xl p-6 shadow-2xl space-y-4 text-left">
                <div className="flex items-center justify-between pb-3 border-b border-purple-950/30">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-purple-400" />
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Agenda Inteligente Autônoma
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/40 text-[10px] font-bold">
                    Automação WhatsApp
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-[#080810] border border-purple-900/25 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-purple-400 block">14:00h · Confirmado</span>
                      <span className="text-white font-bold text-xs">Juliana Costa — Estética Facial</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-green-950/50 text-green-400 border border-green-800/40 text-[9px] font-bold">
                      Lembrete Enviado
                    </span>
                  </div>

                  <div className="p-3 bg-[#080810] border border-purple-900/25 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-amber-400 block flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 text-amber-400" />
                        <span>16:30h · Remarcado pelo WhatsApp</span>
                      </span>
                      <span className="text-white font-bold text-xs">Camila Rocha — Limpeza de Pele</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/40 text-[9px] font-bold">
                      Reajustado pela IA
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-purple-950/30 border border-purple-800/30 rounded-xl text-[10px] text-purple-200 leading-relaxed">
                  ⚡ <strong>A IA ajusta a agenda de forma 100% autônoma:</strong> Se o cliente solicitar troca de horário ou desmarcar via WhatsApp, a agenda é reajustada instantaneamente.
                </div>
              </div>
            </div>

            <div className="space-y-6 text-left order-1 lg:order-2">
              <div className="space-y-2">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 border border-purple-800/30 px-3 py-1 rounded-full">
                  Gestão de Agenda Autônoma
                </span>
                <h3 className="text-2xl md:text-3xl font-extrabold text-white leading-snug">
                  A IA cria e gerencia a agenda da sua clínica de forma 100% autônoma
                </h3>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">
                Esqueça recepção sobrecarregada ou planilhas desatualizadas. Se o cliente desmarcar ou pedir para mudar a data diretamente na conversa do WhatsApp, a própria IA encontra o próximo horário livre e atualiza os agendamentos.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  "Confirmação de presenças automatizada 24h antes da consulta",
                  "Reagendamento automático direto pelo WhatsApp",
                  "Histórico completo de atendimentos e procedimentos registrados"
                ].map((item, i) => (
                  <div key={i} className="flex items-center space-x-2.5 text-xs text-gray-300">
                    <div className="w-5 h-5 rounded-full bg-purple-900/50 border border-purple-700/40 flex items-center justify-center text-purple-300 font-bold shrink-0">
                      ✓
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 5. Quinta Seção — Carrossel de Funcionalidades Arredondadas (Item 3.10) ── */}
      <section className="py-24 px-6 md:px-12 bg-[#080812] border-b border-purple-950/20 overflow-hidden relative">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 text-left max-w-xl">
              <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
                Recursos da Plataforma
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                Tudo o que sua clínica precisa, <span className="gradient-text">em um único sistema</span>
              </h2>
              <p className="text-xs md:text-sm text-gray-400">
                Arraste para os lados para explorar as funcionalidades autônomas da LeadPluz.
              </p>
            </div>

            <div className="flex items-center space-x-3 shrink-0">
              <button onClick={() => handleCarouselScroll('left')} className="w-10 h-10 rounded-full bg-purple-950/40 border border-purple-800/35 flex items-center justify-center text-purple-300 hover:bg-purple-900/40 transition-all cursor-pointer">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => handleCarouselScroll('right')} className="w-10 h-10 rounded-full bg-purple-950/40 border border-purple-800/35 flex items-center justify-center text-purple-300 hover:bg-purple-900/40 transition-all cursor-pointer">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cards do Carrossel (Financeiro, Assinatura Digital, Feed Indicadores) */}
          <div ref={scrollRef} className="flex space-x-6 overflow-x-auto pb-6 pt-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {carouselCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <div key={idx} className="w-[320px] md:w-[360px] shrink-0 bg-[#0e0e1c] border border-purple-900/30 hover:border-purple-500/50 rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-xl transition-all group text-left">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-400 group-hover:text-purple-300 group-hover:scale-110 transition-all">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 bg-purple-950/50 border border-purple-800/30 px-2.5 py-1 rounded-full">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white tracking-wide">{card.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
                  </div>

                  <div className="border-t border-purple-950/40 pt-4 space-y-2">
                    {card.bullets.map((b, bIdx) => (
                      <div key={bIdx} className="flex items-center space-x-2 text-[11px] text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
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

      {/* ── 6. Seção Destacada — LIA (Assistente de IA no WhatsApp) (Item 3.11) ── */}
      <section className="relative py-24 px-6 md:px-12 bg-gradient-to-br from-[#1b0838] via-[#0d061c] to-[#050508] border-b border-purple-500/30 overflow-hidden text-left">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          
          <div className="space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              <span>Assistente Interna da Equipe</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
              Conheça a <span className="gradient-text">LIA</span>: Sua Assistente de IA dentro do WhatsApp
            </h2>

            <p className="text-sm md:text-base text-gray-300 leading-relaxed">
              A LIA não fala com o seu cliente — <strong>ela é o copiloto da sua equipe</strong>. Dentro do WhatsApp da própria clínica, você ou seus atendentes comandam o CRM usando <strong>mensagens de texto ou áudio</strong>.
            </p>

            <div className="p-4 rounded-2xl bg-purple-950/60 border border-purple-500/30 space-y-2">
              <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                <BarChart2 className="w-4 h-4 text-purple-400" />
                <span>Relatórios Automáticos no seu WhatsApp</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Receba os relatórios dos principais indicadores da clínica de forma 100% automática: <strong>diariamente, quinzenalmente e mensalmente</strong>, direto no grupo da sua equipe.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md bg-[#0a0a14] border-2 border-purple-500/40 rounded-3xl p-5 shadow-[0_0_60px_rgba(168,85,247,0.25)] space-y-4">
              <div className="flex items-center space-x-3 pb-3 border-b border-purple-900/30">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center text-white shadow-lg shrink-0 font-bold">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white flex items-center space-x-1.5">
                    <span>LIA — Copiloto LeadPluz</span>
                    <span className="bg-purple-500/30 border border-purple-400/40 text-purple-300 text-[8px] font-bold px-1.5 py-0.5 rounded">IA Ativa</span>
                  </h4>
                  <p className="text-[10px] text-gray-400 flex items-center space-x-1">
                    <Mic className="w-3 h-3 text-purple-400" />
                    <span>Aceita comandos de texto e áudio</span>
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                  Exemplos de comandos executados no chat:
                </span>
                {liaCommands.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <div key={i} className="p-3 rounded-xl bg-[#120b24] border border-purple-800/30 space-y-1">
                      <div className="flex items-center space-x-2 text-xs font-semibold text-purple-200">
                        <Icon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{c.cmd}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 pl-5">
                        ↳ <strong>Ação executada:</strong> {c.action}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] text-purple-300 font-bold text-center pt-2 border-t border-purple-950/40">
                ⚡ Sem precisar abrir sistemas lentos — resolva tudo em segundos pelo celular.
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 7. Nova Seção — "Todos os recursos" (Grid Completo do PRD) (Item 3.14) ── */}
      <section className="py-24 px-6 md:px-12 bg-[#050508] border-b border-purple-950/20 text-left">
        <div className="max-w-6xl mx-auto space-y-16">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
              Todos os Recursos
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
              Ecossistema completo para <span className="gradient-text">escalar sua clínica</span>
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Desenvolvido especificamente para o mercado de saúde, beleza e estética.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allFeatures.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div key={idx} className="p-6 rounded-2xl bg-[#0d0d1a] border border-purple-900/25 hover:border-purple-500/40 transition-all space-y-3 group">
                  <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-400 group-hover:text-purple-300 group-hover:scale-110 transition-all">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-wide">{feat.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 8. Demonstração em Ação ── */}
      <section id="demonstracao" className="py-24 px-6 md:px-12 bg-[#080812] border-b border-purple-950/20 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-3">
            <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
              Demonstração ao Vivo
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
              Veja a <span className="gradient-text">LeadPluz</span> em Ação
            </h2>
            <p className="text-sm text-gray-400 max-w-lg mx-auto">
              Assista como a busca de contatos e a esteira de atendimento funcionam de forma 100% autônoma.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#0f0f1c] border border-purple-800/30 max-w-2xl mx-auto shadow-2xl space-y-6">
            <div className="aspect-video bg-[#050508] rounded-2xl border border-purple-900/30 flex items-center justify-center relative overflow-hidden group">
              <div className="w-16 h-16 rounded-full bg-purple-600/80 border border-purple-400 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform cursor-pointer">
                ▶
              </div>
              <span className="absolute bottom-4 left-4 text-xs font-bold text-gray-300 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md">
                Demonstração da Plataforma · 2:15 min
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center border-t border-purple-950/40 pt-4">
              <div>
                <span className="text-lg font-extrabold text-white block">100%</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase">No WhatsApp</span>
              </div>
              <div className="border-x border-purple-950/40">
                <span className="text-lg font-extrabold text-white block">0h</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Digitação no CRM</span>
              </div>
              <div>
                <span className="text-lg font-extrabold text-white block">24/7</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Autônomo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Faixa Chamativa — Fale com um Especialista (Item 3.15) ── */}
      <section className="relative py-16 px-6 md:px-12 bg-gradient-to-r from-purple-950 via-[#180833] to-[#0d061c] border-y border-purple-500/30 text-left">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-purple-300" />
              <span>Consultoria Especializada LeadPluz</span>
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">
              Quer ver como a LeadPluz se adapta à sua clínica?
            </h2>
            <p className="text-xs md:text-sm text-gray-300 leading-relaxed">
              Fale diretamente com um de nossos especialistas em automação comercial no WhatsApp. Tiramos suas dúvidas e montamos uma demonstração ao vivo adaptada ao seu fluxo.
            </p>
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            <Link href="https://wa.me/5521976640033?text=Quero%20falar%20com%20um%20especialista%20sobre%20o%20LeadPluz" target="_blank" className="w-full sm:w-auto px-8 py-4 bg-white text-[#050508] hover:bg-gray-100 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center space-x-2 shadow-2xl transition-all hover:scale-105">
              <MessageSquare className="w-4 h-4 text-purple-700 fill-purple-700/20" />
              <span>Falar com especialista no WhatsApp</span>
              <ArrowRight className="w-4 h-4 text-[#050508]" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 10. Área de Planos (Item 3.12: Tag "Completo", Bullet IA ajustado no Anual, LIA inclusa) ── */}
      <section id="planos" className="py-24 px-6 md:px-12 bg-[#050508] border-b border-purple-950/20 text-center">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="space-y-4">
            <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
              Planos e Assinatura
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
              Escolha o plano ideal para a <span className="gradient-text">sua clínica</span>
            </h2>
            <p className="text-sm text-gray-400 max-w-lg mx-auto">
              Sem pegadinhas ou recursos bloqueados. Todos os planos contam com acesso ilimitado a todas as ferramentas.
            </p>

            <div className="flex justify-center pt-2">
              <div className="bg-[#0e0e1a] p-1.5 rounded-full border border-purple-800/30 flex items-center space-x-1">
                <button onClick={() => setBillingPeriod("monthly")} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${billingPeriod === "monthly" ? "bg-purple-600 text-white shadow-md" : "text-gray-400 hover:text-white"}`}>
                  Faturamento Mensal
                </button>
                <button onClick={() => setBillingPeriod("yearly")} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1.5 ${billingPeriod === "yearly" ? "bg-purple-600 text-white shadow-md" : "text-gray-400 hover:text-white"}`}>
                  <span>Faturamento Anual</span>
                  <span className="bg-emerald-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full">2 MESES GRÁTIS</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
            {/* Mensal (Tag Completo - Item 3.12) */}
            <div className="p-8 rounded-3xl bg-[#0e0e1c] border border-purple-800/30 hover:border-purple-500/50 transition-all flex flex-col justify-between space-y-8 shadow-xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest bg-purple-950/60 border border-purple-700/40 text-purple-300 px-3 py-1 rounded-full">
                    ✦ Completo
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">Sem fidelidade</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-white">Plano Mensal Completo</h3>
                  <p className="text-xs text-gray-400">Todos os módulos inclusos sem restrições</p>
                </div>

                <div className="flex items-baseline space-x-2 border-b border-purple-900/30 pb-6">
                  <span className="text-4xl font-black text-white font-mono">{billingPeriod === "monthly" ? "R$ 197" : "R$ 164"}</span>
                  <span className="text-xs text-gray-400">/mês</span>
                </div>

                <ul className="space-y-2.5 text-xs text-gray-300">
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> CRM 100% Autônomo Kanban + WhatsApp</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Agenda Inteligente Autônoma (marcações e lembretes)</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> LIA — Assistente de IA direta no WhatsApp da equipe</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Assinatura digital de contratos no WhatsApp</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Financeiro Completo (receita prevista, sinais, comissões)</li>
                </ul>
              </div>

              <Link href="/signup" className="btn-gradient w-full py-4 rounded-xl text-xs font-extrabold uppercase tracking-widest text-white text-center block shadow-lg hover:scale-[1.02] transition-all">
                Começar Teste Grátis de 7 Dias 🚀
              </Link>
            </div>

            {/* Anual (Bullet IA ajustado - Item 3.12) */}
            <div className="p-8 rounded-3xl bg-gradient-to-b from-[#180933] to-[#0a0518] border-2 border-purple-500/60 shadow-[0_0_50px_rgba(139,69,212,0.3)] flex flex-col justify-between space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-bl-xl shadow-md">
                ✦ Melhor Custo-Benefício
              </div>

              <div className="space-y-6 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest bg-purple-500/20 border border-purple-400/40 text-purple-200 px-3 py-1 rounded-full">
                    ✦ Anual Econômico
                  </span>
                  <span className="text-xs text-emerald-400 font-bold">Economize 20%</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-white">Plano Anual Pro</h3>
                  <p className="text-xs text-gray-300">Para clínicas que buscam aceleração máxima</p>
                </div>

                <div className="flex items-baseline space-x-2 border-b border-purple-900/30 pb-6">
                  <span className="text-4xl font-black text-white font-mono">{billingPeriod === "monthly" ? "R$ 147" : "R$ 127"}</span>
                  <span className="text-xs text-gray-400">/mês em 12x</span>
                </div>

                <ul className="space-y-2.5 text-xs text-gray-200">
                  <li className="flex items-start space-x-2.5 font-semibold text-white">
                    <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <span>IA que cria documentos, sugere disparos e estratégias comerciais</span>
                  </li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Todos os recursos do plano Mensal</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> LIA com prioridade de velocidade</li>
                  <li className="flex items-center space-x-2.5"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Suporte VIP dedicado no WhatsApp</li>
                </ul>
              </div>

              <Link href="/signup" className="w-full py-4 bg-white text-[#050508] hover:bg-gray-100 rounded-xl text-xs font-black uppercase tracking-widest text-center block shadow-xl transition-all hover:scale-[1.02]">
                Assinar Plano Anual ⚡
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 11. FAQ Accordion ── */}
      <section id="faq" className="py-24 px-6 md:px-12 bg-[#050508] border-b border-purple-950/20 text-left">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-widest">
              Dúvidas Frequentes
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white">Perguntas <span className="gradient-text">Frequentes</span></h2>
            <p className="text-xs text-gray-400">Tudo o que você precisa saber sobre a LeadPluz antes de começar.</p>
          </div>

          <div className="space-y-4 pt-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="border-b border-purple-950/20 py-1">
                <button onClick={() => setActiveFaq(activeFaq === idx ? null : idx)} className="w-full flex justify-between items-center py-4 text-sm font-bold text-white uppercase tracking-wider hover:text-purple-300 transition-colors">
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-purple-400 transition-transform ${activeFaq === idx ? "rotate-180" : ""}`} />
                </button>
                {activeFaq === idx && (
                  <p className="text-xs md:text-sm text-gray-400 leading-relaxed pb-4 pr-6">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. Final CTA ── */}
      <section className="py-24 px-6 md:px-12 bg-gradient-to-b from-[#0a0a0f] to-[#050508] text-center flex flex-col items-center">
        <div className="max-w-3xl mx-auto space-y-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/40 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-xl">
            <Zap className="w-8 h-8 fill-purple-400/20" />
          </div>

          <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
            Sua clínica pronta para <br />
            <span className="gradient-text">vender no piloto automático</span>
          </h2>

          <p className="text-sm text-gray-300 max-w-lg leading-relaxed">
            Comece agora mesmo seu teste de 7 dias grátis. Configuração rápida em 5 minutos e sem necessidade de cartão de crédito.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <Link href="/signup" className="px-10 py-4 bg-white text-[#050508] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all shadow-2xl flex items-center justify-center space-x-2">
              <span>Criar conta grátis agora</span>
              <ArrowRight className="w-4 h-4 text-[#050508]" />
            </Link>
            <Link href="https://wa.me/5521976640033?text=Quero%20saber%20mais%20sobre%20o%20LeadPluz" target="_blank" className="px-8 py-4 border border-purple-800/40 rounded-xl text-xs font-bold uppercase tracking-widest text-white hover:bg-purple-950/40 transition-all flex items-center justify-center space-x-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              <span>Falar com o suporte</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 13. Footer ── */}
      <footer className="bg-[#050508] border-t border-purple-950/20 pt-16 pb-8 px-6 md:px-12 font-sans select-none text-left">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 pb-12 border-b border-purple-950/15">
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-purple-400 fill-purple-400/20" />
              <span className="text-sm font-extrabold tracking-widest text-white uppercase">
                LEAD<span className="text-purple-400">PLUZ</span>
              </span>
            </Link>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
              CRM 100% autônomo e integrado ao WhatsApp para clínicas de saúde, beleza e estética.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-extrabold text-white uppercase tracking-widest">Navegação</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><a href="#recursos" className="hover:text-purple-300 transition-colors">Recursos da plataforma</a></li>
              <li><a href="#planos" className="hover:text-purple-300 transition-colors">Planos de assinatura</a></li>
              <li><a href="#demonstracao" className="hover:text-purple-300 transition-colors">Demonstração em vídeo</a></li>
              <li><a href="#faq" className="hover:text-purple-300 transition-colors">Perguntas Frequentes</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-extrabold text-white uppercase tracking-widest">Plataforma</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><Link href="/login" className="hover:text-purple-300 transition-colors font-semibold text-gray-400">Entrar na Conta (Login)</Link></li>
              <li><Link href="/signup" className="hover:text-purple-300 transition-colors font-semibold text-purple-400">Criar Conta Grátis</Link></li>
              <li><a href="https://wa.me/5521976640033" target="_blank" className="hover:text-purple-300 transition-colors">Suporte via WhatsApp</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-extrabold text-white uppercase tracking-widest">Legal</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><Link href="/termos" className="hover:text-purple-300">Termos de uso</Link></li>
              <li><Link href="/privacidade" className="hover:text-purple-300">Política de privacidade</Link></li>
              <li><span className="text-gray-600 block">LGPD Enterprise Compliance</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-gray-600 gap-4">
          <span>© {new Date().getFullYear()} LEADPLUZ. Todos os direitos reservados.</span>
          <span>Feito com excelência 🇧🇷</span>
        </div>
      </footer>

    </div>
  );
}
