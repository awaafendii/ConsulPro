import type { AnyEngine } from '@consulpro/calc-core';

import { plumbingDrainage, plumbingManholes, plumbingSepticTank } from './engines/drainage';
import { plumbingPump, plumbingStorageTank, plumbingWaterHeater } from './engines/equipment';
import {
  plumbingFlowRates,
  plumbingHeadLoss,
  plumbingPipeSizing,
  plumbingPressureCheck,
  plumbingSupplyNetwork,
} from './engines/supply';

export {
  COLEBROOK_DEFAULTS,
  computeLoss,
  simultaneity,
  solveColebrook,
  STANDARD_GRAVITY,
} from './common/hydraulics';
export { FIXTURE_LABELS, FIXTURES, MATERIAL_LABELS, PLUMBING_HYPOTHESIS } from './common/inputs';
export {
  manholePositions,
  partialFlow,
  plumbingDrainage,
  plumbingManholes,
  plumbingSepticTank,
} from './engines/drainage';
export { plumbingPump, plumbingStorageTank, plumbingWaterHeater } from './engines/equipment';
export {
  plumbingFlowRates,
  plumbingHeadLoss,
  plumbingPipeSizing,
  plumbingPressureCheck,
  plumbingSupplyNetwork,
} from './engines/supply';

/**
 * Cas de référence rédigés par moteur (`cases/<id>.json`) et nombre de cas contre-vérifiés
 * par un ingénieur plombier (`checkedBy`, Q6). Un test compare ce tableau aux fichiers.
 * Tant que `checked < total`, l'interface affiche « moteur non contre-vérifié ».
 */
export const PLUMBING_REFERENCE_CASES: Readonly<
  Record<string, { total: number; checked: number }>
> = {
  'plumbing.flow-rates': { total: 7, checked: 0 },
  'plumbing.pipe-sizing': { total: 7, checked: 0 },
  'plumbing.head-loss': { total: 7, checked: 0 },
  'plumbing.pressure-check': { total: 7, checked: 0 },
  'plumbing.supply-network': { total: 7, checked: 0 },
  'plumbing.drainage': { total: 7, checked: 0 },
  'plumbing.septic-tank': { total: 7, checked: 0 },
  'plumbing.manholes': { total: 7, checked: 0 },
  'plumbing.storage-tank': { total: 7, checked: 0 },
  'plumbing.pump': { total: 7, checked: 0 },
  'plumbing.water-heater': { total: 8, checked: 0 },
};

const withCases = (engine: AnyEngine): AnyEngine => ({
  ...engine,
  referenceCases: PLUMBING_REFERENCE_CASES[engine.id] ?? { total: 0, checked: 0 },
});

/** Moteurs de plomberie (Phase 6) : toujours enregistrés. */
export const PLUMBING_ENGINES: readonly AnyEngine[] = [
  plumbingFlowRates,
  plumbingSupplyNetwork,
  plumbingPipeSizing,
  plumbingHeadLoss,
  plumbingPressureCheck,
  plumbingDrainage,
  plumbingSepticTank,
  plumbingManholes,
  plumbingStorageTank,
  plumbingPump,
  plumbingWaterHeater,
].map((engine) => withCases(engine as AnyEngine));
