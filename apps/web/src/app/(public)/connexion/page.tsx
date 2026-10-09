import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PublicPage } from '@/components/public-page';
import { SignInForm } from '@/features/auth/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.signIn'))('title') };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const t = await getTranslations('auth.signIn');
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
  return (
    <PublicPage
      title={t('title')}
      description={t('description')}
      footer={
        <span className="flex justify-center gap-4">
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            href={`/inscription${query}`}
          >
            {t('createAccount')}
          </Link>
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            href="/mot-de-passe-oublie"
          >
            {t('forgot')}
          </Link>
        </span>
      }
    >
      <SignInForm redirectTo={redirect ?? null} />
    </PublicPage>
  );
}
