'use client';

import { AppLink, cn } from '@consulpro/ui';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

/** Sections de la bibliothèque technique : référentiels et prix unitaires. */
export function LibraryTabs({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('prices.tabs');
  const pathname = usePathname();
  const base = `/${orgSlug}/bibliotheque`;
  const tabs = [
    { id: 'standards', href: base, active: !pathname.startsWith(`${base}/prix`) },
    { id: 'prices', href: `${base}/prix`, active: pathname.startsWith(`${base}/prix`) },
  ] as const;

  return (
    <nav aria-label={t('label')} className="mb-6 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <AppLink
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                tab.active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(tab.id)}
            </AppLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
