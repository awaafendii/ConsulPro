'use client';

import type { TakeoffNodeDto, TakeoffNodeKindDto } from '@consulpro/contracts';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

/** Boîte ouverte : création (sous un parent, natures admises) ou modification d'un nœud. */
export type NodeDialogState =
  | {
      readonly mode: 'create';
      readonly parent: TakeoffNodeDto | null;
      readonly kinds: readonly TakeoffNodeKindDto[];
    }
  | { readonly mode: 'edit'; readonly node: TakeoffNodeDto };

interface Props {
  readonly state: NodeDialogState | null;
  readonly onClose: () => void;
  /** Une erreur (déjà signalée) laisse la boîte ouverte avec la saisie. */
  readonly onCreate: (
    parent: TakeoffNodeDto | null,
    values: { kind: TakeoffNodeKindDto; code: string; title: string },
  ) => Promise<unknown>;
  readonly onUpdate: (
    node: TakeoffNodeDto,
    values: { code: string; title: string },
  ) => Promise<unknown>;
}

/** Saisie d'un nœud de l'avant-métré (code, intitulé, nature). */
export function NodeDialog({ state, onClose, onCreate, onUpdate }: Props) {
  const t = useTranslations('takeoff');
  const schema = useMemo(
    () =>
      z.object({
        kind: z.enum(['LOT', 'LEVEL', 'ELEMENT']),
        code: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, t('validation.code')),
        title: z.string().trim().min(2, t('validation.title')).max(160, t('validation.title')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'LOT', code: '', title: '' },
  });

  useEffect(() => {
    if (!state) return;
    form.reset(
      state.mode === 'edit'
        ? { kind: state.node.kind, code: state.node.code, title: state.node.title }
        : { kind: state.kinds[0] ?? 'LOT', code: '', title: '' },
    );
  }, [state, form]);

  const submit = async (values: Values) => {
    if (!state) return;
    try {
      if (state.mode === 'edit')
        await onUpdate(state.node, { code: values.code, title: values.title });
      else await onCreate(state.parent, values);
      onClose();
    } catch {
      // Message déjà affiché ; la saisie est conservée.
    }
  };

  const kinds = state?.mode === 'create' ? state.kinds : [];

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'edit'
              ? t('editTitle', { code: state.node.code, title: state.node.title })
              : t('createTitle')}
          </DialogTitle>
          <DialogDescription>
            {state?.mode === 'create'
              ? state.parent
                ? t('createIn', { code: state.parent.code, title: state.parent.title })
                : t('createRoot')
              : t('codeHelp')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(submit)(e)}
          >
            {kinds.length > 1 && (
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('kind')}</FormLabel>
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
                        {kinds.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {t(`kinds.${kind}`)}
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('code')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" className="font-mono" {...field} />
                  </FormControl>
                  {state?.mode === 'create' && <FormDescription>{t('codeHelp')}</FormDescription>}
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
