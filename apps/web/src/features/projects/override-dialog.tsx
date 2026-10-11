'use client';

import type { ParameterValueDto } from '@consulpro/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Textarea,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formatParameterValue } from './parameter-value';

export interface OverrideDialogProps {
  readonly label: string;
  /** Valeur du référentiel (le type et l'unité de la surcharge sont les siens). */
  readonly reference: Extract<ParameterValueDto, { kind: 'SCALAR' | 'ENUM' }>;
  readonly units: Readonly<Record<string, string>>;
  readonly initial?: { readonly value: ParameterValueDto; readonly justification: string };
  readonly trigger: ReactNode;
  /** Enregistre la surcharge ; une erreur laisse la boîte ouverte. */
  readonly onSave: (value: ParameterValueDto, justification: string) => Promise<unknown>;
}

/** Saisie d'une surcharge justifiée (paramètre scalaire ou énuméré). */
export function OverrideDialog({
  label,
  reference,
  units,
  initial,
  trigger,
  onSave,
}: OverrideDialogProps) {
  const t = useTranslations('overrides');
  const tStandards = useTranslations('project.standards');
  const [open, setOpen] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        value: z
          .string()
          .trim()
          .refine(
            (v) => reference.kind === 'ENUM' || Number.isFinite(Number(v.replace(',', '.'))),
            t('validation.value'),
          ),
        justification: z.string().trim().min(3, t('validation.justification')),
      }),
    [reference.kind, t],
  );
  type Values = z.infer<typeof schema>;
  const defaults = (): Values => ({
    value:
      initial && initial.value.kind !== 'TABLE'
        ? String(initial.value.value)
        : String(reference.value),
    justification: initial?.justification ?? '',
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() });

  const submit = async (values: Values) => {
    const value: ParameterValueDto =
      reference.kind === 'SCALAR'
        ? { kind: 'SCALAR', value: Number(values.value.replace(',', '.')), unit: reference.unit }
        : { kind: 'ENUM', value: values.value, allowed: reference.allowed };
    try {
      await onSave(value, values.justification);
      setOpen(false);
    } catch {
      // Message déjà affiché par l'appelant ; la saisie est conservée.
    }
  };

  const unit = reference.kind === 'SCALAR' ? (units[reference.unit] ?? reference.unit) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? t('titleEdit', { label }) : t('titleCreate', { label })}
          </DialogTitle>
          <DialogDescription>
            {t('description', {
              reference: formatParameterValue(reference, units, (count) =>
                tStandards('table', { count }),
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(submit)(e)}
          >
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{unit ? `${t('value')} (${unit})` : t('value')}</FormLabel>
                  {reference.kind === 'ENUM' ? (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reference.allowed.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <FormControl>
                      <Input inputMode="decimal" autoComplete="off" {...field} />
                    </FormControl>
                  )}
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
                  <FormDescription>{t('justificationHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
