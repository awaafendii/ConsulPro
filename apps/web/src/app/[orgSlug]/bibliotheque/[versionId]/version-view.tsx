'use client';

import type {
  OverrideDto,
  ParameterValueDto,
  StandardVersionDetailDto,
} from '@consulpro/contracts';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Section,
  toast,
  useConfirm,
  VerificationBadge,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { ListChecks, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { OverrideDialog } from '@/features/projects/override-dialog';
import { formatParameterValue } from '@/features/projects/parameter-value';
import { api, ApiError } from '@/lib/api';

type Parameter = StandardVersionDetailDto['parameters'][number];
type Rule = StandardVersionDetailDto['rules'][number];

const SEVERITY_BADGE = { BLOCKING: 'destructive', WARNING: 'warning', INFO: 'info' } as const;

interface Props {
  readonly orgSlug: string;
  readonly version: StandardVersionDetailDto;
  /** Gestion des surcharges d'organisation (version publiée, rôle suffisant). */
  readonly canManage: boolean;
  readonly overrides: readonly OverrideDto[];
}

export function VersionView({ orgSlug, version, canManage, overrides }: Props) {
  const t = useTranslations('library');
  const tStandards = useTranslations('project.standards');
  const tOverrides = useTranslations('overrides');
  const confirm = useConfirm();
  const router = useRouter();
  const base = `/organizations/${orgSlug}/library/overrides`;
  const display = (value: ParameterValueDto) =>
    formatParameterValue(value, version.units, (count) => tStandards('table', { count }));

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };
  const remove = useMutation({
    mutationFn: (override: OverrideDto) =>
      api(`${base}/${override.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${override.version}"` },
      }),
    onSuccess: () => {
      toast.success(tOverrides('removed'));
      router.refresh();
    },
    onError,
  });
  const save = async (
    parameter: Parameter,
    existing: OverrideDto | undefined,
    value: ParameterValueDto,
    justification: string,
  ) => {
    try {
      await (existing
        ? api(`${base}/${existing.id}`, {
            method: 'PATCH',
            json: { value, justification },
            headers: { 'if-match': `"${existing.version}"` },
          })
        : api(base, {
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

  const parameterColumns: DataColumn<Parameter>[] = [
    {
      id: 'label',
      header: tStandards('label'),
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
      id: 'reference',
      header: tStandards('reference'),
      cell: (p) => <span className="tabular-nums">{display(p.value)}</span>,
    },
    {
      id: 'organization',
      header: t('orgOverrides'),
      cell: (p) => {
        const existing = overrides.find((o) => o.key === p.key);
        return existing ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{display(existing.value)}</span>
            <Badge variant="info">{tStandards('origins.ORGANIZATION')}</Badge>
            <span className="block w-full text-xs text-muted-foreground">
              {existing.justification} — {existing.createdByName}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'source',
      header: tStandards('source'),
      cell: (p) => (
        <span className="text-sm">
          {p.source.document}
          {p.source.clause ? `, ${p.source.clause}` : ''}
          {p.source.table ? `, ${p.source.table}` : ''}
          {p.source.note && (
            <span className="block text-xs text-muted-foreground">{p.source.note}</span>
          )}
        </span>
      ),
    },
    {
      id: 'verification',
      header: tStandards('verification'),
      cell: (p) => <VerificationBadge verification={p.verification} />,
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: tStandards('actions'),
            align: 'end' as const,
            cell: (p: Parameter) => {
              const reference = p.value;
              if (reference.kind === 'TABLE') {
                return (
                  <span className="text-xs text-muted-foreground">
                    {tStandards('tableUnsupported')}
                  </span>
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

  const ruleColumns: DataColumn<Rule>[] = [
    {
      id: 'code',
      header: t('ruleCode'),
      cell: (r) => <span className="font-mono text-sm">{r.code}</span>,
      sortValue: (r) => r.code,
    },
    { id: 'description', header: t('ruleDescription'), cell: (r) => r.description },
    {
      id: 'severity',
      header: t('severity'),
      cell: (r) => (
        <Badge variant={SEVERITY_BADGE[r.severity]}>{t(`severities.${r.severity}`)}</Badge>
      ),
    },
    { id: 'clause', header: t('clause'), cell: (r) => r.clause ?? '—' },
  ];

  return (
    <>
      <Section title={t('parameters')} description={t('orgOverridesDescription')}>
        <DataTable
          caption={t('parametersTable')}
          columns={parameterColumns}
          rows={version.parameters}
          getRowId={(p) => p.key}
        />
      </Section>
      <Section title={t('rules')}>
        <DataTable
          caption={t('rulesTable')}
          columns={ruleColumns}
          rows={version.rules}
          getRowId={(r) => r.code}
          empty={<EmptyState icon={ListChecks} title={t('noRules')} />}
        />
      </Section>
    </>
  );
}
