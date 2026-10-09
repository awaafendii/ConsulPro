import { AuthLayout, Brand, ThemeToggle } from '@consulpro/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/** Écran public (connexion, inscription…) : marque, carte centrée, sélecteur de thème. */
export async function PublicPage({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('common');
  return (
    <AuthLayout
      brand={<Brand className="text-lg" />}
      title={title}
      description={description}
      footer={footer}
      corner={<ThemeToggle label={t('theme')} />}
    >
      {children}
    </AuthLayout>
  );
}
