import type { AnyEngine } from '@consulpro/calc-core';

import { elecCableSizing, elecCircuit, elecProtection, elecVoltageDrop } from './engines/circuits';
import { elecDesignCurrent, elecPowerBalance } from './engines/power';

export { ELEC_HYPOTHESIS } from './common/inputs';
export { elecCableSizing, elecCircuit, elecProtection, elecVoltageDrop } from './engines/circuits';
export { elecDesignCurrent, elecPowerBalance } from './engines/power';

/**
 * Cas de référence rédigés par moteur (`cases/<id>.json`) et nombre de cas contre-vérifiés
 * par un ingénieur électricien (`checkedBy`, Q6). Un test compare ce tableau aux fichiers.
 * Tant que `checked < total`, l'interface affiche « moteur non contre-vérifié ».
 */
export const ELEC_REFERENCE_CASES: Readonly<Record<string, { total: number; checked: number }>> = {
  'elec.design-current': { total: 7, checked: 0 },
  'elec.power-balance': { total: 7, checked: 0 },
  'elec.cable-sizing': { total: 7, checked: 0 },
  'elec.voltage-drop': { total: 7, checked: 0 },
  'elec.protection': { total: 7, checked: 0 },
  'elec.circuit': { total: 7, checked: 0 },
};

const withCases = (engine: AnyEngine): AnyEngine => ({
  ...engine,
  referenceCases: ELEC_REFERENCE_CASES[engine.id] ?? { total: 0, checked: 0 },
});

/** Moteurs électriques (Phase 5) : toujours enregistrés. */
export const ELEC_ENGINES: readonly AnyEngine[] = [
  elecPowerBalance,
  elecDesignCurrent,
  elecCircuit,
  elecCableSizing,
  elecVoltageDrop,
  elecProtection,
].map((engine) => withCases(engine as AnyEngine));
