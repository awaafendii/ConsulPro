import type { Meta, StoryObj } from '@storybook/react-vite';

/** Fondations : tokens de couleur, typographie, rayons. Documentation : docs/architecture/14-design-system.md */
const meta: Meta = { title: 'Fondations/Tokens' };
export default meta;

const COLORS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['muted', 'muted-foreground'],
  ['accent', 'accent-foreground'],
  ['destructive', 'destructive-foreground'],
  ['destructive-subtle', 'destructive-subtle-foreground'],
  ['success', 'success-foreground'],
  ['success-subtle', 'success-subtle-foreground'],
  ['warning', 'warning-foreground'],
  ['warning-subtle', 'warning-subtle-foreground'],
  ['info', 'info-foreground'],
  ['info-subtle', 'info-subtle-foreground'],
  ['sidebar', 'sidebar-foreground'],
  ['sidebar-accent', 'sidebar-accent-foreground'],
] as const;

export const Couleurs: StoryObj = {
  render: () => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLORS.map(([bg, fg]) => (
        <li
          key={bg}
          className="rounded-lg border p-4"
          style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
        >
          <p className="font-medium">--{bg}</p>
          <p className="text-sm">texte : --{fg}</p>
        </li>
      ))}
    </ul>
  ),
};

export const Typographie: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <p className="text-3xl font-semibold tracking-tight">Titre de page — text-2xl/3xl</p>
      <p className="text-xl font-semibold">Titre de section — text-xl</p>
      <p className="text-base">Texte courant — text-base (Inter)</p>
      <p className="text-sm text-muted-foreground">Texte secondaire — text-sm muted</p>
      <p className="font-mono text-sm">Identifiant technique — font-mono (JetBrains Mono)</p>
      <p className="text-2xl tabular-nums">1 234,56 m³ — chiffres tabulaires</p>
    </div>
  ),
};

export const Rayons: StoryObj = {
  render: () => (
    <div className="flex gap-4">
      {['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'].map((r) => (
        <div
          key={r}
          className={`flex size-20 items-center justify-center border bg-muted text-xs ${r}`}
        >
          {r}
        </div>
      ))}
    </div>
  ),
};
