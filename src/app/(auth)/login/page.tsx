"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, UsersRound, Eye, EyeOff, Mail, Lock, ArrowLeft, Bot, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleLogin = async () => {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const redirectTo = searchParams.get("redirectTo");
    if (redirectTo) {
      window.location.href = redirectTo;
    } else if (inviteToken) {
      window.location.href = `/join/${encodeURIComponent(inviteToken)}`;
    } else {
      window.location.href = "/agenda";
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#FAFBFF] text-[#10182B] font-sans">
      
      {/* Left side (Marketing column, hidden on mobile) */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0B1528] p-12 text-left relative overflow-hidden border-r border-neutral-800">
        {/* Glow Effects */}
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
            Centralize sua agenda, automatize os retornos dos pacientes via WhatsApp e simplifique a gestão de faturamento e comissões da sua equipe. Tudo em um único painel.
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
              {inviteToken ? "Aceitar convite" : "Acesse sua conta"}
            </h1>
            
            <p className="text-sm text-neutral-500 font-semibold leading-relaxed">
              {inviteToken 
                ? "Entre com suas credenciais para aceitar o convite da clínica"
                : "Entre com suas credenciais para gerenciar sua clínica de estética"}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs text-red-700">
                <p className="font-bold">Erro de Login</p>
                <p className="mt-0.5 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute top-3.5 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="email"
                  type="email"
                  placeholder="exemplo@clinica.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider" htmlFor="password">
                  Senha
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Esqueceu sua senha?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute top-3.5 left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-neutral-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all bg-white"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-neutral-400 hover:text-neutral-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-bold rounded-xl transition-all shadow-md shadow-blue-200"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="relative my-6">
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
            onClick={handleGoogleLogin}
            className="h-12 w-full rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-bold flex items-center justify-center gap-2.5 transition-all text-xs bg-white"
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
            Entrar com o Google
          </Button>

          <p className="text-center text-xs font-bold text-neutral-400 leading-relaxed">
            Não tem uma conta?{" "}
            <Link
              href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
