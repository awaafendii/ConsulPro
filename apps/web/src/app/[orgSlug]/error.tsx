'use client';

import { ErrorState } from '@consulpro/ui';
import { useTranslations } from 'next-intl';

/** Erreur d'affichage d'une page de l'espace de travail : message, référence, nouvelle tentative. */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  return (
    <ErrorState
      title={t('errorTitle')}
      message={t('errorDescription')}
      requestId={error.digest}
      onRetry={reset}
      retryLabel={tCommon('retry')}
    />
  );
}
