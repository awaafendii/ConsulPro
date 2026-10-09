'use client';

import { Button, Callout } from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';

export function AcceptInvitation({ token, email }: { token: string; email: string }) {
  const t = useTranslations('invitation');
  const router = useRouter();
  const accept = useMutation({
    mutationFn: () =>
      api<{ organization: { slug: string } }>('/invitations/accept', {
        method: 'POST',
        json: { token },
      }),
    onSuccess: ({ organization }) => {
      router.push(`/${organization.slug}/tableau-de-bord`);
    },
  });

  const error = accept.error;
  return (
    <div className="space-y-4">
      {error && (
        <Callout tone="destructive">
          {error instanceof ApiError && error.problem.status === 404
            ? t('notFound', { email })
            : error.message}
        </Callout>
      )}
      <p className="text-sm text-muted-foreground">{t('signedInAs', { email })}</p>
      <Button
        className="w-full"
        loading={accept.isPending}
        onClick={() => {
          accept.mutate();
        }}
      >
        {accept.isPending ? t('accepting') : t('accept')}
      </Button>
    </div>
  );
}
