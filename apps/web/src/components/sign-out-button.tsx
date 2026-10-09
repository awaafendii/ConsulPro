'use client';

import { Button } from '@consulpro/ui';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

export function useSignOut(): () => void {
  const router = useRouter();
  return () => {
    void authClient.signOut().then(() => {
      router.push('/connexion');
      router.refresh();
    });
  };
}

export function SignOutButton() {
  const t = useTranslations('common');
  const signOut = useSignOut();
  return (
    <Button variant="ghost" size="sm" onClick={signOut}>
      <LogOut aria-hidden />
      <span className="hidden sm:inline">{t('signOut')}</span>
      <span className="sr-only sm:hidden">{t('signOut')}</span>
    </Button>
  );
}
