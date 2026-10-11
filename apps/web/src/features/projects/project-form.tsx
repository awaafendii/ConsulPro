'use client';

import type { DisciplineDto, ProjectBody, ProjectDto } from '@consulpro/contracts';
import { DISCIPLINES, PROJECT_CODE_PATTERN } from '@consulpro/domain';
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Textarea,
  toast,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api, ApiError } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  /** Projet modifié ; absent pour une création. */
  readonly project?: ProjectDto;
  readonly disabled?: boolean;
}

const blank = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Création ou modification d'un projet. Les règles (code, dates, métiers) sont celles du
 * domaine ; elles sont reprises ici pour un retour immédiat et revérifiées par le serveur.
 */
export function ProjectForm({ orgSlug, project, disabled = false }: Props) {
  const t = useTranslations('projectForm');
  const tProjects = useTranslations('projects');
  const tSettings = useTranslations('project.settings');
  const tDisciplines = useTranslations('disciplines');
  const router = useRouter();

  const schema = useMemo(
    () =>
      z
        .object({
          code: z
            .string()
            .trim()
            .transform((v) => v.toUpperCase())
            .refine((v) => v.length >= 2 && v.length <= 24 && PROJECT_CODE_PATTERN.test(v), {
              message: t('validation.code'),
            }),
          name: z.string().trim().min(2, t('validation.name')).max(160, t('validation.name')),
          client: z.string().max(200),
          location: z.string().max(200),
          startDate: z.string(),
          endDate: z.string(),
          description: z.string().max(2000),
          disciplines: z.array(z.enum(DISCIPLINES)).min(1, t('validation.disciplines')),
        })
        .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
          path: ['endDate'],
          message: t('validation.dates'),
        }),
    [t],
  );
  type Values = z.input<typeof schema>;

  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: project?.code ?? '',
      name: project?.name ?? '',
      client: project?.client ?? '',
      location: project?.location ?? '',
      startDate: project?.startDate ?? '',
      endDate: project?.endDate ?? '',
      description: project?.description ?? '',
      disciplines: project ? [...project.disciplines] : [],
    },
  });

  const save = useMutation({
    mutationFn: (values: z.output<typeof schema>) => {
      const body: ProjectBody = {
        code: values.code,
        name: values.name,
        client: blank(values.client),
        location: blank(values.location),
        startDate: blank(values.startDate),
        endDate: blank(values.endDate),
        description: blank(values.description),
        disciplines: values.disciplines,
      };
      return project
        ? api<ProjectDto>(`/organizations/${orgSlug}/projects/${project.id}`, {
            method: 'PATCH',
            json: body,
            headers: { 'if-match': `"${project.version}"` },
          })
        : api<ProjectDto>(`/organizations/${orgSlug}/projects`, { method: 'POST', json: body });
    },
    onSuccess: (saved) => {
      if (project) {
        toast.success(tSettings('saved'));
        router.refresh();
      } else {
        toast.success(tProjects('created', { code: saved.code }));
        router.push(`/${orgSlug}/projets/${saved.id}`);
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.problem.code === 'PROJECT_CODE_TAKEN') {
        form.setError('code', { message: error.message });
        return;
      }
      toast.error(error.message);
      if (error instanceof ApiError && error.problem.status === 412) router.refresh();
    },
  });

  const text = (name: 'name' | 'client' | 'location', label: string, autoComplete: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('code')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      className="uppercase"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t('codeHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('name', t('name'), 'off')}
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {text('client', t('client'), 'organization')}
            {text('location', t('location'), 'address-level2')}
            {(['startDate', 'endDate'] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(name)}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
          <FormField
            control={form.control}
            name="disciplines"
            render={({ field }) => (
              <FormItem>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t('disciplines')}</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {DISCIPLINES.map((d) => {
                      const id = `discipline-${d}`;
                      const checked = field.value.includes(d);
                      return (
                        <div key={d} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(next) => {
                              field.onChange(
                                next === true
                                  ? [...field.value, d]
                                  : field.value.filter((x: DisciplineDto) => x !== d),
                              );
                            }}
                          />
                          <Label htmlFor={id} className="font-normal">
                            {tDisciplines(d)}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <FormDescription>{t('disciplinesHelp')}</FormDescription>
                  <FormMessage />
                </fieldset>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('description')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        {!disabled && (
          <Button type="submit" loading={save.isPending}>
            {project
              ? save.isPending
                ? t('saving')
                : t('save')
              : save.isPending
                ? t('creating')
                : t('create')}
          </Button>
        )}
      </form>
    </Form>
  );
}
