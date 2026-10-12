'use client';

import type {
  BoqUnitDto,
  PriceItemDto,
  PriceLibraryDetailDto,
  PriceLibraryDto,
  WorkItemDto,
} from '@consulpro/contracts';
import { boqUnitSchema, currencySchema } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  useConfirm,
  type DataColumn,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Plus, Tags } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { currencyName, formatUnitPrice, parseDecimalInput, toDecimalInput } from '@/lib/decimal';

interface Props {
  readonly orgSlug: string;
  readonly canManage: boolean;
  readonly library: PriceLibraryDetailDto;
}

/** Valeur « aucun ouvrage » de la liste (Radix interdit la chaîne vide). */
const NO_WORK = 'none';

const workLabel = (w: WorkItemDto) => `${w.engineTitle} — ${w.outputLabel}`;

type ItemDialogState =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly item: PriceItemDto };

export function PriceLibraryView({ orgSlug, canManage, library }: Props) {
  const t = useTranslations('prices');
  const tUnits = useTranslations('units');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const confirm = useConfirm();
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const base = `/organizations/${orgSlug}/price-libraries/${library.id}`;
  const works = new Map(library.works.map((w) => [w.workKey, w]));

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };
  const mutate = async (run: () => Promise<unknown>, success: string) => {
    try {
      await run();
      toast.success(success);
      router.refresh();
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  };

  const removeItem = useMutation({
    mutationFn: (item: PriceItemDto) =>
      api(`${base}/items/${item.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${String(item.version)}"` },
      }),
    onSuccess: () => {
      toast.success(t('itemDeleted'));
      router.refresh();
    },
    onError,
  });

  const removeLibrary = useMutation({
    mutationFn: () =>
      api(base, { method: 'DELETE', headers: { 'if-match': `"${String(library.version)}"` } }),
    onSuccess: () => {
      toast.success(t('deleted'));
      router.push(`/${orgSlug}/bibliotheque/prix`);
    },
    onError,
  });

  const columns: DataColumn<PriceItemDto>[] = [
    {
      id: 'code',
      header: t('code'),
      cell: (i) => <span className="font-mono text-sm">{i.code}</span>,
      sortValue: (i) => i.code,
      filterValue: (i) => `${i.code} ${i.designation}`,
    },
    {
      id: 'designation',
      header: t('designation'),
      cell: (i) => i.designation,
      sortValue: (i) => i.designation,
    },
    { id: 'unit', header: t('unit'), cell: (i) => tUnits(i.unit) },
    {
      id: 'price',
      header: t('price'),
      align: 'end',
      cell: (i) => formatUnitPrice(i.price, library.currency, locale),
      sortValue: (i) => Number(i.price),
    },
    {
      id: 'work',
      header: t('work'),
      cell: (i) => {
        const work = i.workKey ? works.get(i.workKey) : undefined;
        if (!i.workKey) return <span className="text-muted-foreground">—</span>;
        return work ? workLabel(work) : <Badge variant="warning">{i.workKey}</Badge>;
      },
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('actions'),
            align: 'end' as const,
            cell: (i: PriceItemDto) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('itemActions', { code: i.code })}
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setItemDialog({ mode: 'edit', item: i });
                    }}
                  >
                    {t('editItem')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      void confirm({
                        title: t('deleteItemTitle', { code: i.code }),
                        description: t('deleteItemDescription'),
                        confirmLabel: t('deleteItem'),
                        tone: 'destructive',
                      }).then((ok) => {
                        if (ok) removeItem.mutate(i);
                      });
                    }}
                  >
                    {t('deleteItem')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  const validity = library.validFrom
    ? format.dateTime(new Date(`${library.validFrom}T12:00:00Z`), {
        dateStyle: 'long',
        timeZone: 'UTC',
      })
    : t('noValidity');

  return (
    <>
      <div className="mb-4">
        <AppLink
          href={`/${orgSlug}/bibliotheque/prix`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </AppLink>
      </div>
      <Section
        title={library.name}
        description={`${library.currency} — ${currencyName(library.currency, locale)} · ${t('validFrom')} : ${validity}`}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setItemDialog({ mode: 'create' });
                }}
              >
                <Plus aria-hidden />
                {t('addItem')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('settingsTitle')}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setSettingsOpen(true);
                    }}
                  >
                    {t('settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      void confirm({
                        title: t('deleteTitle', { name: library.name }),
                        description: t('deleteDescription'),
                        confirmLabel: t('delete'),
                        tone: 'destructive',
                      }).then((ok) => {
                        if (ok) removeLibrary.mutate();
                      });
                    }}
                  >
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : undefined
        }
      >
        <DataTable
          caption={t('itemsTable')}
          columns={columns}
          rows={library.items}
          getRowId={(i) => i.id}
          empty={<EmptyState icon={Tags} title={t('itemsEmpty')} />}
        />
      </Section>

      <ItemDialog
        state={itemDialog}
        currency={library.currency}
        works={library.works}
        onClose={() => {
          setItemDialog(null);
        }}
        onSave={(values) =>
          itemDialog?.mode === 'edit'
            ? mutate(
                () =>
                  api(`${base}/items/${itemDialog.item.id}`, {
                    method: 'PATCH',
                    json: values,
                    headers: { 'if-match': `"${String(itemDialog.item.version)}"` },
                  }),
                t('itemSaved'),
              )
            : mutate(() => api(`${base}/items`, { method: 'POST', json: values }), t('itemSaved'))
        }
      />
      <SettingsDialog
        open={settingsOpen}
        library={library}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={(values) =>
          mutate(
            () =>
              api(base, {
                method: 'PATCH',
                json:
                  library.itemCount > 0
                    ? { name: values.name, validFrom: values.validFrom }
                    : values,
                headers: { 'if-match': `"${String(library.version)}"` },
              }),
            t('saved'),
          )
        }
      />
    </>
  );
}

interface ItemValues {
  readonly code: string;
  readonly designation: string;
  readonly unit: BoqUnitDto;
  readonly price: string;
  readonly workKey: string | null;
}

function ItemDialog({
  state,
  currency,
  works,
  onClose,
  onSave,
}: {
  readonly state: ItemDialogState | null;
  readonly currency: string;
  readonly works: readonly WorkItemDto[];
  readonly onClose: () => void;
  readonly onSave: (values: ItemValues) => Promise<unknown>;
}) {
  const t = useTranslations('prices');
  const tDecimal = useTranslations('decimal');
  const tUnits = useTranslations('units');
  const schema = z.object({
    code: z.string().trim().min(1, t('validation.code')).max(40, t('validation.code')),
    designation: z
      .string()
      .trim()
      .min(2, t('validation.designation'))
      .max(300, t('validation.designation')),
    unit: boqUnitSchema,
    price: z
      .string()
      .trim()
      .refine((v) => parseDecimalInput(v) !== null, tDecimal('invalid')),
    workKey: z.string(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', designation: '', unit: 'm3', price: '', workKey: NO_WORK },
  });
  useEffect(() => {
    if (!state) return;
    form.reset(
      state.mode === 'edit'
        ? {
            code: state.item.code,
            designation: state.item.designation,
            unit: state.item.unit,
            price: toDecimalInput(state.item.price),
            workKey: state.item.workKey ?? NO_WORK,
          }
        : { code: '', designation: '', unit: 'm3', price: '', workKey: NO_WORK },
    );
  }, [state, form]);
  const workKey = useWatch({ control: form.control, name: 'workKey' });
  const work = works.find((w) => w.workKey === workKey);

  const submit = async (values: Values) => {
    try {
      await onSave({
        code: values.code,
        designation: values.designation,
        // Un ouvrage impose son unité (celle de la ligne de DQE).
        unit: work?.unit ?? values.unit,
        price: parseDecimalInput(values.price) ?? '',
        workKey: values.workKey === NO_WORK ? null : values.workKey,
      });
      onClose();
    } catch {
      // Message déjà affiché ; la saisie est conservée.
    }
  };

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'edit'
              ? t('editItemTitle', { code: state.item.code })
              : t('addItemTitle')}
          </DialogTitle>
          <DialogDescription>{t('workHelp')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(submit)(e)}
          >
            <FormField
              control={form.control}
              name="workKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('work')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value === '') return;
                      field.onChange(value);
                      const chosen = works.find((w) => w.workKey === value);
                      if (chosen) {
                        form.setValue('unit', chosen.unit);
                        if (form.getValues('designation').trim() === '') {
                          form.setValue('designation', workLabel(chosen));
                        }
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_WORK}>{t('noWork')}</SelectItem>
                      {works.map((w) => (
                        <SelectItem key={w.workKey} value={w.workKey}>
                          {`${workLabel(w)} (${tUnits(w.unit)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('code')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('unit')}</FormLabel>
                    <Select
                      value={work?.unit ?? field.value}
                      disabled={work !== undefined}
                      onValueChange={(value) => {
                        if (value !== '') field.onChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {boqUnitSchema.options.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {tUnits(unit)}
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
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{`${t('price')} (${currency})`}</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="designation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('designation')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  library,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly library: PriceLibraryDto;
  readonly onClose: () => void;
  readonly onSave: (values: {
    name: string;
    currency: string;
    validFrom: string | null;
  }) => Promise<unknown>;
}) {
  const t = useTranslations('prices');
  const locale = useLocale();
  const schema = z.object({
    name: z.string().trim().min(2, t('validation.name')).max(120, t('validation.name')),
    currency: currencySchema,
    validFrom: z.string(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) {
      form.reset({
        name: library.name,
        currency: library.currency,
        validFrom: library.validFrom ?? '',
      });
    }
  }, [open, library, form]);
  const locked = library.itemCount > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settingsTitle')}</DialogTitle>
          <DialogDescription>{library.name}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) =>
              void form.handleSubmit(async (values) => {
                try {
                  await onSave({
                    name: values.name,
                    currency: values.currency,
                    validFrom: values.validFrom === '' ? null : values.validFrom,
                  });
                  onClose();
                } catch {
                  // Message déjà affiché ; la saisie est conservée.
                }
              })(e)
            }
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
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
                    disabled={locked}
                    onValueChange={(value) => {
                      if (value !== '') field.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
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
                  {locked && <FormDescription>{t('currencyLocked')}</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="validFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('validFrom')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
