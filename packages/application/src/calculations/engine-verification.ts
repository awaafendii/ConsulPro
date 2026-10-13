import type { EngineRegistry } from '@consulpro/calc-core';

/** Moteurs d'un métier et cas de référence contre-vérifiés (06-strategie-de-tests §3.2). */
export interface EngineVerification {
  readonly total: number;
  readonly verified: number;
  readonly cases: number;
  readonly checkedCases: number;
}

export function engineVerification(
  engines: EngineRegistry,
  discipline: string,
): EngineVerification {
  const list = engines.list().filter((e) => e.discipline === discipline && e.referenceCases);
  const cases = (e: (typeof list)[number]) => e.referenceCases ?? { total: 0, checked: 0 };
  return {
    total: list.length,
    verified: list.filter((e) => cases(e).total > 0 && cases(e).checked === cases(e).total).length,
    cases: list.reduce((sum, e) => sum + cases(e).total, 0),
    checkedCases: list.reduce((sum, e) => sum + cases(e).checked, 0),
  };
}
