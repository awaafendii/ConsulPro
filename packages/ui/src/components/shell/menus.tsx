'use client';

import { Building2, Check, ChevronsUpDown, type LucideIcon } from 'lucide-react';

import { AppLink } from '../navigation/link';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';

/** Initiales pour l'avatar (« Awa Diop » → « AD »). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
  return letters
    .map((p) => p?.[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export interface UserMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly href?: string;
  readonly onSelect?: () => void;
}

export interface UserMenuProps {
  readonly name: string;
  readonly email: string;
  readonly items: readonly UserMenuItem[];
  readonly label?: string;
}

/** Menu de l'utilisateur, en pied de la barre latérale. */
export function UserMenu({ name, email, items, label = 'Menu du compte' }: UserMenuProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={`${label} : ${name}`}>
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-primary text-xs text-primary-foreground">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-sidebar-foreground/80">{email}</span>
              </span>
              <ChevronsUpDown aria-hidden className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {items.map(({ id, label: itemLabel, icon: Icon, href, onSelect }) =>
                href ? (
                  <DropdownMenuItem key={id} asChild>
                    <AppLink href={href}>
                      {Icon && <Icon aria-hidden />}
                      {itemLabel}
                    </AppLink>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={id} {...(onSelect ? { onSelect } : {})}>
                    {Icon && <Icon aria-hidden />}
                    {itemLabel}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export interface OrganizationOption {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly detail?: string;
}

export interface OrganizationSwitcherProps {
  readonly current: OrganizationOption;
  readonly organizations: readonly OrganizationOption[];
  readonly allHref: string;
  readonly allLabel?: string;
  readonly label?: string;
}

/** Sélecteur d'organisation, en tête de la barre latérale. */
export function OrganizationSwitcher({
  current,
  organizations,
  allHref,
  allLabel = 'Toutes mes organisations',
  label = 'Changer d’organisation',
}: OrganizationSwitcherProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={`${label} (actuelle : ${current.name})`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 aria-hidden className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{current.name}</span>
                {current.detail && (
                  <span className="truncate text-xs text-sidebar-foreground/80">
                    {current.detail}
                  </span>
                )}
              </span>
              <ChevronsUpDown aria-hidden className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
            {organizations.map((o) => (
              <DropdownMenuItem key={o.id} asChild>
                <AppLink href={o.href} aria-current={o.id === current.id ? 'page' : undefined}>
                  <Building2 aria-hidden />
                  <span className="truncate">{o.name}</span>
                  {o.id === current.id && <Check aria-hidden className="ml-auto" />}
                </AppLink>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <AppLink href={allHref}>{allLabel}</AppLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
