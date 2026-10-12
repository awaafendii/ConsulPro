'use client';

import type { PriceLibraryDto } from '@consulpro/contracts';
import { currencySchema } from '@consulpro/contracts';
import {
  AppLink,
  Button,
  DataTable,
  EmptyState,
  Input,
  Label,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Tags } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { currencyName } from '@/lib/decimal';

interface Props {
  readonly orgSlug: string;
  readonly canManage: boolean;
  readonly libraries: readonly PriceLibraryDto[];
}

/** Date AAAA-MM-JJ affichée sans décalage de fuseau (date civile). */
const civilDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function PriceLibrariesView({ orgSlug, canManage, libraries }: Props) {
  const t = useTranslations('prices');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('XOF');
  const [validFrom, setValidFrom] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<PriceLibraryDto>(`/organizations/${orgSlug}/price-libraries`, {
        method: 'POST',
        json: { name, currency, validFrom: validFrom === '' ? null : validFrom },
      }),
    onSuccess: (library) => {
      toast.success(t('created', { name: library.name }));
      router.push(`/${orgSlug}/bibliotheque/prix/${library.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const columns: DataColumn<PriceLibraryDto>[] = [
    {
      id: 'name',
      header: t('name'),
      cell: (l) => (
        <AppLink
          href={`/${orgSlug}/bibliotheque/prix/${l.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {l.name}
        </AppLink>
      ),
      sortValue: (l) => l.name,
      filterValue: (l) => `${l.name} ${l.currency}`,
    },
    {
      id: 'currency',
      header: t('currency'),
      cell: (l) => l.currency,
      sortValue: (l) => l.currency,
    },
    {
      id: 'validFrom',
      header: t('validFrom'),
      sortValue: (l) => l.validFrom ?? '',
      cell: (l) =>
        l.validFrom ? (
          format.dateTime(civilDate(l.validFrom), { dateStyle: 'medium', timeZone: 'UTC' })
        ) : (
          <span className="text-muted-foreground">{t('noValidity')}</span>
        ),
    },
    {
      id: 'items',
      header: t('itemCount'),
      align: 'end',
      cell: (l) => l.itemCount,
      sortValue: (l) => l.itemCount,
    },
  ];

  return (
    <Section title={t('title')}>
      <div className="space-y-6">
        <DataTable
          caption={t('table')}
          columns={columns}
          rows={libraries}
          getRowId={(l) => l.id}
          empty={<EmptyState icon={Tags} title={t('empty')} />}
        />
        {canManage && (
          <form
            noValidate
            className="space-y-3 border-t pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length < 2 || name.trim().length > 120) {
                setNameError(t('validation.name'));
                return;
              }
              setNameError(null);
              create.mutate();
            }}
          >
            <h3 className="font-medium">{t('createTitle')}</h3>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="library-name">{t('name')}</Label>
                <Input
                  id="library-name"
                  value={name}
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'library-name-error' : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                />
                {nameError && (
                  <p id="library-name-error" className="text-sm font-medium text-destructive">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="library-currency">{t('currency')}</Label>
                <Select
                  value={currency}
                  onValueChange={(value) => {
                    if (value !== '') setCurrency(value);
                  }}
                >
                  <SelectTrigger id="library-currency" className="w-full lg:w-64">
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
              <div className="space-y-2">
                <Label htmlFor="library-valid-from">{t('validFrom')}</Label>
                <Input
                  id="library-valid-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => {
                    setValidFrom(e.target.value);
                  }}
                />
              </div>
              <Button type="submit" className="lg:mt-[1.375rem]" loading={create.isPending}>
                <Plus aria-hidden />
                {t('create')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}
