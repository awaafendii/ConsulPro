import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { PublicPage } from '@/components/public-page';
import { ResetPasswordForm } from '@/features/auth/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.reset'))('title') };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth.reset');
  return (
    <PublicPage
      title={t('title')}
      footer={
        <Link className="underline underline-offset-4 hover:text-foreground" href="/connexion">
          {t('signIn')}
        </Link>
      }
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </PublicPage>
  );
}
