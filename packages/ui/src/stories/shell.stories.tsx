import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Building2,
  ClipboardList,
  FolderKanban,
  Keyboard,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Mountain,
  Plug,
  ShowerHead,
  Users,
  Zap,
} from 'lucide-react';

import { CommandPalette } from '../components/command/command-palette';
import { AppShell, type NavSection } from '../components/shell/app-shell';
import { AuthLayout, Brand, PageHeader, Section } from '../components/shell/layout';
import { OrganizationSwitcher, UserMenu } from '../components/shell/menus';
import { ThemeToggle } from '../components/shell/theme';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const meta: Meta = { title: 'Coquille/Application', parameters: { layout: 'fullscreen' } };
export default meta;

const sections: NavSection[] = [
  {
    id: 'workspace',
    label: 'Espace de travail',
    items: [
      {
        id: 'dashboard',
        label: 'Tableau de bord',
        href: '#',
        icon: LayoutDashboard,
        active: true,
        shortcut: 'g d',
      },
      {
        id: 'projects',
        label: 'Projets',
        href: '#',
        icon: FolderKanban,
        disabledReason: 'Disponible en Phase 3',
      },
      {
        id: 'library',
        label: 'Bibliothèque',
        href: '#',
        icon: LibraryBig,
        disabledReason: 'Disponible en Phase 3',
      },
    ],
  },
  {
    id: 'trades',
    label: 'Métiers',
    items: [
      {
        id: 'btp',
        label: 'BTP / Génie civil',
        href: '#',
        icon: Building2,
        disabledReason: 'Disponible en Phase 4',
      },
      {
        id: 'elec',
        label: 'Électricité',
        href: '#',
        icon: Zap,
        disabledReason: 'Disponible en Phase 5',
      },
      {
        id: 'plumbing',
        label: 'Plomberie & Sanitaire',
        href: '#',
        icon: ShowerHead,
        disabledReason: 'Disponible en Phase 6',
      },
      {
        id: 'topo',
        label: 'Topographie',
        href: '#',
        icon: Mountain,
        disabledReason: 'Disponible en Phase 7',
      },
    ],
  },
  {
    id: 'organization',
    label: 'Organisation',
    items: [
      { id: 'members', label: 'Membres', href: '#', icon: Users, shortcut: 'g m' },
      { id: 'audit', label: 'Journal d’audit', href: '#', icon: ClipboardList, shortcut: 'g a' },
    ],
  },
];

const org = { id: 'o1', name: 'BET Sahel Ingénierie', href: '#', detail: 'Propriétaire' };

export const Espace: StoryObj = {
  render: () => (
    <AppShell
      sections={sections}
      sidebarHeader={
        <OrganizationSwitcher
          current={org}
          organizations={[org, { id: 'o2', name: 'Génie Civil Kaolack', href: '#' }]}
          allHref="#"
        />
      }
      sidebarFooter={
        <UserMenu
          name="Awa Diop"
          email="awa.diop@bet-sahel.test"
          items={[
            {
              id: 'shortcuts',
              label: 'Raccourcis clavier',
              icon: Keyboard,
              onSelect: () => undefined,
            },
            { id: 'logout', label: 'Se déconnecter', icon: LogOut, onSelect: () => undefined },
          ]}
        />
      }
      headerStart={<span className="truncate text-sm font-medium">Tableau de bord</span>}
      headerEnd={<ThemeToggle />}
    >
      <PageHeader
        title="Tableau de bord"
        description="Vue d’ensemble de l’organisation."
        actions={<Button disabled>Nouveau projet</Button>}
      />
      <Section title="Activité récente">
        <p className="text-sm text-muted-foreground">Aucune activité pour le moment.</p>
      </Section>
    </AppShell>
  ),
};

export const PaletteDeCommandes: StoryObj = {
  parameters: { layout: 'padded' },
  render: () => (
    <CommandPalette
      open
      onOpenChange={() => undefined}
      sections={[
        {
          heading: 'Navigation',
          entries: [
            {
              id: 'dash',
              label: 'Tableau de bord',
              icon: LayoutDashboard,
              shortcut: 'g d',
              onSelect: () => undefined,
            },
            {
              id: 'members',
              label: 'Membres',
              icon: Users,
              shortcut: 'g m',
              onSelect: () => undefined,
            },
            {
              id: 'projects',
              label: 'Projets',
              icon: FolderKanban,
              disabledReason: 'Phase 3',
              onSelect: () => undefined,
            },
          ],
        },
        {
          heading: 'Actions',
          entries: [
            { id: 'plug', label: 'Changer d’organisation', icon: Plug, onSelect: () => undefined },
          ],
        },
      ]}
    />
  ),
};

export const PageDeConnexion: StoryObj = {
  render: () => (
    <AuthLayout
      brand={<Brand />}
      title="Connexion"
      description="Accédez à vos projets."
      corner={<ThemeToggle />}
      footer={<a href="#">Créer un compte</a>}
    >
      <form className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" type="email" autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" type="password" autoComplete="current-password" />
        </div>
        <Button type="submit">Se connecter</Button>
      </form>
    </AuthLayout>
  ),
};
