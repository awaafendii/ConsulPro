import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PublicPage } from '@/components/public-page';
import { SignUpForm } from '@/features/auth/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.signUp'))('title') };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const t = await getTranslations('auth.signUp');
  return (
    <PublicPage
      title={t('title')}
      description={t('description')}
      footer={
        <Link className="underline underline-offset-4 hover:text-foreground" href="/connexion">
          {t('already')}
        </Link>
      }
    >
      <SignUpForm redirectTo={redirect ?? null} />
    </PublicPage>
  );
}
