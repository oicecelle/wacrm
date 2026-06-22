"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckIcon } from "lucide-react";

interface ClinicOption {
  id: string;
  name: string;
}

interface ClinicSwitcherModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClinicSwitcherModal({ open, onOpenChange }: ClinicSwitcherModalProps) {
  const supabase = createClient();
  const { profile, user } = useAuth();
  
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!open || !user || !profile) return;

    const loadUserClinics = async () => {
      setLoading(true);
      try {
        // Fetch all clinic memberships from clinic_users
        const { data: userClinics } = await supabase
          .from("clinic_users")
          .select("clinic_id, role")
          .eq("user_id", user.id);

        const clinicIds = (userClinics || []).map((uc) => uc.clinic_id);
        const allIds = Array.from(new Set([profile.account_id, ...clinicIds].filter(Boolean) as string[]));

        // Fetch accounts details
        const { data: accountsList } = await supabase
          .from("accounts")
          .select("id, name")
          .in("id", allIds);

        setClinics(accountsList || []);
        setSelectedId(profile.account_id || "");
      } catch (err) {
        console.error("Error loading user clinics:", err);
      } finally {
        setLoading(false);
      }
    };

    loadUserClinics();
  }, [open, user, profile, supabase]);

  const handleSwitchClinic = async () => {
    if (!selectedId || !user || !profile) return;
    if (selectedId === profile.account_id) {
      onOpenChange(false);
      return;
    }

    setSwitching(true);
    try {
      // 1. Determine target role
      let targetRole: "owner" | "admin" | "agent" | "viewer" = "agent";

      // 1.1 Check if they are owner of the target account
      const { data: accData } = await supabase
        .from("accounts")
        .select("owner_user_id")
        .eq("id", selectedId)
        .single();

      if (accData?.owner_user_id === user.id) {
        targetRole = "owner";
      } else {
        // 1.2 Check their role in clinic_users for that clinic_id
        const { data: cuData } = await supabase
          .from("clinic_users")
          .select("role")
          .eq("user_id", user.id)
          .eq("clinic_id", selectedId)
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

      // 2. Update profiles table to point to new clinic/account
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          account_id: selectedId,
          account_role: targetRole,
        })
        .eq("user_id", user.id);

      if (updateErr) throw updateErr;

      // 3. Reload window to refresh context
      window.location.reload();
    } catch (err) {
      console.error("Error switching clinic:", err);
      alert("Erro ao trocar de clínica. Tente novamente.");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 bg-white border border-neutral-100 shadow-xl text-center">
        <DialogHeader className="space-y-2">
          {/* Logo element placeholder matching aesthetics */}
          <div className="flex justify-center items-center gap-1.5 mb-1">
            <span className="text-xl font-black tracking-tight text-blue-600">lp</span>
            <span className="text-xl font-bold text-neutral-800">leadpluz</span>
          </div>
          <DialogTitle className="text-lg font-black text-neutral-900 leading-tight">
            Bem vindo, {profile?.full_name || "Usuário"}!
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-500 font-semibold">
            Qual a clínica que você deseja acessar agora?
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3 py-3 text-left">
            {clinics.map((clinic) => {
              const isSelected = selectedId === clinic.id;
              return (
                <div
                  key={clinic.id}
                  onClick={() => setSelectedId(clinic.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/40 text-blue-900"
                      : "border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700"
                  }`}
                >
                  <span className="text-xs font-bold">{clinic.name}</span>
                  <div
                    className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-neutral-300 bg-white"
                    }`}
                  >
                    {isSelected && <CheckIcon className="h-3 w-3 stroke-[3]" />}
                  </div>
                </div>
              );
            })}

            {clinics.length === 0 && (
              <p className="text-xs text-neutral-400 italic text-center py-4">
                Nenhuma clínica vinculada a este usuário.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 pt-2 sm:flex-col shrink-0">
          <Button
            onClick={handleSwitchClinic}
            disabled={switching || !selectedId}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 h-10 rounded-xl transition-all"
          >
            {switching ? "Acessando..." : "Acessar clínica selecionada"}
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[11px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors py-1 cursor-pointer self-center"
          >
            Voltar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
