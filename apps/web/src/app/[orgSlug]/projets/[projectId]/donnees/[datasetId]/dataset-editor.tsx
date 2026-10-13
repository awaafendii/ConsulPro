'use client';

import type { DatasetKindDto, DatasetRevisionDto } from '@consulpro/contracts';
import {
  Button,
  Callout,
  formatAuto,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  withUnit,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api, ApiError } from '@/lib/api';

type Cell = { text: string; unit: string };
type Row = { id: number; cells: Record<string, Cell> };

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly datasetId: string;
  readonly version: number;
  readonly kind: DatasetKindDto;
  readonly revision: DatasetRevisionDto | null;
  readonly editable: boolean;
}

let nextRowId = 0;

function toRows(kind: DatasetKindDto, revision: DatasetRevisionDto | null): Row[] {
  return (revision?.rows ?? []).map((raw) => ({
    id: (nextRowId += 1),
    cells: Object.fromEntries(
      kind.columns.map((c) => {
        const value = raw[c.key];
        if (c.type === 'text' || c.type === 'choice')
          return [c.key, { text: typeof value === 'string' ? value : '', unit: '' }];
        if (c.type === 'number')
          return [
            c.key,
            { text: typeof value === 'number' ? String(value).replace('.', ',') : '', unit: '' },
          ];
        const q = value && typeof value === 'object' ? value : null;
        return [
          c.key,
          {
            text: q ? String(q.value).replace('.', ',') : '',
            unit: q?.unit ?? c.units[0]?.symbol ?? '',
          },
        ];
      }),
    ),
  }));
}

const emptyRow = (kind: DatasetKindDto): Row => ({
  id: (nextRowId += 1),
  cells: Object.fromEntries(
    kind.columns.map((c) => [
      c.key,
      { text: '', unit: c.type === 'quantity' ? (c.units[0]?.symbol ?? '') : '' },
    ]),
  ),
});

/** Saisie tabulaire : chaque enregistrement crée une nouvelle révision immuable. */
export function DatasetEditor({
  orgSlug,
  projectId,
  datasetId,
  version,
  kind,
  revision,
  editable,
}: Props) {
  const t = useTranslations('datasets');
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(kind, revision));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<readonly { path: string; message: string }[]>([]);

  const setCell = (rowId: number, key: string, cell: Cell) => {
    setRows((current) =>
      current.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: cell } } : r)),
    );
  };

  const save = useMutation({
    mutationFn: () =>
      api<DatasetRevisionDto>(
        `/organizations/${orgSlug}/projects/${projectId}/datasets/${datasetId}/revisions`,
        {
          method: 'POST',
          headers: { 'if-match': `"${String(version)}"` },
          json: {
            ...(note.trim() ? { note } : {}),
            rows: rows.map((r) =>
              Object.fromEntries(
                kind.columns.map((c) => {
                  const cell = r.cells[c.key] ?? { text: '', unit: '' };
                  const text = cell.text.trim();
                  if (text === '') return [c.key, null];
                  const number = Number(text.replace(/\s/g, '').replace(',', '.'));
                  return [
                    c.key,
                    c.type === 'text' || c.type === 'choice'
                      ? text
                      : c.type === 'number'
                        ? number
                        : { value: number, unit: cell.unit },
                  ];
                }),
              ),
            ),
          },
        },
      ),
    onSuccess: (saved) => {
      setErrors([]);
      setNote('');
      toast.success(t('saved', { number: saved.number }));
      router.refresh();
    },
    onError: (error) => {
      setErrors(error instanceof ApiError ? (error.problem.errors ?? []) : []);
      toast.error(error.message);
      if (error instanceof ApiError && error.problem.status === 412) router.refresh();
    },
  });

  const invalid = (index: number, key: string) =>
    errors.some((e) => e.path === `rows.${String(index + 1)}.${key}`);

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Callout tone="destructive" title={t('rowErrors')}>
          <ul className="list-inside list-disc">
            {errors.map((e) => (
              <li key={`${e.path}-${e.message}`}>{e.message}</li>
            ))}
          </ul>
        </Callout>
      )}
      {!editable && revision && (
        <p className="text-sm text-muted-foreground">
          {t('readOnly', { number: revision.number })}
        </p>
      )}
      <div className="rounded-lg border">
        <Table regionLabel={t('editorTable')}>
          <TableCaption className="sr-only">{t('editorTable')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              {kind.columns.map((c) => (
                <TableHead key={c.key}>
                  {c.label}
                  {c.required ? ' *' : ''}
                </TableHead>
              ))}
              {editable && (
                <TableHead className="w-12">
                  <span className="sr-only">{t('actions')}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={kind.columns.length + 2} className="text-muted-foreground">
                  {t('none')}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                {kind.columns.map((c) => {
                  const cell = row.cells[c.key] ?? { text: '', unit: '' };
                  const name = t('cellOf', { column: c.label, row: index + 1 });
                  if (!editable) {
                    return (
                      <TableCell key={c.key}>
                        {cell.text === ''
                          ? '—'
                          : c.type === 'text'
                            ? cell.text
                            : c.type === 'choice'
                              ? (c.options.find((o) => o.value === cell.text)?.label ?? cell.text)
                              : c.type === 'number'
                                ? cell.text
                                : withUnit(
                                    formatAuto(Number(cell.text.replace(',', '.'))),
                                    c.units.find((u) => u.symbol === cell.unit)?.display ??
                                      cell.unit,
                                  )}
                      </TableCell>
                    );
                  }
                  if (c.type === 'choice') {
                    return (
                      <TableCell key={c.key} className="min-w-40">
                        <Select
                          value={cell.text}
                          onValueChange={(value) => {
                            // Radix peut émettre '' quand la liste change : ignoré.
                            if (value) setCell(row.id, c.key, { ...cell, text: value });
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label={name}
                            aria-invalid={invalid(index, c.key) || undefined}
                          >
                            <SelectValue placeholder={t('choose')} />
                          </SelectTrigger>
                          <SelectContent>
                            {c.options.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={c.key} className="min-w-36">
                      <div className="flex gap-1">
                        <Input
                          aria-label={name}
                          inputMode={c.type === 'text' ? 'text' : 'decimal'}
                          value={cell.text}
                          aria-invalid={invalid(index, c.key) || undefined}
                          onChange={(e) => {
                            setCell(row.id, c.key, { ...cell, text: e.target.value });
                          }}
                        />
                        {c.type === 'quantity' &&
                          (c.units.length > 1 ? (
                            <Select
                              value={cell.unit}
                              onValueChange={(unit) => {
                                setCell(row.id, c.key, { ...cell, unit });
                              }}
                            >
                              <SelectTrigger className="w-20" aria-label={`${name} — unité`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {c.units.map((u) => (
                                  <SelectItem key={u.symbol} value={u.symbol}>
                                    {u.display}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="self-center text-sm text-muted-foreground">
                              {c.units[0]?.display}
                            </span>
                          ))}
                      </div>
                    </TableCell>
                  );
                })}
                {editable && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('removeRow', { row: index + 1 })}
                      onClick={() => {
                        setRows((current) => current.filter((r) => r.id !== row.id));
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editable && (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => {
              setRows((current) => [...current, emptyRow(kind)]);
            }}
          >
            <Plus aria-hidden />
            {t('addRow')}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="dataset-note">{t('note')}</Label>
            <Input
              id="dataset-note"
              value={note}
              maxLength={500}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>
          <Button
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            <Save aria-hidden />
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
