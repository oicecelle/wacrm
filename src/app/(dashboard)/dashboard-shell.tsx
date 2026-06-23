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

    const defaultClinicId = localStorage.getItem("default_clinic_id");
    const hasAutoSwitched = sessionStorage.getItem("clinic_auto_switched");

    if (defaultClinicId && profile.account_id && profile.account_id !== defaultClinicId && !hasAutoSwitched) {
      sessionStorage.setItem("clinic_auto_switched", "true");

      const autoSwitch = async () => {
        const supabase = createClient();
        try {
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
        } catch (err) {
          console.error("Error auto switching clinic:", err);
        }
      };

      autoSwitch();
    }
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
