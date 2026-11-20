import { DATASET_KINDS, validateRows } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';

import { gridToRows, readGrid } from '../pipeline';

/* Mesure de performance sur un levé de 50 000 points (critère de sortie Phase 7 #3).
   Chemin d'import pur de bout en bout — lecture, rapprochement, coercition, validation — sans
   base de données. Sert aussi de garde-fou : un budget large détecte une régression pathologique
   sans être sensible à la machine. Les chiffres mesurés étayent la décision de stockage `jsonb`
   (voir docs/adr/0012-stockage-jsonb-jeux-de-donnees.md). */

const POINTS = DATASET_KINDS.TOPO_POINTS.columns;
const N = 50_000;

describe('performance — levé de 50 000 points', () => {
  // Délai Vitest large (indépendant du budget mesuré) : la génération des 50 000 lignes et la
  // lecture ne doivent pas être tuées par le timeout par défaut sous forte charge parallèle.
  it('lit, rapproche, coerce et valide 50 000 points sous le budget', { timeout: 30_000 }, () => {
    const lines = ['Matricule,X (Est),Y (Nord),Z (altitude)'];
    for (let i = 0; i < N; i += 1) {
      const x = (1000 + i * 0.01).toFixed(3);
      const y = (2000 + i * 0.02).toFixed(3);
      const z = (100 + (i % 500) * 0.01).toFixed(3);
      lines.push(`P${String(i)},${x},${y},${z}`);
    }
    const bytes = new TextEncoder().encode(lines.join('\n'));

    const start = performance.now();
    const grid = readGrid(bytes);
    const rows = gridToRows(POINTS, grid, undefined, { x: 'm', y: 'm', z: 'm' });
    const validation = validateRows('TOPO_POINTS', rows);
    const elapsed = performance.now() - start;

    expect(validation.ok).toBe(true);
    expect(rows).toHaveLength(N);
    // Taille du blob jsonb qui serait stocké pour cette révision (une seule colonne).
    const payloadBytes = JSON.stringify(validation.ok ? validation.value : rows).length;

    // Trace de mesure (critère de sortie documenté).
    console.info(
      `[perf] 50 000 points : ${elapsed.toFixed(0)} ms, blob jsonb ~${(payloadBytes / 1_048_576).toFixed(2)} Mio`,
    );

    // Budget très large : garde-fou anti-régression, pas une mesure fine.
    expect(elapsed).toBeLessThan(10_000);
    // Le blob reste très en deçà de la limite jsonb (1 Gio) de PostgreSQL.
    expect(payloadBytes).toBeLessThan(64 * 1_048_576);
  });
});
