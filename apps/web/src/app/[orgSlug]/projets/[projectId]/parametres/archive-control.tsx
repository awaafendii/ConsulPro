'use client';

import type { ProjectDto } from '@consulpro/contracts';
import { Button, toast, useConfirm } from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';

export function ArchiveControl({ orgSlug, project }: { orgSlug: string; project: ProjectDto }) {
  const t = useTranslations('project.settings');
  const confirm = useConfirm();
  const router = useRouter();
  const archived = project.status === 'ARCHIVED';

  const toggle = useMutation({
    mutationFn: () =>
      api(
        `/organizations/${orgSlug}/projects/${project.id}/${archived ? 'unarchive' : 'archive'}`,
        { method: 'POST', headers: { 'if-match': `"${project.version}"` } },
      ),
    onSuccess: () => {
      toast.success(archived ? t('unarchived') : t('archived'));
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
      if (error instanceof ApiError && error.problem.status === 412) router.refresh();
    },
  });

  return archived ? (
    <Button
      variant="outline"
      loading={toggle.isPending}
      onClick={() => {
        toggle.mutate();
      }}
    >
      <ArchiveRestore aria-hidden />
      {t('unarchive')}
    </Button>
  ) : (
    <Button
      variant="outline"
      loading={toggle.isPending}
      onClick={() => {
        void confirm({
          title: t('archiveConfirmTitle', { code: project.code }),
          description: t('archiveConfirmDescription'),
          confirmLabel: t('archive'),
          tone: 'destructive',
        }).then((ok) => {
          if (ok) toggle.mutate();
        });
      }}
    >
      <Archive aria-hidden />
      {t('archive')}
    </Button>
  );
}
