'use client';

import type { DatasetDto, DatasetKindDto } from '@consulpro/contracts';
import {
  AppLink,
  Button,
  DataTable,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Database, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canCreate: boolean;
  readonly datasets: readonly DatasetDto[];
  readonly kinds: readonly DatasetKindDto[];
}

export function DatasetsView({ orgSlug, projectId, canCreate, datasets, kinds }: Props) {
  const t = useTranslations('datasets');
  const tStudies = useTranslations('studies');
  const format = useFormatter();
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const label = (id: string) => kinds.find((k) => k.id === id)?.label ?? id;

  const create = useMutation({
    mutationFn: () =>
      api<DatasetDto>(`/organizations/${orgSlug}/projects/${projectId}/datasets`, {
        method: 'POST',
        json: { kind, title },
      }),
    onSuccess: (dataset) => {
      toast.success(t('created', { title: dataset.title }));
      router.push(`/${orgSlug}/projets/${projectId}/donnees/${dataset.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const columns: DataColumn<DatasetDto>[] = [
    {
      id: 'title',
      header: t('title'),
      cell: (d) => (
        <AppLink
          href={`/${orgSlug}/projets/${projectId}/donnees/${d.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {d.title}
        </AppLink>
      ),
      sortValue: (d) => d.title,
      filterValue: (d) => `${d.title} ${label(d.kind)}`,
    },
    { id: 'kind', header: t('kind'), cell: (d) => label(d.kind) },
    {
      id: 'revision',
      header: t('revision'),
      cell: (d) => (d.current ? String(d.current.number) : t('none')),
    },
    { id: 'rows', header: t('rows'), cell: (d) => d.current?.rowCount ?? 0, align: 'end' },
    {
      id: 'updated',
      header: t('updatedBy'),
      cell: (d) =>
        d.current
          ? `${d.current.authorName} · ${format.dateTime(new Date(d.current.createdAt), { dateStyle: 'short' })}`
          : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption={t('table')}
        columns={columns}
        rows={datasets}
        getRowId={(d) => d.id}
        empty={<EmptyState icon={Database} title={t('empty')} />}
      />
      {canCreate &&
        (kinds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noKind')}</p>
        ) : (
          <form
            noValidate
            className="space-y-3 border-t pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length < 2 || title.trim().length > 160) {
                setTitleError(tStudies('validation.title'));
                return;
              }
              setTitleError(null);
              create.mutate();
            }}
          >
            <h3 className="font-medium">{t('createTitle')}</h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="space-y-2">
                <Label htmlFor="dataset-kind">{t('kind')}</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger id="dataset-kind" className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="dataset-title">{t('title')}</Label>
                <Input
                  id="dataset-title"
                  value={title}
                  autoComplete="off"
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? 'dataset-title-error' : undefined}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                />
                {titleError && (
                  <p id="dataset-title-error" className="text-sm font-medium text-destructive">
                    {titleError}
                  </p>
                )}
              </div>
              <Button type="submit" className="sm:mt-[1.375rem]" loading={create.isPending}>
                <Plus aria-hidden />
                {t('create')}
              </Button>
            </div>
          </form>
        ))}
    </div>
  );
}
