import { DATASET_KINDS, type ColumnDefinition } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';

import { applyMapping, autoMap, type ColumnMapping } from '../mapping';

const topoPoints = DATASET_KINDS.TOPO_POINTS.columns;

const twoNamed: readonly ColumnDefinition[] = [
  { key: 'a', label: 'Nom', type: 'text', required: true, maxLength: 10 },
  { key: 'b', label: 'Nom', type: 'text', required: false, maxLength: 10 },
];

describe('autoMap', () => {
  it('rapproche une colonne par sa clé', () => {
    const mapping = autoMap(topoPoints, ['pointId', 'x', 'y', 'z', 'code', 'description']);
    expect(mapping).toEqual([
      { key: 'pointId', sourceIndex: 0 },
      { key: 'x', sourceIndex: 1 },
      { key: 'y', sourceIndex: 2 },
      { key: 'z', sourceIndex: 3 },
      { key: 'code', sourceIndex: 4 },
      { key: 'description', sourceIndex: 5 },
    ]);
  });

  it('rapproche par libellé, en ignorant casse, accents et ponctuation', () => {
    const mapping = autoMap(topoPoints, ['Matricule', 'X (Est)', 'Y (Nord)']);
    expect(mapping).toEqual([
      { key: 'pointId', sourceIndex: 0 },
      { key: 'x', sourceIndex: 1 },
      { key: 'y', sourceIndex: 2 },
      { key: 'z', sourceIndex: null },
      { key: 'code', sourceIndex: null },
      { key: 'description', sourceIndex: null },
    ]);
  });

  it('ne réutilise pas un en-tête déjà rattaché (un pour un)', () => {
    expect(autoMap(twoNamed, ['Nom', 'Nom'])).toEqual([
      { key: 'a', sourceIndex: 0 },
      { key: 'b', sourceIndex: 1 },
    ]);
  });

  it('laisse une colonne sans en-tête correspondant à null', () => {
    expect(autoMap(twoNamed, ['Nom'])).toEqual([
      { key: 'a', sourceIndex: 0 },
      { key: 'b', sourceIndex: null },
    ]);
  });
});

describe('applyMapping', () => {
  it('projette les cellules rattachées et ignore les colonnes non rattachées', () => {
    const mapping: readonly ColumnMapping[] = [
      { key: 'x', sourceIndex: 1 },
      { key: 'z', sourceIndex: null },
    ];
    expect(applyMapping(mapping, ['a', 'b'])).toEqual({ x: 'b' });
  });

  it('rend une chaîne vide pour un indice hors de la ligne', () => {
    expect(applyMapping([{ key: 'x', sourceIndex: 5 }], ['a'])).toEqual({ x: '' });
  });
});
