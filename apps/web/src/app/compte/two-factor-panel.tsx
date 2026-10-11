'use client';

import { Badge, Button, Callout, Input, Label, toast } from '@consulpro/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toString as qrSvg } from 'qrcode';
import { useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

interface Setup {
  readonly uri: string;
  readonly secret: string;
  readonly backupCodes: readonly string[];
}

/**
 * Double authentification TOTP facultative (plugin Better Auth) : activation en deux temps
 * (mot de passe, puis code de l'application), désactivation par mot de passe.
 */
export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations('account');
  const tAuth = useTranslations('auth.twoFactor');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!setup) return;
    void qrSvg(setup.uri, { type: 'svg', margin: 1 }).then(setQr);
  }, [setup]);

  const run = async (action: () => Promise<{ error: { message?: string | undefined } | null }>) => {
    setPending(true);
    setError(null);
    const { error: failure } = await action();
    setPending(false);
    if (failure) setError(failure.message ?? tAuth('invalid'));
    return !failure;
  };

  if (setup) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => authClient.twoFactor.verifyTotp({ code: code.trim() })).then((ok) => {
            if (!ok) return;
            toast.success(t('enabled'));
            setSetup(null);
            router.refresh();
          });
        }}
      >
        <h3 className="font-medium">{t('setupTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('setupUri')}</p>
        {qr && (
          <div
            className="size-48 rounded-md bg-white p-2"
            role="img"
            aria-label={t('setupTitle')}
            // SVG produit localement par la bibliothèque qrcode à partir de l'URI otpauth.
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        )}
        <p className="text-sm">
          <a href={setup.uri} className="text-primary underline-offset-4 hover:underline">
            otpauth://
          </a>
        </p>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('secret')}</p>
          <code className="block rounded bg-muted px-2 py-1 font-mono text-sm break-all">
            {setup.secret}
          </code>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('backupCodes')}</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-5">
            {setup.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        {error && <Callout tone="destructive">{error}</Callout>}
        <div className="space-y-2">
          <Label htmlFor="two-factor-setup-code">{t('code')}</Label>
          <Input
            id="two-factor-setup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
        </div>
        <Button type="submit" loading={pending}>
          {t('confirm')}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (enabled) {
          void run(() => authClient.twoFactor.disable({ password })).then((ok) => {
            if (!ok) return;
            toast.success(t('disabled'));
            setPassword('');
            router.refresh();
          });
          return;
        }
        void (async () => {
          setPending(true);
          setError(null);
          const { data, error: failure } = await authClient.twoFactor.enable({ password });
          setPending(false);
          if (failure || data.method !== 'totp') {
            setError(failure?.message ?? tAuth('invalid'));
            return;
          }
          const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
          setPassword('');
          setSetup({ uri: data.totpURI, secret, backupCodes: data.backupCodes });
        })();
      }}
    >
      <Badge variant={enabled ? 'success' : 'muted'}>
        {enabled ? t('twoFactorOn') : t('twoFactorOff')}
      </Badge>
      {error && <Callout tone="destructive">{error}</Callout>}
      <div className="space-y-2">
        <Label htmlFor="two-factor-password">{t('password')}</Label>
        <Input
          id="two-factor-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </div>
      <Button type="submit" variant={enabled ? 'outline' : 'default'} loading={pending}>
        {enabled ? t('disable') : t('enable')}
      </Button>
    </form>
  );
}
