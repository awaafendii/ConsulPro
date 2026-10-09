'use client';

import type { OrganizationDto } from '@consulpro/contracts';
import {
  Button,
  Callout,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api } from '@/lib/api';

/** Proposition d'identifiant d'URL à partir du nom (modifiable par l'utilisateur). */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function CreateOrganizationForm() {
  const t = useTranslations('organizations');
  const router = useRouter();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t('validation.name')).max(120, t('validation.name')),
        slug: z
          .string()
          .trim()
          .min(3, t('validation.slug'))
          .max(48, t('validation.slug'))
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, t('validation.slug')),
      }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
  });
  const create = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api<OrganizationDto>('/organizations', { method: 'POST', json: values }),
    onSuccess: (organization) => {
      toast.success(t('created', { name: organization.name }));
      router.push(`/${organization.slug}/tableau-de-bord`);
    },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) =>
          void form.handleSubmit((values) => {
            create.mutate(values);
          })(e)
        }
        className="grid max-w-md gap-4"
      >
        {create.error && <Callout tone="destructive">{create.error.message}</Callout>}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!form.getFieldState('slug').isDirty) {
                      form.setValue('slug', slugify(e.target.value));
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('slug')}</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono" />
              </FormControl>
              <FormDescription>
                {t('slugHelp', { slug: field.value || 'identifiant' })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-fit" loading={create.isPending}>
          {create.isPending ? t('creating') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
