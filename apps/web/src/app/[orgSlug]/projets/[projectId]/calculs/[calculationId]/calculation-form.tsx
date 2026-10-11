'use client';

import type { EngineDto, RevisionDto } from '@consulpro/contracts';
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
import { Play } from 'lucide-react';
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

type Field =
  | { readonly mode: 'manual'; readonly value: string; readonly unit: string }
  | { readonly mode: 'link'; readonly link: string };

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly calculationId: string;
  readonly engine: EngineDto;
  readonly initialInputs: Readonly<Record<string, unknown>>;
  readonly linkable: readonly LinkableOutputView[];
}

const linkKey = (o: { calculationId: string; output: string }) => `${o.calculationId}:${o.output}`;

function initialField(input: EngineDto['inputs'][number], raw: unknown): Field {
  if (typeof raw === 'object' && raw !== null && 'fromCalculation' in raw && 'output' in raw) {
    const link = raw as { fromCalculation: string; output: string };
    return {
      mode: 'link',
      link: linkKey({ calculationId: link.fromCalculation, output: link.output }),
    };
  }
  if (input.kind === 'enum') {
    return { mode: 'manual', value: typeof raw === 'string' ? raw : '', unit: '' };
  }
  const measured = raw as { value?: unknown; unit?: unknown } | undefined;
  return {
    mode: 'manual',
    value: typeof measured?.value === 'number' ? String(measured.value).replace('.', ',') : '',
    unit:
      typeof measured?.unit === 'string' && input.units.some((u) => u.symbol === measured.unit)
        ? measured.unit
        : (input.units[0]?.symbol ?? ''),
  };
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
        if (!field) continue;
        if (field.mode === 'link') {
          const [fromCalculation, output] = field.link.split(':');
          if (fromCalculation && output) inputs[input.key] = { fromCalculation, output };
          continue;
        }
        const text = field.value.trim();
        if (text === '') continue;
        inputs[input.key] =
          input.kind === 'enum'
            ? text
            : { value: Number(text.replace(/\s/g, '').replace(',', '.')), unit: field.unit };
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
      const issues = error instanceof ApiError ? (error.problem.errors ?? []) : [];
      setErrors(issues);
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
          const field = fields[input.key] ?? { mode: 'manual', value: '', unit: '' };
          const id = `input-${input.key}`;
          const fieldErrors = errorFor(input.key);
          const described =
            fieldErrors.length > 0 ? `${id}-error` : input.help ? `${id}-help` : undefined;
          const compatible =
            input.kind === 'quantity' ? linkable.filter((o) => o.unitKind === input.unitKind) : [];
          return (
            <fieldset key={input.key} className="min-w-0 space-y-2 rounded-lg border p-3">
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
                    set(input.key, { mode: 'link', link });
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
              ) : input.kind === 'enum' ? (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    set(input.key, { mode: 'manual', value, unit: '' });
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
              ) : (
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={id} className="sr-only">
                      {input.label}
                    </Label>
                    <Input
                      id={id}
                      inputMode="decimal"
                      autoComplete="off"
                      value={field.value}
                      aria-invalid={fieldErrors.length > 0 || undefined}
                      aria-describedby={described}
                      onChange={(e) => {
                        set(input.key, { ...field, value: e.target.value });
                      }}
                    />
                  </div>
                  <Select
                    value={field.unit}
                    onValueChange={(unit) => {
                      set(input.key, { ...field, unit });
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
                </div>
              )}
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
