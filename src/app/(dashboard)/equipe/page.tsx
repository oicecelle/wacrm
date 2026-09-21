"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import {
  PlusIcon,
  MailIcon,
  PercentIcon,
  Loader2Icon,
  XIcon,
  ShieldAlertIcon,
  LinkIcon,
  CheckCircle2Icon,
  ClockIcon,
  ShieldIcon,
  UserCogIcon,
  BriefcaseIcon,
  MegaphoneIcon,
  PhoneIcon,
  UserXIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog";

/* ─── Types ──────────────────────────────────────────────── */
type Role = "admin" | "professional" | "receptionist" | "marketing" | "financial" | "traffic_manager" | "commercial";

interface TeamMember {
  id: string;
  user_id: string | null;
  name: string;
  role: Role;
  specialty: string;
  email: string;
  phone: string;
  avatar_url?: string | null;
  is_active: boolean;
  invite_status: "pending" | "active" | "disabled";
  invite_email: string | null;
  commission_model: "percentage" | "fixed" | "hybrid";
  commission_rate: number;
  commission_fixed: number;
  permissions_json: Record<string, boolean>;
  // computed
  proceduresMonth: number;
  revenueMonth: number;
  commissionMonth: number;
}

/* ─── Config Maps ────────────────────────────────────────── */
const ROLE_CONFIG: Record<Role, { label: string; cls: string; icon: React.ElementType }> = {
  admin: { label: "Administrador", cls: "text-orange-600 bg-orange-50 border-orange-200", icon: ShieldIcon },
  professional: { label: "Profissional", cls: "text-blue-600 bg-blue-50 border-blue-200", icon: UserCogIcon },
  receptionist: { label: "Recepcionista", cls: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: PhoneIcon },
  marketing: { label: "Marketing", cls: "text-amber-600 bg-amber-50 border-amber-200", icon: MegaphoneIcon },
  financial: { label: "Financeiro", cls: "text-violet-600 bg-violet-50 border-violet-200", icon: PercentIcon },
  traffic_manager: { label: "Gestor de Tráfego", cls: "text-cyan-600 bg-cyan-50 border-cyan-200", icon: BriefcaseIcon },
  commercial: { label: "Comercial", cls: "text-rose-600 bg-rose-50 border-rose-200", icon: BriefcaseIcon },
};

const DEFAULT_PERMISSIONS: Record<Role, Record<string, boolean>> = {
  admin: {
    view_crm: true, edit_crm: true, view_agenda: true, edit_agenda: true,
    view_financeiro: true, edit_financeiro: true, view_documentos: true,
    generate_documentos: true, view_relatorios: true, configurar_marketing: true,
    gerenciar_equipe: true, acessar_configuracoes: true,
  },
  professional: {
    view_crm: true, edit_crm: false, view_agenda: true, edit_agenda: true,
    view_financeiro: false, edit_financeiro: false, view_documentos: true,
    generate_documentos: true, view_relatorios: false, configurar_marketing: false,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
  receptionist: {
    view_crm: true, edit_crm: true, view_agenda: true, edit_agenda: true,
    view_financeiro: false, edit_financeiro: false, view_documentos: true,
    generate_documentos: true, view_relatorios: false, configurar_marketing: true,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
  marketing: {
    view_crm: true, edit_crm: false, view_agenda: false, edit_agenda: false,
    view_financeiro: false, edit_financeiro: false, view_documentos: false,
    generate_documentos: false, view_relatorios: true, configurar_marketing: true,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
  financial: {
    view_crm: false, edit_crm: false, view_agenda: false, edit_agenda: false,
    view_financeiro: true, edit_financeiro: true, view_documentos: true,
    generate_documentos: false, view_relatorios: true, configurar_marketing: false,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
  traffic_manager: {
    view_crm: true, edit_crm: false, view_agenda: false, edit_agenda: false,
    view_financeiro: false, edit_financeiro: false, view_documentos: false,
    generate_documentos: false, view_relatorios: true, configurar_marketing: true,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
  commercial: {
    view_crm: true, edit_crm: true, view_agenda: true, edit_agenda: false,
    view_financeiro: false, edit_financeiro: false, view_documentos: true,
    generate_documentos: false, view_relatorios: true, configurar_marketing: false,
    gerenciar_equipe: false, acessar_configuracoes: false,
  },
};

const PERMISSION_LABELS: Record<string, string> = {
  view_crm: "Visualizar CRM",
  edit_crm: "Editar CRM",
  view_agenda: "Visualizar Agenda",
  edit_agenda: "Editar Agenda",
  view_financeiro: "Visualizar Financeiro",
  edit_financeiro: "Editar Financeiro",
  view_documentos: "Visualizar Documentos",
  generate_documentos: "Gerar Documentos",
  view_relatorios: "Visualizar Relatórios",
  configurar_marketing: "Configurar Marketing",
  gerenciar_equipe: "Gerenciar Equipe",
  acessar_configuracoes: "Acessar Configurações",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-blue-600" : "bg-neutral-300"}`}
    >
      <span className={`inline-block h-4 w-4 translate-x-0.5 rounded-full bg-card shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export default function EquipePage() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const { hasPermission, loading: permsLoading } = usePermissions();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);

  // Invite modal state
  const [isLinkInviteOpen, setIsLinkInviteOpen] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<Role>("professional");
  const [formSpecialty, setFormSpecialty] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCommModel, setFormCommModel] = useState<"percentage" | "fixed" | "hybrid">("percentage");
  const [formCommRate, setFormCommRate] = useState("0");
  const [formCommFixed, setFormCommFixed] = useState("0");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({});

  /* ─── Load team ─────────────────────────────────────────── */
  const hasLoadedTeamOnce = useRef(false);
  const loadTeam = useCallback(async () => {
    if (!accountId) return;
    // Only the very first load takes over the whole screen with a
    // spinner. Later calls (e.g. right after creating an invite link,
    // via onCreated) are a background refresh — swapping the entire
    // page for a spinner mid-refresh was unmounting the invite dialog
    // along with everything else, closing it before its "link
    // created" result screen ever got to render.
    if (!hasLoadedTeamOnce.current) setLoading(true);
    setError(null);
    try {
      const { data: users, error: usersErr } = await supabase
        .from("clinic_users")
        .select("*")
        .eq("clinic_id", accountId)
        .order("name");

      if (usersErr) throw usersErr;

      // Fetch profile avatars for the user accounts
      const userIds = (users || []).map((u) => u.user_id).filter(Boolean);
      const profilesMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, avatar_url")
          .in("user_id", userIds);
        (profs || []).forEach((p) => {
          if (p.avatar_url && p.user_id) {
            profilesMap[p.user_id] = p.avatar_url;
          }
        });
      }

      // Fetch appointments for commission calc
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: appts } = await supabase
        .from("appointments")
        .select("professional_id, status, type")
        .eq("clinic_id", accountId)
        .gte("start_time", startOfMonth)
        .lte("start_time", endOfMonth)
        .eq("status", "attended");

      const { data: procList } = await supabase
        .from("procedures")
        .select("name, valor")
        .eq("clinic_id", accountId);

      const priceMap: Record<string, number> = {};
      (procList || []).forEach((p) => { priceMap[p.name] = Number(p.valor) || 0; });

      const formatted: TeamMember[] = (users || []).map((u) => {
        const uAppts = (appts || []).filter((a) => a.professional_id === u.id);
        const proceduresCount = uAppts.length;
        let revenue = 0;
        uAppts.forEach((a) => { revenue += priceMap[a.type || ""] || 250; });

        const model = u.commission_model || "percentage";
        const rate = Number(u.commission_rate) || 0;
        const fixedVal = Number(u.commission_fixed) || 0;
        let commission = 0;
        if (model === "percentage") commission = (revenue * rate) / 100;
        else if (model === "fixed") commission = proceduresCount * fixedVal;
        else if (model === "hybrid") commission = (revenue * rate) / 100 + proceduresCount * fixedVal;

        return {
          id: u.id, user_id: u.user_id,
          name: u.name || "Sem Nome",
          role: (u.role || "professional") as Role,
          specialty: u.specialty || "",
          email: u.email || "",
          phone: u.phone || "",
          avatar_url: u.user_id ? (profilesMap[u.user_id] || null) : null,
          is_active: u.is_active !== false,
          invite_status: (u.invite_status || (u.user_id ? "active" : "pending")) as "pending" | "active" | "disabled",
          invite_email: u.invite_email || null,
          commission_model: model as "percentage" | "fixed" | "hybrid",
          commission_rate: rate,
          commission_fixed: fixedVal,
          permissions_json: u.permissions_json || {},
          proceduresMonth: proceduresCount,
          revenueMonth: revenue,
          commissionMonth: commission,
        };
      });

      setMembers(formatted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar equipe.");
    } finally {
      setLoading(false);
      hasLoadedTeamOnce.current = true;
    }
  }, [accountId, supabase]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleResendInvite = async (member: TeamMember) => {
    if (!member.invite_email && !member.email) return;
    const email = member.invite_email || member.email;
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          clinic_user_id: member.id,
          name: member.name,
          account_id: accountId,
          resend: true,
        }),
      });
      if (!res.ok) throw new Error("Erro ao reenviar.");
      toast.success(`Convite reenviado para ${email}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao reenviar convite.");
    }
  };

  /* ─── Edit / Save handler ─────────────────────────────────── */
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
    setFormPermissions(m.permissions_json || DEFAULT_PERMISSIONS[m.role] || {});
    setIsDrawerOpen(true);
  };

  const handleRoleChange = (role: Role) => {
    setFormRole(role);
    setFormPermissions(DEFAULT_PERMISSIONS[role] || {});
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !editingMember) return;
    setSaving(true);
    try {
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
          commission_rate: parseFloat(formCommRate) || 0,
          commission_fixed: parseFloat(formCommFixed) || 0,
          permissions_json: formPermissions,
        })
        .eq("id", editingMember.id)
        .eq("clinic_id", accountId);

      if (updateErr) throw updateErr;
      toast.success("Colaborador atualizado!");
      setIsDrawerOpen(false);
      await loadTeam();
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  /* ─── Stats ──────────────────────────────────────────────── */
  const totalRevenue = members.reduce((a, m) => a + m.revenueMonth, 0);
  const totalCommissions = members.reduce((a, m) => a + m.commissionMonth, 0);
  const pendingInvites = members.filter((m) => m.invite_status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!permsLoading && !hasPermission("gerenciar_equipe", "view")) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlertIcon className="h-10 w-10 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-bold text-foreground">Sem acesso à Equipe</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sua função não tem permissão pra ver essa área. Fale com um administrador se precisar
            de acesso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Equipe & Comissões</h1>
          <p className="text-sm text-muted-foreground">Convide colaboradores, configure permissões e acompanhe comissões.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLinkInviteOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-xs font-black hover:bg-blue-700 transition-colors shadow-sm"
          >
            <LinkIcon className="h-4 w-4" />
            Convidar por Link
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Membros ativos", value: members.filter((m) => m.is_active).length },
          { label: "Convites pendentes", value: pendingInvites },
          { label: "Faturamento (mês)", value: fmt(totalRevenue) },
          { label: "Comissões a pagar", value: fmt(totalCommissions) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-wide">{s.label}</p>
            <p className="mt-1 text-lg font-black text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending invites banner */}
      {pendingInvites > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <ClockIcon className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs font-semibold text-amber-800">
            {pendingInvites} convite{pendingInvites > 1 ? "s" : ""} aguardando aceitação.
            Os colaboradores devem verificar o e-mail e clicar no link enviado.
          </p>
        </div>
      )}

      {/* Team Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => {
          const roleConf = ROLE_CONFIG[member.role] || { label: member.role, cls: "text-muted-foreground bg-neutral-100 border-border", icon: UserCogIcon };
          const RoleIcon = roleConf.icon;
          const isPending = member.invite_status === "pending";

          return (
            <div
              key={member.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3 hover:border-blue-200 hover:shadow-md transition-all relative"
            >
              {/* Pending badge overlay */}
              {isPending && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-600">
                  <ClockIcon className="h-2.5 w-2.5" /> Pendente
                </span>
              )}

              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full flex items-center justify-center shrink-0 bg-neutral-100 border border-border overflow-hidden text-neutral-700 font-black text-base">
                  {member.avatar_url ? (
                    <img 
                      src={member.avatar_url} 
                      alt={member.name} 
                      className="size-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    member.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-foreground truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.specialty || member.email}</p>
                  {member.phone && (
                    <a 
                      href={`https://wa.me/${member.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-primary hover:underline mt-0.5 flex items-center gap-1 w-max"
                    >
                      {member.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Role chip */}
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${roleConf.cls}`}>
                  <RoleIcon className="h-2.5 w-2.5" />
                  {roleConf.label}
                </span>
                {!member.is_active && !isPending && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-600">
                    <UserXIcon className="h-2.5 w-2.5" /> Inativo
                  </span>
                )}
              </div>

              {/* Stats */}
              {!isPending && member.role === "professional" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Proc./mês</p>
                    <p className="font-black text-foreground text-base mt-0.5">{member.proceduresMonth}</p>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Comissão</p>
                    <p className="font-black text-blue-700 text-sm mt-0.5">{fmt(member.commissionMonth)}</p>
                  </div>
                </div>
              )}

              {/* Invite resend for pending */}
              {isPending && (
                <p className="text-[11px] text-muted-foreground">
                  Convite enviado para: <span className="font-bold text-neutral-600">{member.invite_email || member.email}</span>
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
                {!isPending ? (
                  <button
                    onClick={() => handleOpenEditDrawer(member)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Editar
                  </button>
                ) : (
                  <button
                    onClick={() => handleResendInvite(member)}
                    className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors"
                  >
                    <RefreshCwIcon className="h-3 w-3" /> Reenviar convite
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {members.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground">
            <MailIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">Nenhum colaborador cadastrado.</p>
            <p className="text-xs mt-1">Clique em &quot;Convidar por Link&quot; para adicionar membros à equipe.</p>
          </div>
        )}
      </div>

      {/* Commission Table */}
      {members.filter((m) => m.role === "professional").length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4">
            <h2 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Folha de Comissionamento — Mês Vigente</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-6 py-3 text-left text-[10px] font-black text-muted-foreground uppercase">Profissional</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-muted-foreground uppercase">Modelo</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-muted-foreground uppercase">Faturamento</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-muted-foreground uppercase">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {members.filter((m) => m.role === "professional").map((m) => (
                <tr key={m.id} className="hover:bg-neutral-50/50">
                  <td className="px-6 py-3 font-bold text-foreground">{m.name}</td>
                  <td className="px-6 py-3 text-xs text-muted-foreground capitalize">
                    {m.commission_model === "percentage" ? `${m.commission_rate}%` : m.commission_model === "fixed" ? `R$ ${m.commission_fixed} fixo` : "Híbrido"}
                  </td>
                  <td className="px-6 py-3 font-mono text-neutral-600">{fmt(m.revenueMonth)}</td>
                  <td className="px-6 py-3 font-black text-blue-700">{fmt(m.commissionMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteMemberDialog
        open={isLinkInviteOpen}
        onOpenChange={setIsLinkInviteOpen}
        onCreated={loadTeam}
      />

      {/* ═══ EDIT DRAWER ════════════════════════════════════════ */}
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-sm">
          <div className="bg-card w-full max-w-md h-full flex flex-col shadow-2xl border-l border-neutral-100 overflow-y-auto">
            <header className="p-5 border-b border-neutral-100 flex items-center justify-between shrink-0 bg-neutral-50">
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Editar Colaborador</h3>
                <p className="text-[10px] text-muted-foreground">{editingMember?.name}</p>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="h-8 w-8 hover:bg-neutral-200 rounded-lg flex items-center justify-center">
                <XIcon className="h-5 w-5 text-muted-foreground" />
              </button>
            </header>

            <form onSubmit={handleSaveMember} className="p-6 flex-1 flex flex-col gap-5">
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Nome Completo *</Label>
                  <Input required value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>

                {/* Role + Specialty */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Função</Label>
                    <select
                      value={formRole}
                      onChange={(e) => handleRoleChange(e.target.value as Role)}
                      className="w-full text-xs h-9 rounded-lg border border-border bg-card px-2 focus:ring-1 focus:ring-blue-500"
                    >
                      {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Especialidade</Label>
                    <Input placeholder="Ex: Harmonização" value={formSpecialty} onChange={(e) => setFormSpecialty(e.target.value)} className="text-xs h-9" />
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail</Label>
                  <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="text-xs h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">WhatsApp</Label>
                  <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="11999990000" className="text-xs h-9" />
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
                  <div>
                    <p className="text-xs font-bold text-foreground">Colaborador Ativo</p>
                    <p className="text-[9px] text-muted-foreground">Inativos não aparecem para agendamentos.</p>
                  </div>
                  <Toggle checked={formIsActive} onChange={() => setFormIsActive(!formIsActive)} />
                </div>

                {/* Commission (professionals only) */}
                {formRole === "professional" && (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/20 space-y-3">
                    <p className="text-[10px] font-black text-blue-900 uppercase tracking-wide flex items-center gap-1">
                      <PercentIcon className="h-3.5 w-3.5 text-blue-600" /> Comissão
                    </p>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold text-muted-foreground uppercase">Modelo</Label>
                      <select
                        value={formCommModel}
                        onChange={(e) => setFormCommModel(e.target.value as "percentage" | "fixed" | "hybrid")}
                        className="w-full text-xs h-8 rounded-lg border border-border bg-card px-2"
                      >
                        <option value="percentage">Percentual (%) sobre faturamento</option>
                        <option value="fixed">Valor fixo (R$) por procedimento</option>
                        <option value="hybrid">Híbrido (% + fixo)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(formCommModel === "percentage" || formCommModel === "hybrid") && (
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-muted-foreground uppercase">Taxa %</Label>
                          <Input type="number" step="0.1" value={formCommRate} onChange={(e) => setFormCommRate(e.target.value)} className="h-8 text-xs" />
                        </div>
                      )}
                      {(formCommModel === "fixed" || formCommModel === "hybrid") && (
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-muted-foreground uppercase">Valor R$</Label>
                          <Input type="number" step="0.01" value={formCommFixed} onChange={(e) => setFormCommFixed(e.target.value)} className="h-8 text-xs" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Granular permissions */}
                <div className="border border-border rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black text-neutral-700 uppercase tracking-wide flex items-center gap-1">
                    <ShieldIcon className="h-3.5 w-3.5 text-muted-foreground" /> Permissões Granulares
                  </p>
                  <div className="space-y-2">
                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-neutral-600">{label}</span>
                        <Toggle
                          checked={!!formPermissions[key]}
                          onChange={() => setFormPermissions(prev => ({ ...prev, [key]: !prev[key] }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-neutral-100 shrink-0 mt-auto">
                <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} className="text-xs h-10 w-1/3 rounded-xl">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-10 w-2/3 rounded-xl font-bold"
                >
                  {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-1" /> Salvando...</> : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
