'use client';

import type { EngineDto, ListFieldDto, RevisionDto } from '@consulpro/contracts';
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
  toast,
  withUnit,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Play, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api, ApiError } from '@/lib/api';

export interface LinkableOutputView {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly revisionNumber: number;
  readonly output: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly unitKind: string;
}

type Input = EngineDto['inputs'][number];
interface Cell {
  readonly text: string;
  readonly unit: string;
}
interface Row {
  readonly id: number;
  readonly cells: Readonly<Record<string, Cell>>;
}
type Field =
  | { readonly mode: 'manual'; readonly value: string; readonly unit: string }
  | { readonly mode: 'link'; readonly link: string }
  | { readonly mode: 'list'; readonly rows: readonly Row[] };

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly calculationId: string;
  readonly engine: EngineDto;
  readonly initialInputs: Readonly<Record<string, unknown>>;
  readonly linkable: readonly LinkableOutputView[];
}

let nextRowId = 0;
const linkKey = (o: { calculationId: string; output: string }) => `${o.calculationId}:${o.output}`;
/** Saisie à la française (virgule décimale, espaces de milliers) ; aucune conversion d'unité. */
const parseNumber = (text: string) => Number(text.replace(/\s/g, '').replace(',', '.'));
const shown = (value: unknown) =>
  typeof value === 'number' ? String(value).replace('.', ',') : '';

const unitOf = (raw: unknown, units: readonly { symbol: string }[]) => {
  const unit = (raw as { unit?: unknown } | undefined)?.unit;
  return typeof unit === 'string' && units.some((u) => u.symbol === unit)
    ? unit
    : (units[0]?.symbol ?? '');
};

function cellOf(field: ListFieldDto, raw: unknown): Cell {
  if (field.kind === 'integer') return { text: shown(raw), unit: '' };
  return {
    text: shown((raw as { value?: unknown } | undefined)?.value),
    unit: unitOf(raw, field.units),
  };
}

const emptyRow = (fields: readonly ListFieldDto[]): Row => ({
  id: (nextRowId += 1),
  cells: Object.fromEntries(fields.map((f) => [f.key, cellOf(f, undefined)])),
});

function initialField(input: Input, raw: unknown): Field {
  if (typeof raw === 'object' && raw !== null && 'fromCalculation' in raw && 'output' in raw) {
    const link = raw as { fromCalculation: string; output: string };
    return {
      mode: 'link',
      link: linkKey({ calculationId: link.fromCalculation, output: link.output }),
    };
  }
  switch (input.kind) {
    case 'enum':
      return { mode: 'manual', value: typeof raw === 'string' ? raw : '', unit: '' };
    case 'integer':
      return { mode: 'manual', value: shown(raw), unit: '' };
    case 'list':
      return {
        mode: 'list',
        rows: Array.isArray(raw)
          ? raw.map((r: Record<string, unknown>) => ({
              id: (nextRowId += 1),
              cells: Object.fromEntries(input.fields.map((f) => [f.key, cellOf(f, r[f.key])])),
            }))
          : [],
      };
    case 'quantity':
      return {
        mode: 'manual',
        value: shown((raw as { value?: unknown } | undefined)?.value),
        unit: unitOf(raw, input.units),
      };
  }
}

/** Valeur envoyée au serveur pour une entrée (undefined : entrée non renseignée). */
function payload(input: Input, field: Field): unknown {
  if (field.mode === 'link') {
    const [fromCalculation, output] = field.link.split(':');
    return fromCalculation && output ? { fromCalculation, output } : undefined;
  }
  if (field.mode === 'list') {
    if (input.kind !== 'list') return undefined;
    const rows = field.rows.filter((r) => Object.values(r.cells).some((c) => c.text.trim() !== ''));
    return rows.map((r) =>
      Object.fromEntries(
        input.fields.map((f) => {
          const cell = r.cells[f.key] ?? { text: '', unit: '' };
          const value = parseNumber(cell.text);
          return [f.key, f.kind === 'integer' ? value : { value, unit: cell.unit }];
        }),
      ),
    );
  }
  const text = field.value.trim();
  if (text === '') return undefined;
  if (input.kind === 'enum') return text;
  if (input.kind === 'integer') return parseNumber(text);
  return { value: parseNumber(text), unit: field.unit };
}

/**
 * Saisie des entrées d'un calcul. Aucune formule ici : les valeurs sont envoyées telles
 * quelles au serveur, qui exécute le moteur et enregistre une révision immuable.
 */
export function CalculationForm({
  orgSlug,
  projectId,
  calculationId,
  engine,
  initialInputs,
  linkable,
}: Props) {
  const t = useTranslations('calculations');
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, Field>>(() =>
    Object.fromEntries(engine.inputs.map((i) => [i.key, initialField(i, initialInputs[i.key])])),
  );
  const [errors, setErrors] = useState<readonly { path: string; message: string }[]>([]);

  const set = (key: string, field: Field) => {
    setFields((current) => ({ ...current, [key]: field }));
  };

  const run = useMutation({
    mutationFn: () => {
      const inputs: Record<string, unknown> = {};
      for (const input of engine.inputs) {
        const field = fields[input.key];
        const value = field ? payload(input, field) : undefined;
        if (value !== undefined) inputs[input.key] = value;
      }
      return api<RevisionDto>(
        `/organizations/${orgSlug}/projects/${projectId}/calculations/${calculationId}/runs`,
        { method: 'POST', json: { inputs } },
      );
    },
    onSuccess: (revision) => {
      setErrors([]);
      toast.success(t('computed', { number: revision.number }));
      router.push(`/${orgSlug}/projets/${projectId}/calculs/${calculationId}`);
      router.refresh();
    },
    onError: (error) => {
      setErrors(error instanceof ApiError ? (error.problem.errors ?? []) : []);
      toast.error(error.message);
    },
  });

  const errorFor = (key: string) =>
    errors.filter((e) => e.path === key || e.path.startsWith(`${key}.`));
  const general = errors.filter((e) => !engine.inputs.some((i) => errorFor(i.key).includes(e)));

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      {errors.length > 0 && (
        <Callout tone="destructive" title={t('inputErrors')}>
          {general.length > 0 && (
            <ul className="list-inside list-disc">
              {general.map((e) => (
                <li key={`${e.path}-${e.message}`}>{e.message}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {engine.inputs.map((input) => {
          const field = fields[input.key] ?? initialField(input, undefined);
          const id = `input-${input.key}`;
          const fieldErrors = errorFor(input.key);
          const described =
            fieldErrors.length > 0 ? `${id}-error` : input.help ? `${id}-help` : undefined;
          const compatible =
            input.kind === 'quantity' ? linkable.filter((o) => o.unitKind === input.unitKind) : [];
          return (
            <fieldset
              key={input.key}
              className={`min-w-0 space-y-2 rounded-lg border p-3 ${input.kind === 'list' ? 'lg:col-span-2' : ''}`}
            >
              <legend className="px-1 text-sm font-medium">{input.label}</legend>
              {compatible.length > 0 && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('source')}>
                  {(['manual', 'link'] as const).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={field.mode === mode}
                      variant={field.mode === mode ? 'secondary' : 'ghost'}
                      onClick={() => {
                        set(
                          input.key,
                          mode === 'manual'
                            ? initialField(input, undefined)
                            : { mode: 'link', link: compatible[0] ? linkKey(compatible[0]) : '' },
                        );
                      }}
                    >
                      {mode === 'manual' ? t('sourceManual') : t('sourceLink')}
                    </Button>
                  ))}
                </div>
              )}
              {field.mode === 'link' ? (
                <Select
                  value={field.link}
                  onValueChange={(link) => {
                    if (link) set(input.key, { mode: 'link', link });
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t('linkOf', { label: input.label })}
                  >
                    <SelectValue placeholder={t('linkPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {compatible.map((o) => (
                      <SelectItem key={linkKey(o)} value={linkKey(o)}>
                        {o.calculationTitle} — {o.label} ({withUnit(formatAuto(o.value), o.unit)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.mode === 'list' && input.kind === 'list' ? (
                <ListEditor
                  inputKey={input.key}
                  label={input.label}
                  fields={input.fields}
                  maxItems={input.maxItems}
                  rows={field.rows}
                  invalid={(path) => errors.some((e) => e.path.startsWith(`${input.key}.${path}`))}
                  onChange={(rows) => {
                    set(input.key, { mode: 'list', rows });
                  }}
                />
              ) : field.mode === 'manual' && input.kind === 'enum' ? (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (value) set(input.key, { mode: 'manual', value, unit: '' });
                  }}
                >
                  <SelectTrigger id={id} className="w-full" aria-label={input.label}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {input.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.mode === 'manual' ? (
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={id} className="sr-only">
                      {input.label}
                    </Label>
                    <Input
                      id={id}
                      inputMode={input.kind === 'integer' ? 'numeric' : 'decimal'}
                      autoComplete="off"
                      value={field.value}
                      aria-invalid={fieldErrors.length > 0 || undefined}
                      aria-describedby={described}
                      onChange={(e) => {
                        set(input.key, { ...field, value: e.target.value });
                      }}
                    />
                  </div>
                  {input.kind === 'quantity' && (
                    <Select
                      value={field.unit}
                      onValueChange={(unit) => {
                        if (unit) set(input.key, { ...field, unit });
                      }}
                    >
                      <SelectTrigger
                        className="w-28"
                        aria-label={t('unitOf', { label: input.label })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {input.units.map((u) => (
                          <SelectItem key={u.symbol} value={u.symbol}>
                            {u.display}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : null}
              {input.help && fieldErrors.length === 0 && (
                <p id={`${id}-help`} className="text-sm text-muted-foreground">
                  {input.help}
                </p>
              )}
              {fieldErrors.length > 0 && (
                <p id={`${id}-error`} className="text-sm font-medium text-destructive">
                  {fieldErrors.map((e) => e.message).join(' ')}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      <Button type="submit" loading={run.isPending}>
        <Play aria-hidden />
        {run.isPending ? t('running') : t('run')}
      </Button>
    </form>
  );
}

/** Saisie d'une liste (ouvertures, barres d'acier…) : une ligne par élément. */
function ListEditor({
  inputKey,
  label,
  fields,
  maxItems,
  rows,
  invalid,
  onChange,
}: {
  inputKey: string;
  label: string;
  fields: readonly ListFieldDto[];
  maxItems: number;
  rows: readonly Row[];
  invalid: (path: string) => boolean;
  onChange: (rows: readonly Row[]) => void;
}) {
  const t = useTranslations('calculations');
  const update = (rowId: number, key: string, cell: Cell) => {
    onChange(rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: cell } } : r)));
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t('listEmpty')}</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
            {fields.map((f) => {
              const cell = row.cells[f.key] ?? { text: '', unit: '' };
              const id = `${inputKey}-${String(row.id)}-${f.key}`;
              const name = t('listCell', { field: f.label, row: index + 1 });
              return (
                <div key={f.key} className="min-w-28 flex-1 space-y-1">
                  <Label htmlFor={id} className="text-xs">
                    {f.label}
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      id={id}
                      aria-label={name}
                      inputMode={f.kind === 'integer' ? 'numeric' : 'decimal'}
                      autoComplete="off"
                      value={cell.text}
                      aria-invalid={invalid(`${String(index)}.${f.key}`) || undefined}
                      onChange={(e) => {
                        update(row.id, f.key, { ...cell, text: e.target.value });
                      }}
                    />
                    {f.kind === 'quantity' &&
                      (f.units.length > 1 ? (
                        <Select
                          value={cell.unit}
                          onValueChange={(unit) => {
                            if (unit) update(row.id, f.key, { ...cell, unit });
                          }}
                        >
                          <SelectTrigger className="w-20" aria-label={`${name} — ${t('unit')}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {f.units.map((u) => (
                              <SelectItem key={u.symbol} value={u.symbol}>
                                {u.display}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="self-center text-sm text-muted-foreground">
                          {f.units[0]?.display}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('listRemove', { label, row: index + 1 })}
              onClick={() => {
                onChange(rows.filter((r) => r.id !== row.id));
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      {rows.length < maxItems && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...rows, emptyRow(fields)]);
          }}
        >
          <Plus aria-hidden />
          {t('listAdd', { label })}
        </Button>
      )}
    </div>
  );
}
