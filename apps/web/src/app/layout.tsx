import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { PwaRegister } from '@/features/shell/pwa/pwa-register';

import { Providers } from './providers';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  const appName = t('appName');
  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: t('tagline'),
    applicationName: appName,
    // Installation sur l'écran d'accueil iOS (Safari n'utilise pas le manifeste).
    appleWebApp: { capable: true, title: appName, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#090e18' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : la classe du thème est posée avant l'hydratation (next-themes).
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          <PwaRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
