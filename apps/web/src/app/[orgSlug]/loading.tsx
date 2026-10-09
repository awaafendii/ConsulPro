import { LoadingState } from '@consulpro/ui';
import { getTranslations } from 'next-intl/server';

/** État de chargement de l'espace de travail (affiché dans la coquille). */
export default async function Loading() {
  const t = await getTranslations('common');
  return <LoadingState rows={6} label={t('loading')} />;
}
