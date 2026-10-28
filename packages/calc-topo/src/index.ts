import type { AnyEngine } from '@consulpro/calc-core';

import { topoControl } from './engines/control';
import { topoCoordinates } from './engines/coordinates';
import { topoLeveling } from './engines/leveling';
import { topoRadiationSurvey } from './engines/survey';
import { topoStakeout } from './engines/stakeout';
import { topoTraverse } from './engines/traverse';

export { TOPO_HYPOTHESIS } from './common/geometry';
export { topoControl } from './engines/control';
export { topoCoordinates } from './engines/coordinates';
export { topoLeveling } from './engines/leveling';
export { topoRadiationSurvey } from './engines/survey';
export { topoStakeout } from './engines/stakeout';
export { topoTraverse } from './engines/traverse';

/**
 * Cas de référence rédigés par moteur (`cases/<id>.json`) et nombre de cas contre-vérifiés
 * par un ingénieur topographe (`checkedBy`, Q6). Un test compare ce tableau aux fichiers.
 * Tant que `checked < total`, l'interface affiche « moteur non contre-vérifié ».
 */
export const TOPO_REFERENCE_CASES: Readonly<Record<string, { total: number; checked: number }>> = {
  'topo.coordinates': { total: 7, checked: 0 },
  'topo.radiation-survey': { total: 7, checked: 0 },
  'topo.traverse': { total: 7, checked: 0 },
  'topo.leveling': { total: 7, checked: 0 },
  'topo.stakeout': { total: 7, checked: 0 },
  'topo.control': { total: 7, checked: 0 },
};

const withCases = (engine: AnyEngine): AnyEngine => ({
  ...engine,
  referenceCases: TOPO_REFERENCE_CASES[engine.id] ?? { total: 0, checked: 0 },
});

/** Moteurs topographiques (Phase 7) : toujours enregistrés. */
export const TOPO_ENGINES: readonly AnyEngine[] = [
  topoCoordinates,
  topoRadiationSurvey,
  topoTraverse,
  topoLeveling,
  topoStakeout,
  topoControl,
].map((engine) => withCases(engine as AnyEngine));
