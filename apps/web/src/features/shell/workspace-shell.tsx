'use client';

import { isModuleAvailable, MODULES, type ModuleSection } from '@consulpro/domain';
import {
  AppShell,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  OrganizationSwitcher,
  ThemeToggle,
  useOpenShortcutsHelp,
  useTheme,
  UserMenu,
  type CommandSection,
  type NavSection,
} from '@consulpro/ui';
import {
  Building2,
  ClipboardList,
  FolderKanban,
  Keyboard,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Mountain,
  ShowerHead,
  SunMoon,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useSignOut } from '@/components/sign-out-button';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  library: LibraryBig,
  btp: Building2,
  electricity: Zap,
  plumbing: ShowerHead,
  topography: Mountain,
  members: Users,
  audit: ClipboardList,
};

const SECTIONS: readonly ModuleSection[] = ['workspace', 'trades', 'organization'];

export interface WorkspaceShellProps {
  readonly organization: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly role: string;
  };
  readonly organizations: readonly {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  }[];
  readonly user: { readonly name: string; readonly email: string };
  readonly canReadAudit: boolean;
  readonly defaultSidebarOpen: boolean;
  readonly children: ReactNode;
}

/** Espace de travail d'une organisation : navigation issue du registre des modules (domain). */
export function WorkspaceShell({
  organization,
  organizations,
  user,
  canReadAudit,
  defaultSidebarOpen,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useSignOut();
  const openHelp = useOpenShortcutsHelp();
  const { resolvedTheme, setTheme } = useTheme();
  const base = `/${organization.slug}`;

  const visible = MODULES.filter((m) => m.permission !== 'audit.read' || canReadAudit);
  const sections: NavSection[] = SECTIONS.map((section) => ({
    id: section,
    label: t(`sections.${section}`),
    items: visible
      .filter((m) => m.section === section)
      .map((m) => {
        const href = `${base}/${m.path}`;
        return {
          id: m.id,
          label: t(`modules.${m.id}`),
          href,
          icon: ICONS[m.id] ?? LayoutDashboard,
          active: pathname === href || pathname.startsWith(`${href}/`),
          ...(m.shortcut ? { shortcut: m.shortcut } : {}),
          ...(isModuleAvailable(m)
            ? {}
            : { disabledReason: tCommon('availableInPhase', { phase: m.phase }) }),
        };
      }),
  }));
  const current = sections.flatMap((s) => s.items).find((i) => i.active);

  const commands: CommandSection[] = [
    {
      heading: t('commandsOrganizations'),
      entries: organizations
        .filter((o) => o.id !== organization.id)
        .map((o) => ({
          id: `org.${o.id}`,
          label: o.name,
          icon: Building2,
          keywords: [o.slug],
          onSelect: () => {
            router.push(`/${o.slug}/tableau-de-bord`);
          },
        })),
    },
    {
      heading: t('commandsActions'),
      entries: [
        {
          id: 'theme',
          label: t('toggleTheme'),
          icon: SunMoon,
          onSelect: () => {
            setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          },
        },
        {
          id: 'shortcuts',
          label: t('shortcuts'),
          icon: Keyboard,
          shortcut: '?',
          onSelect: openHelp,
        },
        { id: 'sign-out', label: tCommon('signOut'), icon: LogOut, onSelect: signOut },
      ],
    },
  ].filter((section) => section.entries.length > 0);

  return (
    <AppShell
      defaultSidebarOpen={defaultSidebarOpen}
      sections={sections}
      commands={commands}
      sidebarHeader={
        <OrganizationSwitcher
          label={t('switchOrganization')}
          allLabel={t('allOrganizations')}
          allHref="/organisations"
          current={{
            id: organization.id,
            name: organization.name,
            href: `${base}/tableau-de-bord`,
            detail: tRoles(organization.role),
          }}
          organizations={organizations.map((o) => ({
            id: o.id,
            name: o.name,
            href: `/${o.slug}/tableau-de-bord`,
          }))}
        />
      }
      sidebarFooter={
        <UserMenu
          label={t('accountMenu')}
          name={user.name}
          email={user.email}
          items={[
            {
              id: 'organizations',
              label: t('myOrganizations'),
              icon: Building2,
              href: '/organisations',
            },
            { id: 'shortcuts', label: t('shortcuts'), icon: Keyboard, onSelect: openHelp },
            { id: 'sign-out', label: tCommon('signOut'), icon: LogOut, onSelect: signOut },
          ]}
        />
      }
      headerStart={
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
              <span className="truncate">{organization.name}</span>
            </BreadcrumbItem>
            {current && (
              <>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{current.label}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      }
      headerEnd={<ThemeToggle label={tCommon('theme')} />}
    >
      {children}
    </AppShell>
  );
}
