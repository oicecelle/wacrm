"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  UsersRound,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

function JoinPageContent() {
  const searchParams = useSearchParams();
  const clinicUserId = searchParams.get("clinic_user_id");
  const accountId = searchParams.get("account_id");

  const [clinicName, setClinicName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authedUser, setAuthedUser] = useState<any | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Peek clinic name & check auth
  useEffect(() => {
    if (!accountId) return;
    
    let cancelled = false;
    (async () => {
      try {
        const [peekRes, authRes] = await Promise.all([
          fetch(`/api/team/peek-invite?account_id=${encodeURIComponent(accountId)}`),
          createClient().auth.getUser(),
        ]);

        const peekBody = await peekRes.json();
        if (cancelled) return;

        if (peekBody.clinic_name) {
          setClinicName(peekBody.clinic_name);
        }
        setAuthedUser(authRes.data?.user || null);
      } catch (err) {
        console.error("[join] initialization error:", err);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleAccept = useCallback(async () => {
    if (!clinicUserId || !accountId) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_user_id: clinicUserId,
          account_id: accountId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Erro ao aceitar convite");
        setAccepting(false);
        return;
      }

      toast.success("Bem-vindo à equipe!");
      // Force hard reload so AuthProvider updates active clinic settings
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("[join] accept error:", err);
      toast.error("Erro de conexão com o servidor");
      setAccepting(false);
    }
  }, [clinicUserId, accountId]);

  if (loading) {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando convite...</p>
        </CardContent>
      </Card>
    );
  }

  if (!clinicUserId || !accountId || !clinicName) {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <CardTitle className="text-xl text-foreground font-black">Convite inválido</CardTitle>
          <CardDescription className="text-muted-foreground">
            Este link de convite é inválido ou expirou. Solicite um novo convite ao administrador da clínica.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link href="/login" className="w-full">
            <Button className="w-full bg-primary text-primary-foreground">Ir para Login</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const inviteHeader = (
    <CardHeader className="items-center text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <UsersRound className="h-6 w-6 text-primary" />
      </div>
      <CardTitle className="text-xl text-foreground font-black">
        Você foi convidado para a equipe da clínica
      </CardTitle>
      <p className="text-lg font-black text-blue-600 mt-1">{clinicName}</p>
      <CardDescription className="text-muted-foreground mt-2">
        Ao aceitar, você poderá gerenciar a agenda, contatos e faturamento.
      </CardDescription>
    </CardHeader>
  );

  // If authenticated
  if (authedUser) {
    return (
      <Card className="w-full max-w-md border-border bg-card shadow-2xl rounded-2xl">
        {inviteHeader}
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-xs text-neutral-600 mb-2">
            Conectado como: <strong className="text-neutral-800">{authedUser.email}</strong>
          </div>
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-xl"
          >
            {accepting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Aceitando...
              </>
            ) : (
              <>
                <CheckCircle className="size-4 mr-1.5" />
                Aceitar convite e entrar
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // If not authenticated, prompt to login or register
  const loginUrl = `/login?redirectTo=${encodeURIComponent(
    `/join?clinic_user_id=${clinicUserId}&account_id=${accountId}`
  )}`;
  const signupUrl = `/signup?redirectTo=${encodeURIComponent(
    `/join?clinic_user_id=${clinicUserId}&account_id=${accountId}`
  )}`;

  return (
    <Card className="w-full max-w-md border-border bg-card shadow-2xl rounded-2xl">
      {inviteHeader}
      <CardContent className="flex flex-col gap-3">
        <Link href={signupUrl} className="w-full">
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-xl">
            Criar conta e aceitar convite
          </Button>
        </Link>
        <Link href={loginUrl} className="w-full">
          <Button
            variant="outline"
            className="w-full border-border text-neutral-600 hover:bg-neutral-50 h-10 rounded-xl"
          >
            Já tenho uma conta (Fazer Login)
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    }>
      <JoinPageContent />
    </Suspense>
  );
}
