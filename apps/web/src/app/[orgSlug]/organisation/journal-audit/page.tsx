import { ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { auditLogDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { AuditTable } from './audit-table';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('audit'))('title') };
}

/**
 * `cursor` : page courante ; `stack` : curseurs des pages précédentes (`-` = première page),
 * pour un retour fiable à la page précédente.
 */
const searchSchema = z.object({
  cursor: z.uuid().optional(),
  stack: z
    .string()
    .regex(/^(-|[0-9a-f-]{36})(,(-|[0-9a-f-]{36}))*$/)
    .optional(),
});

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const search = searchSchema.safeParse(await searchParams);
  if (!search.success) notFound();
  const { app } = getServer().infra;
  const t = await getTranslations('audit');

  const page = await app.audit.list(ctx, { cursor: search.data.cursor, limit: 50 });
  if (!page.ok) {
    // Accès refusé (rôle sans audit.read) ou autre : jamais de contenu partiel.
    return (
      <>
        <PageHeader title={t('title')} />
        <ErrorState message={page.error.message} requestId={ctx.meta.requestId} />
      </>
    );
  }
  const members = await app.members.list(ctx);
  const names = Object.fromEntries(
    (members.ok ? members.value : []).map((m) => [m.userId, m.name]),
  );

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <AuditTable
        entries={page.value.items.map(auditLogDto)}
        actorNames={names}
        cursor={search.data.cursor ?? null}
        stack={search.data.stack?.split(',') ?? []}
        nextCursor={page.value.nextCursor}
      />
    </>
  );
}
