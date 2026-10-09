import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PublicPage } from '@/components/public-page';
import { ForgotPasswordForm } from '@/features/auth/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.forgot'))('title') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');
  return (
    <PublicPage
      title={t('title')}
      description={t('description')}
      footer={
        <Link className="underline underline-offset-4 hover:text-foreground" href="/connexion">
          {t('back')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </PublicPage>
  );
}
