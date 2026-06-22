"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  PlusIcon,
  MailIcon,
  PercentIcon,
  Loader2Icon,
  XIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Role = "admin" | "professional" | "receptionist" | "marketing";

interface TeamMember {
  id: string;
  user_id: string | null;
  name: string;
  role: Role;
  specialty: string;
  email: string;
  phone: string;
  is_active: boolean;
  commission_model: "percentage" | "fixed" | "hybrid";
  commission_rate: number;
  commission_fixed: number;
  // Computed values
  proceduresMonth: number;
  revenueMonth: number;
  commissionMonth: number;
}

const ROLE_CONFIG: Record<Role, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "text-orange-600 bg-orange-500/10 border-orange-500/30" },
  professional: { label: "Profissional", cls: "text-blue-500 bg-blue-500/10 border-blue-500/30" },
  receptionist: { label: "Recepcionista", cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  marketing: { label: "Marketing", cls: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function EquipePage() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit/Add Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<Role>("professional");
  const [formSpecialty, setFormSpecialty] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCommModel, setFormCommModel] = useState<"percentage" | "fixed" | "hybrid">("percentage");
  const [formCommRate, setFormCommRate] = useState("0");
  const [formCommFixed, setFormCommFixed] = useState("0");

  const loadTeam = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const clinicId = accountId;

      // 1. Fetch clinic users
      const { data: users, error: usersErr } = await supabase
        .from("clinic_users")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("name");

      if (usersErr) throw usersErr;

      const userList = users || [];

      // 2. Fetch appointments for current month to aggregate procedures & revenue
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: appts } = await supabase
        .from("appointments")
        .select("professional_id, status, type")
        .eq("clinic_id", clinicId)
        .gte("start_time", startOfMonth)
        .lte("start_time", endOfMonth)
        .eq("status", "attended");

      const apptsList = appts || [];

      // We'll estimate procedure pricing based on database or use a default standard (e.g. R$ 250 per service)
      const { data: procList } = await supabase
        .from("procedures")
        .select("name, valor")
        .eq("clinic_id", clinicId);

      const priceMap: Record<string, number> = {};
      (procList || []).forEach(p => {
        priceMap[p.name] = Number(p.valor) || 0;
      });

      // Map clinic_users to UI format
      const formattedMembers: TeamMember[] = userList.map(u => {
        // Calculate procedures performed this month - professional_id maps to clinic_users.id (u.id)
        const uAppts = apptsList.filter(a => a.professional_id === u.id);
        const proceduresCount = uAppts.length;

        // Calculate revenue generated
        let revenue = 0;
        uAppts.forEach(a => {
          const servicePrice = priceMap[a.type || ""] || 250; // default to R$ 250 if not specified
          revenue += servicePrice;
        });

        // Compute monthly commission based on model
        const model = u.commission_model || "percentage";
        const rate = Number(u.commission_rate) || 0;
        const fixedVal = Number(u.commission_fixed) || 0;

        let commission = 0;
        if (model === "percentage") {
          commission = (revenue * rate) / 100;
        } else if (model === "fixed") {
          commission = proceduresCount * fixedVal;
        } else if (model === "hybrid") {
          commission = ((revenue * rate) / 100) + (proceduresCount * fixedVal);
        }

        return {
          id: u.id,
          user_id: u.user_id,
          name: u.name || "Sem Nome",
          role: (u.role || "professional") as Role,
          specialty: u.specialty || "Geral",
          email: u.email || "",
          phone: u.phone || "",
          is_active: u.is_active !== false,
          commission_model: model as "percentage" | "fixed" | "hybrid",
          commission_rate: rate,
          commission_fixed: fixedVal,
          proceduresMonth: proceduresCount,
          revenueMonth: revenue,
          commissionMonth: commission
        };
      });

      setMembers(formattedMembers);

    } catch (err: any) {
      console.error("Error loading team:", err);
      setError("Erro ao carregar os dados da equipe.");
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleOpenAddDrawer = () => {
    setEditingMember(null);
    setFormName("");
    setFormRole("professional");
    setFormSpecialty("");
    setFormEmail("");
    setFormPhone("");
    setFormIsActive(true);
    setFormCommModel("percentage");
    setFormCommRate("0");
    setFormCommFixed("0");
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (m: TeamMember) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormRole(m.role);
    setFormSpecialty(m.specialty);
    setFormEmail(m.email);
    setFormPhone(m.phone);
    setFormIsActive(m.is_active);
    setFormCommModel(m.commission_model);
    setFormCommRate(m.commission_rate.toString());
    setFormCommFixed(m.commission_fixed.toString());
    setIsDrawerOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;

    setSaving(true);
    try {
      const clinicId = accountId;
      const rateNum = parseFloat(formCommRate) || 0;
      const fixedNum = parseFloat(formCommFixed) || 0;

      if (editingMember) {
        // Update member
        const { error: updateErr } = await supabase
          .from("clinic_users")
          .update({
            name: formName.trim(),
            role: formRole,
            specialty: formSpecialty.trim(),
            email: formEmail.trim(),
            phone: formPhone.trim().replace(/\D/g, ""),
            is_active: formIsActive,
            commission_model: formCommModel,
            commission_rate: rateNum,
            commission_fixed: fixedNum,
          })
          .eq("id", editingMember.id);

        if (updateErr) throw updateErr;
      } else {
        // Insert new clinic user
        const { error: insertErr } = await supabase
          .from("clinic_users")
          .insert({
            clinic_id: clinicId,
            name: formName.trim(),
            role: formRole,
            specialty: formSpecialty.trim(),
            email: formEmail.trim(),
            phone: formPhone.trim().replace(/\D/g, ""),
            is_active: formIsActive,
            commission_model: formCommModel,
            commission_rate: rateNum,
            commission_fixed: fixedNum,
          });

        if (insertErr) throw insertErr;
      }

      setIsDrawerOpen(false);
      await loadTeam();
      alert(editingMember ? "Membro atualizado com sucesso!" : "Novo membro cadastrado com sucesso!");
    } catch (err: any) {
      console.error("Error saving team member:", err);
      alert("Erro ao salvar membro da equipe: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalRevenue = members.reduce((a, m) => a + m.revenueMonth, 0);
  const totalCommissions = members.reduce((a, m) => a + m.commissionMonth, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[300px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Equipe & Comissões</h1>
          <p className="text-sm text-neutral-500">Cadastre colaboradores, selecione comissionamento e monitore a folha do mês.</p>
        </div>
        <button
          onClick={handleOpenAddDrawer}
          className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-xs font-black hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Adicionar Colaborador
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Membros ativos", value: members.filter((m) => m.is_active).length },
          { label: "Profissionais", value: members.filter((m) => m.role === "professional").length },
          { label: "Faturamento total (mês)", value: fmt(totalRevenue) },
          { label: "Comissões a pagar", value: fmt(totalCommissions) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm/5">
            <p className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-wide">{s.label}</p>
            <p className="mt-1 text-lg font-black text-neutral-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Team cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => {
          const roleConf = ROLE_CONFIG[member.role] || { label: member.role, cls: "text-neutral-500 bg-neutral-100" };
          return (
            <div
              key={member.id}
              onClick={() => handleOpenEditDrawer(member)}
              className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-5 space-y-4 hover:border-blue-300 hover:shadow-md transition-all relative group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-base font-black shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-neutral-800 truncate group-hover:text-blue-700 transition-colors">{member.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{member.specialty}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${roleConf.cls}`}>
                    {roleConf.label}
                  </span>
                  {!member.is_active && (
                    <span className="bg-rose-50 text-rose-600 border border-rose-100 rounded-full px-2 py-0.5 text-[9px] font-black uppercase">
                      Inativo
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Procedimentos/mês</p>
                  <p className="font-black text-neutral-800 text-base mt-0.5">{member.proceduresMonth}</p>
                </div>
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Faturamento/mês</p>
                  <p className="font-black text-neutral-800 text-sm mt-0.5">{fmt(member.revenueMonth)}</p>
                </div>
              </div>

              {/* Commission model representation */}
              {member.role === "professional" && (
                <div className="space-y-1 bg-blue-50/20 border border-blue-100/30 rounded-xl p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase">
                      Comissão ({member.commission_model === 'percentage' ? 'Percentual' : member.commission_model === 'fixed' ? 'Fixo' : 'Híbrido'})
                    </span>
                    <span className="font-black text-blue-700">{fmt(member.commissionMonth)}</span>
                  </div>
                  <p className="text-[9px] text-neutral-400 font-semibold mt-0.5">
                    {member.commission_model === 'percentage' && `${member.commission_rate}% sobre vendas`}
                    {member.commission_model === 'fixed' && `${fmt(member.commission_fixed)} fixo por consulta`}
                    {member.commission_model === 'hybrid' && `${member.commission_rate}% + ${fmt(member.commission_fixed)} fixo`}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-semibold pt-1 border-t border-neutral-100">
                <MailIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{member.email || "Sem e-mail cadastrado"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Commission summary table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4">
          <h2 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Folha de Comissionamento — Mês Vigente</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-6 py-3 text-left text-[10px] font-black text-neutral-400 uppercase tracking-wide">Profissional</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-neutral-400 uppercase tracking-wide">Modelo de Comissão</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-neutral-400 uppercase tracking-wide">Faturamento Produzido</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-neutral-400 uppercase tracking-wide">Comissão Calculada</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-neutral-400 uppercase tracking-wide">Status Folha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {members.filter((m) => m.role === "professional").map((m) => (
                <tr key={m.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-neutral-800">{m.name}</td>
                  <td className="px-6 py-3.5 text-xs text-neutral-500 capitalize">{m.commission_model === 'percentage' ? 'Percentual' : m.commission_model === 'fixed' ? 'Valor Fixo' : 'Híbrido'}</td>
                  <td className="px-6 py-3.5 font-mono text-neutral-600">{fmt(m.revenueMonth)}</td>
                  <td className="px-6 py-3.5 font-black text-blue-700">{fmt(m.commissionMonth)}</td>
                  <td className="px-6 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-600">
                      A pagar
                    </span>
                  </td>
                </tr>
              ))}
              {members.filter((m) => m.role === "professional").length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-xs text-neutral-400 italic">Nenhum profissional de comissão cadastrado na clínica.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Side Drawer Form */}
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end animate-fade-in backdrop-blur-xs">
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-neutral-100 animate-slide-in overflow-y-auto">
            <header className="p-5 border-b border-neutral-100 flex items-center justify-between shrink-0 bg-neutral-50">
              <div>
                <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider">
                  {editingMember ? "Editar Colaborador" : "Cadastrar Colaborador"}
                </h3>
                <p className="text-[10px] text-neutral-500">Configure os acessos, informações de contato e comissionamento.</p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="h-8 w-8 hover:bg-neutral-200/50 rounded-lg flex items-center justify-center transition-colors"
              >
                <XIcon className="h-5 w-5 text-neutral-500" />
              </button>
            </header>

            <form onSubmit={handleSaveMember} className="p-6 flex-1 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-neutral-500 uppercase">Nome Completo *</Label>
                  <Input 
                    type="text" required placeholder="Ex: Dra. Juliana Santos"
                    value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-neutral-500 uppercase">Função / Papel *</Label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as Role)}
                      className="w-full text-xs h-9 rounded-md border border-neutral-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="professional">Profissional Clínico</option>
                      <option value="admin">Administrador</option>
                      <option value="receptionist">Recepcionista</option>
                      <option value="marketing">Marketing</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-neutral-500 uppercase">Especialidade / Setor</Label>
                    <Input 
                      type="text" placeholder="Ex: Harmonização Estética"
                      value={formSpecialty} onChange={(e) => setFormSpecialty(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-neutral-500 uppercase">E-mail</Label>
                  <Input 
                    type="email" placeholder="nome@empresa.com"
                    value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-neutral-500 uppercase">WhatsApp</Label>
                  <Input 
                    type="text" placeholder="Ex: 11999990000"
                    value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
                  <div>
                    <p className="text-xs font-bold text-neutral-800">Status do Colaborador</p>
                    <p className="text-[9px] text-neutral-500">Membros inativos não podem ser selecionados para novos agendamentos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormIsActive(!formIsActive)}
                    className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors ${
                      formIsActive ? "bg-blue-600" : "bg-neutral-300"
                    }`}
                  >
                    <span className={`inline-block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                      formIsActive ? "translate-x-4.5" : ""
                    }`} />
                  </button>
                </div>

                {/* Commission Configuration Section */}
                {formRole === "professional" && (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/10 space-y-4">
                    <p className="text-[10px] font-black text-blue-900 uppercase tracking-wide flex items-center gap-1">
                      <PercentIcon className="h-3.5 w-3.5 text-blue-600" /> Configurar Regra de Comissão
                    </p>

                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold text-neutral-500 uppercase">Modelo de Comissão</Label>
                      <select
                        value={formCommModel}
                        onChange={(e) => setFormCommModel(e.target.value as any)}
                        className="w-full text-xs h-8 rounded-md border border-neutral-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="percentage">Percentual (%) sobre o Faturamento</option>
                        <option value="fixed">Valor Fixo (R$) por Procedimento</option>
                        <option value="hybrid">Modelo Híbrido (Percentual + Fixo)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(formCommModel === "percentage" || formCommModel === "hybrid") && (
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-neutral-500 uppercase">Taxa Percentual (%)</Label>
                          <Input 
                            type="number" step="0.1" placeholder="Ex: 40"
                            value={formCommRate} onChange={(e) => setFormCommRate(e.target.value)}
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                      )}
                      {(formCommModel === "fixed" || formCommModel === "hybrid") && (
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-neutral-500 uppercase">Valor Fixo (R$)</Label>
                          <Input 
                            type="number" step="0.01" placeholder="Ex: 50.00"
                            value={formCommFixed} onChange={(e) => setFormCommFixed(e.target.value)}
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-5 border-t border-neutral-100 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-xs h-10 w-1/3 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-10 w-2/3 rounded-xl font-bold flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Salvar Colaborador"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
