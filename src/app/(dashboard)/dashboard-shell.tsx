"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { createClient } from "@/lib/supabase/client";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { ShieldAlert, AlertCircle, Sparkles } from "lucide-react";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Full-screen "app-like" builders (fixed inset-0, no z-index of
  // their own so they don't fight every dropdown/popover that also
  // lives at z-50 throughout the app) need this banner out of the
  // way entirely rather than layered under or over it.
  const hideTrialBanner = pathname?.startsWith("/automations/new") || /^\/automations\/[^/]+\/edit/.test(pathname ?? "");

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || !profile || !profile.account_id) return;

    const checkSuspension = async () => {
      const supabase = createClient();
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("status")
        .eq("id", profile.account_id)
        .maybeSingle();

      const hasAdminBypass = profile?.role === "system_admin" || user?.email === "marcelle@leadpluz.com.br";
      if (clinicData && clinicData.status === "suspended" && !hasAdminBypass) {
        setIsSuspended(true);
      } else {
        setIsSuspended(false);
      }
    };

    checkSuspension();
  }, [loading, user, profile]);

  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (loading || !user || !profile || !profile.account_id) return;

    const fetchAlerts = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("system_alerts")
        .select("*")
        .or(`clinic_id.eq.${profile.account_id},clinic_id.is.null`)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      setAlerts(data || []);
    };

    fetchAlerts();

    // Poll for alerts every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loading, user, profile]);

  useEffect(() => {
    if (loading || !user || !profile) return;

    const hasHandledClinicSelection = sessionStorage.getItem("clinic_auto_switched");
    if (hasHandledClinicSelection) return;

    // Mark this session so we don't re-run
    sessionStorage.setItem("clinic_auto_switched", "true");

    const handleClinicSetup = async () => {
      const supabase = createClient();
      try {
        const defaultClinicId = localStorage.getItem("default_clinic_id");

        // Check how many clinics this user belongs to
        const { data: memberships } = await supabase
          .from("clinic_users")
          .select("clinic_id")
          .eq("user_id", user.id);

        const memberClinicIds = (memberships || []).map((m: { clinic_id: string }) => m.clinic_id);
        const allIds = Array.from(
          new Set([profile.account_id, ...memberClinicIds].filter(Boolean) as string[])
        );

        // If user belongs to multiple clinics and has no default set → show selector
        if (allIds.length > 1 && !defaultClinicId) {
          router.push("/selecionar-clinica");
          return;
        }

        // If user has a stored default that differs from current account → auto-switch to it
        if (defaultClinicId && profile.account_id && profile.account_id !== defaultClinicId) {
          let targetRole: "owner" | "admin" | "agent" | "viewer" = "agent";

          const { data: accData } = await supabase
            .from("accounts")
            .select("owner_user_id")
            .eq("id", defaultClinicId)
            .single();

          if (accData?.owner_user_id === user.id) {
            targetRole = "owner";
          } else {
            const { data: cuData } = await supabase
              .from("clinic_users")
              .select("role")
              .eq("user_id", user.id)
              .eq("clinic_id", defaultClinicId)
              .maybeSingle();

            if (cuData) {
              const roleMap: Record<string, "admin" | "agent" | "viewer"> = {
                admin: "admin",
                professional: "agent",
                receptionist: "agent",
                marketing: "agent",
              };
              targetRole = roleMap[cuData.role] || "agent";
            }
          }

          const { error: updateErr } = await supabase
            .from("profiles")
            .update({
              account_id: defaultClinicId,
              account_role: targetRole,
            })
            .eq("user_id", user.id);

          if (updateErr) throw updateErr;

          window.location.reload();
        }
      } catch (err) {
        console.error("Error in clinic setup:", err);
      }
    };

    handleClinicSetup();
  }, [loading, user, profile]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (isSuspended) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 px-4 text-center text-white">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 max-w-md space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 mx-auto">
            <ShieldAlert className="h-6 w-6 text-red-500 animate-bounce" />
          </div>
          <h1 className="text-xl font-bold">Acesso Suspenso</h1>
          <p className="text-xs text-muted-foreground">
            A assinatura da sua clínica foi suspensa temporariamente por motivos administrativos ou de faturamento.
          </p>
          <p className="text-xs text-muted-foreground">
            Entre em contato com o suporte ou o administrador da clínica para regularizar a situação.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {user?.created_at && !hideTrialBanner && (
          <div className="bg-blue-600 text-white text-center py-2 px-4 text-[11px] font-bold shadow-xs flex items-center justify-center gap-2 relative z-50">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-yellow-300 animate-pulse" />
            <span>
              Você está no dia {Math.min(Math.max(Math.ceil((new Date().getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)), 1), 7)} de 7 dias de teste. Aproveite ao máximo, conte com o nosso suporte.
            </span>
          </div>
        )}
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-24 animate-fade-in">
          {/* Active System Alerts Banner */}
          {alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between rounded-xl border p-4 text-xs font-medium shadow-sm transition-all duration-200 ${
                    alert.severity === "error"
                      ? "border-red-500/20 bg-red-500/10 text-red-400"
                      : alert.severity === "warning"
                      ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                      : "border-blue-500/20 bg-blue-500/10 text-blue-400"
                  }`}
                >
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold mb-0.5">{alert.title}</strong>
                      <span className="opacity-90 leading-relaxed block">{alert.message}</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const supabase = createClient();
                      // Optimistic dismiss
                      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
                      // Resolve alert in DB
                      await supabase
                        .from("system_alerts")
                        .update({ resolved_at: new Date().toISOString() })
                        .eq("id", alert.id);
                    }}
                    className="opacity-60 hover:opacity-100 font-bold transition-opacity ml-2 shrink-0 cursor-pointer text-[10px] underline"
                  >
                    Dispensar
                  </button>
                </div>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
      {/* Copiloto flutuante — visível em todas as telas autenticadas */}
      <CopilotChat />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
