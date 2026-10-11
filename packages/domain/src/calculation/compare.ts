/*
 * Comparaison de deux révisions d'un même calcul : liste des valeurs qui diffèrent, par
 * section (entrées, paramètres, sorties, vérifications, statut). Aucune interprétation
 * technique : on compare des valeurs enregistrées.
 */

export type Scalar = string | number | boolean | null;

export interface Difference {
  readonly section: string;
  /** Chemin dans la section (ex. `length.value`, `demo.waste_rate`). */
  readonly path: string;
  readonly before: Scalar | undefined;
  readonly after: Scalar | undefined;
}

/** Aplatit une valeur JSON en chemins → valeurs scalaires. */
export function flatten(value: unknown, prefix = ''): Map<string, Scalar> {
  const out = new Map<string, Scalar>();
  const visit = (v: unknown, path: string) => {
    if (v === null || typeof v !== 'object') {
      out.set(path, v === undefined ? null : (v as Scalar));
      return;
    }
    const entries = Array.isArray(v)
      ? v.map((item, index) => [String(index), item] as const)
      : Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) out.set(path, null);
    for (const [key, item] of entries) visit(item, path ? `${path}.${key}` : key);
  };
  visit(value, prefix);
  return out;
}

export function diffSection(section: string, before: unknown, after: unknown): Difference[] {
  const a = flatten(before);
  const b = flatten(after);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths
    .filter((path) => a.get(path) !== b.get(path))
    .map((path) => ({ section, path, before: a.get(path), after: b.get(path) }));
}

export interface ComparableRevision {
  readonly inputs: unknown;
  readonly parameters: readonly { readonly key: string; readonly value: unknown }[];
  readonly outputs: unknown;
  readonly checks: readonly {
    readonly rule: string;
    readonly status: string;
    readonly measured?: number;
  }[];
  readonly resultStatus: string;
  readonly engineVersion: string;
}

export function compareRevisions(
  before: ComparableRevision,
  after: ComparableRevision,
): Difference[] {
  const byKey = (params: ComparableRevision['parameters']) =>
    Object.fromEntries(params.map((p) => [p.key, p.value]));
  const checks = (list: ComparableRevision['checks']) =>
    Object.fromEntries(
      list.map((c) => [c.rule, { status: c.status, measured: c.measured ?? null }]),
    );
  return [
    ...diffSection(
      'status',
      { result: before.resultStatus, engine: before.engineVersion },
      { result: after.resultStatus, engine: after.engineVersion },
    ),
    ...diffSection('inputs', before.inputs, after.inputs),
    ...diffSection('parameters', byKey(before.parameters), byKey(after.parameters)),
    ...diffSection('outputs', before.outputs, after.outputs),
    ...diffSection('checks', checks(before.checks), checks(after.checks)),
  ];
}
