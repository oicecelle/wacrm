"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Menu, Settings as SettingsIcon, User, ArrowLeftRight } from "lucide-react";
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
import { ModeToggle } from "@/components/layout/mode-toggle";
import { ClinicSwitcherModal } from "@/components/layout/clinic-switcher-modal";

const pageTitles: Record<string, string> = {
  "/dashboard": "Painel",
  "/inbox": "Caixa de Entrada",
  "/contacts": "Contatos",
  "/pipelines": "Funis de Vendas",
  "/broadcasts": "Disparos",
  "/automations": "Automações",
  "/settings": "Configurações",
  "/agenda": "Agenda",
  "/financeiro": "Financeiro",
  "/documentos": "Documentos",
  "/equipe": "Equipe",
  "/servicos": "Serviços",
  "/relatorios": "Relatórios",
  "/flows": "Fluxos",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "Painel";
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { profile, signOut, account } = useAuth();
  const title = getPageTitle(pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Abrir menu"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Clinic switcher pill — shown when user has account name available */}
        {account?.name && (
          <>
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              title="Trocar de clínica"
              className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-w-[180px]"
            >
              <ArrowLeftRight className="size-3 shrink-0" />
              <span className="truncate">{account.name}</span>
            </button>
            <ClinicSwitcherModal open={switcherOpen} onOpenChange={setSwitcherOpen} />
          </>
        )}

        <ModeToggle />

        <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70 sm:gap-3 sm:pl-1 sm:pr-3"
          aria-label="Abrir menu do usuário"
        >
          <Avatar className="size-8">
            {profile?.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name ?? "Avatar"}
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {profile?.full_name ?? "Usuário"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-56 bg-popover text-popover-foreground ring-border"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.full_name ?? "Usuário"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email ?? ""}
            </p>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=profile"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <User className="size-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=whatsapp"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <SettingsIcon className="size-4" />
            Preferências
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={signOut}
            className="text-popover-foreground focus:bg-accent focus:text-accent-foreground text-red-600 focus:text-red-700 cursor-pointer"
          >
            <LogOut className="size-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
