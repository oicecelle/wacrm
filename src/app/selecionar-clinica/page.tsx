"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";
import {
  Loader2Icon,
  CheckIcon,
  BuildingIcon,
  LogOutIcon,
  ChevronRightIcon,
  StarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClinicOption {
  id: string;
  name: string;
  role: string;
}

export default function SelecionarClinicaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [userName, setUserName] = useState("");
  const [switching, setSwitching] = useState(false);
  const [defaultClinicId, setDefaultClinicId] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClinicName, setNewClinicName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setDefaultClinicId(localStorage.getItem("default_clinic_id"));
  }, []);

  const loadClinics = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push("/login");
        return;
      }

      const userId = session.user.id;

      // Load user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, account_id")
        .eq("user_id", userId)
        .maybeSingle();

      setUserName(profile?.full_name || session.user.email || "Usuário");

      const currentAccountId = profile?.account_id;

      // Get all clinics where user is a member (clinic_users)
      const { data: memberships } = await supabase
        .from("clinic_users")
        .select("clinic_id, role")
        .eq("user_id", userId);

      const memberClinicIds = (memberships || []).map((m) => m.clinic_id);
      const allIds = Array.from(
        new Set([currentAccountId, ...memberClinicIds].filter(Boolean) as string[])
      );

      // Fetch accounts for all clinic ids
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, owner_user_id")
        .in("id", allIds);

      // Build role label map
      const roleMap: Record<string, string> = {};
      (memberships || []).forEach((m) => {
        roleMap[m.clinic_id] = m.role;
      });

      const clinicList: ClinicOption[] = (accounts || []).map((acc) => ({
        id: acc.id,
        name: acc.name,
        role:
          acc.owner_user_id === userId
            ? "Proprietário"
            : roleMap[acc.id] === "admin"
            ? "Administrador"
            : roleMap[acc.id] === "professional"
            ? "Profissional"
            : roleMap[acc.id] === "receptionist"
            ? "Recepção"
            : roleMap[acc.id] === "marketing"
            ? "Marketing"
            : "Membro",
      }));

      setClinics(clinicList);

      if (clinicList.length === 1) {
        const targetId = clinicList[0].id;
        setSelectedId(targetId);
        setSwitching(true);

        let targetRole: "owner" | "admin" | "agent" | "viewer" = "agent";
        const acc = accounts?.find((a) => a.id === targetId);
        if (acc?.owner_user_id === userId) {
          targetRole = "owner";
        } else {
          const m = memberships?.find((m) => m.clinic_id === targetId);
          if (m) {
            const rm: Record<string, "admin" | "agent" | "viewer"> = {
              admin: "admin",
              professional: "agent",
              receptionist: "agent",
              marketing: "agent",
            };
            targetRole = rm[m.role] || "agent";
          }
        }

        await supabase
          .from("profiles")
          .update({ account_id: targetId, account_role: targetRole })
          .eq("user_id", userId);

        sessionStorage.setItem("clinic_auto_switched", "true");
        router.push("/agenda");
        return;
      }

      // Auto-select: default > current > first
      const storedDefault = localStorage.getItem("default_clinic_id");
      if (storedDefault && clinicList.find((c) => c.id === storedDefault)) {
        setSelectedId(storedDefault);
      } else if (currentAccountId) {
        setSelectedId(currentAccountId);
      } else if (clinicList.length > 0) {
        setSelectedId(clinicList[0].id);
      }
    } catch (err) {
      console.error("Error loading clinics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  const handleAccess = async () => {
    if (!selectedId || switching) return;
    setSwitching(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      const userId = session.user.id;

      // Determine role
      let targetRole: "owner" | "admin" | "agent" | "viewer" = "agent";

      const { data: accData } = await supabase
        .from("accounts")
        .select("owner_user_id")
        .eq("id", selectedId)
        .single();

      if (accData?.owner_user_id === userId) {
        targetRole = "owner";
      } else {
        const { data: cuData } = await supabase
          .from("clinic_users")
          .select("role")
          .eq("user_id", userId)
          .eq("clinic_id", selectedId)
          .maybeSingle();

        if (cuData) {
          const rm: Record<string, "admin" | "agent" | "viewer"> = {
            admin: "admin",
            professional: "agent",
            receptionist: "agent",
            marketing: "agent",
          };
          targetRole = rm[cuData.role] || "agent";
        }
      }

      await supabase
        .from("profiles")
        .update({ account_id: selectedId, account_role: targetRole })
        .eq("user_id", userId);

      // Mark this session as already handled to prevent dashboard-shell auto-switch loop
      sessionStorage.setItem("clinic_auto_switched", "true");

      router.push("/agenda");
    } catch (err) {
      console.error("Error accessing clinic:", err);
      alert("Erro ao acessar a clínica. Tente novamente.");
    } finally {
      setSwitching(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateClinic = async () => {
    if (!newClinicName.trim() || creating) return;
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

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      await supabase
        .from("profiles")
        .update({ account_id: data.account_id, account_role: "owner" })
        .eq("user_id", session.user.id);

      sessionStorage.setItem("clinic_auto_switched", "true");
      router.push("/agenda");
    } catch (err) {
      console.error("Error creating clinic:", err);
      alert(err instanceof Error ? err.message : "Erro ao criar a clínica. Tente novamente.");
      setCreating(false);
    }
  };

  const handleSetDefault = (clinicId: string) => {
    if (defaultClinicId === clinicId) {
      localStorage.removeItem("default_clinic_id");
      setDefaultClinicId(null);
    } else {
      localStorage.setItem("default_clinic_id", clinicId);
      setDefaultClinicId(clinicId);
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    Proprietário: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    Administrador: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20",
    Profissional: "text-blue-600 bg-blue-500/10 border-blue-500/20",
    Recepção: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    Marketing: "text-violet-600 bg-violet-500/10 border-violet-500/20",
    Membro: "text-neutral-500 bg-neutral-100 border-neutral-200",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Logo className="h-10 w-10 shrink-0" />
            <span className="text-xl tracking-tight text-slate-900">
              <span className="font-medium text-[#2585fc]">LEAD</span>{" "}
              <span className="font-extrabold text-[#003bbd]">PLUZ</span>
            </span>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Carregando suas clínicas...</p>
          ) : (
            <>
              <h1 className="text-lg font-black text-slate-900">
                Olá, {userName.split(" ")[0]}! 👋
              </h1>
              <p className="text-xs text-slate-500 font-semibold">
                Selecione a clínica que deseja acessar
              </p>
            </>
          )}
        </div>

        {/* Clinic cards */}
        <div className="rounded-2xl p-2 space-y-1 bg-white border border-slate-200 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : clinics.length === 0 ? (
            <div className="text-center py-8">
              <BuildingIcon className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs text-slate-400 italic font-semibold">
                Nenhuma clínica vinculada. Contate o administrador.
              </p>
            </div>
          ) : (
            clinics.map((clinic) => {
              const isSelected = selectedId === clinic.id;
              const isDefault = defaultClinicId === clinic.id;
              const roleClr = ROLE_COLORS[clinic.role] || ROLE_COLORS["Membro"];
              return (
                <button
                  key={clinic.id}
                  type="button"
                  onClick={() => setSelectedId(clinic.id)}
                  className={cn(
                    "group w-full text-left rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all border",
                    isSelected
                      ? "bg-blue-50/70 border-blue-200/80 text-blue-900"
                      : "bg-slate-50/40 border-slate-100/50 hover:bg-slate-50 hover:border-slate-200 text-slate-700"
                  )}
                >
                  {/* Clinic avatar */}
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-base font-black text-white",
                      isSelected
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                        : "bg-slate-200 text-slate-600"
                    )}
                  >
                    {clinic.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-black text-slate-800 truncate">
                        {clinic.name}
                      </p>
                      {isDefault && (
                        <StarIcon className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />
                      )}
                    </div>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide mt-0.5 ${roleClr}`}
                    >
                      {clinic.role}
                    </span>
                  </div>

                  {/* Selected indicator or star button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      title={isDefault ? "Remover como padrão" : "Definir como padrão"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(clinic.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md flex items-center justify-center transition-all hover:bg-slate-100"
                      style={{ opacity: isDefault ? 1 : undefined }}
                    >
                      <StarIcon
                        className={`h-3.5 w-3.5 transition-colors ${
                          isDefault
                            ? "text-amber-500 fill-amber-500"
                            : "text-slate-400"
                        }`}
                      />
                    </button>
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center transition-all border",
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-100 border-slate-200 text-transparent"
                      )}
                    >
                      {isSelected && <CheckIcon className="h-3 w-3 text-white stroke-[3]" />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Default hint */}
        <p className="text-[10px] text-slate-400 text-center font-semibold">
          ⭐ Clique na estrela para definir uma clínica como padrão na próxima entrada
        </p>

        {/* Create a new, fully isolated clinic under this same login */}
        {showCreateForm ? (
          <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
            <label className="text-[11px] font-bold text-slate-600">Nome da nova clínica</label>
            <input
              autoFocus
              value={newClinicName}
              onChange={(e) => setNewClinicName(e.target.value)}
              placeholder="Ex: Clínica Bella Vitta"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClinic()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateClinic}
                disabled={creating || !newClinicName.trim()}
                className="h-9 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {creating ? "Criando..." : "Criar e acessar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewClinicName("");
                }}
                disabled={creating}
                className="rounded-lg px-3 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Criar nova clínica
          </button>
        )}

        {/* Access button */}
        <button
          type="button"
          onClick={handleAccess}
          disabled={!selectedId || switching || loading}
          className="w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-md shadow-blue-500/10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-95 active:scale-95"
        >
          {switching ? (
            <>
              <Loader2Icon className="h-5 w-5 animate-spin" />
              Acessando...
            </>
          ) : (
            <>
              Acessar Painel
              <ChevronRightIcon className="h-5 w-5" />
            </>
          )}
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors py-1"
        >
          <LogOutIcon className="h-3.5 w-3.5" />
          Sair da conta
        </button>
      </div>
    </div>
  );
}
