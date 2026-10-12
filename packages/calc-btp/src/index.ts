import type { AnyEngine } from '@consulpro/calc-core';

import { btpBeams, btpColumns, btpFootings, btpGroundBeams } from './engines/concrete-elements';
import { btpEarthworks } from './engines/earthworks';
import { btpPainting, btpRenders, btpTiling } from './engines/finishes';
import { btpBlocks, btpMasonry, btpPartitions } from './engines/masonry';
import { btpSlabs, btpStairs } from './engines/slabs-stairs';

export { BTP_HYPOTHESIS } from './common/outputs';
export { btpBeams, btpColumns, btpFootings, btpGroundBeams } from './engines/concrete-elements';
export { btpEarthworks } from './engines/earthworks';
export { btpPainting, btpRenders, btpTiling } from './engines/finishes';
export { btpBlocks, btpMasonry, btpPartitions } from './engines/masonry';
export { btpSlabs, btpStairs } from './engines/slabs-stairs';

/**
 * Cas de référence rédigés par moteur (`cases/<id>.json`) et nombre de cas contre-vérifiés
 * par un ingénieur (`checkedBy`). Un test compare ce tableau aux fichiers : il ne peut pas
 * dériver. Tant que `checked < total`, l'interface affiche « moteur non contre-vérifié ».
 */
export const BTP_REFERENCE_CASES: Readonly<Record<string, { total: number; checked: number }>> = {
  'btp.earthworks': { total: 7, checked: 0 },
  'btp.footings': { total: 7, checked: 0 },
  'btp.ground-beams': { total: 7, checked: 0 },
  'btp.columns': { total: 7, checked: 0 },
  'btp.beams': { total: 7, checked: 0 },
  'btp.slabs': { total: 7, checked: 0 },
  'btp.stairs': { total: 7, checked: 0 },
  'btp.masonry': { total: 7, checked: 0 },
  'btp.blocks': { total: 7, checked: 0 },
  'btp.partitions': { total: 7, checked: 0 },
  'btp.renders': { total: 7, checked: 0 },
  'btp.tiling': { total: 7, checked: 0 },
  'btp.painting': { total: 7, checked: 0 },
};

const withCases = (engine: AnyEngine): AnyEngine => ({
  ...engine,
  referenceCases: BTP_REFERENCE_CASES[engine.id] ?? { total: 0, checked: 0 },
});

/** Moteurs BTP (quantités, décision Q2) : toujours enregistrés. */
export const BTP_ENGINES: readonly AnyEngine[] = [
  btpEarthworks,
  btpFootings,
  btpGroundBeams,
  btpColumns,
  btpBeams,
  btpSlabs,
  btpStairs,
  btpMasonry,
  btpBlocks,
  btpPartitions,
  btpRenders,
  btpTiling,
  btpPainting,
].map((engine) => withCases(engine as AnyEngine));
