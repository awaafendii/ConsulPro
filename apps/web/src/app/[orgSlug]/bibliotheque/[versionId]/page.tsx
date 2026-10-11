import { can } from '@consulpro/domain';
import { Badge, Callout, ErrorState, PageHeader, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { overrideDto, standardVersionDetailDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { PlatformActions } from './platform-actions';
import { VersionView } from './version-view';

type Params = Promise<{ orgSlug: string; versionId: string }>;

const STATUS_BADGE = { DRAFT: 'muted', PUBLISHED: 'success', DEPRECATED: 'warning' } as const;

async function load(orgSlug: string, versionId: string) {
  const ctx = await requireOrganization(orgSlug);
  if (!z.uuid().safeParse(versionId).success) notFound();
  const version = await getServer().infra.app.library.getVersion(ctx, versionId);
  if (!version.ok && version.error.kind === 'NOT_FOUND') notFound();
  return { ctx, version };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, versionId } = await params;
  const { version } = await load(orgSlug, versionId);
  return {
    title: version.ok
      ? `${version.value.standard.code} ${version.value.label}`
      : (await getTranslations('library'))('title'),
  };
}

export default async function StandardVersionPage({ params }: { params: Params }) {
  const { orgSlug, versionId } = await params;
  const { ctx, version } = await load(orgSlug, versionId);
  if (!version.ok) {
    return <ErrorState message={version.error.message} requestId={ctx.meta.requestId} />;
  }
  const t = await getTranslations('library');
  const format = await getFormatter();
  const detail = standardVersionDetailDto(version.value);
  const system = version.value.standard.organizationId === null;
  const overrides = await getServer().infra.app.library.listOrgOverrides(ctx);
  const canManage = can(ctx.role, 'library.org.manage') && detail.status === 'PUBLISHED';

  return (
    <>
      <PageHeader
        title={`${detail.standard.code} — ${detail.standard.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{t('version', { label: detail.label })}</span>
            <Badge variant={STATUS_BADGE[detail.status]}>{t(`statuses.${detail.status}`)}</Badge>
            {detail.publishedAt && (
              <span>
                {t('publishedAt', {
                  date: format.dateTime(new Date(detail.publishedAt), { dateStyle: 'long' }),
                })}
              </span>
            )}
          </span>
        }
        actions={
          system && ctx.actor.platformAdmin === true && detail.status !== 'DEPRECATED' ? (
            <PlatformActions
              versionId={detail.id}
              code={detail.standard.code}
              label={detail.label}
              status={detail.status}
            />
          ) : null
        }
      />
      <div className="space-y-6">
        {detail.status === 'DRAFT' && <Callout tone="warning">{t('draftNotice')}</Callout>}
        {detail.status === 'DEPRECATED' && (
          <Callout tone="warning">{t('deprecatedNotice')}</Callout>
        )}
        {detail.sourceNotes && (
          <Section title={t('sourceNotes')}>
            <p className="whitespace-pre-line">{detail.sourceNotes}</p>
          </Section>
        )}
        <VersionView
          orgSlug={ctx.organization.slug}
          version={detail}
          canManage={canManage}
          overrides={
            overrides.ok
              ? overrides.value.filter((o) => o.standardVersionId === detail.id).map(overrideDto)
              : []
          }
        />
      </div>
    </>
  );
}
