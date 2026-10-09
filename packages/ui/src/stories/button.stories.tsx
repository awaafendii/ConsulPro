import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Trash2 } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

const meta: Meta<typeof Button> = {
  title: 'Primitives/Bouton',
  component: Button,
  args: { children: 'Enregistrer' },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Principal: Story = {};
export const Secondaire: Story = { args: { variant: 'secondary' } };
export const Contour: Story = { args: { variant: 'outline' } };
export const Discret: Story = { args: { variant: 'ghost' } };
export const Destructif: Story = {
  args: {
    variant: 'destructive',
    children: (
      <>
        <Trash2 aria-hidden />
        Supprimer
      </>
    ),
  },
};
export const AvecIcone: Story = {
  args: {
    children: (
      <>
        <Plus aria-hidden />
        Nouveau projet
      </>
    ),
  },
};
export const Chargement: Story = { args: { loading: true, children: 'Enregistrement…' } };
export const Desactive: Story = { args: { disabled: true } };
export const Tailles: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">Très petit</Button>
      <Button size="sm">Petit</Button>
      <Button>Normal</Button>
      <Button size="lg">Grand</Button>
      <Button size="icon" aria-label="Ajouter">
        <Plus aria-hidden />
      </Button>
    </div>
  ),
};

export const Badges: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Par défaut</Badge>
      <Badge variant="secondary">Secondaire</Badge>
      <Badge variant="outline">Contour</Badge>
      <Badge variant="success">Vérifié</Badge>
      <Badge variant="warning">À vérifier</Badge>
      <Badge variant="info">Information</Badge>
      <Badge variant="destructive">Non conforme</Badge>
      <Badge variant="muted">Phase 3</Badge>
    </div>
  ),
};
