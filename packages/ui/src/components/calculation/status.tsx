import type { CalculationView, ResultStatusDto } from '@consulpro/contracts';
import { CircleCheck, CircleX, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';

const STATUS: Readonly<
  Record<ResultStatusDto, { label: string; icon: LucideIcon; className: string }>
> = {
  OK: { label: 'Conforme', icon: CircleCheck, className: 'bg-success text-success-foreground' },
  OK_WITH_WARNINGS: {
    label: 'Conforme avec avertissements',
    icon: TriangleAlert,
    className: 'bg-warning text-warning-foreground',
  },
  NON_COMPLIANT: {
    label: 'Non conforme',
    icon: CircleX,
    className: 'bg-destructive text-destructive-foreground',
  },
  INVALID: {
    label: 'Données invalides',
    icon: OctagonAlert,
    className: 'bg-destructive text-destructive-foreground',
  },
  ERROR: {
    label: 'Erreur de calcul',
    icon: OctagonAlert,
    className: 'bg-destructive text-destructive-foreground',
  },
};

export function statusLabel(status: ResultStatusDto): string {
  return STATUS[status].label;
}

/** Statut global d'un calcul (l'icône double la couleur : jamais la couleur seule). */
export function CalculationStatusBadge({
  status,
  className,
}: {
  status: ResultStatusDto;
  className?: string | undefined;
}) {
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

type Check = CalculationView['checks'][number];

const CHECK: Readonly<
  Record<Check['status'], { label: string; icon: LucideIcon; className: string }>
> = {
  PASS: {
    label: 'Conforme',
    icon: CircleCheck,
    className: 'text-success-subtle-foreground bg-success-subtle',
  },
  FAIL: {
    label: 'Non conforme',
    icon: CircleX,
    className: 'text-destructive-subtle-foreground bg-destructive-subtle',
  },
  NOT_APPLICABLE: {
    label: 'Sans objet',
    icon: CircleCheck,
    className: 'text-muted-foreground bg-muted',
  },
};

export function CheckStatusBadge({ status }: { status: Check['status'] }) {
  const { label, icon: Icon, className } = CHECK[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

export function VerificationBadge({ verification }: { verification: 'VERIFIED' | 'TO_VERIFY' }) {
  return verification === 'VERIFIED' ? (
    <span className="inline-flex items-center gap-1 rounded bg-success-subtle px-1.5 py-0.5 text-xs font-medium text-success-subtle-foreground">
      <CircleCheck aria-hidden className="size-3.5" />
      Vérifié
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-warning-subtle-foreground">
      <TriangleAlert aria-hidden className="size-3.5" />À vérifier
    </span>
  );
}
