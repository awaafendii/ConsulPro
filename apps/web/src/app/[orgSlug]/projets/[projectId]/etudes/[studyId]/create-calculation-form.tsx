'use client';

import type { CalculationDto, EngineDto } from '@consulpro/contracts';
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
import { Calculator } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { api } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly studyId: string;
  readonly engines: readonly EngineDto[];
}

export function CreateCalculationForm({ orgSlug, projectId, studyId, engines }: Props) {
  const t = useTranslations('calculations');
  const tStudies = useTranslations('studies');
  const router = useRouter();
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(2, tStudies('validation.title'))
          .max(160, tStudies('validation.title')),
        engineId: z.string().min(1),
      }),
    [tStudies],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', engineId: engines[0]?.id ?? '' },
  });
  const engineId = useWatch({ control: form.control, name: 'engineId' });
  const engine = engines.find((e) => e.id === engineId);

  const create = useMutation({
    mutationFn: (values: Values) =>
      api<CalculationDto>(
        `/organizations/${orgSlug}/projects/${projectId}/studies/${studyId}/calculations`,
        { method: 'POST', json: values },
      ),
    onSuccess: (calculation) => {
      toast.success(t('created', { title: calculation.title }));
      router.push(`/${orgSlug}/projets/${projectId}/calculs/${calculation.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (engines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noEngine')}</p>;
  }

  return (
    <Form {...form}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) =>
          void form.handleSubmit((values) => {
            create.mutate(values);
          })(e)
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('createTitleField')}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="engineId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('engineField')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {engines.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {engine && <FormDescription>{engine.description}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" loading={create.isPending}>
          <Calculator aria-hidden />
          {create.isPending ? t('creating') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
