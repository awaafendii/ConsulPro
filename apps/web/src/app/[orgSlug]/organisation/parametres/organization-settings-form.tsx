'use client';

import type { OrganizationDto, UpdateOrganizationBody } from '@consulpro/contracts';
import { currencySchema } from '@consulpro/contracts';
import { COUNTRIES, COUNTRY_CODES, isCountry } from '@consulpro/domain';
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { currencyName } from '@/lib/decimal';

/** Valeur du sélecteur pour « pays non renseigné » (Radix refuse une valeur vide). */
const NO_COUNTRY = 'NONE';

const countryName = (code: string, locale: string) =>
  new Intl.DisplayNames(locale, { type: 'region' }).of(code) ?? code;

export function OrganizationSettingsForm({
  organization,
  disabled,
}: {
  readonly organization: OrganizationDto;
  readonly disabled: boolean;
}) {
  const t = useTranslations('organizationSettings');
  const locale = useLocale();
  const router = useRouter();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t('validation.name')).max(120, t('validation.name')),
        country: z.string(),
        currency: currencySchema,
      }),
    [t],
  );
  type Values = z.input<typeof schema>;

  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization.name,
      country: organization.country ?? NO_COUNTRY,
      currency: currencySchema.safeParse(organization.currency).data ?? 'XOF',
    },
  });

  const countries = useMemo(
    () =>
      [...COUNTRY_CODES].sort((a, b) =>
        countryName(a, locale).localeCompare(countryName(b, locale), locale),
      ),
    [locale],
  );

  const save = useMutation({
    mutationFn: (values: z.output<typeof schema>) => {
      const body: UpdateOrganizationBody = {
        name: values.name,
        country: values.country === NO_COUNTRY ? null : values.country,
        currency: values.currency,
      };
      return api<OrganizationDto>(`/organizations/${organization.slug}`, {
        method: 'PATCH',
        json: body,
        headers: { 'if-match': `"${String(organization.version)}"` },
      });
    },
    onSuccess: () => {
      toast.success(t('saved'));
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
      if (error instanceof ApiError && error.problem.status === 412) router.refresh();
    },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) =>
          void form.handleSubmit((values) => {
            save.mutate(values);
          })(e)
        }
      >
        <fieldset disabled={disabled || save.isPending} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('country')}</FormLabel>
                <Select
                  value={field.value}
                  disabled={disabled}
                  onValueChange={(value) => {
                    if (value === '') return;
                    field.onChange(value);
                    // Devise usuelle du pays préremplie, toujours modifiable.
                    if (isCountry(value)) form.setValue('currency', COUNTRIES[value].currency);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_COUNTRY}>{t('countryNone')}</SelectItem>
                    {countries.map((code) => (
                      <SelectItem key={code} value={code}>
                        {countryName(code, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t('countryHelp')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('currency')}</FormLabel>
                <Select
                  value={field.value}
                  disabled={disabled}
                  onValueChange={(value) => {
                    if (value !== '') field.onChange(value);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencySchema.options.map((code) => (
                      <SelectItem key={code} value={code}>
                        {`${code} — ${currencyName(code, locale)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t('currencyHelp')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        {!disabled && (
          <Button type="submit" loading={save.isPending}>
            {save.isPending ? t('saving') : t('save')}
          </Button>
        )}
      </form>
    </Form>
  );
}
