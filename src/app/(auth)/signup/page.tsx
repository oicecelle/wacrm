"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageSquare, CheckCircle, UsersRound, Eye, EyeOff, Mail, Lock, User, ArrowLeft, Bot, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleGoogleSignup = async () => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);

    const redirectTo = searchParams.get("redirectTo");
    const emailRedirectTo = redirectTo
      ? `${window.location.origin}${redirectTo}`
      : inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#FAFBFF] text-[#10182B] font-sans">
        {/* Left column (Dark marketing banner) */}
        <div className="hidden lg:flex flex-col justify-between bg-[#0B1528] p-12 text-left relative overflow-hidden border-r border-neutral-800">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-blue-800/15 rounded-full blur-3xl pointer-events-none" />
          
          <Link href="/landing" className="inline-flex items-center gap-2 text-neutral-400 hover:text-blue-400 transition-colors z-10">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-semibold">Voltar para o site</span>
          </Link>
          
          <div className="space-y-6 max-w-md relative z-10">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8 object-contain" />
              <span className="text-lg font-black tracking-tight text-white uppercase">
                <span className="font-medium text-blue-400">LEAD</span>{" "}
                <span className="font-extrabold text-blue-500">PLUZ</span>
              </span>
            </div>
            <h2 className="text-4xl font-black text-white leading-[1.1] tracking-tight">
              Sua clínica rodando no automático.
            </h2>
          </div>
          <div className="text-xs text-neutral-500 relative z-10 font-semibold">
            © {new Date().getFullYear()} LeadPluz. Todos os direitos reservados.
          </div>
        </div>

        {/* Right column (Success message) */}
        <div className="flex flex-col justify-center px-6 py-12 lg:px-16 xl:px-24 bg-white relative">
          <div className="mx-auto w-full max-w-sm space-y-6 text-center lg:text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 mx-auto lg:mx-0">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tight text-[#10182B]">Verifique seu e-mail</h1>
              <p className="text-sm text-neutral-500 font-semibold leading-relaxed">
                Enviamos um link de confirmação para <strong className="text-neutral-800">{email}</strong>. 
                Clique no link do e-mail para ativar sua conta.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex h-12 w-full items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl transition-all shadow-md shadow-blue-200 text-sm"
              >
                Voltar para o login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#FAFBFF] text-[#10182B] font-sans">
      
      {/* Left side (Marketing column, hidden on mobile) */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0B1528] p-12 text-left relative overflow-hidden border-r border-neutral-800">
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-blue-800/15 rounded-full blur-3xl pointer-events-none" />
        
        <Link href="/landing" className="inline-flex items-center gap-2 text-neutral-400 hover:text-blue-400 transition-colors z-10">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-semibold">Voltar para o site</span>
        </Link>
        
        <div className="space-y-6 max-w-md relative z-10">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8 object-contain" />
            <span className="text-lg font-black tracking-tight text-white uppercase">
              <span className="font-medium text-blue-400">LEAD</span>{" "}
              <span className="font-extrabold text-blue-500">PLUZ</span>
            </span>
          </div>
          
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> CRM Inteligente & Autônomo
          </span>
          
          <h2 className="text-4xl font-black text-white leading-[1.1] tracking-tight">
            Sua clínica rodando no automático.
          </h2>
          
          <p className="text-sm text-neutral-400 leading-relaxed font-medium">
            Centralize sua agenda, automatize os retornos dos clientes via WhatsApp e simplifique a gestão de faturamento e comissões da sua equipe. Tudo em um único painel.
          </p>
        </div>
        
        <div className="text-xs text-neutral-500 relative z-10 font-semibold">
          © {new Date().getFullYear()} LeadPluz. Todos os direitos reservados.
        </div>
      </div>

      {/* Right side (Form column) */}
      <div className="flex flex-col justify-center px-6 py-12 lg:px-16 xl:px-24 bg-white relative">
        <div className="mx-auto w-full max-w-sm space-y-8 text-left">
          
          <div className="space-y-2">
            {/* Logo visible on mobile */}
            <div className="flex items-center gap-2 lg:hidden pb-4">
              <Logo className="h-7 w-7 object-contain" />
              <span className="text-base font-black tracking-tight text-[#10182B] uppercase">
                <span className="font-medium text-blue-600">LEAD</span>{" "}
                <span className="font-extrabold text-blue-800">PLUZ</span>
              </span>
            </div>
            
            <h1 className="text-3xl font-black tracking-tight text-[#10182B]">
              {inviteToken ? "Criar conta e aceitar" : "Crie sua conta"}
            </h1>
            
            <p className="text-sm text-neutral-500 font-semibold leading-relaxed">
              {inviteToken
                ? "Cadastre-se para aceitar o convite e acessar sua equipe"
                : "Comece seu teste gratuito de 7 dias hoje mesmo"}
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs text-red-700">
                <p className="font-bold">Erro no Cadastro</p>
                <p className="mt-0.5 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="fullName">
                Nome completo
              </label>
              <div className="relative">
                <User className="absolute top-3 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="fullName"
                  type="text"
                  placeholder="Seu Nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="email"
                  type="email"
                  placeholder="exemplo@clinica.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-neutral-400 hover:text-neutral-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="confirmPassword">
                Confirmar Senha
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-3 text-neutral-400 hover:text-neutral-600 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-bold rounded-xl transition-all shadow-md shadow-blue-200 mt-2 text-xs"
            >
              {loading ? "Criando Conta..." : "Começar Agora"}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-neutral-400 font-bold tracking-wider">Ou continue com</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleGoogleSignup}
            className="h-11 w-full rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-bold flex items-center justify-center gap-2.5 transition-all text-xs bg-white"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                className="fill-[#4285F4]"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                className="fill-[#34A853]"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                className="fill-[#FBBC05]"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                className="fill-[#EA4335]"
              />
            </svg>
            Cadastrar com o Google
          </Button>

          <p className="text-center text-xs font-bold text-neutral-400 leading-relaxed">
            Já tem uma conta?{" "}
            <Link
              href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
