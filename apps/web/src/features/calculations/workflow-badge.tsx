'use client';

import type { WorkflowStatusDto } from '@consulpro/contracts';
import { Badge } from '@consulpro/ui';
import { useTranslations } from 'next-intl';

const VARIANT = {
  COMPUTED: 'muted',
  VALIDATED: 'info',
  VERIFIED: 'success',
  REJECTED: 'destructive',
} as const;

/** Statut du contrôle à deux niveaux d'une révision. */
export function WorkflowBadge({ status }: { status: WorkflowStatusDto }) {
  const t = useTranslations('workflow');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
