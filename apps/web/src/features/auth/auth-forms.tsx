'use client';

import {
  Button,
  Callout,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@consulpro/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { z } from 'zod';

import { safeRedirect } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  autoComplete,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SignInForm({ redirectTo }: { redirectTo: string | null }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t('validation.email')),
        password: z.string().min(1, t('validation.passwordLength')),
      }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: failure } = await authClient.signIn.email(values);
    if (failure) {
      setError(
        failure.status === 403
          ? t('signIn.unverified')
          : failure.status === 429
            ? t('signIn.tooMany')
            : t('signIn.invalid'),
      );
      return;
    }
    router.push(safeRedirect(redirectTo));
    router.refresh();
  });

  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        {error && <Callout tone="destructive">{error}</Callout>}
        <TextField
          control={form.control}
          name="email"
          label={t('email')}
          type="email"
          autoComplete="email"
        />
        <TextField
          control={form.control}
          name="password"
          label={t('password')}
          type="password"
          autoComplete="current-password"
        />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('signIn.pending') : t('signIn.submit')}
        </Button>
      </form>
    </Form>
  );
}

export function SignUpForm({ redirectTo }: { redirectTo: string | null }) {
  const t = useTranslations('auth');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      z
        .object({
          name: z
            .string()
            .trim()
            .min(2, t('validation.nameLength'))
            .max(120, t('validation.nameLength')),
          email: z.email(t('validation.email')),
          password: z
            .string()
            .min(12, t('validation.passwordLength'))
            .max(128, t('validation.passwordLength')),
          confirm: z.string(),
        })
        .refine((v) => v.password === v.confirm, {
          path: ['confirm'],
          message: t('validation.passwordMismatch'),
        }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    setError(null);
    const { error: failure } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: safeRedirect(redirectTo),
    });
    if (failure) {
      setError(
        failure.status === 429 ? t('signUp.tooMany') : (failure.message ?? t('signUp.failed')),
      );
      return;
    }
    setSentTo(email);
  });

  if (sentTo) return <Callout tone="success">{t('signUp.sent', { email: sentTo })}</Callout>;

  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        {error && <Callout tone="destructive">{error}</Callout>}
        <TextField control={form.control} name="name" label={t('fullName')} autoComplete="name" />
        <TextField
          control={form.control}
          name="email"
          label={t('email')}
          type="email"
          autoComplete="email"
        />
        <TextField
          control={form.control}
          name="password"
          label={t('passwordNew')}
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirm"
          label={t('passwordConfirm')}
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('signUp.pending') : t('signUp.submit')}
        </Button>
      </form>
    </Form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => z.object({ email: z.email(t('validation.email')) }), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error: failure } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reinitialiser',
    });
    if (failure?.status === 429) {
      setError(t('forgot.tooMany'));
      return;
    }
    // Même réponse que l'adresse existe ou non : on ne révèle pas les comptes.
    setDone(true);
  });

  if (done) return <Callout tone="success">{t('forgot.done')}</Callout>;
  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        {error && <Callout tone="destructive">{error}</Callout>}
        <TextField
          control={form.control}
          name="email"
          label={t('email')}
          type="email"
          autoComplete="email"
        />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t('forgot.submit')}
        </Button>
      </form>
    </Form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'form' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(12, t('validation.passwordLength'))
            .max(128, t('validation.passwordLength')),
          confirm: z.string(),
        })
        .refine((v) => v.password === v.confirm, {
          path: ['confirm'],
          message: t('validation.passwordMismatch'),
        }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error: failure } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? '',
    });
    if (failure) {
      setError(t('reset.invalid'));
      return;
    }
    setState('done');
  });

  if (!token) return <Callout tone="destructive">{t('reset.incomplete')}</Callout>;
  if (state === 'done') return <Callout tone="success">{t('reset.done')}</Callout>;
  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        {error && <Callout tone="destructive">{error}</Callout>}
        <TextField
          control={form.control}
          name="password"
          label={t('passwordNew')}
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirm"
          label={t('passwordConfirm')}
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t('reset.submit')}
        </Button>
      </form>
    </Form>
  );
}
