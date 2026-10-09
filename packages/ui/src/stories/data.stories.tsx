import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { DataTable, type DataColumn } from '../components/data-table/data-table';
import { EmptyState } from '../components/feedback/states';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { formatAuto } from '../lib/format';

const meta: Meta = { title: 'Données/Tableau' };
export default meta;

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

const members: Member[] = [
  { id: '1', name: 'Awa Diop', email: 'awa.diop@bet-sahel.test', role: 'Propriétaire' },
  { id: '2', name: 'Moussa Traoré', email: 'moussa.traore@bet-sahel.test', role: 'Ingénieur' },
  { id: '3', name: 'Éloïse N’Diaye', email: 'eloise.ndiaye@bet-sahel.test', role: 'Technicien' },
  { id: '4', name: 'Ibrahima Sow', email: 'ibrahima.sow@bet-sahel.test', role: 'Lecteur' },
];

const memberColumns: DataColumn<Member>[] = [
  {
    id: 'name',
    header: 'Nom',
    cell: (m) => m.name,
    sortValue: (m) => m.name,
    filterValue: (m) => m.name,
  },
  {
    id: 'email',
    header: 'E-mail',
    cell: (m) => m.email,
    sortValue: (m) => m.email,
    filterValue: (m) => m.email,
  },
  {
    id: 'role',
    header: 'Rôle',
    cell: (m) => <Badge variant="secondary">{m.role}</Badge>,
    sortValue: (m) => m.role,
  },
  {
    id: 'actions',
    header: 'Actions',
    align: 'end',
    cell: (m) => (
      <Button variant="ghost" size="sm" aria-label={`Retirer ${m.name}`}>
        Retirer
      </Button>
    ),
  },
];

export const TriEtFiltre: StoryObj = {
  render: () => (
    <DataTable
      caption="Membres de l’organisation"
      columns={memberColumns}
      rows={members}
      getRowId={(m) => m.id}
      filterPlaceholder="Filtrer les membres…"
    />
  ),
};

export const Vide: StoryObj = {
  render: () => (
    <DataTable
      caption="Membres"
      columns={memberColumns}
      rows={[]}
      getRowId={(m) => m.id}
      empty={<EmptyState title="Aucun membre" description="Invitez une première personne." />}
    />
  ),
};

export const Chargement: StoryObj = {
  render: () => (
    <DataTable
      caption="Membres"
      columns={memberColumns}
      rows={[]}
      getRowId={(m) => m.id}
      status="loading"
    />
  ),
};

export const Erreur: StoryObj = {
  render: () => (
    <DataTable
      caption="Membres"
      columns={memberColumns}
      rows={[]}
      getRowId={(m) => m.id}
      status="error"
      error={{
        message: 'Le serveur n’a pas répondu.',
        requestId: 'req-1234abcd',
        onRetry: () => undefined,
      }}
    />
  ),
};

export const Pagination: StoryObj = {
  render: () => (
    <DataTable
      caption="Journal d’audit"
      columns={memberColumns}
      rows={members}
      getRowId={(m) => m.id}
      pagination={{
        hasPrevious: false,
        hasNext: true,
        onPrevious: () => undefined,
        onNext: () => undefined,
      }}
    />
  ),
};

interface Point {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

function EditableGrid() {
  const [points, setPoints] = useState<Point[]>([
    { id: '1', name: 'S1', x: 500123.456, y: 1601234.789, z: 12.345 },
    { id: '2', name: 'S2', x: 500210.012, y: 1601301.554, z: 12.871 },
    { id: '3', name: 'P101', x: 500180.731, y: 1601266.102, z: 13.02 },
  ]);
  const numeric = (key: 'x' | 'y' | 'z', header: string): DataColumn<Point> => ({
    id: key,
    header,
    align: 'end',
    cell: (p) => formatAuto(p[key], 3),
    sortValue: (p) => p[key],
    editor: {
      inputMode: 'decimal',
      value: (p) => String(p[key]).replace('.', ','),
      onCommit: (p, raw) => {
        const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'));
        if (Number.isFinite(parsed))
          setPoints((all) => all.map((q) => (q.id === p.id ? { ...q, [key]: parsed } : q)));
      },
    },
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Flèches pour se déplacer ; Entrée ou F2 pour modifier ; Entrée valide et descend ; Tab
        valide et passe à droite ; Échap annule.
      </p>
      <DataTable
        caption="Jeu de points (saisie tabulaire)"
        rows={points}
        getRowId={(p) => p.id}
        columns={[
          {
            id: 'name',
            header: 'Matricule',
            cell: (p) => p.name,
            filterValue: (p) => p.name,
            editor: {
              value: (p) => p.name,
              onCommit: (p, value) => {
                setPoints((all) => all.map((q) => (q.id === p.id ? { ...q, name: value } : q)));
              },
            },
          },
          numeric('x', 'X (m)'),
          numeric('y', 'Y (m)'),
          numeric('z', 'Z (m)'),
        ]}
      />
    </div>
  );
}

/** Saisie tabulaire au clavier (préfigure les jeux de données de la Phase 3). Données fictives. */
export const SaisieTabulaire: StoryObj = { render: () => <EditableGrid /> };
