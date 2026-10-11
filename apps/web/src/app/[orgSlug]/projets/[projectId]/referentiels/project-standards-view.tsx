'use client';

import type {
  DisciplineDto,
  EffectiveParameterDto,
  OverrideDto,
  ParameterValueDto,
} from '@consulpro/contracts';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ErrorState,
  Label,
  Section,
  toast,
  useConfirm,
  VerificationBadge,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OverrideDialog } from '@/features/projects/override-dialog';
import { formatParameterValue } from '@/features/projects/parameter-value';
import { api, ApiError } from '@/lib/api';

interface VersionOption {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly title: string;
}

export interface DisciplineBlock {
  readonly discipline: DisciplineDto;
  readonly versions: readonly (VersionOption & {
    readonly parameters: readonly EffectiveParameterDto[];
    readonly units: Readonly<Record<string, string>>;
    readonly error: string | null;
  })[];
  /** Versions publiées proposées pour ce métier (si l'utilisateur peut modifier la sélection). */
  readonly options: readonly VersionOption[];
}

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canSelect: boolean;
  readonly canOverride: boolean;
  readonly blocks: readonly DisciplineBlock[];
  readonly overrides: readonly OverrideDto[];
}

const ORIGIN_BADGE = { STANDARD: 'outline', ORGANIZATION: 'info', PROJECT: 'warning' } as const;

export function ProjectStandardsView({
  orgSlug,
  projectId,
  canSelect,
  canOverride,
  blocks,
  overrides,
}: Props) {
  const t = useTranslations('project.standards');
  const tDisciplines = useTranslations('disciplines');
  const base = `/organizations/${orgSlug}/projects/${projectId}`;

  return (
    <div className="space-y-6">
      <Callout>{t('description')}</Callout>
      {blocks.map((block) => (
        <Section
          key={block.discipline}
          title={tDisciplines(block.discipline)}
          actions={
            canSelect ? (
              <SelectionDialog
                base={base}
                discipline={block.discipline}
                options={block.options}
                selected={block.versions.map((v) => v.id)}
              />
            ) : undefined
          }
        >
          {block.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('none')}</p>
          ) : (
            <div className="space-y-8">
              {block.versions.map((version) =>
                version.error ? (
                  <ErrorState key={version.id} message={version.error} />
                ) : (
                  <ParametersTable
                    key={version.id}
                    base={base}
                    version={version}
                    canOverride={canOverride}
                    overrides={overrides.filter((o) => o.standardVersionId === version.id)}
                  />
                ),
              )}
            </div>
          )}
        </Section>
      ))}
    </div>
  );
}

function ParametersTable({
  base,
  version,
  canOverride,
  overrides,
}: {
  base: string;
  version: DisciplineBlock['versions'][number];
  canOverride: boolean;
  overrides: readonly OverrideDto[];
}) {
  const t = useTranslations('project.standards');
  const tOverrides = useTranslations('overrides');
  const confirm = useConfirm();
  const router = useRouter();
  const display = (value: ParameterValueDto) =>
    formatParameterValue(value, version.units, (count) => t('table', { count }));

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };
  const remove = useMutation({
    mutationFn: (override: OverrideDto) =>
      api(`${base}/overrides/${override.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${override.version}"` },
      }),
    onSuccess: () => {
      toast.success(tOverrides('removed'));
      router.refresh();
    },
    onError,
  });

  /** Enregistre la surcharge ; l'erreur est relancée pour garder la boîte de dialogue ouverte. */
  const save = async (
    parameter: EffectiveParameterDto,
    existing: OverrideDto | undefined,
    value: ParameterValueDto,
    justification: string,
  ) => {
    try {
      await (existing
        ? api(`${base}/overrides/${existing.id}`, {
            method: 'PATCH',
            json: { value, justification },
            headers: { 'if-match': `"${existing.version}"` },
          })
        : api(`${base}/overrides`, {
            method: 'POST',
            json: { standardVersionId: version.id, key: parameter.key, value, justification },
          }));
      toast.success(tOverrides('saved'));
      router.refresh();
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  };

  const columns: DataColumn<EffectiveParameterDto>[] = [
    {
      id: 'label',
      header: t('label'),
      cell: (p) => (
        <span className="block min-w-40">
          <span className="font-medium">{p.label}</span>
          <span className="block font-mono text-xs text-muted-foreground">{p.key}</span>
        </span>
      ),
      sortValue: (p) => p.label,
      filterValue: (p) => `${p.label} ${p.key}`,
    },
    {
      id: 'value',
      header: t('value'),
      cell: (p) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{display(p.value)}</span>
          <Badge variant={ORIGIN_BADGE[p.origin]}>{t(`origins.${p.origin}`)}</Badge>
          {p.justification && (
            <span className="block w-full text-xs text-muted-foreground">{p.justification}</span>
          )}
        </span>
      ),
    },
    {
      id: 'reference',
      header: t('reference'),
      cell: (p) => <span className="tabular-nums">{display(p.referenceValue)}</span>,
    },
    {
      id: 'source',
      header: t('source'),
      cell: (p) => (
        <span className="text-sm">
          {p.source.document}
          {p.source.clause ? `, ${p.source.clause}` : ''}
          {p.source.table ? `, ${p.source.table}` : ''}
        </span>
      ),
    },
    {
      id: 'verification',
      header: t('verification'),
      cell: (p) => <VerificationBadge verification={p.verification} />,
    },
    ...(canOverride
      ? [
          {
            id: 'actions',
            header: t('actions'),
            align: 'end' as const,
            cell: (p: EffectiveParameterDto) => {
              const reference = p.referenceValue;
              if (reference.kind === 'TABLE') {
                return (
                  <span className="text-xs text-muted-foreground">{t('tableUnsupported')}</span>
                );
              }
              const existing = overrides.find((o) => o.key === p.key);
              return (
                <span className="flex justify-end gap-1">
                  <OverrideDialog
                    label={p.label}
                    reference={reference}
                    units={version.units}
                    {...(existing
                      ? {
                          initial: { value: existing.value, justification: existing.justification },
                        }
                      : {})}
                    onSave={(value, justification) => save(p, existing, value, justification)}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={
                          existing
                            ? tOverrides('editOf', { label: p.label })
                            : tOverrides('createOf', { label: p.label })
                        }
                      >
                        {existing ? <Pencil aria-hidden /> : <SlidersHorizontal aria-hidden />}
                        {existing ? tOverrides('edit') : tOverrides('create')}
                      </Button>
                    }
                  />
                  {existing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={tOverrides('removeOf', { label: p.label })}
                      onClick={() => {
                        void confirm({
                          title: tOverrides('removeTitle', { label: p.label }),
                          description: tOverrides('removeDescription'),
                          confirmLabel: tOverrides('remove'),
                          tone: 'destructive',
                        }).then((ok) => {
                          if (ok) remove.mutate(existing);
                        });
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </span>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-medium">
        {version.code} {version.label} — {version.title}
      </h3>
      <DataTable
        caption={t('parameters', { standard: `${version.code} ${version.label}` })}
        columns={columns}
        rows={version.parameters}
        getRowId={(p) => p.key}
      />
    </div>
  );
}

function SelectionDialog({
  base,
  discipline,
  options,
  selected,
}: {
  base: string;
  discipline: DisciplineDto;
  options: readonly VersionOption[];
  selected: readonly string[];
}) {
  const t = useTranslations('project.standards');
  const tDisciplines = useTranslations('disciplines');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>(selected);

  const save = useMutation({
    mutationFn: () =>
      api(`${base}/standards/${discipline}`, {
        method: 'PUT',
        json: { standardVersionIds: chosen },
      }),
    onSuccess: () => {
      toast.success(t('saved'));
      setOpen(false);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setChosen(selected);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden />
          {t('edit')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle', { discipline: tDisciplines(discipline) })}</DialogTitle>
          <DialogDescription>{t('editDescription')}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noneAvailable')}</p>
        ) : (
          <ul className="space-y-3">
            {options.map((option) => {
              const id = `standard-${discipline}-${option.id}`;
              return (
                <li key={option.id} className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={chosen.includes(option.id)}
                    onCheckedChange={(next) => {
                      setChosen((current) =>
                        next === true
                          ? [...current, option.id]
                          : current.filter((x) => x !== option.id),
                      );
                    }}
                  />
                  <Label htmlFor={id} className="flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">
                      {option.code} {option.label}
                    </span>
                    <span className="text-muted-foreground">{option.title}</span>
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
