'use client';

// ============================================================
// MembersTab — Settings → Members
//
// Two stacked sections:
//   1. Roster   — every member of the account. Admin+ can change a
//                 teammate's role inline and remove them. Owner row
//                 is non-editable everywhere (transfer is its own
//                 separate flow, deferred to a later PR).
//   2. Pending  — outstanding invite links. Admin+ can revoke. The
//                 plaintext URL is gone after the create dialog
//                 closes, so we surface a "revoke + new link" hint
//                 rather than pretending we can resurface it.
//
// Role-gating
//   The tab itself is reachable by any member, but mutation buttons
//   are wrapped in `<RequireRole min="admin">` / `useCan` so an
//   agent or viewer sees the roster read-only. The server-side
//   RPCs (set_member_role, remove_account_member) double-check
//   the role anyway.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  Mail,
  MailX,
  Plus,
  Trash2,
  UsersRound,
  Shield,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MODULES_LABELS: Record<string, string> = {
  agenda: "Agenda & Consultas",
  inbox: "WhatsApp Inbox",
  crm: "CRM & Funil de Vendas",
  financeiro: "Financeiro & Caixa",
  documentos: "Gerador de Termos & Documentos",
  relatorios: "Relatórios & Estatísticas",
  equipe: "Gestão da Equipe",
  settings: "Configurações Globais",
  marketing: "Disparos de Mensagens & Marketing"
};

const PERMISSION_PRESETS: Record<string, Record<string, { view: boolean; edit: boolean }>> = {
  admin: {
    agenda: { view: true, edit: true },
    inbox: { view: true, edit: true },
    crm: { view: true, edit: true },
    financeiro: { view: true, edit: true },
    documentos: { view: true, edit: true },
    relatorios: { view: true, edit: true },
    equipe: { view: true, edit: true },
    settings: { view: true, edit: true },
    marketing: { view: true, edit: true }
  },
  secretaria: {
    agenda: { view: true, edit: true },
    inbox: { view: true, edit: true },
    crm: { view: true, edit: false },
    financeiro: { view: false, edit: false },
    documentos: { view: true, edit: true },
    relatorios: { view: false, edit: false },
    equipe: { view: false, edit: false },
    settings: { view: false, edit: false },
    marketing: { view: false, edit: false }
  },
  comercial: {
    agenda: { view: true, edit: false },
    inbox: { view: true, edit: true },
    crm: { view: true, edit: true },
    financeiro: { view: true, edit: false },
    documentos: { view: true, edit: false },
    relatorios: { view: true, edit: false },
    equipe: { view: false, edit: false },
    settings: { view: false, edit: false },
    marketing: { view: true, edit: true }
  },
  profissional: {
    agenda: { view: true, edit: true },
    inbox: { view: true, edit: false },
    crm: { view: true, edit: false },
    financeiro: { view: false, edit: false },
    documentos: { view: true, edit: true },
    relatorios: { view: false, edit: false },
    equipe: { view: false, edit: false },
    settings: { view: false, edit: false },
    marketing: { view: false, edit: false }
  },
  marketing: {
    agenda: { view: false, edit: false },
    inbox: { view: false, edit: false },
    crm: { view: true, edit: false },
    financeiro: { view: false, edit: false },
    documentos: { view: false, edit: false },
    relatorios: { view: true, edit: false },
    equipe: { view: false, edit: false },
    settings: { view: false, edit: false },
    marketing: { view: true, edit: true }
  },
  financeiro: {
    agenda: { view: true, edit: false },
    inbox: { view: false, edit: false },
    crm: { view: true, edit: false },
    financeiro: { view: true, edit: true },
    documentos: { view: true, edit: false },
    relatorios: { view: true, edit: true },
    equipe: { view: false, edit: false },
    settings: { view: false, edit: false },
    marketing: { view: false, edit: false }
  }
};

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import type { AccountRole } from '@/lib/auth/roles';
import { presenceLabel, summarize } from '@/lib/presence';
import {
  PRESENCE_DOT_CLASS,
  PresenceDot,
} from '@/components/presence/presence-dot';
import { InviteMemberDialog } from './invite-member-dialog';
import { SettingsPanelHead } from './settings-panel-head';
import { ROLE_META } from './role-meta';

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  joined_at: string;
}

interface Invitation {
  id: string;
  role: 'admin' | 'agent' | 'viewer';
  label: string | null;
  created_at: string;
  expires_at: string;
}

// Editable roles in the inline dropdown. Owner is never an option —
// promotions go through the (deferred) Transfer Ownership flow.
const EDITABLE_ROLES: { value: AccountRole; label: string; hint: string }[] = [
  { value: 'admin', label: 'Administrador', hint: 'Gerencia membros e tudo mais' },
  { value: 'agent', label: 'Agente', hint: 'Usa as funcionalidades; sem acesso às configurações' },
  { value: 'viewer', label: 'Visualizador', hint: 'Apenas leitura em todo o sistema' },
];

// Per-role chip metadata (icon / label / colour) lives in the shared
// ROLE_META module so this roster and the Overview identity chip can't
// drift. The colour scale runs amber (owner — scarce, immutable) →
// primary (admin) → muted (agent / viewer).

function fmtDate(iso: string): string {
  // Match the rest of the dashboard's locale-light formatting.
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtExpiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `expires in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}

export function MembersTab() {
  const supabase = createClient();
  const { user, canManageMembers, accountId } = useAuth();
  const { getPresence, getRow, now } = usePresence();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [editingPermissionsMember, setEditingPermissionsMember] = useState<Member | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<Record<string, { view: boolean; edit: boolean }>>({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [pendingMemberAction, setPendingMemberAction] = useState<string | null>(
    null,
  );

  const loadEverything = useCallback(async () => {
    try {
      const [mres, ires] = await Promise.all([
        fetch('/api/account/members', { cache: 'no-store' }),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      if (!mres.ok) {
        const payload = await mres.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao carregar os membros');
        return;
      }
      const mdata = (await mres.json()) as { members: Member[] };
      setMembers(mdata.members);

      if (ires) {
        if (!ires.ok) {
          const payload = await ires.json().catch(() => ({}));
          toast.error(payload.error || 'Falha ao carregar os convites');
          return;
        }
        const idata = (await ires.json()) as { invitations: Invitation[] };
        setInvitations(idata.invitations);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      console.error('[MembersTab] load error:', err);
      toast.error('Não foi possível conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }, [canManageMembers]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  async function handleRoleChange(member: Member, nextRole: AccountRole) {
    if (member.role === nextRole) return;
    // Optimistic update — flip the dropdown immediately so the UI
    // feels snappy. If the server PATCH fails we revert below so
    // the dropdown doesn't lie about the persisted state.
    const previousRole = member.role;
    setPendingMemberAction(member.user_id);
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === member.user_id ? { ...m, role: nextRole } : m,
      ),
    );
    try {
      const res = await fetch(`/api/account/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        // Revert the optimistic flip. The toast on its own wasn't
        // enough — the dropdown was left showing the new role
        // forever, so the next interaction operated on a wrong
        // baseline (re-trying the same change would no-op via the
        // `member.role === nextRole` guard at the top).
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id ? { ...m, role: previousRole } : m,
          ),
        );
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to update role');
        return;
      }
      toast.success(`Updated ${member.full_name || 'member'} to ${nextRole}`);
    } catch (err) {
      // Same revert on network failure.
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === member.user_id ? { ...m, role: previousRole } : m,
        ),
      );
      console.error('[MembersTab] role change error:', err);
      toast.error('Não foi possível conectar ao servidor');
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRemove() {
    if (!removingMember) return;
    setPendingMemberAction(removingMember.user_id);
    try {
      const res = await fetch(
        `/api/account/members/${removingMember.user_id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to remove member');
        return;
      }
      toast.success(`Removed ${removingMember.full_name || 'member'}`);
      setMembers((prev) =>
        prev.filter((m) => m.user_id !== removingMember.user_id),
      );
      setRemovingMember(null);
    } catch (err) {
      console.error('[MembersTab] remove error:', err);
      toast.error('Não foi possível conectar ao servidor');
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleOpenPermissions(member: Member) {
    setEditingPermissionsMember(member);
    setMemberPermissions({});
    try {
      const { data, error } = await supabase
        .from('clinic_users')
        .select('permissions_json')
        .eq('user_id', member.user_id)
        .eq('clinic_id', accountId)
        .maybeSingle();

      if (!error && data && data.permissions_json) {
        setMemberPermissions(data.permissions_json);
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
    }
  }

  async function handleSavePermissions() {
    if (!editingPermissionsMember || !user) return;
    setSavingPermissions(true);
    try {
      const { error } = await supabase
        .from('clinic_users')
        .update({ permissions_json: memberPermissions })
        .eq('user_id', editingPermissionsMember.user_id)
        .eq('clinic_id', accountId);

      if (error) throw error;
      toast.success('Permissões atualizadas com sucesso!');
      setEditingPermissionsMember(null);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao salvar permissões: ' + err.message);
    } finally {
      setSavingPermissions(false);
    }
  }

  async function handleRevoke(invite: Invitation) {
    try {
      const res = await fetch(`/api/account/invitations/${invite.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to revoke invitation');
        return;
      }
      toast.success('Invitation revoked');
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      console.error('[MembersTab] revoke error:', err);
      toast.error('Não foi possível conectar ao servidor');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Team members"
        description="People with access to this account. Roles control what each teammate can do."
        action={
          <RequireRole min="admin">
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" />
              Invite member
            </Button>
          </RequireRole>
        }
      />

      {/* Live presence summary across the roster. Updates without a
          full refresh as heartbeats and the local re-derive tick land. */}
      {members.length > 0 &&
        (() => {
          const counts = summarize(members.map((m) => getPresence(m.user_id)));
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="online" />
                {counts.online} online
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="away" />
                {counts.away} away
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="offline" />
                {counts.offline} offline
              </span>
              <span className="text-muted-foreground/70">
                · {members.length} member{members.length === 1 ? '' : 's'}
              </span>
            </div>
          );
        })()}

      {/* Roster */}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const roleMeta = ROLE_META[member.role];
              const RoleIcon = roleMeta.icon;
              const isSelf = member.user_id === user?.id;
              const isOwnerRow = member.role === 'owner';
              const isBusy = pendingMemberAction === member.user_id;
              const presence = getPresence(member.user_id);
              const presenceRow = getRow(member.user_id);
              const presenceText = presenceLabel(
                presence,
                presenceRow?.last_seen_at ?? null,
                now,
              );

              return (
                <li
                  key={member.user_id}
                  // Mobile: stack identity (avatar+name+email) above the
                  // role/remove actions so the role dropdown's fixed
                  // 128px width doesn't force the name into a 50-pixel
                  // truncation. Desktop (sm+): everything inline as
                  // before.
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Avatar className="size-9 shrink-0">
                            {member.avatar_url ? (
                              <AvatarImage
                                src={member.avatar_url}
                                alt={member.full_name || 'Member'}
                              />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                              {(member.full_name || member.email || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                            {/* role+label so screen readers announce
                                presence — the hover tooltip alone isn't
                                reachable by keyboard/AT on a non-focusable
                                avatar. */}
                            <AvatarBadge
                              role="img"
                              aria-label={presenceText}
                              className={PRESENCE_DOT_CLASS[presence]}
                            />
                          </Avatar>
                        }
                      />
                      <TooltipContent>{presenceText}</TooltipContent>
                    </Tooltip>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {member.full_name || 'Unnamed'}
                        </span>
                        {isSelf && (
                          <Badge className="bg-muted text-muted-foreground border-border text-[10px] uppercase tracking-wide">
                            You
                          </Badge>
                        )}
                      </div>
                      {member.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Joined date stays desktop-only. The mobile row's
                      vertical density makes the joined date noise. */}
                  <div className="hidden sm:block text-right text-xs text-muted-foreground">
                    Joined {fmtDate(member.joined_at)}
                  </div>

                  {/* Actions cluster. On mobile this is its own row
                      below the identity block; on desktop it sits
                      inline. Items align to the start on mobile so the
                      role dropdown lines up under the avatar. */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Role display / editor. Inline Select is admin+
                        only AND not allowed on the owner row (owner
                        changes go through transfer, which lands later). */}
                    {canManageMembers && !isOwnerRow && !isSelf ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          // Base UI Select can emit null on clear. We
                          // don't expose a clear affordance, so the
                          // guard is defensive — but the typed
                          // signature requires it.
                          v && handleRoleChange(member, v as AccountRole)
                        }
                      >
                        <SelectTrigger
                          className="w-32 bg-muted border-border text-foreground"
                          disabled={isBusy}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EDITABLE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${roleMeta.className}`}
                      >
                        <RoleIcon className="size-3.5" />
                        {roleMeta.label}
                      </span>
                    )}

                    {/* Remove. Admin+ only; never on the owner row;
                        never on yourself. Pre-polish styling was
                        neutral-default + red-on-hover — the
                        destructive intent was invisible until the
                        user moused over. Now red is the default
                        state with a darker shade on hover so the
                        affordance reads at-a-glance. */}
                    {canManageMembers && !isOwnerRow && !isSelf && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPermissions(member)}
                          disabled={isBusy}
                          className="border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/60 hover:text-blue-200"
                          title="Editar Permissões"
                        >
                          <Shield className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRemovingMember(member)}
                          disabled={isBusy}
                          className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Pending invitations — admin+ only */}
      <RequireRole min="admin">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Pending invitations
            </h3>
            <Badge className="bg-muted text-muted-foreground border-border">
              {invitations.length}
            </Badge>
          </div>
          {/* P10 — make the no-resend design explicit. Admins were
              confused why the pending list shows roles + expiry but
              no "copy link again" button. Stating the constraint up
              front (rather than letting the user discover it by
              looking for a button) keeps it from feeling like a bug. */}
          {invitations.length > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              The plaintext invite URL is only shown once at creation
              for security — to re-share, revoke the invite below and
              create a new one.
            </p>
          ) : null}

          {invitations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Mail className="size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No pending invitations.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click <span className="text-muted-foreground">Convidar membro</span>{' '}
                  above to generate a shareable link.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {invitations.map((inv) => {
                    const inviteRoleMeta = ROLE_META[inv.role];
                    const InviteRoleIcon = inviteRoleMeta.icon;
                    return (
                    <li
                      key={inv.id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {inv.label || 'Untitled invite'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inviteRoleMeta.className}`}
                          >
                            <InviteRoleIcon className="size-3" />
                            {inviteRoleMeta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Created {fmtDate(inv.created_at)} · {fmtExpiresIn(inv.expires_at)}
                        </p>
                      </div>

                      {/* Revoke: red default state, mirrors the
                          members-tab Remove button. Pre-polish version
                          read as a neutral secondary button until
                          hover. */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(inv)}
                        className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                      >
                        <MailX className="size-4" />
                        Revoke
                      </Button>
                    </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </RequireRole>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={loadEverything}
      />

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-amber-400" />
              Remove member
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Remove{' '}
              <span className="font-medium text-muted-foreground">
                {removingMember?.full_name || 'this teammate'}
              </span>{' '}
              from the account? They&apos;ll be signed out of this account
              and given a fresh personal account on their next sign-in. Their
              login isn&apos;t deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setRemovingMember(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!!pendingMemberAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {pendingMemberAction ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove member'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={editingPermissionsMember !== null} onOpenChange={(open) => { if (!open) setEditingPermissionsMember(null); }}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
            <DialogDescription>
              Ajuste as permissões de acesso do membro {editingPermissionsMember?.full_name || 'deste usuário'}.
            </DialogDescription>
          </DialogHeader>

          {/* Preset Selector */}
          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Perfil Pré-definido</label>
            <Select onValueChange={(presetKey) => {
              const preset = PERMISSION_PRESETS[presetKey as keyof typeof PERMISSION_PRESETS];
              if (preset) setMemberPermissions(preset);
            }}>
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue placeholder="Selecione um perfil..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador (Total)</SelectItem>
                <SelectItem value="secretaria">Secretária</SelectItem>
                <SelectItem value="comercial">Comercial / Vendas</SelectItem>
                <SelectItem value="profissional">Profissional de Saúde/Estética</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Granular Modules Grid */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 py-1">
            {Object.keys(MODULES_LABELS).map((module) => {
              const label = MODULES_LABELS[module];
              const perm = memberPermissions[module] || { view: false, edit: false };
              return (
                <div key={module} className="flex items-center justify-between p-2 rounded-lg border bg-neutral-900/30 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground capitalize">{label}</p>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={perm.view}
                        onChange={(e) => {
                          setMemberPermissions({
                            ...memberPermissions,
                            [module]: { ...perm, view: e.target.checked }
                          });
                        }}
                        className="rounded border-border bg-muted text-blue-500 focus:ring-0"
                      />
                      Ver
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={perm.edit}
                        disabled={module === 'relatorios'}
                        onChange={(e) => {
                          setMemberPermissions({
                            ...memberPermissions,
                            [module]: { ...perm, edit: e.target.checked }
                          });
                        }}
                        className="rounded border-border bg-muted text-blue-500 focus:ring-0 disabled:opacity-30"
                      />
                      Editar
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditingPermissionsMember(null)}>Cancelar</Button>
            <Button onClick={handleSavePermissions} disabled={savingPermissions}>
              {savingPermissions ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
