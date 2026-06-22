"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import {
  MessageSquareIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  ArrowLeftIcon,
  SparklesIcon,
  ZapIcon,
  ClockIcon,
  UserPlusIcon,
  BriefcaseIcon,
  SaveIcon,
  Loader2Icon,
  PlusIcon,
  CheckIcon,
  Trash2Icon,
  BuildingIcon,
  TagIcon,
  UsersIcon,
  SettingsIcon,
  ShieldCheckIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, accountId } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Step States ---
  // Step 2: WhatsApp
  const [waStatus, setWaStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  
  // Step 3: Campaigns
  const [campaignInput, setCampaignInput] = useState("");
  const [campaignTags, setCampaignTags] = useState<string[]>(["campanha-inverno", "promocao-botox", "lead-organico"]);

  // Step 4: Patient Interests
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState<string[]>([
    "Estética Corporal",
    "Limpeza de Pele",
    "Preenchimento",
    "Botox",
    "Nutrição"
  ]);

  // Step 5: Services
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [servicesList, setServicesList] = useState<{ id: string; name: string; price: number }[]>([
    { id: "1", name: "Aplicação de Botox (Testa)", price: 350.0 },
    { id: "2", name: "Limpeza de Pele Profunda", price: 150.0 }
  ]);

  // Step 6: Team
  const [teamName, setTeamName] = useState("");
  const [teamSpecialty, setTeamSpecialty] = useState("");
  const [teamCommission, setTeamCommission] = useState("10");
  const [teamList, setTeamList] = useState<{ id: string; name: string; specialty: string; commission: number }[]>([]);

  // Auto load state if clinic already has WhatsApp connected
  useEffect(() => {
    if (!accountId) return;
    const loadClinicStatus = async () => {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("whatsapp_status")
        .eq("id", accountId)
        .maybeSingle();

      if (clinic?.whatsapp_status === "connected") {
        setWaStatus("connected");
      }
    };
    loadClinicStatus();
  }, [accountId, supabase]);

  // Sync with Supabase Steps table
  const completeStepInDb = async (stepId: string) => {
    if (!accountId) return;
    try {
      await supabase.from("clinic_onboarding_steps").upsert({
        clinic_id: accountId,
        step_id: stepId,
        completed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Error saving onboarding step ${stepId}:`, err);
    }
  };

  // Navigations
  const handleNext = async () => {
    // Save to Supabase when moving past steps
    if (currentStep === 2) {
      await completeStepInDb("whatsapp_connected");
    } else if (currentStep === 3) {
      await completeStepInDb("campaigns_setup");
      // Optionally insert tags into Supabase/Contacts logic if needed
    } else if (currentStep === 4) {
      await completeStepInDb("interests_configured");
    } else if (currentStep === 5) {
      await completeStepInDb("services_created");
      // Save services to database
      for (const service of servicesList) {
        await supabase.from("procedures").insert({
          clinic_id: accountId,
          name: service.name,
          price: service.price,
          valor: service.price,
          duration_minutes: 60,
          ativo: true,
        });
      }
    } else if (currentStep === 6) {
      await completeStepInDb("team_configured");
      // Save team members to database
      for (const member of teamList) {
        await supabase.from("clinic_users").insert({
          clinic_id: accountId,
          name: member.name,
          role: "professional",
          specialty: member.specialty,
          commission_model: "percentage",
          commission_rate: member.commission,
          is_active: true
        });
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 7));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Skip actions
  const handleSkip = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 7));
  };

  // --- Step Handlers ---

  // WhatsApp Connect (Simulation)
  const handleConnectWhatsApp = () => {
    setWaStatus("connecting");
    const fakeToken = "instance_" + Math.random().toString(36).substring(7);
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=2563eb&data=https://uazapi.com/connect/${accountId || fakeToken}`);

    // Simulate scanning and connecting in 4 seconds
    setTimeout(async () => {
      setWaStatus("connected");
      if (accountId) {
        await supabase
          .from("clinics")
          .update({ whatsapp_status: "connected" })
          .eq("id", accountId);
      }
    }, 4000);
  };

  const handleDisconnectWhatsApp = async () => {
    setWaStatus("disconnected");
    setQrCodeUrl(null);
    if (accountId) {
      await supabase
        .from("clinics")
        .update({ whatsapp_status: "disconnected" })
        .eq("id", accountId);
    }
  };

  // Campaign handling
  const handleAddCampaign = () => {
    const trimmed = campaignInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (trimmed && !campaignTags.includes(trimmed)) {
      setCampaignTags((prev) => [...prev, trimmed]);
      setCampaignInput("");
    }
  };

  const handleRemoveCampaign = (tag: string) => {
    setCampaignTags((prev) => prev.filter((t) => t !== tag));
  };

  // Interest handling
  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests((prev) => [...prev, trimmed]);
      setInterestInput("");
    }
  };

  const handleRemoveInterest = (item: string) => {
    setInterests((prev) => prev.filter((i) => i !== item));
  };

  // Service handling
  const handleAddService = () => {
    if (!serviceName.trim()) return;
    const price = parseFloat(servicePrice.replace(",", ".")) || 0.0;
    const newService = {
      id: Math.random().toString(),
      name: serviceName.trim(),
      price,
    };
    setServicesList((prev) => [...prev, newService]);
    setServiceName("");
    setServicePrice("");
  };

  const handleRemoveService = (id: string) => {
    setServicesList((prev) => prev.filter((s) => s.id !== id));
  };

  // Team handling
  const handleAddTeam = () => {
    if (!teamName.trim()) return;
    const comm = parseFloat(teamCommission) || 0.0;
    const newMember = {
      id: Math.random().toString(),
      name: teamName.trim(),
      specialty: teamSpecialty.trim() || "Profissional",
      commission: comm,
    };
    setTeamList((prev) => [...prev, newMember]);
    setTeamName("");
    setTeamSpecialty("");
    setTeamCommission("10");
  };

  const handleRemoveTeam = (id: string) => {
    setTeamList((prev) => prev.filter((t) => t.id !== id));
  };

  // Final Action
  const handleComplete = () => {
    router.push("/agenda");
  };

  // Progress Percentage
  const progressPercent = Math.round((currentStep / 7) * 100);

  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col items-center justify-center p-6 text-neutral-800 antialiased font-sans">
      
      {/* Top Brand Logo & Progress Bar */}
      <div className="w-full max-w-xl mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black shadow-md">
              L
            </div>
            <span className="font-extrabold text-sm tracking-wider text-neutral-900">LeadPluz</span>
          </div>
          <span className="text-xs font-bold text-neutral-400">
            Etapa {currentStep} de 7
          </span>
        </div>
        <div className="h-1.5 w-full bg-neutral-200/60 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-xl bg-white border border-neutral-200/80 rounded-3xl p-8 shadow-xl shadow-neutral-100 flex flex-col justify-between transition-all duration-300">
        
        {/* STEP 1: Welcome Page */}
        {currentStep === 1 && (
          <div className="space-y-6 text-center py-4">
            <div className="h-16 w-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
              🚀
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
                Bem-vindo à LeadPluz 🚀
              </h1>
              <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed">
                Seu CRM inteligente trabalha em tempo real para organizar automaticamente tudo o que acontece no seu negócio.
              </p>
            </div>
            <div className="p-4 bg-neutral-50 rounded-2xl text-xs text-neutral-600 max-w-sm mx-auto font-medium border border-neutral-100/50">
              Conecte algumas informações essenciais e deixe a LeadPluz cuidar do restante.
            </div>
            <div className="pt-4">
              <Button 
                onClick={handleNext} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 rounded-xl shadow-lg shadow-blue-500/20 text-xs transition-transform active:scale-98"
              >
                Começar configuração
                <ArrowRightIcon className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Connect WhatsApp */}
        {currentStep === 2 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1.5">
              <h2 className="text-xl font-black text-neutral-900 tracking-tight">
                Conecte seu WhatsApp Business
              </h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                A LeadPluz usa as conversas do WhatsApp para atualizar automaticamente seus leads, clientes, agendamentos e fluxos em tempo real.
              </p>
            </div>

            <div className="py-2 flex justify-center">
              {waStatus === "disconnected" && (
                <div className="w-full flex flex-col items-center justify-center p-8 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50 space-y-4">
                  <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <MessageSquareIcon className="h-6 w-6" />
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-xs font-bold text-neutral-800">WhatsApp Desconectado</p>
                    <p className="text-[10px] text-neutral-400">Escaneie o QR Code para parear o sistema.</p>
                  </div>
                  <Button 
                    onClick={handleConnectWhatsApp}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs rounded-xl shadow-md"
                  >
                    Gerar QR Code de Conexão
                  </Button>
                </div>
              )}

              {waStatus === "connecting" && (
                <div className="w-full flex flex-col items-center justify-center p-6 border border-neutral-200 rounded-2xl bg-neutral-50/30 space-y-4">
                  {qrCodeUrl ? (
                    <div className="bg-white p-3 border border-neutral-200 rounded-2xl shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCodeUrl} alt="QR Code" className="h-44 w-44" />
                    </div>
                  ) : (
                    <div className="h-44 w-44 flex items-center justify-center bg-white border border-neutral-100 rounded-2xl">
                      <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  )}
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-blue-600 font-bold text-xs">
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      <span>Aguardando leitura do celular...</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 max-w-sm">
                      Abra o WhatsApp no celular, vá em Aparelhos Conectados e aponte para a tela.
                    </p>
                  </div>
                </div>
              )}

              {waStatus === "connected" && (
                <div className="w-full flex items-center justify-between p-5 border border-emerald-100 rounded-2xl bg-emerald-50/20">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                      <CheckCircle2Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">WhatsApp Conectado!</p>
                      <p className="text-[10px] text-emerald-700/80 font-semibold">CRM ativo e conectado à instância do WhatsApp.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnectWhatsApp}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-10 border-neutral-200 text-neutral-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <Button
                onClick={handleNext}
                disabled={waStatus !== "connected"}
                className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50"
              >
                Avançar
                <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Campaigns Setup */}
        {currentStep === 3 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-neutral-900 tracking-tight">
                Origem e Tags de Campanhas
              </h2>
              <p className="text-xs text-neutral-500">
                Cadastre palavras-chaves e códigos para identificar de qual campanha de marketing cada lead veio.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="camp-input" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Adicionar Nova Tag</Label>
                <div className="flex gap-2">
                  <Input
                    id="camp-input"
                    placeholder="Ex: promo-maio, facebook-ads, botox-vip"
                    value={campaignInput}
                    onChange={(e) => setCampaignInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCampaign()}
                    className="rounded-xl border-neutral-200 text-xs h-10"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddCampaign}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl h-10 px-4 font-bold text-xs"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Tag Cloud */}
              <div className="bg-neutral-50 border border-neutral-100/50 rounded-2xl p-4 min-h-[100px] flex flex-wrap gap-1.5 items-start content-start">
                {campaignTags.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic mx-auto my-auto">Nenhuma tag de campanha adicionada.</p>
                ) : (
                  campaignTags.map((tag) => (
                    <span 
                      key={tag} 
                      className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100/50 text-[10px] font-black px-2.5 py-1 rounded-lg"
                    >
                      <TagIcon className="h-2.5 w-2.5" />
                      {tag}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveCampaign(tag)}
                        className="hover:text-red-500 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-10 border-neutral-200 text-neutral-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Client Interests */}
        {currentStep === 4 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-neutral-900 tracking-tight">
                Interesses comuns dos Pacientes
              </h2>
              <p className="text-xs text-neutral-500">
                Configure os interesses e procedimentos buscados que nos ajudam a classificar e segmentar a base de clientes automaticamente.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="interest-input" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Adicionar Novo Interesse</Label>
                <div className="flex gap-2">
                  <Input
                    id="interest-input"
                    placeholder="Ex: Harmonização Facial, Depilação, etc."
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddInterest()}
                    className="rounded-xl border-neutral-200 text-xs h-10"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddInterest}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl h-10 px-4 font-bold text-xs"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Tag Cloud */}
              <div className="bg-neutral-50 border border-neutral-100/50 rounded-2xl p-4 min-h-[100px] flex flex-wrap gap-1.5 items-start content-start">
                {interests.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic mx-auto my-auto">Nenhum interesse adicionado.</p>
                ) : (
                  interests.map((i) => (
                    <span 
                      key={i} 
                      className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100/50 text-[10px] font-black px-2.5 py-1 rounded-lg"
                    >
                      <SparklesIcon className="h-2.5 w-2.5 text-indigo-500 animate-pulse" />
                      {i}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveInterest(i)}
                        className="hover:text-red-500 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-10 border-neutral-200 text-neutral-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Services Setup */}
        {currentStep === 5 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-neutral-900 tracking-tight">
                Configure os Procedimentos & Serviços
              </h2>
              <p className="text-xs text-neutral-500">
                Cadastre os procedimentos estéticos ou serviços consultivos que você oferece para usar no painel e na agenda.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="srv-name" className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Nome do Serviço *</Label>
                  <Input
                    id="srv-name"
                    placeholder="Ex: Peeling de Algas"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="rounded-xl border-neutral-200 text-xs h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="srv-price" className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Valor (R$)</Label>
                  <Input
                    id="srv-price"
                    placeholder="Ex: 250"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    className="rounded-xl border-neutral-200 text-xs h-10 text-center"
                  />
                </div>
              </div>
              <Button
                type="button"
                onClick={handleAddService}
                disabled={!serviceName.trim()}
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs h-9 font-bold rounded-xl shadow-xs"
              >
                + Adicionar Procedimento
              </Button>

              {/* Service list scroll area */}
              <div className="border border-neutral-100 rounded-2xl bg-neutral-50/30 max-h-40 overflow-y-auto divide-y divide-neutral-100 shadow-inner">
                {servicesList.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic p-6 text-center">Nenhum procedimento cadastrado.</p>
                ) : (
                  servicesList.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 text-xs bg-white/70">
                      <div className="text-left">
                        <p className="font-extrabold text-neutral-800">{s.name}</p>
                        <p className="text-[10px] text-neutral-500">Valor sugerido: R$ {s.price.toFixed(2)}</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveService(s.id)}
                        className="text-rose-600 hover:text-rose-700 p-1"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-10 border-neutral-200 text-neutral-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Team Configuration */}
        {currentStep === 6 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-neutral-900 tracking-tight">
                Equipe & Colaboradores
              </h2>
              <p className="text-xs text-neutral-500">
                Cadastre os membros da equipe e profissionais que realizam os procedimentos na clínica para cálculo de comissões.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="tm-name" className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Nome Completo *</Label>
                  <Input
                    id="tm-name"
                    placeholder="Ex: Dra. Mariana Silva"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="rounded-xl border-neutral-200 text-xs h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tm-comm" className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Comissão (%)</Label>
                  <Input
                    id="tm-comm"
                    type="number"
                    value={teamCommission}
                    onChange={(e) => setTeamCommission(e.target.value)}
                    className="rounded-xl border-neutral-200 text-xs h-10 text-center"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tm-specialty" className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Especialidade / Função</Label>
                <Input
                  id="tm-specialty"
                  placeholder="Ex: Biomédica Esteta, Dermatologista"
                  value={teamSpecialty}
                  onChange={(e) => setTeamSpecialty(e.target.value)}
                  className="rounded-xl border-neutral-200 text-xs h-10"
                />
              </div>
              <Button
                type="button"
                onClick={handleAddTeam}
                disabled={!teamName.trim()}
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs h-9 font-bold rounded-xl shadow-xs"
              >
                + Adicionar Profissional
              </Button>

              {/* Team list scroll area */}
              <div className="border border-neutral-100 rounded-2xl bg-neutral-50/30 max-h-36 overflow-y-auto divide-y divide-neutral-100 shadow-inner">
                {teamList.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic p-6 text-center">Nenhum colaborador adicionado.</p>
                ) : (
                  teamList.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 text-xs bg-white/70">
                      <div className="text-left">
                        <p className="font-extrabold text-neutral-800">{t.name}</p>
                        <p className="text-[10px] text-neutral-500">
                          {t.specialty} • Comissão: {t.commission}%
                        </p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTeam(t.id)}
                        className="text-rose-600 hover:text-rose-700 p-1"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-10 border-neutral-200 text-neutral-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: Tela Final */}
        {currentStep === 7 && (
          <div className="space-y-6 text-center py-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mx-auto shadow-inner border border-emerald-100">
              🎉
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
                Tudo pronto 🎉
              </h1>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed">
                Sua LeadPluz está preparada para trabalhar por você. Agora as conversas começam a alimentar o CRM e a agenda em tempo real.
              </p>
            </div>

            {/* Checklist of completed tasks */}
            <div className="bg-neutral-50/50 border border-neutral-100/50 rounded-2xl p-5 text-left max-w-md mx-auto space-y-3 shadow-xs">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-1.5">
                Checklist Operacional
              </p>
              <div className="space-y-2 text-xs font-semibold text-neutral-700">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>WhatsApp conectado</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Campanhas cadastradas</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Interesses configurados</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Serviços criados</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Equipe configurada</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button
                onClick={handleComplete}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 rounded-xl shadow-lg shadow-blue-500/20 text-xs transition-transform active:scale-98"
              >
                Ir para minha Agenda
                <ArrowRightIcon className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
