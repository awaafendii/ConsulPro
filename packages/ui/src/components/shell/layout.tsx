import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { AppLink } from '../navigation/link';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Actions principales de la page (boutons). */
  readonly actions?: ReactNode;
  /** Lien de retour vers la page parente (« ← label »), au-dessus du titre. */
  readonly back?: { readonly href: string; readonly label: string };
  readonly className?: string | undefined;
}

/** En-tête de page : un seul <h1> par page. */
export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {back && (
          <AppLink
            href={back.href}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <span aria-hidden>←</span>
            {back.label}
          </AppLink>
        )}
        <h1 className="text-[1.75rem] leading-tight font-medium sm:text-3xl">{title}</h1>
        {/* Filet laiton : signature de marque sous le titre de page. */}
        <span aria-hidden className="brand-rule block h-0.5 w-14 rounded-full" />
        {description && (
          <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
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
      className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
    >
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-0.5">
          <h2 id={id} className="font-semibold tracking-tight">
            {title}
          </h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
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
  /** Slogan affiché sur le panneau d'encre (écrans larges). Sans lui, le panneau est décoratif. */
  readonly tagline?: ReactNode;
  /** Nom accessible du panneau de présentation. */
  readonly asideLabel?: string;
}

/**
 * Mise en page des écrans publics (connexion, inscription…) : panneau d'encre à gauche
 * sur écran large, formulaire à droite ; une seule colonne en dessous de 1024 px.
 */
export function AuthLayout({
  brand,
  title,
  description,
  children,
  footer,
  corner,
  tagline,
  asideLabel = 'Présentation',
}: AuthLayoutProps) {
  const panelClass =
    'blueprint-grid relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-end lg:p-12 xl:p-16';
  const ornament = (
    <>
      <span aria-hidden className="brand-rule absolute inset-x-0 top-0 h-0.5" />
      <SurveyOrnament className="absolute -top-24 -right-24 size-[30rem] text-sidebar-primary opacity-25" />
    </>
  );
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {tagline ? (
        <aside aria-label={asideLabel} className={panelClass}>
          {ornament}
          <div className="relative max-w-md space-y-5">
            <span aria-hidden className="block h-0.5 w-14 rounded-full bg-sidebar-primary" />
            <p className="font-display text-3xl leading-tight font-medium tracking-tight text-sidebar-accent-foreground xl:text-4xl">
              {tagline}
            </p>
          </div>
        </aside>
      ) : (
        <div aria-hidden className={panelClass}>
          {ornament}
        </div>
      )}
      <div className="relative flex min-w-0 flex-col items-center justify-center px-4 py-12">
        {corner && <div className="absolute top-4 right-4">{corner}</div>}
        <main className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">{brand}</div>
          <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-md sm:p-8">
            <div className="mb-6 space-y-1.5">
              <h1 className="text-2xl leading-tight font-medium">{title}</h1>
              {description && <div className="text-sm text-muted-foreground">{description}</div>}
            </div>
            {children}
          </div>
          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </main>
      </div>
    </div>
  );
}

/** Ornement décoratif : cercles de visée et axes, évoquant un plan topographique. */
function SurveyOrnament({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
    >
      {[60, 110, 160, 199].map((r) => (
        <circle key={r} cx="200" cy="200" r={r} />
      ))}
      <path d="M200 0v400M0 200h400M59 59l282 282M341 59 59 341" />
    </svg>
  );
}

/** Logo textuel de ConsulPro : monogramme laiton sur encre, dans les deux thèmes. */
export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 font-display font-semibold tracking-tight',
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-sidebar text-sm text-sidebar-primary ring-1 ring-sidebar-primary/40 ring-inset"
      >
        C
      </span>
      ConsulPro
    </span>
  );
}
