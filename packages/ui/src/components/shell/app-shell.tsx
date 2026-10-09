'use client';

import { PanelLeft, Search, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { CommandPalette, type CommandSection } from '../command/command-palette';
import { AppLink, useNavigate } from '../navigation/link';
import { ShortcutKeys, useShortcut } from '../shortcuts/shortcuts';
import { Button } from '../ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '../ui/sidebar';

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly active?: boolean;
  /** Module non livré : affiché inactif avec sa raison (principe P7). */
  readonly disabledReason?: string;
  /** Raccourci de navigation (ex. `g d`). */
  readonly shortcut?: string;
}

export interface NavSection {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export interface AppShellProps {
  /** En-tête de la barre latérale (sélecteur d'organisation). */
  readonly sidebarHeader: ReactNode;
  /** Pied de la barre latérale (menu utilisateur). */
  readonly sidebarFooter: ReactNode;
  readonly sections: readonly NavSection[];
  /** Commandes supplémentaires de la palette (actions, organisations…). */
  readonly commands?: readonly CommandSection[];
  /** Début de l'en-tête (fil d'Ariane). */
  readonly headerStart?: ReactNode;
  /** Fin de l'en-tête (thème, notifications…). */
  readonly headerEnd?: ReactNode;
  readonly defaultSidebarOpen?: boolean;
  readonly children: ReactNode;
}

/**
 * Coquille de l'espace de travail : barre latérale + en-tête + espace de travail.
 * Sous 768 px, la barre latérale devient un panneau ouvert depuis l'en-tête.
 */
export function AppShell({ defaultSidebarOpen = true, ...props }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <ShellLayout {...props} />
    </SidebarProvider>
  );
}

function ShellLayout({
  sidebarHeader,
  sidebarFooter,
  sections,
  commands = [],
  headerStart,
  headerEnd,
  children,
}: Omit<AppShellProps, 'defaultSidebarOpen'>) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  useShortcut({
    id: 'palette',
    keys: 'mod+k',
    description: 'Ouvrir la palette de commandes',
    group: 'Général',
    allowInInputs: true,
    handler: () => {
      setPaletteOpen((open) => !open);
    },
  });
  useShortcut({
    id: 'sidebar',
    keys: 'mod+b',
    description: 'Afficher ou masquer la barre latérale',
    group: 'Général',
    allowInInputs: true,
    handler: toggleSidebar,
  });

  const navigationCommands: CommandSection[] = sections.map((section) => ({
    heading: section.label ?? 'Navigation',
    entries: section.items.map((item) => ({
      id: `nav.${item.id}`,
      label: item.label,
      icon: item.icon,
      ...(item.shortcut ? { shortcut: item.shortcut } : {}),
      ...(item.disabledReason ? { disabledReason: item.disabledReason } : {}),
      onSelect: () => {
        navigate(item.href);
      },
    })),
  }));

  return (
    <>
      <a
        href="#contenu-principal"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu principal
      </a>

      <Sidebar collapsible="icon">
        {/* Repère de navigation : tout le contenu de la barre latérale appartient à un landmark. */}
        <nav aria-label="Navigation principale" className="flex h-full min-h-0 flex-col">
          <SidebarHeader>{sidebarHeader}</SidebarHeader>
          <SidebarContent>
            {sections.map((section) => (
              <SidebarGroup key={section.id}>
                {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
                <SidebarMenu>
                  {section.items.map((item) => (
                    <NavMenuItem key={item.id} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>{sidebarFooter}</SidebarFooter>
        </nav>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Afficher ou masquer la navigation"
          >
            <PanelLeft aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">{headerStart}</div>
          <Button
            variant="outline"
            className="h-9 gap-2 px-2 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
            onClick={() => {
              setPaletteOpen(true);
            }}
            aria-label="Rechercher (palette de commandes)"
          >
            <Search aria-hidden />
            <span className="hidden sm:inline">Rechercher…</span>
            <span className="ml-auto hidden sm:inline-flex">
              <ShortcutKeys keys="mod+k" />
            </span>
          </Button>
          {headerEnd}
        </header>
        <main
          id="contenu-principal"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </SidebarInset>

      {sections
        .flatMap((s) => s.items)
        .map((item) => (
          <NavShortcut key={item.id} item={item} />
        ))}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sections={[...navigationCommands, ...commands]}
      />
    </>
  );
}

function NavMenuItem({ item }: { item: NavItem }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;
  if (item.disabledReason) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip={`${item.label} — ${item.disabledReason}`}
          className="cursor-not-allowed opacity-60 hover:bg-transparent"
        >
          <span aria-disabled="true">
            <Icon aria-hidden />
            <span>{item.label}</span>
          </span>
        </SidebarMenuButton>
        <SidebarMenuBadge className="text-[0.65rem] font-normal">
          {item.disabledReason.replace(/^Disponible en /, '')}
        </SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={item.active ?? false} tooltip={item.label}>
        <AppLink
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <Icon aria-hidden />
          <span>{item.label}</span>
        </AppLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavShortcut({ item }: { item: NavItem }) {
  const navigate = useNavigate();
  useShortcut(
    {
      id: `nav.${item.id}`,
      keys: item.shortcut ?? '',
      description: `Aller à : ${item.label}`,
      group: 'Navigation',
      handler: () => {
        navigate(item.href);
      },
    },
    item.shortcut !== undefined && item.disabledReason === undefined,
  );
  return null;
}
