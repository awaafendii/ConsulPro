'use client';

import type {
  BoqItemDto,
  BoqNodeDto,
  BoqUnitDto,
  CurrencyDto,
  PriceLibraryDto,
} from '@consulpro/contracts';
import { boqUnitSchema, currencySchema } from '@consulpro/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { currencyName, formatQuantity, parseDecimalInput, toDecimalInput } from '@/lib/decimal';

/** Une erreur (déjà signalée par l'appelant) laisse la boîte ouverte avec la saisie. */
type Save<T> = (values: T) => Promise<unknown>;

function useDecimalField() {
  const t = useTranslations('decimal');
  return useMemo(
    () => ({
      optional: z
        .string()
        .trim()
        .refine((v) => v === '' || parseDecimalInput(v) !== null, t('invalid')),
      required: z
        .string()
        .trim()
        .refine((v) => parseDecimalInput(v) !== null, t('invalid')),
      positive: z
        .string()
        .trim()
        .refine((v) => parseDecimalInput(v) !== null, t('invalid'))
        .refine((v) => Number(parseDecimalInput(v) ?? '0') > 0, t('positive')),
    }),
    [t],
  );
}

async function attempt(run: () => Promise<unknown>, close: () => void) {
  try {
    await run();
    close();
  } catch {
    // Message affiché par l'appelant ; la saisie est conservée.
  }
}

// --- Prix unitaire ------------------------------------------------------------------------

export function PriceDialog({
  item,
  currency,
  unitLabel,
  onClose,
  onSave,
}: {
  readonly item: BoqItemDto | null;
  readonly currency: CurrencyDto;
  readonly unitLabel: string;
  readonly onClose: () => void;
  readonly onSave: Save<string | null>;
}) {
  const t = useTranslations('boq');
  const tCommon = useTranslations('common');
  const decimal = useDecimalField();
  const schema = z.object({ price: decimal.optional });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { price: '' },
  });
  useEffect(() => {
    if (item) form.reset({ price: toDecimalInput(item.unitPrice) });
  }, [item, form]);

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('priceTitle', { designation: item?.designation ?? '' })}</DialogTitle>
          <DialogDescription>
            {t('priceDescription', { currency, unit: unitLabel })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) =>
              void form.handleSubmit((values) =>
                attempt(
                  () => onSave(values.price === '' ? null : parseDecimalInput(values.price)),
                  onClose,
                ),
              )(e)
            }
          >
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{`${t('price')} (${currency} / ${unitLabel})`}</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
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

// --- Quantité retenue ---------------------------------------------------------------------

export function OverrideDialog({
  item,
  unitLabel,
  onClose,
  onSave,
}: {
  readonly item: BoqItemDto | null;
  readonly unitLabel: string;
  readonly onClose: () => void;
  readonly onSave: Save<{ quantity: string; justification: string } | null>;
}) {
  const t = useTranslations('boq');
  const locale = useLocale();
  const decimal = useDecimalField();
  const schema = z.object({
    quantity: decimal.required,
    justification: z.string().trim().min(3, t('validation.justification')).max(500),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: '', justification: '' },
  });
  useEffect(() => {
    if (item) {
      form.reset({
        quantity: toDecimalInput(item.overrideQuantity ?? item.quantity),
        justification: item.overrideJustification ?? '',
      });
    }
  }, [item, form]);

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('overrideTitle', { designation: item?.designation ?? '' })}</DialogTitle>
          <DialogDescription>
            {t('overrideDescription', {
              quantity: item ? formatQuantity(item.quantity, locale) : '',
              unit: unitLabel,
            })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) =>
              void form.handleSubmit((values) =>
                attempt(
                  () =>
                    onSave({
                      quantity: parseDecimalInput(values.quantity) ?? '',
                      justification: values.justification,
                    }),
                  onClose,
                ),
              )(e)
            }
          >
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{`${t('overrideQuantity')} (${unitLabel})`}</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="justification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('justification')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2">
              {item?.overrideQuantity !== null && item?.overrideQuantity !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void attempt(() => onSave(null), onClose)}
                >
                  {t('resetOverride')}
                </Button>
              )}
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

// --- Ligne saisie --------------------------------------------------------------------------

export type LineDialogState =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly item: BoqItemDto };

export interface LineValues {
  readonly nodeId: string;
  readonly designation: string;
  readonly unit: BoqUnitDto;
  readonly quantity: string;
  readonly unitPrice: string | null;
}

export function LineDialog({
  state,
  nodes,
  onClose,
  onSave,
}: {
  readonly state: LineDialogState | null;
  readonly nodes: readonly BoqNodeDto[];
  readonly onClose: () => void;
  readonly onSave: Save<LineValues>;
}) {
  const t = useTranslations('boq');
  const tUnits = useTranslations('units');
  const decimal = useDecimalField();
  const schema = z.object({
    nodeId: z.string().min(1),
    designation: z
      .string()
      .trim()
      .min(2, t('validation.designation'))
      .max(300, t('validation.designation')),
    unit: boqUnitSchema,
    quantity: decimal.positive,
    unitPrice: decimal.optional,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { nodeId: '', designation: '', unit: 'ff', quantity: '1', unitPrice: '' },
  });
  useEffect(() => {
    if (!state) return;
    form.reset(
      state.mode === 'edit'
        ? {
            nodeId: state.item.nodeId,
            designation: state.item.designation,
            unit: state.item.unit,
            quantity: toDecimalInput(state.item.quantity),
            unitPrice: toDecimalInput(state.item.unitPrice),
          }
        : { nodeId: nodes[0]?.id ?? '', designation: '', unit: 'ff', quantity: '1', unitPrice: '' },
    );
  }, [state, nodes, form]);

  const submit = (values: Values) =>
    attempt(
      () =>
        onSave({
          nodeId: values.nodeId,
          designation: values.designation,
          unit: values.unit,
          quantity: parseDecimalInput(values.quantity) ?? '',
          unitPrice: values.unitPrice === '' ? null : parseDecimalInput(values.unitPrice),
        }),
      onClose,
    );

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'edit' ? t('editLineTitle') : t('addLineTitle')}
          </DialogTitle>
          <DialogDescription>{t('lineDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(submit)(e)}
          >
            {state?.mode === 'create' && (
              <FormField
                control={form.control}
                name="nodeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('nodeField')}</FormLabel>
                    <Select
                      value={field.value}
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
                        {nodes.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {`${n.code} — ${n.title}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('unitField')}</FormLabel>
                    <Select
                      value={field.value}
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
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('quantity')}</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{`${t('price')} (${t('optional')})`}</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {state?.mode === 'edit' ? t('save') : t('addLine')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// --- Bibliothèque de prix ------------------------------------------------------------------

export function ApplyPricesDialog({
  open,
  currency,
  libraries,
  onClose,
  onApply,
}: {
  readonly open: boolean;
  readonly currency: CurrencyDto;
  readonly libraries: readonly PriceLibraryDto[];
  readonly onClose: () => void;
  readonly onApply: Save<{ libraryId: string; overwrite: boolean }>;
}) {
  const t = useTranslations('boq');
  const tCommon = useTranslations('common');
  const usable = libraries.filter((l) => l.currency === currency);
  const [chosen, setChosen] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [pending, setPending] = useState(false);
  // Sans choix (ou choix disparu), la première bibliothèque de la devise.
  const libraryId = usable.some((l) => l.id === chosen) ? chosen : (usable[0]?.id ?? '');
  const close = () => {
    setChosen('');
    setOverwrite(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('applyTitle')}</DialogTitle>
          <DialogDescription>{t('applyDescription', { currency })}</DialogDescription>
        </DialogHeader>
        {usable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLibrary', { currency })}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apply-library">{t('library')}</Label>
              <Select
                value={libraryId}
                onValueChange={(value) => {
                  if (value !== '') setChosen(value);
                }}
              >
                <SelectTrigger id="apply-library" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {usable.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="apply-overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
              <Label htmlFor="apply-overwrite">{t('overwrite')}</Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            disabled={libraryId === ''}
            loading={pending}
            onClick={() => {
              setPending(true);
              void attempt(() => onApply({ libraryId, overwrite }), close).finally(() => {
                setPending(false);
              });
            }}
          >
            {t('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Réglages du quantitatif ---------------------------------------------------------------

export function BoqSettingsDialog({
  open,
  title,
  currency,
  currencyLocked,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly currency: CurrencyDto;
  readonly currencyLocked: boolean;
  readonly onClose: () => void;
  readonly onSave: Save<{ title: string; currency: CurrencyDto }>;
}) {
  const t = useTranslations('boq');
  const locale = useLocale();
  const schema = z.object({
    title: z.string().trim().min(2, t('validation.title')).max(160, t('validation.title')),
    currency: currencySchema,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title, currency },
  });
  useEffect(() => {
    if (open) form.reset({ title, currency });
  }, [open, title, currency, form]);

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
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) =>
              void form.handleSubmit((values) => attempt(() => onSave(values), onClose))(e)
            }
          >
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
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('currency')}</FormLabel>
                  <Select
                    value={field.value}
                    disabled={currencyLocked}
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
                  {currencyLocked && <FormDescription>{t('currencyLocked')}</FormDescription>}
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
