"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { createClient } from "@/lib/supabase/client";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
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
