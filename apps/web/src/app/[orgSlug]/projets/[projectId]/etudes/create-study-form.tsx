'use client';

import type { DisciplineDto, StudyDto } from '@consulpro/contracts';
import {
  Button,
  Form,
  FormControl,
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
  Textarea,
  toast,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { BookPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly disciplines: readonly DisciplineDto[];
}

export function CreateStudyForm({ orgSlug, projectId, disciplines }: Props) {
  const t = useTranslations('studies');
  const tDisciplines = useTranslations('disciplines');
  const router = useRouter();
  const schema = useMemo(
    () =>
      z.object({
        discipline: z.enum(['BTP', 'ELEC', 'PLUMBING', 'TOPO']),
        title: z.string().trim().min(2, t('validation.title')).max(160, t('validation.title')),
        description: z.string().max(2000),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { discipline: disciplines[0] ?? 'BTP', title: '', description: '' },
  });
  const create = useMutation({
    mutationFn: (values: Values) =>
      api<StudyDto>(`/organizations/${orgSlug}/projects/${projectId}/studies`, {
        method: 'POST',
        json: {
          discipline: values.discipline,
          title: values.title,
          ...(values.description.trim() ? { description: values.description } : {}),
        },
      }),
    onSuccess: (study) => {
      toast.success(t('created', { title: study.title }));
      router.push(`/${orgSlug}/projets/${projectId}/etudes/${study.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <FormField
            control={form.control}
            name="discipline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('discipline')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {disciplines.map((d) => (
                      <SelectItem key={d} value={d}>
                        {tDisciplines(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('title')}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description2')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={create.isPending}>
          <BookPlus aria-hidden />
          {create.isPending ? t('creating') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
