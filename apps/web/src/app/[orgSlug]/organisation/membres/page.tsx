import { can } from '@consulpro/domain';
import { ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { invitationDto, memberDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { MembersView } from './members-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('members'))('title') };
}

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const { app } = getServer().infra;
  const canManage = can(ctx.role, 'org.member.manage');
  const t = await getTranslations('members');

  const members = await app.members.list(ctx);
  const invitations = canManage ? await app.invitations.list(ctx) : null;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description', { organization: ctx.organization.name })}
      />
      {members.ok ? (
        <MembersView
          orgSlug={ctx.organization.slug}
          currentUserId={ctx.actor.userId}
          canManage={canManage}
          initialMembers={members.value.map(memberDto)}
          initialInvitations={invitations?.ok ? invitations.value.map(invitationDto) : []}
        />
      ) : (
        <ErrorState message={members.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
