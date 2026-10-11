import { Brand, ErrorState, PageHeader, Section, ThemeToggle } from '@consulpro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { SignOutButton } from '@/components/sign-out-button';
import { getServer } from '@/server/container';
import { requireUser } from '@/server/session';

import { TimeZoneForm } from './time-zone-form';
import { TwoFactorPanel } from './two-factor-panel';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('account'))('title') };
}

/** Préférences du compte : fuseau horaire, double authentification facultative. */
export default async function AccountPage() {
  const ctx = await requireUser('/compte');
  const t = await getTranslations('account');
  const tCommon = await getTranslations('common');
  const prefs = await getServer().infra.app.account.preferences(ctx);
  // Liste des fuseaux IANA du moteur JavaScript, l'Afrique en premier.
  const zones = Intl.supportedValuesOf('timeZone');
  const ordered = [
    ...zones.filter((z) => z.startsWith('Africa/')),
    ...zones.filter((z) => !z.startsWith('Africa/')),
  ];

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Brand />
          <Link
            href="/organisations"
            className="ml-auto text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('back')}
          </Link>
          <ThemeToggle label={tCommon('theme')} />
          <SignOutButton />
        </div>
      </header>
      <main id="contenu-principal" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <PageHeader title={t('title')} description={t('description')} />
        {prefs.ok ? (
          <>
            <Section title={t('timeZoneTitle')} description={t('timeZoneDescription')}>
              <TimeZoneForm
                zones={ordered}
                current={prefs.value.timeZone}
                appDefault={getServer().env.APP_TIME_ZONE}
              />
            </Section>
            <Section title={t('twoFactorTitle')} description={t('twoFactorDescription')}>
              <TwoFactorPanel enabled={prefs.value.twoFactorEnabled} />
            </Section>
          </>
        ) : (
          <ErrorState message={prefs.error.message} requestId={ctx.meta.requestId} />
        )}
      </main>
    </div>
  );
}
