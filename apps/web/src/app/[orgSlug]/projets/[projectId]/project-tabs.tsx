'use client';

import { AppLink, Badge, cn } from '@consulpro/ui';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

/** Onglets non livrés : visibles mais inactifs (principe P7). */
const UPCOMING = [
  { id: 'documents', phase: 8 },
  { id: 'reports', phase: 9 },
] as const;

const TABS = [
  { id: 'overview', path: '' },
  { id: 'studies', path: '/etudes' },
  { id: 'data', path: '/donnees' },
  { id: 'members', path: '/membres' },
  { id: 'standards', path: '/referentiels' },
  { id: 'activity', path: '/activite' },
  { id: 'settings', path: '/parametres' },
] as const;

export function ProjectTabs({ base }: { base: string }) {
  const t = useTranslations('project.tabs');
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="mb-6 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          // Les pages de calcul relèvent de l'onglet Études.
          const active =
            tab.path === ''
              ? pathname === base
              : pathname.startsWith(href) ||
                (tab.id === 'studies' && pathname.startsWith(`${base}/calculs`));
          return (
            <li key={tab.id}>
              <AppLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t(tab.id)}
              </AppLink>
            </li>
          );
        })}
        {UPCOMING.map((tab) => (
          <li key={tab.id}>
            <span
              aria-disabled="true"
              className="inline-flex h-10 items-center gap-2 px-3 text-sm text-muted-foreground"
            >
              {t(tab.id)}
              <Badge variant="muted">{tCommon('availableInPhase', { phase: tab.phase })}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
