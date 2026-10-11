'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../feedback/states';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface ColumnEditor<T> {
  /** Valeur initiale du champ d'édition. */
  readonly value: (row: T) => string;
  readonly inputMode?: 'text' | 'decimal';
  /** Validation de la saisie ; la valeur est confirmée par l'appelant (aucun calcul ici). */
  readonly onCommit: (row: T, value: string) => void;
}

export interface DataColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Valeur de tri ; sans elle, la colonne n'est pas triable. */
  readonly sortValue?: (row: T) => string | number;
  /** Texte pris en compte par le filtre. */
  readonly filterValue?: (row: T) => string;
  readonly align?: 'start' | 'end';
  readonly editor?: ColumnEditor<T>;
  readonly className?: string | undefined;
}

export interface CursorPagination {
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

export interface DataTableProps<T> {
  /** Nom accessible du tableau. */
  readonly caption: string;
  readonly columns: readonly DataColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowId: (row: T) => string;
  readonly status?: 'ready' | 'loading' | 'error';
  readonly error?: {
    readonly message: string;
    readonly requestId?: string | undefined;
    readonly onRetry?: (() => void) | undefined;
  };
  /** Contenu affiché quand il n'y a aucune ligne (avant filtrage). */
  readonly empty?: ReactNode;
  readonly filterPlaceholder?: string;
  readonly toolbar?: ReactNode;
  readonly pagination?: CursorPagination;
  readonly className?: string | undefined;
}

type Sort = { readonly columnId: string; readonly direction: 'ascending' | 'descending' } | null;

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
/** Éléments focalisables situés DANS les cellules (chaque sélecteur est préfixé). */
const INSIDE_CELLS = FOCUSABLE.split(',')
  .map((selector) => `tbody td ${selector.trim()}`)
  .join(', ');
const collator = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Tableau de données accessible (motif « grid » WAI-ARIA) : navigation au clavier
 * dans les cellules, édition des colonnes éditables, tri, filtre, pagination par curseur,
 * et les quatre états chargement / vide / erreur / nominal.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  status = 'ready',
  error,
  empty,
  filterPlaceholder = 'Filtrer…',
  toolbar,
  pagination,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<Sort>(null);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ row: number; col: number; value: string } | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const filterId = useId();
  const filterable = columns.some((c) => c.filterValue);

  const visible = useMemo(() => {
    const needle = normalize(filter.trim());
    let out = needle
      ? rows.filter((row) =>
          columns.some((c) => c.filterValue && normalize(c.filterValue(row)).includes(needle)),
        )
      : [...rows];
    const column = sort && columns.find((c) => c.id === sort.columnId);
    if (sort && column?.sortValue) {
      const value = column.sortValue;
      const factor = sort.direction === 'ascending' ? 1 : -1;
      out = out.sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (
          factor *
          (typeof x === 'number' && typeof y === 'number'
            ? x - y
            : collator.compare(String(x), String(y)))
        );
      });
    }
    return out;
  }, [rows, columns, filter, sort]);

  const rowCount = visible.length;
  const current = {
    row: Math.min(active.row, Math.max(rowCount - 1, 0)),
    col: Math.min(active.col, columns.length - 1),
  };

  // Motif « grid » : les éléments interactifs des cellules sortent de l'ordre de tabulation.
  useEffect(() => {
    gridRef.current?.querySelectorAll<HTMLElement>(INSIDE_CELLS).forEach((el) => {
      if (!el.closest('[data-editing]')) el.tabIndex = -1;
    });
  });

  const cellElement = (row: number, col: number) =>
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`) ?? null;

  const focusCell = (row: number, col: number) => {
    const r = Math.max(0, Math.min(row, rowCount - 1));
    const c = Math.max(0, Math.min(col, columns.length - 1));
    setActive({ row: r, col: c });
    // La cellule existe déjà : focus immédiat (une frappe suivante ne doit pas le devancer).
    cellElement(r, c)?.focus();
  };

  const startEdit = (row: number, col: number, initial?: string) => {
    const column = columns[col];
    const record = visible[row];
    if (!column?.editor || record === undefined) return false;
    setEditing({ row, col, value: initial ?? column.editor.value(record) });
    return true;
  };

  const commit = (move: { dRow: number; dCol: number }) => {
    if (!editing) return;
    const column = columns[editing.col];
    const record = visible[editing.row];
    if (column?.editor && record !== undefined) column.editor.onCommit(record, editing.value);
    const { row, col } = editing;
    setEditing(null);
    focusCell(row + move.dRow, col + move.dCol);
  };

  const onCellKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, row: number, col: number) => {
    if (event.target !== event.currentTarget) {
      // Focus sur un élément de la cellule : Échap revient à la cellule.
      if (event.key === 'Escape') {
        event.preventDefault();
        focusCell(row, col);
      }
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      PageUp: [row - 10, col],
      PageDown: [row + 10, col],
      Home: event.ctrlKey ? [0, 0] : [row, 0],
      End: event.ctrlKey ? [rowCount - 1, columns.length - 1] : [row, columns.length - 1],
    };
    const target = moves[event.key];
    if (target) {
      event.preventDefault();
      focusCell(target[0], target[1]);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      if (startEdit(row, col)) return;
      const inner = event.currentTarget.querySelector<HTMLElement>(FOCUSABLE);
      if (inner) {
        inner.tabIndex = 0;
        inner.focus();
      }
      return;
    }
    // Frappe directe d'un caractère sur une cellule éditable : saisie immédiate (comme un tableur).
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      columns[col]?.editor
    ) {
      event.preventDefault();
      startEdit(row, col, event.key);
    }
  };

  const toggleSort = (columnId: string) => {
    setSort((prev) =>
      prev?.columnId !== columnId
        ? { columnId, direction: 'ascending' }
        : prev.direction === 'ascending'
          ? { columnId, direction: 'descending' }
          : null,
    );
  };

  if (status === 'loading') return <LoadingState className={className} />;
  if (status === 'error') {
    return (
      <ErrorState
        className={className}
        message={error?.message ?? 'Erreur inattendue.'}
        requestId={error?.requestId}
        onRetry={error?.onRetry}
      />
    );
  }
  if (rows.length === 0)
    return <div className={className}>{empty ?? <EmptyState title="Aucune donnée" />}</div>;

  return (
    <div className={cn('space-y-3', className)}>
      {(filterable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterable && (
            <div className="relative w-full max-w-xs">
              <label htmlFor={filterId} className="sr-only">
                {filterPlaceholder}
              </label>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={filterId}
                type="search"
                value={filter}
                placeholder={filterPlaceholder}
                className="pl-8"
                onChange={(e) => {
                  setFilter(e.target.value);
                }}
              />
            </div>
          )}
          {toolbar && <div className="ml-auto flex flex-wrap gap-2">{toolbar}</div>}
        </div>
      )}

      {/* relative : contient les éléments positionnés des cellules (ex. textes sr-only). */}
      <div className="relative overflow-x-auto rounded-lg border">
        <table
          ref={gridRef}
          role="grid"
          aria-label={caption}
          aria-rowcount={rowCount + 1}
          className="w-full caption-bottom text-sm"
        >
          <thead className="bg-muted/50">
            <tr aria-rowindex={1}>
              {columns.map((column) => {
                const sorted = sort?.columnId === column.id ? sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={sorted ?? (column.sortValue ? 'none' : undefined)}
                    className={cn(
                      'h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground',
                      column.align === 'end' && 'text-right',
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => {
                          toggleSort(column.id);
                        }}
                      >
                        {column.header}
                        {sorted === 'ascending' ? (
                          <ArrowUp aria-hidden className="size-3.5" />
                        ) : sorted === 'descending' ? (
                          <ArrowDown aria-hidden className="size-3.5" />
                        ) : (
                          <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun résultat pour « {filter} ».
                </td>
              </tr>
            ) : (
              visible.map((record, r) => (
                <tr
                  key={getRowId(record)}
                  aria-rowindex={r + 2}
                  className="border-t hover:bg-muted/40"
                >
                  {columns.map((column, c) => {
                    const isEditing = editing?.row === r && editing.col === c;
                    return (
                      <td
                        key={column.id}
                        role="gridcell"
                        data-cell={`${r}:${c}`}
                        {...(isEditing ? { 'data-editing': '' } : {})}
                        tabIndex={current.row === r && current.col === c && !isEditing ? 0 : -1}
                        aria-readonly={column.editor ? undefined : true}
                        onFocus={(e) => {
                          if (e.target === e.currentTarget) setActive({ row: r, col: c });
                        }}
                        onKeyDown={(e) => {
                          onCellKeyDown(e, r, c);
                        }}
                        onDoubleClick={() => {
                          startEdit(r, c);
                        }}
                        className={cn(
                          'h-11 px-3 align-middle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                          column.align === 'end' && 'text-right tabular-nums',
                          column.editor && 'cursor-cell',
                          column.className,
                        )}
                      >
                        {isEditing ? (
                          <Input
                            autoFocus
                            aria-label={`${column.header}, ligne ${r + 1}`}
                            inputMode={column.editor?.inputMode === 'decimal' ? 'decimal' : 'text'}
                            value={editing.value}
                            className={cn('h-8', column.align === 'end' && 'text-right')}
                            onChange={(e) => {
                              setEditing({ ...editing, value: e.target.value });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commit({ dRow: 1, dCol: 0 });
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                commit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 });
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditing(null);
                                focusCell(r, c);
                              }
                            }}
                          />
                        ) : (
                          column.cell(record)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (pagination.hasNext || pagination.hasPrevious) && (
        <nav aria-label={`Pagination : ${caption}`} className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasPrevious}
            onClick={pagination.onPrevious}
          >
            <ChevronLeft aria-hidden />
            Page précédente
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasNext}
            onClick={pagination.onNext}
          >
            Page suivante
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
