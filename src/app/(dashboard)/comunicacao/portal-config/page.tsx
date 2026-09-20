'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Globe,
  Upload,
  CheckCircle,
  Loader2,
  Copy,
  Plus,
  Trash2,
  Eye,
  ToggleLeft,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PortalConfigPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState('');

  // Portal Configurations
  const [welcomeTitle, setWelcomeTitle] = useState('Bem-vindo ao nosso Portal');
  const [welcomeSubtitle, setWelcomeSubtitle] = useState('Aqui você pode gerenciar suas consultas, financeiro e assinar documentos.');
  const [logoUrl, setLogoUrl] = useState('');
  const [enabledScheduling, setEnabledScheduling] = useState(true);
  const [enabledCancellation, setEnabledCancellation] = useState(true);
  const [enabledRescheduling, setEnabledRescheduling] = useState(true);

  // Banner carousel configuration
  const [banners, setBanners] = useState<any[]>([]);
  const [newBannerUrl, setNewBannerUrl] = useState('');
  const [newBannerLink, setNewBannerLink] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      if (!accountId) return;
      setLoading(true);
      try {
        // Fetch slug from clinics
        const { data: clinicRow } = await supabase
          .from('clinics')
          .select('slug')
          .eq('id', accountId)
          .maybeSingle();
        
        if (clinicRow?.slug) {
          setSlug(clinicRow.slug);
        }

        // Fetch portal settings
        const { data: settings } = await supabase
          .from('portal_settings')
          .select('*')
          .eq('account_id', accountId)
          .maybeSingle();

        if (settings) {
          setWelcomeTitle(settings.welcome_title);
          setWelcomeSubtitle(settings.welcome_subtitle);
          setLogoUrl(settings.logo_url || '');
          setEnabledScheduling(settings.enabled_scheduling);
          setEnabledCancellation(settings.enabled_cancellation);
          setEnabledRescheduling(settings.enabled_rescheduling);
          setBanners(settings.banners_carousel || []);
        }
      } catch (err) {
        console.error('Error loading portal settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [accountId, supabase]);

  const handleCopyLink = () => {
    if (!slug) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://crm.leadpluz.com.br';
    const link = `${origin}/portal/${slug}`;
    navigator.clipboard.writeText(link);
    toast.success('Link do portal copiado!');
  };

  const handleAddBanner = () => {
    if (!newBannerUrl.trim()) {
      toast.error('Informe a URL da imagem do banner');
      return;
    }
    const newBanner = {
      image_url: newBannerUrl.trim(),
      link: newBannerLink.trim() || null,
      active: true,
    };
    setBanners(prev => [...prev, newBanner]);
    setNewBannerUrl('');
    setNewBannerLink('');
    toast.success('Banner adicionado! Lembre-se de salvar as configurações.');
  };

  const handleRemoveBanner = (idx: number) => {
    setBanners(prev => prev.filter((_, i) => i !== idx));
    toast.info('Banner removido.');
  };

  const handleToggleBanner = (idx: number) => {
    setBanners(prev => prev.map((b, i) => i === idx ? { ...b, active: !b.active } : b));
  };

  const handleSaveSettings = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('portal_settings')
        .upsert({
          account_id: accountId,
          welcome_title: welcomeTitle.trim(),
          welcome_subtitle: welcomeSubtitle.trim(),
          logo_url: logoUrl.trim() || null,
          enabled_scheduling: enabledScheduling,
          enabled_cancellation: enabledCancellation,
          enabled_rescheduling: enabledRescheduling,
          banners_carousel: banners,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'account_id'
        });

      if (error) throw error;
      toast.success('Configurações do portal salvas com sucesso!');
    } catch (err) {
      console.error('Error saving portal settings:', err);
      toast.error('Falha ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const portalLink = slug 
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://crm.leadpluz.com.br'}/portal/${slug}`
    : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] border border-neutral-100 rounded-3xl bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Configuração do Portal</h1>
        <p className="text-sm text-muted-foreground">
          Personalize a Área do Paciente da sua clínica com sua logo, regras de agendamento online e banners de marketing.
        </p>
      </div>

      {/* Share / URL Panel */}
      {slug && (
        <div className="bg-blue-500/5 border border-blue-200/50 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-foreground">Seu Portal do Paciente está Ativo</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 select-all font-mono" id="portal-url">
                {portalLink}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="border-border text-xs font-bold text-neutral-700 hover:bg-neutral-50 rounded-xl flex-1 sm:flex-initial flex items-center gap-1.5 h-9"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              Copiar Link
            </Button>
            <a
              href={`/portal/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-xl transition-colors flex-1 sm:flex-initial h-9"
            >
              <Eye className="h-3.5 w-3.5" />
              Visualizar
            </a>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Settings Form Column */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Identity settings */}
          <div className="bg-card p-5 rounded-3xl border border-neutral-100 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b pb-2">
              <Settings className="h-4 w-4 text-blue-600" />
              Identidade do Portal
            </h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600">Título de Boas-vindas</label>
                <Input
                  value={welcomeTitle}
                  onChange={(e) => setWelcomeTitle(e.target.value)}
                  placeholder="Ex: Bem-vindo à Marcelle Odontologia"
                  className="border-border bg-neutral-50 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600">Subtítulo / Mensagem Principal</label>
                <textarea
                  value={welcomeSubtitle}
                  onChange={(e) => setWelcomeSubtitle(e.target.value)}
                  rows={3}
                  className="w-full border border-border bg-neutral-50 text-xs text-neutral-700 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Ex: Gerencie seus horários, consulte faturas e assine seus documentos."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600">URL do Logotipo da Clínica</label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                  className="border-border bg-neutral-50 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">
                  URL de uma imagem pública do seu logo para personalizar o cabeçalho e tela de login.
                </p>
              </div>
            </div>
          </div>

          {/* Autonomy settings */}
          <div className="bg-card p-5 rounded-3xl border border-neutral-100 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-foreground border-b pb-2">
              Permissões do Paciente (Autonomia)
            </h2>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block">Agendamento Online</label>
                  <span className="text-[10px] text-muted-foreground">Permite ao paciente agendar consultas livres de forma autônoma.</span>
                </div>
                <input
                  type="checkbox"
                  checked={enabledScheduling}
                  onChange={(e) => setEnabledScheduling(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block">Cancelamento Online</label>
                  <span className="text-[10px] text-muted-foreground">Permite ao paciente cancelar agendamentos futuros diretamente no portal.</span>
                </div>
                <input
                  type="checkbox"
                  checked={enabledCancellation}
                  onChange={(e) => setEnabledCancellation(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 border border-neutral-100">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block">Reagendamento Online</label>
                  <span className="text-[10px] text-muted-foreground">Permite ao paciente reagendar consultas para novos horários.</span>
                </div>
                <input
                  type="checkbox"
                  checked={enabledRescheduling}
                  onChange={(e) => setEnabledRescheduling(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Banners Carousel Column */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card p-5 rounded-3xl border border-neutral-100 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-foreground border-b pb-2 flex items-center gap-1.5">
              <Upload className="h-4 w-4 text-blue-600" />
              Carrossel de Banners
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adicione banners de marketing que serão mostrados no topo do portal do paciente.
            </p>

            {/* List Banners */}
            <div className="space-y-3 pt-2">
              {banners.length === 0 ? (
                <div className="p-4 border border-dashed rounded-2xl text-center text-xs text-muted-foreground">
                  Nenhum banner cadastrado.
                </div>
              ) : (
                <div className="space-y-2">
                  {banners.map((banner, idx) => (
                    <div key={idx} className="border p-2.5 rounded-xl bg-neutral-50 space-y-1 relative">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground">Banner #{idx + 1}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleBanner(idx)}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                              banner.active ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600'
                            }`}
                          >
                            {banner.active ? 'Ativo' : 'Pausado'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBanner(idx)}
                            className="p-1 rounded text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate mt-0.5">Img: {banner.image_url}</p>
                      {banner.link && (
                        <p className="text-[9px] text-blue-500 truncate">Link: {banner.link}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to Add Banner */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-xs font-bold text-neutral-700">Adicionar Novo Banner</h3>
              <div className="space-y-2">
                <Input
                  value={newBannerUrl}
                  onChange={(e) => setNewBannerUrl(e.target.value)}
                  placeholder="URL da Imagem do Banner"
                  className="border-border bg-neutral-50 text-[11px] rounded-lg p-2 h-8"
                />
                <Input
                  value={newBannerLink}
                  onChange={(e) => setNewBannerLink(e.target.value)}
                  placeholder="Link do Clique (opcional)"
                  className="border-border bg-neutral-50 text-[11px] rounded-lg p-2 h-8"
                />
                <Button
                  onClick={handleAddBanner}
                  className="w-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-bold rounded-lg py-1 flex items-center justify-center gap-1 h-8"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Incluir Banner
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button Footer */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSaveSettings}
          disabled={saving || !welcomeTitle.trim()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar Configurações do Portal
        </Button>
      </div>
    </div>
  );
}
