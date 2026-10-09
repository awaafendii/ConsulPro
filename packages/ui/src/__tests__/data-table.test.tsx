import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataColumn } from '../components/data-table/data-table';

interface Row {
  id: string;
  name: string;
  value: number;
}

const rows: Row[] = [
  { id: 'a', name: 'Éloïse', value: 3 },
  { id: 'b', name: 'awa', value: 10 },
  { id: 'c', name: 'Moussa', value: 2 },
];

function columns(onCommit = vi.fn(), onAction = vi.fn()): DataColumn<Row>[] {
  return [
    {
      id: 'name',
      header: 'Nom',
      cell: (r) => r.name,
      sortValue: (r) => r.name,
      filterValue: (r) => r.name,
    },
    {
      id: 'value',
      header: 'Valeur',
      align: 'end',
      cell: (r) => String(r.value),
      sortValue: (r) => r.value,
      editor: { value: (r) => String(r.value), inputMode: 'decimal', onCommit },
    },
    {
      id: 'action',
      header: 'Action',
      cell: (r) => (
        <button
          type="button"
          onClick={() => {
            onAction(r.id);
          }}
        >
          Ouvrir {r.name}
        </button>
      ),
    },
  ];
}

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('gridcell')[0]?.textContent);

describe('DataTable', () => {
  it('trie (aria-sort) en ordre naturel français, puis inverse, puis annule', async () => {
    const user = userEvent.setup();
    render(<DataTable caption="Essai" columns={columns()} rows={rows} getRowId={(r) => r.id} />);
    const header = screen.getByRole('columnheader', { name: /Nom/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['awa', 'Éloïse', 'Moussa']);
    await user.click(within(header).getByRole('button'));
    expect(names()).toEqual(['Moussa', 'Éloïse', 'awa']);
    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(names()).toEqual(['Éloïse', 'awa', 'Moussa']);

    const valueHeader = screen.getByRole('columnheader', { name: /Valeur/ });
    await user.click(within(valueHeader).getByRole('button'));
    expect(names()).toEqual(['Moussa', 'Éloïse', 'awa']);
  });

  it('filtre sans tenir compte des accents ni de la casse', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        caption="Essai"
        columns={columns()}
        rows={rows}
        getRowId={(r) => r.id}
        filterPlaceholder="Filtrer"
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: 'Filtrer' }), 'eloise');
    expect(names()).toEqual(['Éloïse']);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Aucun résultat pour « zzz ».')).toBeInTheDocument();
  });

  it('navigation au clavier dans la grille (une seule cellule tabulable)', async () => {
    const user = userEvent.setup();
    render(<DataTable caption="Essai" columns={columns()} rows={rows} getRowId={(r) => r.id} />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    // Les boutons des cellules sortent de l'ordre de tabulation (motif « grid »).
    expect(screen.getByRole('button', { name: 'Ouvrir Moussa' })).toHaveAttribute('tabindex', '-1');

    cells[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cells[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cells[4]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(cells[5]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(cells[3]);
    await user.keyboard('{Control>}{End}{/Control}');
    expect(document.activeElement).toBe(cells[8]);
    await user.keyboard('{PageUp}');
    expect(document.activeElement).toBe(cells[2]);
    await user.keyboard('{ArrowUp}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(cells[0]);
  });

  it('Entrée dans une cellule d’action donne le focus au bouton ; Échap revient à la cellule', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <DataTable
        caption="Essai"
        columns={columns(vi.fn(), onAction)}
        rows={rows}
        getRowId={(r) => r.id}
      />,
    );
    const cell = screen.getAllByRole('gridcell')[2]!;
    cell.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ouvrir Éloïse' }));
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('a');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cell);
  });

  it('édition : Entrée ouvre, Entrée valide et descend, Échap annule, frappe directe, Tab passe à droite', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <DataTable caption="Essai" columns={columns(onCommit)} rows={rows} getRowId={(r) => r.id} />,
    );
    const valueCell = () => screen.getAllByRole('gridcell')[1]!;

    valueCell().focus();
    await user.keyboard('{Enter}');
    const input = screen.getByRole('textbox', { name: 'Valeur, ligne 1' });
    expect(input).toHaveValue('3');
    await user.clear(input);
    await user.type(input, '4,5{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(rows[0], '4,5');
    expect(document.activeElement).toBe(screen.getAllByRole('gridcell')[4]);

    await user.keyboard('{F2}');
    await user.type(screen.getByRole('textbox'), '99{Escape}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.keyboard('7');
    expect(screen.getByRole('textbox')).toHaveValue('7');
    await user.keyboard('{Tab}');
    expect(onCommit).toHaveBeenLastCalledWith(rows[1], '7');
    expect(document.activeElement).toBe(screen.getAllByRole('gridcell')[5]);

    // Double-clic : édition à la souris.
    await user.dblClick(screen.getAllByRole('gridcell')[7]!);
    expect(screen.getByRole('textbox')).toHaveValue('2');
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(screen.getAllByRole('gridcell')[6]);

    // Une cellule non éditable ignore la frappe directe.
    await user.keyboard('x');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('états : chargement, erreur, vide, pagination', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <DataTable
        caption="Essai"
        columns={columns()}
        rows={[]}
        getRowId={(r) => r.id}
        status="loading"
      />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    rerender(
      <DataTable
        caption="Essai"
        columns={columns()}
        rows={[]}
        getRowId={(r) => r.id}
        status="error"
        error={{ message: 'Panne', requestId: 'req-1', onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Panne');
    expect(screen.getByRole('alert')).toHaveTextContent('req-1');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();

    rerender(<DataTable caption="Essai" columns={columns()} rows={[]} getRowId={(r) => r.id} />);
    expect(screen.getByText('Aucune donnée')).toBeInTheDocument();

    rerender(
      <DataTable
        caption="Essai"
        columns={columns()}
        rows={rows}
        getRowId={(r) => r.id}
        pagination={{ hasPrevious: false, hasNext: true, onPrevious: vi.fn(), onNext }}
      />,
    );
    expect(screen.getByRole('button', { name: /Page précédente/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Page suivante/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
