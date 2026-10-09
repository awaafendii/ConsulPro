import { CircleAlert, Inbox, RotateCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

/*
 * Les quatre états de tout écran de données (05-conventions §7) :
 * chargement, vide, erreur, nominal.
 */

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly icon?: LucideIcon;
  /** Action proposée (ex. « Créer un projet »). */
  readonly action?: ReactNode;
  readonly className?: string | undefined;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  readonly title?: string;
  readonly message: ReactNode;
  /** Identifiant de requête à communiquer au support. */
  readonly requestId?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: string;
  readonly className?: string | undefined;
}

export function ErrorState({
  title = 'Impossible d’afficher ces données',
  message,
  requestId,
  onRetry,
  retryLabel = 'Réessayer',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive-subtle px-6 py-10 text-center text-destructive-subtle-foreground',
        className,
      )}
    >
      <CircleAlert aria-hidden className="size-6" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <div className="max-w-md text-sm">{message}</div>
        {requestId && <p className="font-mono text-xs opacity-80">Référence : {requestId}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export interface LoadingStateProps {
  /** Nombre de lignes simulées. */
  readonly rows?: number;
  readonly label?: string;
  readonly className?: string | undefined;
}

/** Squelette de liste ou de tableau, annoncé aux lecteurs d'écran. */
export function LoadingState({ rows = 5, label = 'Chargement…', className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('space-y-3', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
