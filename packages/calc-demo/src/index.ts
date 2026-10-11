import type { AnyEngine } from '@consulpro/calc-core';

import { demoSlabMass } from './slab-mass';
import { demoSlabVolume } from './slab-volume';

export { DEMO_HYPOTHESIS } from './common';
export { demoSlabMass } from './slab-mass';
export { demoSlabVolume } from './slab-volume';

/** Moteurs de démonstration : enregistrés seulement si CONSULPRO_DEMO_ENGINES=true. */
export const DEMO_ENGINES: readonly AnyEngine[] = [demoSlabVolume, demoSlabMass];
