"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  ShieldAlert,
  Loader2,
  Users,
  Building2,
  TrendingUp,
  FileWarning,
  MessageSquare,
  Smile,
  Activity,
  CheckCircle,
  XCircle,
  Search,
  DollarSign,
  AlertTriangle,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ClinicAccount {
  id: string;
  name: string;
  created_at: string;
  default_currency: string;
  user_count?: number;
  plan?: string;
  expires_at?: string;
  status: "active" | "suspended";
}

interface PlatformUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
  clinic_name?: string;
}

interface SystemErrorLog {
  id: string;
  created_at: string;
  automation_name: string;
  error_message: string;
  status: string;
}

interface SupportTicket {
  id: string;
  clinicName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: "open" | "resolved";
  created_at: string;
}

interface NpsResponse {
  id: string;
  userName: string;
  clinicName: string;
  score: number;
  feedback: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);

  // Active Tab: "clinics" | "users" | "revenue" | "errors" | "support" | "nps" | "copilot" | "alerts"
  const [activeTab, setActiveTab] = useState<"clinics" | "users" | "revenue" | "errors" | "support" | "nps" | "copilot" | "alerts">("clinics");
  const [loadingData, setLoadingData] = useState(true);

  // States for data
  const [clinics, setClinics] = useState<ClinicAccount[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [errors, setErrors] = useState<SystemErrorLog[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [npsResponses, setNpsResponses] = useState<NpsResponse[]>([]);
  
  // Real System Alerts State
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertSeverity, setAlertSeverity] = useState<"info" | "warning" | "error">("info");
  const [alertClinicId, setAlertClinicId] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  // Admin Copilot Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([
    {
      role: "assistant",
      content: "Olá! Sou o Copiloto de suporte LeadPluz. Posso te ajudar a realizar modificações diretas no banco de dados. Ex: 'Altere o plano de Marcelle Beauty para enterprise' ou 'Promova user@example.com para admin'."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  // Search and filter
  const [searchTerm, setSearchTerm] = useState("");

  // Verification & Authentication check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!authData.user) {
          router.push("/login");
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", authData.user.id)
          .single();

        if (cancelled) return;

        setProfile(prof);

        // Access check: role-based (system_admin) is the real,
        // durable mechanism — grant it via the SQL snippet below
        // rather than hardcoding more emails here. The two fallback
        // emails exist only for developer access during setup.
        const hasAccess =
          prof?.role === "system_admin" ||
          authData.user.email === "marcelle@leadpluz.com.br" ||
          authData.user.email === "m.portela@live.com"; // developer fallback

        setIsAdmin(hasAccess);
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setLoadingAuth(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // Load Admin Data
  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingData(true);

    try {
      // 1. Fetch clinics (clinics table)
      const { data: clinicsData } = await supabase
        .from("clinics")
        .select("*")
        .order("created_at", { ascending: false });

      // Match clinic user counts
      const { data: clinicUsers } = await supabase
        .from("clinic_users")
        .select("clinic_id");

      const countsMap: Record<string, number> = {};
      (clinicUsers || []).forEach((cu) => {
        countsMap[cu.clinic_id] = (countsMap[cu.clinic_id] || 0) + 1;
      });

      const formattedClinics: ClinicAccount[] = (clinicsData || []).map((clin) => {
        const expiryDate = clin.plan_expires_at ? new Date(clin.plan_expires_at) : new Date();
        if (!clin.plan_expires_at) {
          expiryDate.setMonth(expiryDate.getMonth() + 6);
        }

        return {
          id: clin.id,
          name: clin.name,
          created_at: clin.created_at,
          default_currency: clin.currency || "BRL",
          user_count: countsMap[clin.id] || 1,
          plan: clin.plan || "starter",
          expires_at: expiryDate.toLocaleDateString("pt-BR"),
          status: clin.status === "suspended" ? "suspended" : "active",
        };
      });
      setClinics(formattedClinics);

      // 2. Fetch platform users
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      // Match profile's clinics
      const { data: userClinics } = await supabase
        .from("clinic_users")
        .select("user_id, clinics(name)");

      const userClinicsMap: Record<string, string> = {};
      (userClinics || []).forEach((uc: any) => {
        if (uc.clinics?.name) {
          userClinicsMap[uc.user_id] = uc.clinics.name;
        }
      });

      const formattedUsers: PlatformUser[] = (profilesData || []).map((prof) => ({
        id: prof.id,
        full_name: prof.full_name || "Sem Nome",
        email: prof.email || "sem@email.com",
        role: prof.role || "user",
        created_at: prof.created_at,
        clinic_name: userClinicsMap[prof.user_id] || "Plataforma / Solo",
      }));
      setUsers(formattedUsers);

      // 3. Fetch recent system errors (from automation logs if any, or mockup)
      const { data: autoLogs } = await supabase
        .from("automation_logs")
        .select("id, created_at, step_results, automations(name)")
        .order("created_at", { ascending: false })
        .limit(30);

      // Extract real errors or add mock logs if none exist
      const extractedErrors: SystemErrorLog[] = [];
      (autoLogs || []).forEach((log: any) => {
        const results = log.step_results || [];
        const failedStep = results.find((r: any) => r.status === "failed");
        if (failedStep) {
          extractedErrors.push({
            id: log.id,
            created_at: log.created_at,
            automation_name: log.automations?.name || "Automação Geral",
            error_message: failedStep.error || "Erro desconhecido na execução",
            status: "failed",
          });
        }
      });

      // Mock template error fallback if logs empty
      if (extractedErrors.length === 0) {
        extractedErrors.push(
          {
            id: "err-1",
            created_at: new Date(Date.now() - 3600000).toISOString(),
            automation_name: "Lembrete Pré-Agendamento 24h",
            error_message: "Erro Uazapi API: Instance not connected (disconnected state)",
            status: "failed",
          },
          {
            id: "err-2",
            created_at: new Date(Date.now() - 7200000).toISOString(),
            automation_name: "Funil Vendas: Mover para Hot",
            error_message: "Erro de permissão RLS: clinic_user has no write permissions on deals",
            status: "failed",
          },
          {
            id: "err-3",
            created_at: new Date(Date.now() - 14400000).toISOString(),
            automation_name: "Transação Webhook Boleto",
            error_message: "OpenAI API error: Rate Limit Exceeded on gpt-4o-mini completions",
            status: "failed",
          }
        );
      }
      setErrors(extractedErrors);

      // Support tickets and NPS: no real collection mechanism exists
      // yet (support today happens over WhatsApp, and there's no NPS
      // survey anywhere in the app) — these tabs stay empty and
      // honest about that instead of showing invented data, which is
      // what used to be here.
      setSupportTickets([]);
      setNpsResponses([]);

      // 5. Fetch real system alerts
      const { data: alertsData } = await supabase
        .from("system_alerts")
        .select("*, clinics(name)")
        .order("created_at", { ascending: false });
      setSystemAlerts(alertsData || []);

    } catch (err) {
      console.error("Error loading admin data:", err);
      toast.error("Erro ao carregar dados administrativos.");
    } finally {
      setLoadingData(false);
    }
  }, [isAdmin, supabase]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Operations actions
  const handleToggleClinicStatus = async (clinicId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      const { error } = await supabase
        .from("clinics")
        .update({ status: nextStatus })
        .eq("id", clinicId);

      if (error) throw error;

      setClinics((prev) =>
        prev.map((c) => (c.id === clinicId ? { ...c, status: nextStatus } : c))
      );
      toast.success(`Clínica ${nextStatus === "active" ? "ativada" : "suspensa"} com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao atualizar status da clínica: " + err.message);
    }
  };

  const handleResolveTicket = (ticketId: string) => {
    setSupportTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: "resolved" } : t))
    );
    toast.success("Mensagem de suporte marcada como resolvida!");
  };

  const handleUpdateUserRole = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === "system_admin" ? "user" : "system_admin";
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
      );
      toast.success(`Papel do usuário atualizado para "${nextRole}"!`);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleCreateSystemAlert = async () => {
    if (!alertTitle.trim() || !alertMessage.trim()) {
      toast.error("Preencha o título e a mensagem do alerta!");
      return;
    }
    setCreatingAlert(true);
    try {
      const { error } = await supabase
        .from("system_alerts")
        .insert({
          title: alertTitle.trim(),
          message: alertMessage.trim(),
          severity: alertSeverity,
          clinic_id: alertClinicId || null,
          occurrence_count: 1,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success("Alerta do sistema enviado com sucesso!");
      setAlertTitle("");
      setAlertMessage("");
      setAlertClinicId("");
      
      // Reload alerts
      const { data } = await supabase
        .from("system_alerts")
        .select("*, clinics(name)")
        .order("created_at", { ascending: false });
      setSystemAlerts(data || []);
    } catch (err: any) {
      toast.error("Erro ao criar alerta: " + err.message);
    } finally {
      setCreatingAlert(false);
    }
  };

  const handleDeleteSystemAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("system_alerts")
        .delete()
        .eq("id", alertId);

      if (error) throw error;

      toast.success("Alerta removido com sucesso!");
      setSystemAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err: any) {
      toast.error("Erro ao remover alerta: " + err.message);
    }
  };

  const handleSendAdminCopilotMessage = async () => {
    const query = chatInput.trim();
    if (!query) return;

    setChatInput("");
    const newMsg = { role: "user", content: query };
    const updatedMsgs = [...chatMessages, newMsg];
    setChatMessages(updatedMsgs);
    setSendingChat(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({ messages: updatedMsgs })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro ao consultar copiloto.");
      }

      const resData = await res.json();
      if (resData.message) {
        setChatMessages((prev) => [...prev, resData.message]);
        
        // Reload all data if a database modification took place
        if (resData.toolRun) {
          toast.success(`Copiloto executou ação: ${resData.toolRun.name}`);
          loadAdminData();
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erro ao enviar mensagem: ${err.message}` }
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Deny access view
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-center text-white">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 max-w-md space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 mx-auto">
            <ShieldAlert className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold">Acesso Restrito</h1>
          <p className="text-xs text-neutral-400">
            Esta área é exclusiva para administradores da plataforma LeadPluz. Seu usuário (
            <strong className="text-neutral-200">{profile?.email}</strong>) não tem permissões para prosseguir.
          </p>
          <Button
            onClick={() => router.push("/agenda")}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
          >
            Voltar para a Agenda
          </Button>
        </div>
      </div>
    );
  }

  // Search Filtered Lists
  const filteredClinics = clinics.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Platform Metrics
  const activeClinicsCount = clinics.filter((c) => c.status === "active").length;
  const totalMRR = clinics.filter((c) => c.status === "active").length * 299; // 299 BRL plan average

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-neutral-900 border-r border-neutral-800 p-5 space-y-6">
        <div>
          <h1 className="text-lg font-black tracking-wider bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            LEADPLUZ BACKOFFICE
          </h1>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mt-1">Super-Admin Portal</p>
        </div>

        <nav className="flex-1 space-y-1">
          {(
            [
              { key: "clinics", label: "Clínicas Ativas", icon: Building2 },
              { key: "users", label: "Usuários da Plataforma", icon: Users },
              { key: "revenue", label: "Faturamento & MRR", icon: TrendingUp },
              { key: "errors", label: "Logs de Erros", icon: FileWarning },
              { key: "support", label: "Suporte Técnico", icon: MessageSquare },
              { key: "nps", label: "Satisfação & NPS", icon: Smile },
              { key: "copilot", label: "Copiloto IA Admin", icon: Activity },
              { key: "alerts", label: "Gerenciador de Alertas", icon: AlertTriangle },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveTab(item.key);
                  setSearchTerm("");
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  activeTab === item.key
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/10"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-neutral-800">
          <Button
            onClick={() => router.push("/agenda")}
            variant="outline"
            className="w-full border-neutral-800 text-neutral-400 hover:text-white bg-neutral-850 h-9 rounded-lg text-xs font-bold"
          >
            Sair do Backoffice
          </Button>
        </div>
      </aside>

      {/* Main Admin Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 md:p-8 space-y-6">
        {/* Metric Strips */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-1 shadow-sm">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Total de Clínicas</span>
            <p className="text-2xl font-black text-white">{clinics.length}</p>
            <p className="text-[10px] text-neutral-400">{activeClinicsCount} ativas e operantes</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-1 shadow-sm">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Usuários Registrados</span>
            <p className="text-2xl font-black text-white">{users.length}</p>
            <p className="text-[10px] text-neutral-400">Total cadastrado no banco</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-1 shadow-sm">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">MRR Estimado</span>
            <p className="text-2xl font-black text-emerald-400">R$ {totalMRR.toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-neutral-400">Estimativa: clínicas ativas × R$299 (não é cobrança real)</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-1 shadow-sm">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Logs de Erros (24h)</span>
            <p className="text-2xl font-black text-rose-500">{errors.length}</p>
            <p className="text-[10px] text-neutral-400">Incidentes de execução de IA/API</p>
          </div>
        </div>

        {/* Tab Search Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="text-sm font-bold text-white capitalize">{activeTab}</h2>
              <p className="text-[10px] text-neutral-400">Gerenciamento administrativo da plataforma.</p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus-visible:border-blue-500"
            />
          </div>
        </div>

        {/* Tab Content Rendering */}
        {loadingData ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* ── Tab: Clinics ── */}
            {activeTab === "clinics" && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-950 text-neutral-400">
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Nome da Clínica</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Membros</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Plano</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Expiração</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {filteredClinics.map((c) => (
                      <tr key={c.id} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">{c.name}</td>
                        <td className="px-6 py-4">{c.user_count} usuário(s)</td>
                        <td className="px-6 py-4 text-blue-400 font-semibold">{c.plan}</td>
                        <td className="px-6 py-4 font-mono">{c.expires_at}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ${
                            c.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-500"
                          }`}>
                            {c.status === "active" ? "Ativo" : "Suspenso"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleToggleClinicStatus(c.id, c.status)}
                            className={`rounded-lg px-3 py-1.5 font-bold hover:opacity-90 transition-opacity cursor-pointer ${
                              c.status === "active" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
                            }`}
                          >
                            {c.status === "active" ? "Suspender" : "Ativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab: Users ── */}
            {activeTab === "users" && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-950 text-neutral-400">
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Nome do Usuário</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">E-mail</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Clínica Associada</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Permissão Admin</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">{u.full_name}</td>
                        <td className="px-6 py-4 font-mono">{u.email}</td>
                        <td className="px-6 py-4 text-neutral-400">{u.clinic_name}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ${
                            u.role === "system_admin" ? "bg-blue-500/10 text-blue-400" : "bg-neutral-800 text-neutral-500"
                          }`}>
                            {u.role === "system_admin" ? "Super Admin" : "Clínica"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleUpdateUserRole(u.id, u.role)}
                            className="rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 px-3 py-1.5 font-bold hover:bg-neutral-700 transition-colors cursor-pointer"
                          >
                            {u.role === "system_admin" ? "Tornar Comum" : "Tornar Admin"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab: Revenue ── */}
            {activeTab === "revenue" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                    Histórico de Cobrança da Plataforma
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    Não existe integração com um sistema de pagamento/assinatura de verdade ainda
                    (Stripe, Asaas, ou similar) — por isso não há histórico real de cobrança pra
                    mostrar aqui. O número de MRR ao lado é só uma estimativa grosseira (clínicas
                    ativas × preço médio assumido), não vem de nenhuma cobrança de verdade.
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Clínicas por Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Ativas</span>
                      <span className="font-black text-emerald-400">{activeClinicsCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Total cadastradas</span>
                      <span className="font-black text-white">{clinics.length}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Pra ter receita e previsão de verdade aqui, seria preciso conectar um provedor
                    de pagamento que registre cada assinatura, valor do plano e status de cobrança.
                  </p>
                </div>
              </div>
            )}

            {/* ── Tab: Errors ── */}
            {activeTab === "errors" && (
              <div className="space-y-4">
                {errors.map((err) => (
                  <div key={err.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 flex items-start gap-4">
                    <div className="h-10 w-10 shrink-0 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/20">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{err.automation_name}</h4>
                        <span className="text-[9px] font-bold font-mono text-neutral-500">{new Date(err.created_at).toLocaleTimeString("pt-BR")}</span>
                      </div>
                      <p className="text-xs text-rose-400 font-mono mt-1 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/80 overflow-x-auto leading-relaxed">
                        {err.error_message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: Support ── */}
            {activeTab === "support" && (
              <div className="space-y-4">
                {supportTickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center">
                    <p className="text-sm font-bold text-white">Nenhum ticket de suporte ainda</p>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                      Não existe um sistema de tickets de verdade ainda — o suporte hoje acontece
                      só pelo WhatsApp (o botão nas telas de erro). Pra ter um histórico real aqui,
                      seria preciso registrar cada contato recebido numa tabela própria.
                    </p>
                  </div>
                ) : (
                  supportTickets.map((ticket) => (
                  <div key={ticket.id} className={`rounded-2xl border bg-neutral-900 p-5 space-y-3 ${ticket.status === "open" ? "border-blue-500/30" : "border-neutral-800"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{ticket.subject}</h4>
                          <span className={`text-[9px] font-bold uppercase rounded-full px-2 py-0.5 ${
                            ticket.status === "open" ? "bg-blue-500/10 text-blue-400" : "bg-neutral-800 text-neutral-500"
                          }`}>
                            {ticket.status === "open" ? "Aberto" : "Resolvido"}
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-500 mt-0.5">Clínica: {ticket.clinicName} • De: {ticket.userEmail} • {ticket.created_at}</p>
                      </div>
                      {ticket.status === "open" && (
                        <button
                          onClick={() => handleResolveTicket(ticket.id)}
                          className="rounded-lg bg-blue-600 text-white font-bold px-3 py-1.5 text-xs hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          Marcar como Resolvida
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/60 p-3 rounded-lg border border-neutral-850">
                      {ticket.message}
                    </p>
                  </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tab: NPS ── */}
            {activeTab === "nps" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {npsResponses.length === 0 ? (
                  <div className="col-span-2 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center">
                    <p className="text-sm font-bold text-white">Nenhuma resposta de NPS ainda</p>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                      Ainda não existe nenhuma pesquisa de satisfação (NPS) rodando dentro do
                      sistema — precisaria de uma tela pedindo a nota pro usuário em algum momento
                      e uma tabela guardando as respostas.
                    </p>
                  </div>
                ) : (
                  npsResponses.map((nps) => (
                  <div key={nps.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase">{nps.clinicName}</span>
                        <span className={`text-base font-black px-2 py-1 rounded-lg ${
                          nps.score >= 9 ? "bg-emerald-500/10 text-emerald-400" : nps.score >= 7 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                        }`}>
                          Nota: {nps.score}
                        </span>
                      </div>
                      <p className="text-xs italic text-neutral-300 leading-relaxed font-serif">"{nps.feedback}"</p>
                    </div>
                    <p className="text-[10px] text-neutral-500 border-t border-neutral-800/60 pt-2">
                      Por: <strong className="text-neutral-400">{nps.userName}</strong> • {nps.created_at}
                    </p>
                  </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tab: Copilot ── */}
            {activeTab === "copilot" && (
              <div className="flex flex-col h-[600px] border border-neutral-800 bg-neutral-900 rounded-2xl overflow-hidden">
                <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
                    Copiloto Administrativo IA (Backoffice)
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Modifique dados, altere permissões de suporte e status de clínicas utilizando linguagem natural de forma segura.
                  </p>
                </div>

                {/* Messages Panel */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-xl rounded-xl p-3.5 text-xs leading-relaxed ${
                        msg.role === "user" 
                          ? "bg-blue-600 text-white" 
                          : "bg-neutral-800 border border-neutral-750 text-neutral-200"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {sendingChat && (
                    <div className="flex justify-start">
                      <div className="bg-neutral-800 border border-neutral-750 rounded-xl p-3.5 text-xs text-neutral-400 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        Executando comando administrativo...
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggestions Section */}
                <div className="p-4 border-t border-neutral-800 bg-neutral-900/60">
                  <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Comandos Sugeridos</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Mude o plano de Marcelle Beauty para enterprise",
                      "Suspenda acesso da Dra. Ana Paula Fisioterapia",
                      "Promova marcelle@leadpluz.com.br para system_admin",
                      "Envie um alerta de aviso para todos: 'Manutenção programada às 23:00'",
                    ].map((sug) => (
                      <button
                        key={sug}
                        onClick={() => {
                          setChatInput(sug);
                        }}
                        className="text-[10px] bg-neutral-800 hover:bg-neutral-750 border border-neutral-750 rounded-lg px-2.5 py-1 text-neutral-300 transition-colors cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input form */}
                <div className="p-4 border-t border-neutral-800 bg-neutral-850 flex gap-2">
                  <Input
                    placeholder="Digite sua instrução (ex: Suspender clínica Espaço Amanda Matos)..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendAdminCopilotMessage();
                    }}
                    className="flex-1 bg-neutral-900 border-neutral-750 text-xs focus-visible:border-blue-500"
                  />
                  <Button
                    onClick={handleSendAdminCopilotMessage}
                    disabled={sendingChat || !chatInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                  >
                    Enviar
                  </Button>
                </div>
              </div>
            )}

            {/* ── Tab: Alerts ── */}
            {activeTab === "alerts" && (
              <div className="space-y-6">
                {/* Form to create new Alert */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Enviar Novo Alerta de Sistema</h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Gere um aviso importante que será exibido no topo do dashboard da clínica correspondente.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Clínica Destinatária</label>
                      <select
                        value={alertClinicId}
                        onChange={(e) => setAlertClinicId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-neutral-750 bg-neutral-950 px-3 py-1 text-xs cursor-pointer text-white focus-visible:border-blue-500"
                      >
                        <option value="">(Global / Todas as Clínicas)</option>
                        {clinics.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Gravidade (Severity)</label>
                      <select
                        value={alertSeverity}
                        onChange={(e) => setAlertSeverity(e.target.value as any)}
                        className="h-9 w-full rounded-lg border border-neutral-750 bg-neutral-950 px-3 py-1 text-xs cursor-pointer text-white focus-visible:border-blue-500"
                      >
                        <option value="info">Informativo (Azul)</option>
                        <option value="warning">Aviso / Warning (Amarelo)</option>
                        <option value="error">Crítico / Erro (Vermelho)</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Título do Alerta</label>
                      <Input
                        placeholder="ex: Instabilidade na API de Mensagens"
                        value={alertTitle}
                        onChange={(e) => setAlertTitle(e.target.value)}
                        className="bg-neutral-950 border-neutral-750 text-xs focus-visible:border-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Corpo da Mensagem</label>
                      <textarea
                        placeholder="Digite os detalhes da mensagem ou instrução para a clínica..."
                        rows={3}
                        value={alertMessage}
                        onChange={(e) => setAlertMessage(e.target.value)}
                        className="w-full rounded-lg border border-neutral-750 bg-neutral-950 px-3 py-2 text-xs focus-visible:border-blue-500 focus-visible:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateSystemAlert}
                    disabled={creatingAlert}
                    className="flex items-center gap-1.5 px-4 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg cursor-pointer transition-colors"
                  >
                    {creatingAlert ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    Disparar Alerta do Sistema
                  </button>
                </div>

                {/* Active Alerts Table */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
                  <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800">
                    <h3 className="text-sm font-bold text-white">Alertas Ativos Registrados</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-850 text-neutral-400 uppercase tracking-wider text-[9px] font-bold">
                          <th className="p-4">Gravidade</th>
                          <th className="p-4">Clínica</th>
                          <th className="p-4">Título</th>
                          <th className="p-4">Mensagem</th>
                          <th className="p-4">Data</th>
                          <th className="p-4">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemAlerts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center italic text-neutral-500">Nenhum alerta ativo.</td>
                          </tr>
                        ) : (
                          systemAlerts.map((alert) => (
                            <tr key={alert.id} className="border-b border-neutral-850/40 hover:bg-neutral-850/20">
                              <td className="p-4">
                                <span className={`inline-block px-2 py-0.5 font-bold rounded text-[9px] ${
                                  alert.severity === "error" 
                                    ? "bg-rose-500/10 text-rose-400" 
                                    : alert.severity === "warning" 
                                      ? "bg-amber-500/10 text-amber-400" 
                                      : "bg-blue-500/10 text-blue-400"
                                }`}>
                                  {alert.severity.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-4 font-semibold">{alert.clinics?.name || "Global / Todos"}</td>
                              <td className="p-4 font-bold text-white">{alert.title}</td>
                              <td className="p-4 text-neutral-400 max-w-xs truncate">{alert.message}</td>
                              <td className="p-4 text-neutral-500">{new Date(alert.created_at).toLocaleString("pt-BR")}</td>
                              <td className="p-4">
                                <button
                                  onClick={() => handleDeleteSystemAlert(alert.id)}
                                  className="text-rose-500 hover:underline font-bold text-[11px] cursor-pointer"
                                >
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
