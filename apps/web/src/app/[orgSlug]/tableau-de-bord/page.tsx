import { isModuleAvailable, MODULES } from '@consulpro/domain';
import { Badge, PageHeader, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { requireOrganization } from '@/server/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('dashboard'))('title') };
}

/** Modules et phase de livraison (principe P7 : aucune fonctionnalité fictive). */
export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('dashboard');
  const tNav = await getTranslations('nav');
  const tCommon = await getTranslations('common');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description', { organization: ctx.organization.name })}
      />
      <Section title={t('modulesTitle')} description={t('modulesDescription')}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.filter((m) => m.id !== 'dashboard').map((m) => {
            const label = tNav(`modules.${m.id}`);
            return (
              <li key={m.id}>
                {isModuleAvailable(m) ? (
                  <Link
                    href={`/${ctx.organization.slug}/${m.path}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="font-medium">{label}</span>
                    <Badge variant="success">{t('available')}</Badge>
                  </Link>
                ) : (
                  <div
                    aria-disabled="true"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4 text-muted-foreground"
                  >
                    <span>{label}</span>
                    <Badge variant="muted">{tCommon('availableInPhase', { phase: m.phase })}</Badge>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
