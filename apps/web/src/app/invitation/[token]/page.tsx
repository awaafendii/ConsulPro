import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PublicPage } from '@/components/public-page';
import { currentUserContext } from '@/server/session';

import { AcceptInvitation } from './accept-invitation';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('invitation'))('title') };
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUserContext();
  const t = await getTranslations('invitation');
  const tAuth = await getTranslations('auth');
  const back = encodeURIComponent(`/invitation/${token}`);

  return (
    <PublicPage title={t('title')}>
      {user ? (
        <AcceptInvitation token={token} email={user.actor.email} />
      ) : (
        <div className="space-y-4 text-sm">
          <p>{t('needAccount')}</p>
          <div className="flex gap-4">
            <Link
              className="font-medium underline underline-offset-4"
              href={`/connexion?redirect=${back}`}
            >
              {tAuth('signIn.submit')}
            </Link>
            <Link
              className="font-medium underline underline-offset-4"
              href={`/inscription?redirect=${back}`}
            >
              {tAuth('signIn.createAccount')}
            </Link>
          </div>
        </div>
      )}
    </PublicPage>
  );
}
