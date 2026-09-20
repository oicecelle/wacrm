'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Phone,
  MessageSquare,
  Key,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  params: {
    slug: string;
  };
}

export default function PatientPortalLoginPage({ params }: Props) {
  const router = useRouter();
  const { slug } = params;
  const supabase = createClient();

  const [clinic, setClinic] = useState<any | null>(null);
  const [portalSettings, setPortalSettings] = useState<any | null>(null);
  const [loadingClinic, setLoadingClinic] = useState(true);

  // Auth state
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchClinicInfo = async () => {
      setLoadingClinic(true);
      try {
        const { data: cl, error: clErr } = await supabase
          .from('clinics')
          .select('id, name, address, phone')
          .eq('slug', slug)
          .maybeSingle();

        if (clErr || !cl) {
          setClinic(null);
          return;
        }

        setClinic(cl);

        // Fetch portal settings
        const { data: settings } = await supabase
          .from('portal_settings')
          .select('*')
          .eq('account_id', cl.id)
          .maybeSingle();

        setPortalSettings(settings || {
          welcome_title: 'Bem-vindo ao nosso Portal',
          welcome_subtitle: 'Aqui você pode gerenciar suas consultas, financeiro e assinar documentos.',
        });
      } catch (err) {
        console.error('Error fetching clinic info:', err);
      } finally {
        setLoadingClinic(false);
      }
    };

    fetchClinicInfo();
  }, [slug, supabase]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error('Informe seu número de telefone');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request-otp',
          phone,
          slug,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Código enviado via WhatsApp!');
        
        // Auto fill OTP in development/debug mode
        if (data.debugCode) {
          console.log(`[DEBUG] Código OTP recebido na API: ${data.debugCode}`);
        }

        setStep('otp');
      } else {
        toast.error(data.error || 'Erro ao enviar código de verificação');
      }
    } catch (err) {
      console.error('Request OTP error:', err);
      toast.error('Erro de rede ao solicitar código');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      toast.error('Informe o código de 6 dígitos recebido');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-otp',
          phone,
          slug,
          code: otpCode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        // Save patient session to localStorage
        localStorage.setItem(`portal_token_${slug}`, data.token);
        localStorage.setItem(`portal_patient_${slug}`, JSON.stringify(data.patient));
        localStorage.setItem(`portal_clinic_${slug}`, JSON.stringify(data.clinic));
        
        toast.success(`Bem-vindo, ${data.patient.name}!`);
        router.push(`/portal/${slug}/dashboard`);
      } else {
        toast.error(data.error || 'Código de verificação incorreto ou expirado');
      }
    } catch (err) {
      console.error('Verify OTP error:', err);
      toast.error('Erro de rede ao validar código');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingClinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="text-xs text-neutral-400">Carregando portal da clínica...</p>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white p-6 text-center">
        <div className="max-w-sm space-y-3">
          <Building className="h-12 w-12 text-neutral-600 mx-auto" />
          <h1 className="text-lg font-black">Clínica não encontrada</h1>
          <p className="text-xs text-neutral-400">
            A URL acessada não corresponde a nenhuma clínica ativa no nosso sistema. Verifique o link e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4 text-left relative overflow-hidden">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Clinic Identity & Header */}
        <div className="text-center space-y-2">
          {portalSettings?.logo_url ? (
            <img
              src={portalSettings.logo_url}
              alt={clinic.name}
              className="h-14 w-auto mx-auto rounded-xl object-contain bg-white/5 p-1 border border-white/10"
            />
          ) : (
            <div className="h-12 w-12 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto">
              <Building className="h-6 w-6" />
            </div>
          )}
          <h2 className="text-lg font-black text-white tracking-tight pt-1">
            {clinic.name}
          </h2>
          <div className="space-y-1 pt-1">
            <h1 className="text-sm font-bold text-neutral-200">
              {portalSettings?.welcome_title || 'Acesso ao Portal do Paciente'}
            </h1>
            <p className="text-[11px] text-neutral-400 leading-relaxed px-4">
              {portalSettings?.welcome_subtitle || 'Verifique seus agendamentos, pacotes e assine documentos.'}
            </p>
          </div>
        </div>

        {/* STEP 1: INPUT PHONE NUMBER */}
        {step === 'phone' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-400 flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 text-neutral-500" />
                Seu número de telefone
              </label>
              <Input
                type="tel"
                placeholder="(DDD) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="bg-neutral-800 border-neutral-700 text-white rounded-xl text-xs placeholder:text-neutral-500"
              />
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                Digite o número com DDD cadastrado na clínica. Nós enviaremos um código de acesso por WhatsApp.
              </p>
            </div>

            <Button
              type="submit"
              disabled={submitting || !phone.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              Receber Código por WhatsApp
            </Button>
          </form>
        )}

        {/* STEP 2: INPUT OTP CODE */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-400 flex items-center gap-1">
                <Key className="h-3.5 w-3.5 text-neutral-500" />
                Código de 6 dígitos
              </label>
              <Input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
                className="bg-neutral-800 border-neutral-700 text-white rounded-xl text-xs text-center tracking-[0.2em] font-black placeholder:text-neutral-500"
              />
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                Insira o código de segurança enviado para o seu WhatsApp terminando com o número digitado.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                type="submit"
                disabled={submitting || otpCode.length < 6}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Confirmar Código e Acessar
              </Button>

              <button
                type="button"
                onClick={() => setStep('phone')}
                disabled={submitting}
                className="w-full text-center text-[10px] font-bold text-neutral-500 hover:text-neutral-400 py-1 transition-colors"
              >
                Alterar número de telefone
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
