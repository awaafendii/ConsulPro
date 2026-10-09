import type { CalculationView } from '@consulpro/contracts';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { formatAuto, formatNumber, unitLabel, withUnit } from '../../lib/format';
import { Callout } from '../feedback/callout';
import { Formula } from './formula';
import { CalculationStatusBadge, CheckStatusBadge, VerificationBadge } from './status';

/*
 * Affichage d'un résultat de calcul. Ordre imposé (cahier des charges, §7) :
 * données d'entrée, hypothèses, paramètres, résultat, vérification, avertissements,
 * puis trace détaillée. Les hypothèses et avertissements ne sont jamais masqués (P4).
 */

const COMPARISON: Readonly<Record<string, string>> = { '<=': '≤', '<': '<', '>=': '≥', '>': '>' };
const SEVERITY: Readonly<Record<string, string>> = {
  BLOCKING: 'Bloquante',
  WARNING: 'Avertissement',
  INFO: 'Information',
};

function value(
  raw: number | string | boolean | null,
  unit: string | undefined,
  units: CalculationView['units'],
) {
  if (raw === null) return '—';
  if (typeof raw === 'boolean') return raw ? 'Oui' : 'Non';
  return withUnit(typeof raw === 'number' ? formatAuto(raw) : raw, unitLabel(unit, units));
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const id = `calc-${title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="h-9 px-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export interface CalculationReportProps {
  readonly view: CalculationView;
  /** Trace détaillée dépliée par défaut. */
  readonly traceOpen?: boolean;
}

export function CalculationReport({ view, traceOpen = false }: CalculationReportProps) {
  const { units } = view;
  const failed = view.status === 'INVALID' || view.status === 'ERROR';

  return (
    <article aria-label={`Résultat : ${view.engine.title}`} className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Moteur <span className="font-mono">{view.engine.id}</span> v{view.engine.version}
            {view.standards.length > 0 && (
              <>
                {' '}
                · Référentiels : {view.standards.map((s) => `${s.code} (${s.version})`).join(', ')}
              </>
            )}
          </p>
        </div>
        <CalculationStatusBadge status={view.status} />
      </header>

      {view.preview && (
        <Callout tone="info" title="Aperçu non enregistré">
          Ce résultat est calculé dans le navigateur pour l’aperçu. Seul le calcul enregistré par le
          serveur fait foi.
        </Callout>
      )}

      {view.status === 'INVALID' && (
        <Callout tone="destructive" title="Données refusées : aucun calcul n’a été effectué">
          <ul className="list-inside list-disc space-y-0.5">
            {view.errors.map((e) => (
              <li key={`${e.path}-${e.code}`}>
                <span className="font-mono text-xs">{e.path}</span> — {e.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {view.status === 'ERROR' && view.failure && (
        <Callout
          tone="destructive"
          title="Le calcul n’a pas abouti : aucun résultat n’est présenté"
        >
          {view.failure.message} <span className="font-mono text-xs">({view.failure.code})</span>
        </Callout>
      )}

      {view.inputs.length > 0 && (
        <Block title="Données d’entrée" count={view.inputs.length}>
          <Table caption="Données d’entrée" head={['Donnée', 'Valeur']}>
            {view.inputs.map((input) => (
              <tr key={input.key}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {input.label}
                </th>
                <td className="px-3 py-2 tabular-nums">
                  {value(input.value, input.unit, units)}
                  {input.defaulted && (
                    <span className="ml-2 rounded bg-warning-subtle px-1.5 py-0.5 text-xs text-warning-subtle-foreground">
                      valeur par défaut
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Block>
      )}

      <Block title="Hypothèses" count={view.hypotheses.length}>
        {view.hypotheses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune hypothèse.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {view.hypotheses.map((h) => (
              <li key={h.code} className="flex gap-2 rounded-lg border px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                <span className="flex-1">{h.text}</span>
                {h.origin === 'DEFAULT_VALUE' && (
                  <span className="self-start rounded bg-warning-subtle px-1.5 py-0.5 text-xs text-warning-subtle-foreground">
                    valeur par défaut
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Paramètres" count={view.parameters.length}>
        {view.parameters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paramètre de référentiel.</p>
        ) : (
          <Table
            caption="Paramètres du référentiel"
            head={['Paramètre', 'Valeur', 'Source', 'Statut']}
          >
            {view.parameters.map((p) => (
              <tr key={p.key} className={p.used ? undefined : 'text-muted-foreground'}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="block">{p.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                </th>
                <td className="px-3 py-2 tabular-nums">
                  {value(p.value, p.unit, units)}
                  {p.override && (
                    <span className="mt-1 block text-xs text-warning-subtle-foreground">
                      Surchargé ({p.override.scope === 'PROJECT' ? 'projet' : 'organisation'}) —
                      référence : {value(p.override.referenceValue, p.unit, units)}.{' '}
                      {p.override.justification}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {[p.source.document, p.source.clause, p.source.table].filter(Boolean).join(', ')}
                  {p.source.note && (
                    <span className="block text-xs text-muted-foreground">{p.source.note}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <VerificationBadge verification={p.verification} />
                  {!p.used && <span className="mt-1 block text-xs">non utilisé</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Block>

      {!failed && (
        <Block title="Résultats" count={view.outputs.length}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.outputs.map((o) => (
              <div key={o.key} className="rounded-lg border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{o.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {withUnit(formatNumber(o.value, o.precision), unitLabel(o.unit, units))}
                </dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {!failed && (
        <Block title="Vérifications" count={view.checks.length}>
          {view.checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune vérification réglementaire pour ce calcul.
            </p>
          ) : (
            <Table caption="Vérifications" head={['Règle', 'Contrôle', 'Résultat', 'Sévérité']}>
              {view.checks.map((c) => {
                const unit = unitLabel(c.unit, units);
                return (
                  <tr key={c.rule}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="block">{c.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.rule}
                        {c.clause && ` · ${c.clause}`}
                      </span>
                    </th>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {c.measured !== undefined && c.limit !== undefined && c.comparison
                        ? `${withUnit(formatAuto(c.measured), unit)} ${COMPARISON[c.comparison] ?? c.comparison} ${withUnit(formatAuto(c.limit), unit)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <CheckStatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{SEVERITY[c.severity]}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Block>
      )}

      <Block title="Avertissements" count={view.warnings.length}>
        {view.warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun avertissement.</p>
        ) : (
          <div className="space-y-2">
            {view.warnings.map((w, i) => (
              <Callout key={`${w.code}-${i}`} tone={w.severity === 'WARNING' ? 'warning' : 'info'}>
                {w.text}
              </Callout>
            ))}
          </div>
        )}
      </Block>

      {view.trace.length > 0 && (
        <details open={traceOpen} className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-open:rotate-90"
            />
            Trace détaillée du calcul ({view.trace.length} étapes)
          </summary>
          <ol className="divide-y border-t">
            {view.trace.map((step) => (
              <li key={step.id} className="space-y-2 px-4 py-3 text-sm">
                <p className="font-medium">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{step.id}</span>
                  {step.label}
                </p>
                {step.formula && <Formula latex={step.formula} display />}
                {step.substitutions && step.substitutions.length > 0 && (
                  <p className="text-muted-foreground">
                    avec{' '}
                    {step.substitutions
                      .map(
                        (s) =>
                          `${s.symbol} = ${typeof s.value === 'number' ? withUnit(formatAuto(s.value, 6), unitLabel(s.unit, units)) : s.value}`,
                      )
                      .join(' ; ')}
                  </p>
                )}
                {step.value !== undefined && (
                  <p className="font-medium tabular-nums">
                    ={' '}
                    {typeof step.value === 'number'
                      ? withUnit(formatAuto(step.value, 6), unitLabel(step.unit, units))
                      : step.value}
                  </p>
                )}
                {(step.source ?? step.note) && (
                  <p className="text-xs text-muted-foreground">
                    {[step.source, step.note].filter(Boolean).join(' — ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
