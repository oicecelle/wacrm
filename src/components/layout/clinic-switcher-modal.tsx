"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/ui/logo";
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
import { Checkbox } from "@/components/ui/checkbox";

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
  const [setAsDefault, setSetAsDefault] = useState(false);

  const [modalUserName, setModalUserName] = useState<string>("Usuário");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClinicName, setNewClinicName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setModalUserName(profile?.full_name || user.email || "Usuário");

    const directSupabase = createClient();
    directSupabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setModalUserName(data.full_name);
        }
      });
  }, [open, user, profile]);

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
        const currentAccountId = profile.account_id || "";
        setSelectedId(currentAccountId);

        const storedDefault = localStorage.getItem("default_clinic_id");
        setSetAsDefault(storedDefault === currentAccountId);
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
    
    // Save or update default clinic preference in localStorage
    if (setAsDefault) {
      localStorage.setItem("default_clinic_id", selectedId);
    } else {
      if (localStorage.getItem("default_clinic_id") === selectedId) {
        localStorage.removeItem("default_clinic_id");
      }
    }

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

  const handleCreateClinic = async () => {
    if (!newClinicName.trim() || !user) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clinics/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClinicName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao criar a clínica");
      }

      // Switch straight into the clinic that was just created — same
      // profiles.account_id update handleSwitchClinic does, then a
      // reload so every context (auth, permissions, sidebar) picks up
      // the new account cleanly instead of patching state by hand.
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ account_id: data.account_id, account_role: "owner" })
        .eq("user_id", user.id);

      if (updateErr) throw updateErr;

      window.location.reload();
    } catch (err) {
      console.error("Error creating clinic:", err);
      alert(err instanceof Error ? err.message : "Erro ao criar a clínica. Tente novamente.");
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 bg-white border border-neutral-100 shadow-xl text-center">
        <DialogHeader className="space-y-2">
          {/* Logo element placeholder matching aesthetics */}
          <div className="flex justify-center items-center gap-1.5 mb-1">
            <Logo className="h-6 w-6 shrink-0" />
            <span className="text-xl tracking-tight">
              <span className="font-medium text-[#2585fc]">LEAD</span>{" "}
              <span className="font-extrabold text-[#003bbd]">PLUZ</span>
            </span>
          </div>
          <DialogTitle className="text-lg font-black text-neutral-900 leading-tight">
            Bem-vindo, {modalUserName}!
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
                  onClick={() => {
                    setSelectedId(clinic.id);
                    const storedDefault = localStorage.getItem("default_clinic_id");
                    setSetAsDefault(storedDefault === clinic.id);
                  }}
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

            {clinics.length > 0 && (
              <div className="flex items-center gap-2 mt-4 px-1 py-1">
                <Checkbox
                  id="default-clinic-checkbox"
                  checked={setAsDefault}
                  onCheckedChange={(checked) => setSetAsDefault(!!checked)}
                />
                <label
                  htmlFor="default-clinic-checkbox"
                  className="text-xs font-bold text-neutral-600 cursor-pointer select-none"
                >
                  Definir a clínica selecionada como padrão
                </label>
              </div>
            )}

            {/* Create a new, fully isolated clinic under this same login —
                own contacts, inbox, WhatsApp instance and broadcasts. */}
            {showCreateForm ? (
              <div className="mt-4 space-y-2 rounded-xl border border-dashed border-neutral-300 p-3">
                <label className="text-[11px] font-bold text-neutral-600">
                  Nome da nova clínica
                </label>
                <input
                  autoFocus
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  placeholder="Ex: Clínica Bella Vitta"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-800 outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateClinic()}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateClinic}
                    disabled={creating || !newClinicName.trim()}
                    className="h-8 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    {creating ? "Criando..." : "Criar e acessar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewClinicName("");
                    }}
                    disabled={creating}
                    className="rounded-lg px-3 text-xs font-bold text-neutral-400 hover:text-neutral-600"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mt-2 w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-xs font-bold text-neutral-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + Criar nova clínica
              </button>
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
