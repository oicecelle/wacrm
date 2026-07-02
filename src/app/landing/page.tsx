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
  Star,
  Menu,
  X,
  Sparkles,
  TrendingUp,
  ChevronDown,
  DollarSign,
  Bot,
  RefreshCw,
  Bell,
  Clock,
  CheckCircle2,
  Activity
} from 'lucide-react';
import { FeaturePreview } from '@/components/landing/feature-previews';

/* ─── Animated counter ───────────────────────────────────────── */
function Counter({ end, suffix = "", duration = 1800 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [started, end, duration]);

  return <span ref={ref}>{count.toLocaleString("pt-BR")}{suffix}</span>;
}

/* ─── WhatsApp Chat Demo ─────────────────────────────────────── */
function ChatDemo() {
  const messages = [
    { from: "client", text: "Oi! Quero marcar uma consulta na quinta às 14h. Sou a Juliana." },
    { from: "ai", text: "✅ CRM alimentado e atualizado sozinho", sub: "Juliana Costa • Lead Quente • Objeção: Nenhuma" },
    { from: "bot", text: "Olá Juliana! Quinta às 14h está agendado com o Dr. Marcos. Já enviei seu termo de consentimento!" },
    { from: "ai", text: "📅 Agenda e Financeiro integrados", sub: "Quinta 14:00 • Link do contrato enviado • Receita prevista atualizada" },
    { from: "client", text: "Perfeito! Termo assinado pelo celular." },
    { from: "ai", text: "✍️ Documento assinado automaticamente", sub: "Status: Assinado • Lead Score: 95 pts" },
  ];

  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(v => {
        if (v >= messages.length - 1) { setTimeout(() => setVisible(0), 2000); return v; }
        return v + 1;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative bg-white rounded-3xl border border-neutral-200/80 shadow-lg overflow-hidden max-w-sm mx-auto text-left">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#5486F0] text-white">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">LP</div>
        <div>
          <div className="text-xs font-bold">Assistente IA LeadPluz</div>
          <div className="text-[10px] text-blue-100 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
            online e monitorando
          </div>
        </div>
      </div>
      {/* Messages */}
      <div className="p-4 space-y-3 min-h-[290px] bg-[#f0f4fc]/40">
        {messages.slice(0, visible + 1).map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.from === "client" ? "justify-start" : "justify-end"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            {msg.from === "ai" ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 max-w-[85%]">
                <div className="text-[10px] font-bold text-blue-700 flex items-center gap-1">
                  <Bot className="w-3 h-3 animate-pulse" /> LeadPluz IA
                </div>
                <div className="text-xs font-semibold text-blue-900 mt-0.5">{msg.text}</div>
                {msg.sub && <div className="text-[10px] text-blue-600 mt-0.5">{msg.sub}</div>}
              </div>
            ) : msg.from === "bot" ? (
              <div className="bg-emerald-50 rounded-xl px-3 py-2 max-w-[85%] border border-emerald-100">
                <div className="text-xs text-neutral-700 leading-relaxed">{msg.text}</div>
                <div className="text-[9px] text-emerald-600 text-right mt-1 flex items-center justify-end gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Disparo automático
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl px-3 py-2 max-w-[75%] border border-neutral-100 shadow-2xs">
                <div className="text-xs text-neutral-700">{msg.text}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── CRM Card Demo ──────────────────────────────────────────── */
function CRMCard() {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-lg p-4 max-w-xs text-left mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">CRM de Contato Automatizado</div>
        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
          <Activity className="w-2.5 h-2.5 animate-pulse" /> IA ativa
        </span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">JC</div>
        <div>
          <div className="text-sm font-bold text-neutral-900">Juliana Costa</div>
          <div className="text-[10px] text-neutral-400">Estágio: Contatada · Lead Score: 95</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Estágio", value: "🔥 Quente", color: "text-orange-600 bg-orange-50" },
          { label: "Assinatura", value: "✓ Assinado", color: "text-emerald-600 bg-emerald-50" },
          { label: "Horário", value: "Quinta 14h", color: "text-blue-600 bg-blue-50" },
          { label: "Sinal Pago", value: "R$ 150,00", color: "text-teal-600 bg-teal-50" },
        ].map((item) => (
          <div key={item.label} className="bg-neutral-50 rounded-lg p-2 border border-neutral-100">
            <div className="text-[8px] text-neutral-400 uppercase tracking-wider">{item.label}</div>
            <div className={`text-[10px] font-bold mt-0.5 ${item.color} px-1.5 py-0.5 rounded-md inline-block`}>{item.value}</div>
          </div>
        ))}
      </div>
      <div className="text-[9px] text-blue-600 bg-blue-50/50 border border-blue-100/50 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
        <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
        <span><b>Resumo da IA:</b> Juliana assinou o termo digitalmente, pagou o sinal de R$ 150 e a consulta está agendada. Ação manual necessária: Nenhuma.</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const faqs = [
    { q: "O que torna o LeadPluz diferente de outros sistemas?", a: "Ao contrário dos CRMs tradicionais que exigem alimentação manual de dados o dia todo, o LeadPluz é inteligente e conectado ao WhatsApp. Ele escuta as conversas, atualiza a ficha dos contatos, insere consultas na agenda, gera faturas financeiras e envia links de termos para assinatura de forma 100% autônoma." },
    { q: "Preciso instalar algo no meu computador?", a: "Não. O LeadPluz roda inteiramente na nuvem. Basta ler o QR Code do seu WhatsApp para conectar a conta e ter acesso a todo o painel de forma instantânea." },
    { q: "Ele integra com o Google Calendar?", a: "Sim, integração nativa bilateral. Qualquer consulta criada ou alterada pelo assistente reflete na sua conta Google e vice-versa, mantendo os horários sempre corretos e enviando alertas automáticos." },
    { q: "Consigo cadastrar vários profissionais da minha equipe?", a: "Com certeza. Você pode criar acessos individuais e permissões granulares para médicos, esteticistas, secretárias e equipe de vendas, dividindo agendas e acompanhando históricos." },
    { q: "Como o paciente assina o contrato ou termo de consentimento?", a: "O robô gera o link único e envia pelo WhatsApp. O paciente clica, confere os dados e assina desenhando com o dedo no próprio celular. A assinatura fica registrada na timeline do contato na hora." },
  ];

  return (
    <div className="min-h-screen bg-[#FAFBFF] text-[#10182B] font-sans antialiased text-left selection:bg-blue-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        body { font-family: 'Outfit', sans-serif; }
        .fade-up { animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .glow-blue { box-shadow: 0 0 60px -10px rgba(108, 155, 255, 0.2); }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .float { animation: float 4s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
        
        .feature-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 3rem;
          align-items: center;
        }
        @media (min-width: 768px) {
          .feature-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* ── Navbar ── */}
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/80 backdrop-blur-md border-b border-[#E3E9F5]/80 shadow-xs" : "bg-transparent"}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6C9BFF] shadow-xs">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-tight text-[#10182B] uppercase">LeadPluz</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {["Diferenciais", "Gestão de Leads", "Agenda Inteligente", "Financeiro", "FAQ"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/\s/g, "-")}`}
                className="text-xs font-bold text-[#5B6478] hover:text-[#5486F0] transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="rounded-xl px-4 py-2 text-xs font-bold text-[#5B6478] hover:bg-[#F0F4FC] transition-colors">Entrar</Link>
            <Link href="/signup" className="rounded-xl bg-[#6C9BFF] px-4 py-2 text-xs font-bold text-white hover:bg-[#5486F0] transition-all shadow-xs">
              Começar Grátis →
            </Link>
          </div>
          <button className="md:hidden p-2 rounded-lg hover:bg-[#F0F4FC]" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-[#E3E9F5] px-6 py-4 space-y-3">
            {["Diferenciais", "Gestão de Leads", "Agenda Inteligente", "Financeiro", "FAQ"].map((l) => (
              <a key={l} href={`#${l.toLowerCase().replace(/\s/g, "-")}`} onClick={() => setMenuOpen(false)} className="block text-sm font-bold text-[#5B6478] hover:text-[#5486F0] py-1">{l}</a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/login" className="flex-1 text-center rounded-xl border border-[#E3E9F5] px-4 py-2 text-xs font-bold text-[#5B6478]">Entrar</Link>
              <Link href="/signup" className="flex-1 text-center rounded-xl bg-[#6C9BFF] px-4 py-2 text-xs font-bold text-white">Criar Conta</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DCE7FF]/40 via-transparent to-violet-50/20 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-[#DCE7FF]/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-[#F0F4FC]/50 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-5xl">
          <div className="text-center mb-16 fade-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#DCE7FF] border border-[#6C9BFF]/20 px-4 py-1.5 text-xs font-bold text-[#3B6BE0] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6C9BFF] pulse-dot" />
              O Único CRM 100% Autônomo e Integrado ao WhatsApp
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-[#10182B] leading-[1.08] mb-6">
              Seu WhatsApp alimenta o CRM,<br />
              <span className="text-[#6C9BFF]">tudo de forma autônoma.</span>
            </h1>

            <p className="text-base sm:text-lg text-[#5B6478] max-w-2xl mx-auto leading-relaxed mb-10">
              Diga adeus à alimentação manual de planilhas. Nosso diferencial é um **CRM inteligente e automatizado** onde cada conversa pelo WhatsApp vira dado estruturado na hora. Acompanhe a **agenda, assinaturas digitais, financeiro** e o progresso do lead sem levantar um dedo.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl bg-[#6C9BFF] px-6 py-3 text-xs font-bold text-white hover:bg-[#5486F0] transition-all shadow-md shadow-blue-300/35 glow-blue"
              >
                Iniciar meu teste grátis de 7 dias
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/login" className="flex items-center gap-2 rounded-xl border border-[#E3E9F5] px-6 py-3 text-xs font-bold text-[#5B6478] hover:bg-[#F0F4FC] transition-colors bg-white">
                Entrar no Painel
              </Link>
            </div>
            <p className="text-[10px] text-neutral-400 mt-3">Teste sem compromisso por 7 dias grátis · Sem cartão de crédito · Integração em 5 min</p>
          </div>

          {/* Demo Grid */}
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-3xl mx-auto">
            <div className="float" style={{ animationDelay: "0s" }}>
              <ChatDemo />
            </div>
            <div className="float" style={{ animationDelay: "0.5s" }}>
              <CRMCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 px-6 border-y border-[#E3E9F5] bg-white">
        <div className="mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { n: 120, s: "+", label: "Clínicas Ativas" },
            { n: 99, s: "%", label: "Fidelidade de Dados" },
            { n: 4, s: "h/dia", label: "Poupadas de Trabalho" },
            { n: 68, s: "%", label: "Conversão de Leads" },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-2xl sm:text-3xl font-black text-[#10182B]">
                <Counter end={item.n} suffix={item.s} />
              </div>
              <div className="text-xs text-[#5B6478] mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 1: CRM INTELIGENTE & FOLLOW-UP ── */}
      <section id="diferenciais" className="py-24 px-6 border-b border-[#E3E9F5] bg-white">
        <div className="mx-auto max-w-4xl">
          <div className="feature-grid">
            {/* Texto */}
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] border border-[#6C9BFF]/10 uppercase">
                <Sparkles className="w-3 h-3" /> CRM Inteligente e Follow-up
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B] leading-tight">
                Você nunca mais vai perder um lead por falta de resposta.
              </h2>
              <p className="text-xs text-[#5B6478] leading-relaxed">
                O bot inteligente monitora os leads frios e atua enviando alertas, disparando follow-ups personalizados e avisando a equipe no momento perfeito. Nunca mais um lead esfria no seu funil sem ninguém perceber.
              </p>
              <div className="space-y-3 pt-2">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#DCE7FF] flex items-center justify-center shrink-0 text-[#3B6BE0]">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-800">Filtro Inteligente de Estado</h4>
                    <p className="text-[11px] text-[#5B6478] mt-0.5">A IA analisa a intenção da mensagem e atualiza o funil de forma 100% dinâmica.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center shrink-0 text-pink-600">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-800">Alertas e Alinhamentos</h4>
                    <p className="text-[11px] text-[#5B6478] mt-0.5">Identifica objeções complexas ou clientes frios e notifica o painel instantaneamente.</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Visual Preview */}
            <div className="glow-blue rounded-3xl p-1 bg-[#F0F4FC]/40">
              <FeaturePreview variant="crm" />
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: GESTÃO DE LEADS (CRM STAGE) ── */}
      <section id="gestão-de-leads" className="py-24 px-6 bg-[#F0F4FC]/30 border-b border-[#E3E9F5]">
        <div className="mx-auto max-w-4xl">
          <div className="feature-grid">
            {/* Visual Preview */}
            <div className="order-2 md:order-1 glow-blue rounded-3xl p-1 bg-white">
              <FeaturePreview variant="leads" />
            </div>
            {/* Texto */}
            <div className="space-y-5 order-1 md:order-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] border border-[#6C9BFF]/10 uppercase">
                <Users className="w-3 h-3" /> Gestão Avançada de Leads
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B] leading-tight">
                Quem é Lead e quem virou Cliente? A IA sabe tudo.
              </h2>
              <p className="text-xs text-[#5B6478] leading-relaxed">
                Mapeie a jornada exata de conversão de cada contato. Identifique objeções de preço ou horário, principais buscas e compare o crescimento da clínica contra o mês anterior de forma 100% automatizada.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                <div className="bg-white border border-[#E3E9F5] p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-neutral-400 uppercase">Conversões</span>
                  <p className="text-sm font-bold text-neutral-800 mt-1">Taxa Alta</p>
                </div>
                <div className="bg-white border border-[#E3E9F5] p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-neutral-400 uppercase">Objeções</span>
                  <p className="text-sm font-bold text-neutral-800 mt-1">Catalogadas</p>
                </div>
                <div className="bg-white border border-[#E3E9F5] p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-neutral-400 uppercase">Crescimento</span>
                  <p className="text-sm font-bold text-neutral-800 mt-1">Mês vs Mês</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: AGENDA E AGENDAMENTO INTELIGENTE ── */}
      <section id="agenda-inteligente" className="py-24 px-6 border-b border-[#E3E9F5] bg-white">
        <div className="mx-auto max-w-4xl">
          <div className="feature-grid">
            {/* Texto */}
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase">
                <Calendar className="w-3 h-3" /> Agenda e Reservas Online
              </span>
              <h2 className="text-3xl font-black tracking-tight text-[#10182B] leading-tight">
                Nunca mais esqueça um agendamento ou perca retornos.
              </h2>
              <p className="text-xs text-[#5B6478] leading-relaxed">
                O assistente cria e gerencia consultas de forma autônoma. Se o cliente desmarcar ou remarcar pelo WhatsApp, a agenda é ajustada e liberada na hora sem intervenção humana.
              </p>
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-[#5B6478]">Integração 100% bidirecional com o Google Calendar.</p>
                </div>
                <div className="flex gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-[#5B6478]">Disparo automático de lembretes, confirmação de horários e retornos.</p>
                </div>
              </div>
            </div>
            {/* Visual Preview */}
            <div className="glow-blue rounded-3xl p-1 bg-[#F0F4FC]/40">
              <FeaturePreview variant="scheduling" />
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: FINANCEIRO AVANÇADO ── */}
      <section id="financeiro" className="py-24 px-6 bg-[#10182B] text-white rounded-[40px] mx-4 my-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(108,155,255,0.1)_0%,_transparent_70%)] pointer-events-none" />
        <div className="mx-auto max-w-4xl relative z-10">
          <div className="feature-grid">
            {/* Visual Preview */}
            <div className="order-2 md:order-1 rounded-3xl p-1 bg-white/5 border border-white/10">
              <FeaturePreview variant="financeiro" />
            </div>
            {/* Texto */}
            <div className="space-y-5 order-1 md:order-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20 uppercase">
                <DollarSign className="w-3 h-3" /> Financeiro e Receita
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white leading-tight">
                Previsão de Receita e Controle Financeiro Simplificado.
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Monitore a receita prevista da sua clínica, controle orçamentos gerados pela IA nas conversas e valide sinais e depósitos pagos pelos clientes automaticamente.
              </p>
              <div className="space-y-2 text-xs text-neutral-300 border-t border-white/10 pt-4">
                <p>✓ Propostas e contratos gerados de forma automática com base no escopo combinado.</p>
                <p>✓ Controle rígido de sinais e depósitos de segurança para procedimentos agendados.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: PLANOS E PREÇOS ── */}
      <section id="planos" className="py-20 px-6 bg-white border-t border-[#E3E9F5]">
        <div className="mx-auto max-w-4xl space-y-12">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#DCE7FF] text-[#3B6BE0] border border-[#6C9BFF]/15 uppercase">
              <CreditCard className="w-3 h-3" /> Nossos Planos
            </span>
            <h2 className="text-3xl font-black tracking-tight text-[#10182B]">
              Escolha o plano ideal para a sua clínica
            </h2>
            <p className="text-xs text-[#5B6478] max-w-xl mx-auto leading-relaxed">
              Todos os planos incluem acesso completo a todos os recursos do LeadPluz. Teste grátis por 7 dias.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-2xl mx-auto">
            {/* Monthly */}
            <div className="bg-card border border-[#E3E9F5] rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-neutral-400 uppercase">Mensal</span>
                  <span className="text-xs bg-[#F0F4FC] px-2.5 py-0.5 rounded-full font-bold text-[#5B6478]">Básico</span>
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-[#10182B]">R$ 397</span>
                  <span className="text-xs text-[#5B6478]"> /mês</span>
                </div>
                <p className="text-xs text-[#5B6478] mt-2 leading-relaxed">
                  Perfeito para clínicas e consultórios que querem agilidade sem compromisso de fidelidade.
                </p>
              </div>
              <ul className="text-xs text-[#5B6478] space-y-2 border-t border-[#E3E9F5] pt-4">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> CRM inteligente e autônomo</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Integração oficial e não oficial de WhatsApp</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Agenda e Google Agenda automática</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Assinaturas eletrônicas ilimitadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Financeiro e Receita Prevista</li>
              </ul>
              <Link href="/signup" className="block text-center rounded-xl border border-[#E3E9F5] bg-white hover:bg-[#F0F4FC] px-6 py-3 text-xs font-bold text-[#5B6478] transition-colors">
                Inicie seu teste grátis de 7 dias
              </Link>
            </div>

            {/* Annual */}
            <div className="bg-card border-2 border-[#6C9BFF] rounded-3xl p-6 shadow-md flex flex-col justify-between space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#6C9BFF] text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Melhor Custo-Benefício
              </div>
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-neutral-400 uppercase">Anual</span>
                  <span className="text-xs bg-blue-50 text-[#6C9BFF] px-2.5 py-0.5 rounded-full font-bold">25% OFF</span>
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-black text-[#10182B]">R$ 297</span>
                  <span className="text-xs text-[#5B6478]"> /mês</span>
                  <span className="text-[10px] text-[#5B6478] block mt-1">(Faturamento anual de R$ 3.564)</span>
                </div>
                <p className="text-xs text-[#5B6478] mt-2 leading-relaxed">
                  Para quem deseja o melhor preço e suporte premium prioritário.
                </p>
              </div>
              <ul className="text-xs text-[#5B6478] space-y-2 border-t border-[#E3E9F5] pt-4">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Todos os recursos do plano mensal</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Suporte VIP dedicado no WhatsApp</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#6C9BFF] shrink-0" /> Treinamento de equipe incluso</li>
              </ul>
              <Link href="/signup" className="block text-center rounded-xl bg-[#6C9BFF] hover:bg-[#5486F0] px-6 py-3 text-xs font-bold text-white transition-all shadow-md">
                Começar agora gratuitamente
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-6 bg-[#F0F4FC]/20 border-t border-[#E3E9F5]">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-[#10182B] mb-4">Perguntas Frequentes</h2>
            <p className="text-xs text-[#5B6478]">Esclareça suas principais dúvidas sobre o funcionamento do LeadPluz.</p>
          </div>
          <div className="space-y-3">
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

      {/* ── CTA Final ── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#10182B] to-[#1e293b] text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(108,155,255,0.12)_0%,_transparent_70%)] pointer-events-none" />
        <div className="relative mx-auto max-w-2xl space-y-6 z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-bold text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
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

      {/* ── Footer ── */}
      <footer className="bg-[#10182B] text-neutral-500 border-t border-white/5 py-8 px-6 text-xs">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#6C9BFF] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-neutral-400 uppercase">LeadPluz</span>
          </div>
          <p>© 2026 LeadPluz. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">Termos</a>
            <a href="#" className="hover:text-white transition-colors">Privacidade</a>
            <Link href="/login" className="hover:text-white transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
