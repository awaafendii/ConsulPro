'use client';

import type { BoqDto, BoqSummaryDto } from '@consulpro/contracts';
import { currencySchema } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Button,
  Callout,
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
import { Calculator, Plus } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { currencyName, formatMoney } from '@/lib/decimal';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canManage: boolean;
  readonly hasTakeoff: boolean;
  readonly defaultCurrency: string;
  readonly boqs: readonly BoqSummaryDto[];
}

export function BoqsView({
  orgSlug,
  projectId,
  canManage,
  hasTakeoff,
  defaultCurrency,
  boqs,
}: Props) {
  const t = useTranslations('boq');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(defaultCurrency);
  const base = `/${orgSlug}/projets/${projectId}`;

  const create = useMutation({
    mutationFn: () =>
      api<BoqDto>(`/organizations/${orgSlug}/projects/${projectId}/boqs`, {
        method: 'POST',
        json: { title, currency },
      }),
    onSuccess: (boq) => {
      toast.success(t('created', { title: boq.title, count: boq.items.length }));
      router.push(`${base}/quantitatifs/${boq.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const pendingCount = (b: BoqSummaryDto) => b.pending.add + b.pending.update + b.pending.remove;

  const columns: DataColumn<BoqSummaryDto>[] = [
    {
      id: 'title',
      header: t('title'),
      cell: (b) => (
        <AppLink
          href={`${base}/quantitatifs/${b.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {b.title}
        </AppLink>
      ),
      sortValue: (b) => b.title,
      filterValue: (b) => b.title,
    },
    { id: 'currency', header: t('currency'), cell: (b) => b.currency },
    {
      id: 'total',
      header: t('total'),
      align: 'end',
      cell: (b) =>
        b.total.unpriced === b.total.lines ? (
          <span className="text-muted-foreground">{t('notPriced')}</span>
        ) : (
          formatMoney(b.total.amount, b.currency, locale)
        ),
    },
    {
      id: 'lines',
      header: t('linesHeader'),
      cell: (b) => (
        <span className="flex flex-col">
          <span>{t('lines', { count: b.total.lines })}</span>
          {b.total.unpriced > 0 && b.total.unpriced < b.total.lines && (
            <span className="text-sm text-muted-foreground">
              {t('unpricedCount', { count: b.total.unpriced })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'state',
      header: t('state'),
      cell: (b) =>
        pendingCount(b) > 0 ? (
          <Badge variant="warning">{t('outdated')}</Badge>
        ) : (
          <Badge variant="success">{t('upToDate')}</Badge>
        ),
    },
    {
      id: 'updated',
      header: t('updatedAt'),
      sortValue: (b) => b.updatedAt,
      cell: (b) =>
        `${b.createdByName} · ${format.dateTime(new Date(b.updatedAt), { dateStyle: 'short' })}`,
    },
  ];

  return (
    <div className="space-y-6">
      {!hasTakeoff && (
        <Callout tone="info">
          {t('needTakeoff')}{' '}
          <AppLink
            href={`${base}/avant-metre`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('goTakeoff')}
          </AppLink>
        </Callout>
      )}
      <DataTable
        caption={t('listTable')}
        columns={columns}
        rows={boqs}
        getRowId={(b) => b.id}
        empty={<EmptyState icon={Calculator} title={t('empty')} />}
      />
      {canManage && (
        <form
          noValidate
          className="space-y-3 border-t pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2 || title.trim().length > 160) {
              setTitleError(t('validation.title'));
              return;
            }
            setTitleError(null);
            create.mutate();
          }}
        >
          <h3 className="font-medium">{t('createTitle')}</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="boq-title">{t('title')}</Label>
              <Input
                id="boq-title"
                value={title}
                autoComplete="off"
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? 'boq-title-error' : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
              {titleError && (
                <p id="boq-title-error" className="text-sm font-medium text-destructive">
                  {titleError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="boq-currency">{t('currency')}</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (value !== '') setCurrency(value);
                }}
              >
                <SelectTrigger id="boq-currency" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencySchema.options.map((code) => (
                    <SelectItem key={code} value={code}>
                      {`${code} — ${currencyName(code, locale)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="sm:mt-[1.375rem]" loading={create.isPending}>
              <Plus aria-hidden />
              {t('create')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
