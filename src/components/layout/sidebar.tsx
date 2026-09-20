"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { applySidebarOrder, getSidebarOrder, SIDEBAR_ORDER_CHANGED_EVENT } from "@/lib/sidebar-order";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/ui/logo";
import { useTotalUnread } from "@/hooks/use-total-unread";
import {
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
  Calendar,
  DollarSign,
  FileText,
  Briefcase,
  TrendingUp,
  ArrowLeftRight,
  Lock,
  Award,
  Sparkles,
  CalendarClock,
  Upload,
  Globe,
  Link2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Megaphone,
  History,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
import { ClinicSwitcherModal } from "@/components/layout/clinic-switcher-modal";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; label: string; className: string }
> = {
  owner: {
    icon: Crown,
    label: "Proprietário",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    label: "Admin",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    label: "Profissional",
    className: "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    label: "Visualizador",
    className: "border-border bg-card text-muted-foreground",
  },
};

interface SubItem {
  href: string;
  label: string;
  icon: any;
}

interface MenuItem {
  key: string;
  href?: string;
  label: string;
  icon: any;
  beta?: boolean;
  subItems?: SubItem[];
}

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  
  // Collapsible sidebar state (persisted in localStorage)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Submenu open states
  const [marketingExpanded, setMarketingExpanded] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem("wacrm:sidebar:collapsed");
      if (saved === "true") setIsCollapsed(true);
    } catch (e) {
      console.error("Failed to read sidebar collapsed state:", e);
    }
  }, []);

  const handleToggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    try {
      localStorage.setItem("wacrm:sidebar:collapsed", String(nextState));
    } catch (e) {
      console.error("Failed to save sidebar collapsed state:", e);
    }
  };

  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name &&
    !isCollapsed;

  useEffect(() => {
    onClose?.();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Main menu item definitions in the requested exact order (1 to 14)
  // — this is the default/fallback order; applySidebarOrder below
  // re-sorts it per the user's own saved preference, if any.
  const defaultMenuItems: MenuItem[] = [
    { key: "/agenda", href: "/agenda", label: "Agenda", icon: Calendar },
    { key: "/inbox", href: "/inbox", label: "Caixa de Entrada", icon: MessageSquare },
    { key: "/dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "/pipelines", href: "/pipelines", label: "CRM", icon: GitBranch },
    { key: "/contacts", href: "/contacts", label: "Contatos", icon: Users },
    { key: "/financeiro", href: "/financeiro", label: "Financeiro", icon: DollarSign },
    { key: "/documentos", href: "/documentos", label: "Documentos", icon: FileText },
    { key: "/equipe", href: "/equipe", label: "Equipe", icon: UsersRound },
    { key: "/servicos", href: "/servicos", label: "Serviços", icon: Briefcase },
    {
      key: "marketing-group",
      label: "Marketing",
      icon: Megaphone,
      subItems: [
        { href: "/broadcasts", label: "Disparos", icon: Radio },
        { href: "/comunicacao/modelos", label: "Modelos", icon: Sparkles },
        { href: "/broadcasts/historico", label: "Histórico", icon: History },
        { href: "/comunicacao/agendados", label: "Notificações Automáticas", icon: CalendarClock },
      ],
    },
    { key: "/automations", href: "/automations", label: "Automações", icon: Zap },
    { key: "/relatorios", href: "/relatorios", label: "Relatórios", icon: TrendingUp },
    { key: "/comunicacao/importacao", href: "/comunicacao/importacao", label: "Migração", icon: Upload },
    { key: "/comunicacao/portal-config", href: "/comunicacao/portal-config", label: "Configurar Portal", icon: Globe },
    { key: "/comunicacao/link-bio", href: "/comunicacao/link-bio", label: "Link na Bio", icon: Link2 },
  ];

  // Re-read whenever the saved order changes — including from another
  // tab/the Settings page in this same tab, via the custom event
  // setSidebarOrder dispatches, so a reorder shows up immediately
  // without a full page reload.
  const [savedOrder, setSavedOrder] = useState<string[]>(() => getSidebarOrder());
  useEffect(() => {
    const onChange = () => setSavedOrder(getSidebarOrder());
    window.addEventListener(SIDEBAR_ORDER_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(SIDEBAR_ORDER_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const menuItems = applySidebarOrder(defaultMenuItems, savedOrder);

  const bottomNavItems = [
    { href: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        className={cn(
          "relative fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-border bg-card transition-all duration-200 ease-in-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:translate-x-0",
          isMounted && isCollapsed ? "lg:w-16" : "lg:w-60",
          !isMounted && "lg:w-60"
        )}
        aria-label="Primary"
      >
        {/* Toggle Collapse Button (Desktop only) */}
        <button
          type="button"
          onClick={handleToggleCollapse}
          className="absolute -right-3 top-5 hidden lg:flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground shadow-xs z-50 transition-colors"
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        {/* Logo Section */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2 mx-auto lg:mx-0">
            <Logo className="h-7 w-7 shrink-0" />
            {(!isMounted || !isCollapsed) && (
              <span className="text-xs font-black tracking-tight text-foreground select-none uppercase">
                <span className="font-medium text-blue-600">LEAD</span>{" "}
                <span className="font-extrabold text-blue-800">PLUZ</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Clinic info banner */}
        {!isCollapsed && account?.name && (
          <div className="mx-4 mt-3 rounded-xl bg-blue-500/5 p-3 border border-blue-500/10 shrink-0">
            <div className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Clínica Ativa</div>
            <div className="text-xs font-bold text-foreground truncate mt-0.5" title={account.name}>{account.name}</div>
            <div className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-600 font-bold">
              <Crown className="h-3 w-3 text-blue-500 shrink-0" />
              Licença Ativa
            </div>
          </div>
        )}

        {/* Main Navigation (Sleek layout with smaller font size) */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 scrollbar-thin">
          <ul className="flex flex-col gap-0.5">
            {menuItems.map((item, idx) => {
              // Handle submenu structure
              if (item.subItems) {
                const hasActiveSub = item.subItems.some(sub => pathname === sub.href || pathname.startsWith(sub.href));
                const showExpanded = marketingExpanded || hasActiveSub;
                
                return (
                  <li key={idx} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setMarketingExpanded(!marketingExpanded)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors w-full text-left",
                        isCollapsed ? "w-9 h-9 mx-auto justify-center p-0 flex items-center justify-center" : "",
                        hasActiveSub
                          ? "bg-blue-600/10 text-blue-600"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {(!isMounted || !isCollapsed) && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          <ChevronDown className={cn("h-3 w-3 transition-transform", showExpanded && "rotate-180")} />
                        </>
                      )}
                    </button>
                    {showExpanded && (!isMounted || !isCollapsed) && (
                      <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                        {item.subItems.map((sub) => {
                          const isSubActive = pathname === sub.href || pathname.startsWith(sub.href);
                          return (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                                  isSubActive
                                    ? "bg-blue-600/10 text-blue-600"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                              >
                                <sub.icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }

              // Simple route item
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && item.href && pathname.startsWith(item.href));

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href || "#"}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors relative",
                      isCollapsed ? "w-9 h-9 mx-auto justify-center p-0 flex items-center justify-center" : "",
                      isActive
                        ? "bg-blue-600/10 text-blue-600"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {(!isMounted || !isCollapsed) && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.beta && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1 py-0.2 text-[8px] font-bold uppercase tracking-wider text-amber-300">
                            Beta
                          </span>
                        )}
                        {showUnreadDot && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-600 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                          </span>
                        )}
                      </>
                    )}
                    {isCollapsed && showUnreadDot && (
                      <span className="absolute top-1 right-1 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-600 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-border" />

          <ul className="flex flex-col gap-0.5">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      isCollapsed ? "w-9 h-9 mx-auto justify-center p-0 flex items-center justify-center" : "",
                      isActive
                        ? "bg-blue-600/10 text-blue-600"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {(!isMounted || !isCollapsed) && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User profile dropdown section */}
        <div className="shrink-0 border-t border-border p-2">
          {showAccountStrip && account?.name && (
            <div className="mb-2 flex items-center gap-2 px-2 text-[10px] text-muted-foreground">
              <UsersRound className="size-3 shrink-0" />
              <span className="truncate font-semibold" title={account.name}>
                {account.name}
              </span>
              {accountRole && (
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1 py-0.2 text-[8px] font-bold uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-2" />
                      {meta.label}
                    </span>
                  );
                })()
              )}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
              isCollapsed ? "w-9 h-9 mx-auto justify-center p-0 flex items-center justify-center" : ""
            )}>
              <Avatar className="size-7 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "Avatar"}
                  />
                ) : null}
                <AvatarFallback className="bg-blue-600/10 text-xs font-bold text-blue-600">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              {(!isMounted || !isCollapsed) && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {profile?.full_name ?? "Usuário"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {profile?.email ?? ""}
                  </p>
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={isCollapsed ? "start" : "end"}
              side="top"
              sideOffset={6}
              className="min-w-52 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs"
                  />
                }
              >
                <User className="size-3.5" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs"
                  />
                }
              >
                <Settings className="size-3.5" />
                Preferências
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=security"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs"
                  />
                }
              >
                <Lock className="size-3.5" />
                Segurança
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=referral"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs"
                  />
                }
              >
                <Award className="size-3.5" />
                Indique e ganhe
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              {account?.name && (
                <div className="px-2 py-1 flex items-center gap-1.5 border-b border-border bg-muted/20">
                  <Avatar className="size-5 shrink-0">
                    <AvatarFallback className="bg-blue-600/10 text-[9px] font-bold text-blue-600 uppercase">
                      {account.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-[10px] font-bold text-neutral-700">{account.name}</span>
                </div>
              )}
              <DropdownMenuItem
                onClick={() => setSwitcherOpen(true)}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs cursor-pointer"
              >
                <ArrowLeftRight className="size-3.5" />
                Trocar de clínica
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-xs text-red-600 focus:text-red-700 cursor-pointer"
              >
                <LogOut className="size-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <ClinicSwitcherModal open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </>
  );
}
