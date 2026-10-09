import {
  Badge,
  Brand,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  ThemeToggle,
} from '@consulpro/ui';
import { Building2, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { SignOutButton } from '@/components/sign-out-button';
import { getServer } from '@/server/container';
import { requireUser } from '@/server/session';

import { CreateOrganizationForm } from './create-organization-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('organizations'))('title') };
}

export default async function OrganizationsPage() {
  const ctx = await requireUser('/organisations');
  const result = await getServer().infra.app.organizations.listMine(ctx);
  const t = await getTranslations('organizations');
  const tRoles = await getTranslations('roles');
  const tCommon = await getTranslations('common');

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Brand />
          <span className="ml-auto hidden truncate text-sm text-muted-foreground sm:inline">
            {t('signedInAs', { email: ctx.actor.email })}
          </span>
          <ThemeToggle label={tCommon('theme')} />
          <SignOutButton />
        </div>
      </header>

      <main id="contenu-principal" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <PageHeader title={t('title')} description={t('description')} />

        {!result.ok ? (
          <ErrorState message={result.error.message} />
        ) : result.value.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={t('title')}>
            {result.value.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/${o.slug}/tableau-de-bord`}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Building2 aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      /{o.slug}
                    </span>
                  </span>
                  <Badge variant="secondary">{tRoles(o.role)}</Badge>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-muted-foreground group-hover:text-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Section title={t('createTitle')}>
          <CreateOrganizationForm />
        </Section>
      </main>
    </div>
  );
}
