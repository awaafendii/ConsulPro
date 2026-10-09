import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Actions principales de la page (boutons). */
  readonly actions?: ReactNode;
  readonly className?: string | undefined;
}

/** En-tête de page : un seul <h1> par page. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export interface SectionProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Bloc de contenu titré (<h2>) sur fond de carte. */
export function Section({ title, description, actions, children, className }: SectionProps) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}
    >
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export interface AuthLayoutProps {
  readonly brand: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Éléments flottants (sélecteur de thème). */
  readonly corner?: ReactNode;
}

/** Mise en page des écrans publics (connexion, inscription…). */
export function AuthLayout({
  brand,
  title,
  description,
  children,
  footer,
  corner,
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      {corner && <div className="absolute top-4 right-4">{corner}</div>}
      <main className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">{brand}</div>
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <div className="text-sm text-muted-foreground">{description}</div>}
          </div>
          {children}
        </div>
        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  );
}

/** Logo textuel de ConsulPro. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground"
      >
        C
      </span>
      ConsulPro
    </span>
  );
}
