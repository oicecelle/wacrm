'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  LogOut,
  Building,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PatientPortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any | null>(null);
  const [clinic, setClinic] = useState<any | null>(null);
  const [portalSettings, setPortalSettings] = useState<any | null>(null);
  
  // Banner Carousel States
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);

  useEffect(() => {
    // 1. Authenticate token locally
    const token = localStorage.getItem(`portal_token_${slug}`);
    const localPatient = localStorage.getItem(`portal_patient_${slug}`);
    const localClinic = localStorage.getItem(`portal_clinic_${slug}`);

    if (!token || !localPatient || !localClinic) {
      toast.error('Sessão expirada ou não autenticado');
      router.replace(`/portal/${slug}`);
      return;
    }

    setPatient(JSON.parse(localPatient));
    setClinic(JSON.parse(localClinic));

    // 2. Fetch fresh portal settings & banners
    const fetchPortalSettings = async () => {
      try {
        const { data: settings } = await supabase
          .from('portal_settings')
          .select('*')
          .eq('account_id', JSON.parse(localClinic).id)
          .maybeSingle();

        if (settings) {
          setPortalSettings(settings);
        }

        // Fetch clinic details for contact info
        const { data: clinicDetails } = await supabase
          .from('clinics')
          .select('name, address, phone, whatsapp_url')
          .eq('id', JSON.parse(localClinic).id)
          .maybeSingle();

        if (clinicDetails) {
          setClinic(clinicDetails);
        }
      } catch (err) {
        console.error('Error fetching portal settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPortalSettings();
  }, [slug, router, supabase]);

  const handleLogout = () => {
    localStorage.removeItem(`portal_token_${slug}`);
    localStorage.removeItem(`portal_patient_${slug}`);
    localStorage.removeItem(`portal_clinic_${slug}`);
    toast.success('Desconectado com sucesso!');
    router.replace(`/portal/${slug}`);
  };

  // Carousel controls
  const activeBanners = useMemo(() => {
    if (!portalSettings?.banners_carousel) return [];
    return portalSettings.banners_carousel.filter((b: any) => b.active && b.image_url);
  }, [portalSettings]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveBannerIdx(prev => (prev + 1) % activeBanners.length);
    }, 5000); // auto slide every 5s
    return () => clearInterval(interval);
  }, [activeBanners]);

  const handleNextBanner = () => {
    setActiveBannerIdx(prev => (prev + 1) % activeBanners.length);
  };

  const handlePrevBanner = () => {
    setActiveBannerIdx(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-800">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-xs text-neutral-500">Carregando painel do paciente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {portalSettings?.logo_url ? (
              <img
                src={portalSettings.logo_url}
                alt={clinic?.name}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <div className="h-8 w-8 bg-blue-500/10 text-blue-600 rounded-lg flex items-center justify-center">
                <Building className="h-4 w-4" />
              </div>
            )}
            <span className="font-black text-sm tracking-tight text-neutral-900 hidden sm:inline">
              {clinic?.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-neutral-500 hidden md:inline">
              Paciente: <strong className="text-neutral-800 font-bold">{patient?.name}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-neutral-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
        
        {/* Banner Carousel */}
        {activeBanners.length > 0 && (
          <div className="relative h-32 md:h-44 w-full overflow-hidden rounded-3xl border shadow-xs bg-neutral-900 group">
            {activeBanners.map((banner: any, idx: number) => {
              const isActive = idx === activeBannerIdx;
              return (
                <div
                  key={idx}
                  className={`absolute inset-0 transition-opacity duration-700 ${
                    isActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <img
                    src={banner.image_url}
                    alt={`Campanha ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {banner.link && (
                    <a
                      href={banner.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 right-3 bg-white/95 text-neutral-800 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-white hover:scale-105 transition-all shadow-md"
                    >
                      Ver Detalhes
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}

            {/* Carousel navigation buttons */}
            {activeBanners.length > 1 && (
              <>
                <button
                  onClick={handlePrevBanner}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-md text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={handleNextBanner}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-md text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Dot indicator indicators */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1">
                  {activeBanners.map((_: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveBannerIdx(idx)}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === activeBannerIdx ? 'w-3 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Clinic Info Bar */}
        <div className="grid gap-3 sm:grid-cols-2 bg-white border p-4 rounded-3xl shadow-xs">
          <div className="flex gap-2 text-xs text-neutral-500">
            <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-neutral-800">Endereço da Clínica</p>
              <p className="mt-0.5">{clinic?.address || 'Endereço não informado'}</p>
            </div>
          </div>
          <div className="flex gap-2 text-xs text-neutral-500">
            <Phone className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-neutral-800">Fale Conosco</p>
              {clinic?.whatsapp_url || clinic?.phone ? (
                <a
                  href={clinic.whatsapp_url || `https://wa.me/${clinic.phone?.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-bold hover:underline block mt-0.5"
                >
                  {clinic.phone || 'Enviar Mensagem no WhatsApp'}
                </a>
              ) : (
                <p className="mt-0.5">Telefone não informado</p>
              )}
            </div>
          </div>
        </div>

        {/* Nested Dashboard Views */}
        <div className="bg-white border rounded-3xl p-5 shadow-xs">
          {children}
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="py-6 border-t mt-auto bg-white/50">
        <p className="text-center text-[10px] text-neutral-400 font-medium">
          Tecnologia LEAD PLUZ · Fila de agendamentos e prontuários protegida.
        </p>
      </footer>
    </div>
  );
}
