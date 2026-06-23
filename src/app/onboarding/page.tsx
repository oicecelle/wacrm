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
  ShieldCheckIcon,
  Edit2Icon,
  TrashIcon,
  UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ServiceItem {
  id: string;
  name: string;
  duration: number; // in minutes
  price: number;
  color: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  specialty: string;
  procedures: string[]; // names of services they perform
  avatar: string; // preset symbol or initial
}

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
  const [campaignTags, setCampaignTags] = useState<string[]>(["Meta Ads", "Instagram", "Google Ads", "Indicação", "Orgânico"]);
  
  // Step 4: Patient Interests (CRUD)
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState<string[]>([
    "Botox",
    "Bioestimulador",
    "Limpeza de pele",
    "Harmonização facial",
    "Consulta"
  ]);
  const [editingInterestIndex, setEditingInterestIndex] = useState<number | null>(null);
  const [editingInterestValue, setEditingInterestValue] = useState("");

  // Step 5: Services Configurator
  const [servicesList, setServicesList] = useState<ServiceItem[]>([
    { id: "1", name: "Aplicação de Botox (Testa)", duration: 60, price: 350.0, color: "purple" },
    { id: "2", name: "Limpeza de Pele Profunda", duration: 60, price: 150.0, color: "green" }
  ]);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceColor, setServiceColor] = useState("purple");

  // Step 6: Team Configuration
  const [teamList, setTeamList] = useState<TeamMember[]>([
    { id: "1", name: "Dra. Jaqueline Novais", role: "professional", specialty: "Estética Avançada", procedures: ["Aplicação de Botox (Testa)"], avatar: "👩‍⚕️" }
  ]);
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState("professional");
  const [teamSpecialty, setTeamSpecialty] = useState("");
  const [teamProcedures, setTeamProcedures] = useState<string[]>([]);
  const [teamAvatar, setTeamAvatar] = useState("👩‍⚕️");

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
    setError(null);
    setLoading(true);
    try {
      if (currentStep === 2) {
        await completeStepInDb("whatsapp_connected");
      } else if (currentStep === 3) {
        await completeStepInDb("campaigns_setup");
      } else if (currentStep === 4) {
        await completeStepInDb("interests_configured");
      } else if (currentStep === 5) {
        await completeStepInDb("services_created");
        // Save services to database
        if (accountId) {
          for (const service of servicesList) {
            await supabase.from("procedures").insert({
              clinic_id: accountId,
              name: service.name,
              valor: service.price,
              duration_minutes: service.duration,
              ativo: true,
            });
          }
        }
      } else if (currentStep === 6) {
        await completeStepInDb("team_configured");
        // Save team members to database
        if (accountId) {
          for (const member of teamList) {
            await supabase.from("clinic_users").insert({
              clinic_id: accountId,
              name: member.name,
              role: member.role,
              specialty: member.specialty,
              commission_model: "percentage",
              commission_rate: 30, // Default 30% commission
              is_active: true
            });
          }
        }
      }
      setCurrentStep((prev) => Math.min(prev + 1, 7));
    } catch (err: any) {
      console.error(err);
      setError("Erro ao salvar as configurações desta etapa.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSkip = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 7));
  };

  // --- Step Handlers ---

  // WhatsApp Connect (Simulation)
  const handleConnectWhatsApp = () => {
    setWaStatus("connecting");
    const fakeToken = "instance_" + Math.random().toString(36).substring(7);
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=2563eb&data=https://uazapi.com/connect/${accountId || fakeToken}`);

    // Simulate scanning and connecting in 3.5 seconds
    setTimeout(async () => {
      setWaStatus("connected");
      if (accountId) {
        await supabase
          .from("clinics")
          .update({ whatsapp_status: "connected" })
          .eq("id", accountId);
      }
    }, 3500);
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

  // Campaigns handling
  const handleToggleCampaign = (tag: string) => {
    if (campaignTags.includes(tag)) {
      setCampaignTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setCampaignTags((prev) => [...prev, tag]);
    }
  };

  const handleAddCampaign = () => {
    const trimmed = campaignInput.trim();
    if (trimmed && !campaignTags.includes(trimmed)) {
      setCampaignTags((prev) => [...prev, trimmed]);
      setCampaignInput("");
    }
  };

  // Interests CRUD
  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests((prev) => [...prev, trimmed]);
      setInterestInput("");
    }
  };

  const handleStartEditInterest = (index: number) => {
    setEditingInterestIndex(index);
    setEditingInterestValue(interests[index]);
  };

  const handleSaveEditInterest = () => {
    const trimmed = editingInterestValue.trim();
    if (trimmed && editingInterestIndex !== null) {
      setInterests((prev) => {
        const updated = [...prev];
        updated[editingInterestIndex] = trimmed;
        return updated;
      });
      setEditingInterestIndex(null);
      setEditingInterestValue("");
    }
  };

  const handleRemoveInterest = (index: number) => {
    setInterests((prev) => prev.filter((_, idx) => idx !== index));
    if (editingInterestIndex === index) {
      setEditingInterestIndex(null);
    }
  };

  // Service configuration
  const handleAddService = () => {
    if (!serviceName.trim()) return;
    const price = parseFloat(servicePrice.replace(",", ".")) || 0.0;
    const newService: ServiceItem = {
      id: Math.random().toString(),
      name: serviceName.trim(),
      duration: parseInt(serviceDuration) || 60,
      price,
      color: serviceColor,
    };
    setServicesList((prev) => [...prev, newService]);
    setServiceName("");
    setServicePrice("");
    setServiceDuration("60");
  };

  const handleRemoveService = (id: string) => {
    setServicesList((prev) => prev.filter((s) => s.id !== id));
  };

  // Team configuration
  const handleAddTeam = () => {
    if (!teamName.trim()) return;
    const newMember: TeamMember = {
      id: Math.random().toString(),
      name: teamName.trim(),
      role: teamRole,
      specialty: teamSpecialty.trim() || "Profissional Clínico",
      procedures: [...teamProcedures],
      avatar: teamAvatar,
    };
    setTeamList((prev) => [...prev, newMember]);
    setTeamName("");
    setTeamSpecialty("");
    setTeamProcedures([]);
  };

  const handleToggleProcedureForMember = (procName: string) => {
    if (teamProcedures.includes(procName)) {
      setTeamProcedures((prev) => prev.filter((p) => p !== procName));
    } else {
      setTeamProcedures((prev) => [...prev, procName]);
    }
  };

  const handleRemoveTeamMember = (id: string) => {
    setTeamList((prev) => prev.filter((t) => t.id !== id));
  };

  // Final Action
  const handleComplete = () => {
    router.push("/agenda");
  };

  // Progress Percentage
  const progressPercent = Math.round((currentStep / 7) * 100);

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4 sm:p-8 text-slate-800 antialiased font-sans">
      
      {/* Brand Header & Progress */}
      <div className="w-full max-w-2xl mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              lp
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-900">LeadPluz</span>
          </div>
          <span className="text-xs font-bold text-slate-400">
            Passo {currentStep} de 7
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-2xl bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-100 flex flex-col justify-between min-h-[460px]">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
          </Alert>
        )}

        {/* STEP 1: Welcome Page */}
        {currentStep === 1 && (
          <div className="space-y-6 text-center py-6">
            <div className="h-16 w-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
              🚀
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Bem-vindo à LeadPluz 🚀
              </h1>
              <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
                Seu CRM inteligente e agenda conectada trabalham em tempo real para organizar consultas, comissões, automações e WhatsApp.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-600 max-w-md mx-auto font-medium border border-slate-100/50 leading-normal">
              Vamos configurar os pontos essenciais do seu negócio em menos de 5 minutos.
            </div>
            <div className="pt-6">
              <Button 
                onClick={handleNext} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold h-12 rounded-2xl shadow-lg shadow-blue-500/10 text-xs transition-transform active:scale-98"
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
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Conecte seu WhatsApp Business
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                A LeadPluz lê conversas autorizadas e envia lembretes automáticos para seus clientes diretamente do seu número.
              </p>
            </div>

            <div className="py-2 flex justify-center">
              {waStatus === "disconnected" && (
                <div className="w-full flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <MessageSquareIcon className="h-6 w-6" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-slate-800">WhatsApp Desconectado</p>
                    <p className="text-[10px] text-slate-400">Escaneie o QR Code para parear.</p>
                  </div>
                  <Button 
                    onClick={handleConnectWhatsApp}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 text-xs rounded-xl shadow-md"
                  >
                    Gerar QR Code de Conexão
                  </Button>
                </div>
              )}

              {waStatus === "connecting" && (
                <div className="w-full flex flex-col items-center justify-center p-6 border border-slate-200 rounded-2xl bg-slate-50/30 space-y-4">
                  {qrCodeUrl ? (
                    <div className="bg-white p-3 border border-slate-200 rounded-2xl shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCodeUrl} alt="QR Code" className="h-40 w-40" />
                    </div>
                  ) : (
                    <div className="h-40 w-40 flex items-center justify-center bg-white border border-slate-100 rounded-2xl">
                      <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  )}
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-blue-600 font-bold text-xs">
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      <span>Aguardando leitura do celular...</span>
                    </div>
                    <p className="text-[10px] text-slate-400 max-w-sm">
                      Abra o WhatsApp, vá em Aparelhos Conectados e aponte para a tela.
                    </p>
                  </div>
                </div>
              )}

              {waStatus === "connected" && (
                <div className="w-full flex flex-col items-center justify-center p-6 border border-emerald-100 rounded-2xl bg-emerald-50/20 text-center space-y-4">
                  <div className="h-12 w-12 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2Icon className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">🎉 WhatsApp conectado com sucesso.</p>
                    <p className="text-xs text-emerald-700/80 font-semibold">Seu CRM está sincronizado e ativo!</p>
                  </div>
                  <button 
                    onClick={handleDisconnectWhatsApp}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    Desconectar dispositivo
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-11 border-slate-200 text-slate-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <Button
                onClick={handleNext}
                disabled={waStatus !== "connected"}
                className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50"
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
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Origem dos Leads & Campanhas
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Selecione as mídias e canais que trazem clientes ou digite novas tags abaixo.
              </p>
            </div>

            <div className="space-y-4">
              {/* Preset Cards Selection */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {["Meta Ads", "Instagram", "Google Ads", "Indicação", "Orgânico"].map((c) => {
                  const isSelected = campaignTags.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleToggleCampaign(c)}
                      className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                        isSelected
                          ? "bg-blue-50/50 border-blue-600 text-blue-900"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Tag */}
              <div className="space-y-1">
                <Label htmlFor="camp-input" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Outras tags de origem</Label>
                <div className="flex gap-2">
                  <Input
                    id="camp-input"
                    placeholder="Ex: Tik-Tok, Outdoor, Rádio"
                    value={campaignInput}
                    onChange={(e) => setCampaignInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCampaign())}
                    className="rounded-xl border-slate-200 text-xs h-10"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddCampaign}
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-4 font-bold text-xs"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Selected Tags list */}
              <div className="flex flex-wrap gap-1.5 min-h-[40px] pt-1">
                {campaignTags.map((tag) => (
                  <span 
                    key={tag} 
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100/50 text-[10px] font-black px-2 py-0.5 rounded-lg"
                  >
                    {tag}
                    <button 
                      type="button" 
                      onClick={() => setCampaignTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-red-500 font-bold ml-1 text-xs"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-11 border-slate-200 text-slate-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Client Interests (CRUD) */}
        {currentStep === 4 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Interesses Comuns & Segmentos
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Configure os interesses que você mapeia nos atendimentos dos pacientes.
              </p>
            </div>

            <div className="space-y-4">
              {/* Add Input */}
              <div className="space-y-1">
                <Label htmlFor="interest-input" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Novo Interesse</Label>
                <div className="flex gap-2">
                  <Input
                    id="interest-input"
                    placeholder="Ex: Toxina Botulínica, Preenchimento labial"
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddInterest())}
                    className="rounded-xl border-slate-200 text-xs h-10"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddInterest}
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-4 font-bold text-xs"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Grid of Interests with Edit/Delete (CRUD) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {interests.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs font-semibold text-slate-700"
                  >
                    {editingInterestIndex === idx ? (
                      <div className="flex items-center gap-1.5 w-full mr-2">
                        <Input
                          type="text"
                          value={editingInterestValue}
                          onChange={(e) => setEditingInterestValue(e.target.value)}
                          className="h-7 text-xs rounded-lg px-2"
                        />
                        <button 
                          type="button" 
                          onClick={handleSaveEditInterest}
                          className="text-emerald-600 hover:text-emerald-700 font-bold"
                        >
                          Salvar
                        </button>
                      </div>
                    ) : (
                      <span className="truncate flex-1 font-bold">{item}</span>
                    )}

                    <div className="flex items-center gap-2.5 shrink-0">
                      {editingInterestIndex !== idx && (
                        <button 
                          type="button"
                          onClick={() => handleStartEditInterest(idx)}
                          className="text-slate-400 hover:text-slate-600"
                          title="Editar"
                        >
                          <Edit2Icon className="h-3 w-3" />
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => handleRemoveInterest(idx)}
                        className="text-rose-600 hover:text-rose-800"
                        title="Excluir"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {interests.length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-6 col-span-2">Nenhum interesse mapeado. Adicione alguns acima.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-11 border-slate-200 text-slate-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Avançar
                  <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Services Configurator */}
        {currentStep === 5 && (
          <div className="space-y-6 text-left">
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Configure seus Serviços & Procedimentos
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Cadastre os procedimentos estéticos que aparecerão na agenda e na grade semanal.
              </p>
            </div>

            <div className="space-y-4">
              {/* Form Input fields */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="srv-name" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nome do Serviço *</Label>
                  <Input
                    id="srv-name"
                    placeholder="Ex: Preenchimento Labial com Hialurônico"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="rounded-xl border-slate-200 text-xs h-9 bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="srv-duration" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Duração *</Label>
                  <select
                    id="srv-duration"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                    className="w-full text-xs h-9 rounded-xl border border-slate-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                    <option value="120">120 min</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="srv-price" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Preço (R$) *</Label>
                  <Input
                    id="srv-price"
                    placeholder="Ex: 500.00"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    className="rounded-xl border-slate-200 text-xs h-9 bg-white"
                  />
                </div>

                {/* Color Selector */}
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Cor na Agenda</Label>
                  <div className="flex gap-2">
                    {[
                      { name: "purple", class: "bg-purple-500" },
                      { name: "blue", class: "bg-blue-500" },
                      { name: "green", class: "bg-emerald-500" },
                      { name: "red", class: "bg-rose-500" },
                      { name: "yellow", class: "bg-amber-500" },
                    ].map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setServiceColor(c.name)}
                        className={`h-5.5 w-5.5 rounded-full ${c.class} transition-transform ${
                          serviceColor === c.name ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : "hover:scale-105"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddService}
                disabled={!serviceName.trim() || !servicePrice.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-bold rounded-xl shadow-xs"
              >
                + Cadastrar Procedimento
              </Button>

              {/* Service list scroll area */}
              <div className="border border-slate-100 rounded-2xl bg-slate-50/20 max-h-36 overflow-y-auto divide-y divide-slate-100">
                {servicesList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 text-xs bg-white">
                    <div className="flex items-center gap-2 text-left">
                      <span className={`h-2.5 w-2.5 rounded-full bg-${s.color === 'green' ? 'emerald' : s.color === 'red' ? 'rose' : s.color === 'yellow' ? 'amber' : s.color}-500`} />
                      <div>
                        <p className="font-extrabold text-slate-850">{s.name}</p>
                        <p className="text-[10px] text-slate-550">
                          {s.duration} min • {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.price)}
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveService(s.id)}
                      className="text-rose-600 hover:text-rose-700 p-1"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {servicesList.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-6 text-center">Nenhum procedimento cadastrado ainda.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-11 border-slate-200 text-slate-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
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
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Estrutura de Equipe & Especialistas
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Cadastre quem realiza atendimentos na clínica e selecione quais procedimentos cada um realiza.
              </p>
            </div>

            <div className="space-y-4">
              {/* Form Input fields */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="tm-name" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nome Completo *</Label>
                  <Input
                    id="tm-name"
                    placeholder="Ex: Dra. Larissa Novais"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="rounded-xl border-slate-200 text-xs h-9 bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tm-role" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Função / Cargo</Label>
                  <select
                    id="tm-role"
                    value={teamRole}
                    onChange={(e) => setTeamRole(e.target.value)}
                    className="w-full text-xs h-9 rounded-xl border border-slate-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="professional">Profissional Clínico</option>
                    <option value="admin">Administrador</option>
                    <option value="receptionist">Recepcionista</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tm-spec" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Especialidade</Label>
                  <Input
                    id="tm-spec"
                    placeholder="Ex: Biomédica Esteta"
                    value={teamSpecialty}
                    onChange={(e) => setTeamSpecialty(e.target.value)}
                    className="rounded-xl border-slate-200 text-xs h-9 bg-white"
                  />
                </div>

                {/* Procedures checklist */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Procedimentos Realizados</Label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-slate-200/50 p-2 bg-white rounded-xl">
                    {servicesList.map(s => {
                      const selected = teamProcedures.includes(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleToggleProcedureForMember(s.name)}
                          className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all ${
                            selected
                              ? "bg-blue-50 border-blue-500 text-blue-700"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-350"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                    {servicesList.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">Cadastre procedimentos na etapa anterior primeiro.</p>
                    )}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddTeam}
                disabled={!teamName.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-bold rounded-xl shadow-xs"
              >
                + Adicionar Profissional
              </Button>

              {/* Team list scroll area */}
              <div className="border border-slate-100 rounded-2xl bg-slate-50/20 max-h-36 overflow-y-auto divide-y divide-slate-100">
                {teamList.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 text-xs bg-white">
                    <div className="flex items-center gap-2.5 text-left">
                      <span className="text-lg">{t.avatar}</span>
                      <div>
                        <p className="font-extrabold text-slate-850">{t.name}</p>
                        <p className="text-[10px] text-slate-500 truncate max-w-sm">
                          {t.specialty} • {t.procedures.length} procedimentos vinculados
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveTeamMember(t.id)}
                      className="text-rose-600 hover:text-rose-700 p-1"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {teamList.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-6 text-center">Nenhum colaborador adicionado.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                className="h-11 border-slate-200 text-slate-600 font-bold rounded-xl text-xs"
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3"
                >
                  Pular
                </button>
                <Button
                  onClick={handleNext}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
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
          <div className="space-y-6 text-center py-6">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mx-auto shadow-inner border border-emerald-100">
              🎉
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Tudo pronto 🎉
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                Seu consultório está com a base configurada. A partir de agora você já pode gerenciar sua agenda com a LeadPluz!
              </p>
            </div>

            {/* Checklist of completed tasks */}
            <div className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-5 text-left max-w-sm mx-auto space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                Checklist Operacional
              </p>
              <div className="space-y-2 text-xs font-semibold text-slate-700">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>WhatsApp conectado</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Canais de campanhas ativos</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Interesses e procedimentos configurados</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Profissionais de equipe cadastrados</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                onClick={handleComplete}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-2xl shadow-lg shadow-blue-500/10 text-xs transition-transform active:scale-98"
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
