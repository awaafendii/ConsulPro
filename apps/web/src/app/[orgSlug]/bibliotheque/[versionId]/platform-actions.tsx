'use client';

import { Button, toast, useConfirm } from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Archive, BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';

/** Publication / dépréciation d'une version système (administrateur de la plateforme). */
export function PlatformActions({
  versionId,
  code,
  label,
  status,
}: {
  versionId: string;
  code: string;
  label: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
}) {
  const t = useTranslations('library');
  const confirm = useConfirm();
  const router = useRouter();
  const publish = status === 'DRAFT';

  const run = useMutation({
    mutationFn: () =>
      api(`/platform/standard-versions/${versionId}/${publish ? 'publish' : 'deprecate'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success(publish ? t('published') : t('deprecated'));
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Button
      variant={publish ? 'default' : 'outline'}
      loading={run.isPending}
      onClick={() => {
        void confirm({
          title: publish
            ? t('publishTitle', { code, label })
            : t('deprecateTitle', { code, label }),
          description: publish ? t('publishDescription') : t('deprecateDescription'),
          confirmLabel: publish ? t('publish') : t('deprecate'),
          tone: publish ? 'default' : 'destructive',
        }).then((ok) => {
          if (ok) run.mutate();
        });
      }}
    >
      {publish ? <BadgeCheck aria-hidden /> : <Archive aria-hidden />}
      {publish ? t('publish') : t('deprecate')}
    </Button>
  );
}
