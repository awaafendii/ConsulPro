import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application } from '../index';
import { InMemoryStore, userContext } from './in-memory';

/* Import de jeux de données (Phase 7) : lecture, rapprochement, coercition et validation. */

const bytes = (text: string) => new TextEncoder().encode(text);

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const fails = (result: { ok: false; error: { reason: string } } | { ok: true }): string => {
  if (result.ok) throw new Error('échec attendu');
  return result.error.reason;
};

let store: InMemoryStore;
let app: Application;

beforeEach(() => {
  store = new InMemoryStore();
  app = createApplication(store.deps());
});

async function world() {
  const owner = store.addUser('owner@bet.test', 'Awa');
  must(await app.organizations.create(userContext(owner), { name: 'BET', slug: 'bet' }));
  const ctx = must(await app.organizations.resolveContext(userContext(owner), 'bet'));
  const project = must(
    await app.projects.create(ctx, { code: 'B-1', name: 'Villa', disciplines: ['BTP', 'TOPO'] }),
  );
  const rooms = must(
    await app.datasets.create(ctx, project.id, { kind: 'ROOMS', title: 'Pièces' }),
  );
  const points = must(
    await app.datasets.create(ctx, project.id, { kind: 'TOPO_POINTS', title: 'Points' }),
  );
  return { ctx, project, rooms, points };
}

describe('importPreview', () => {
  it('rapproche automatiquement, coerce et valide un CSV', async () => {
    const w = await world();
    const preview = must(
      await app.datasets.importPreview(w.ctx, w.project.id, w.rooms.id, {
        content: bytes('name,area\nSéjour,24\nCuisine,12,5'),
        units: { area: 'm2' },
      }),
    );
    expect(preview.format).toBe('delimited');
    expect(preview.headers).toEqual(['name', 'area']);
    expect(preview.mapping).toEqual(
      expect.arrayContaining([
        { key: 'name', sourceIndex: 0 },
        { key: 'area', sourceIndex: 1 },
      ]),
    );
    expect(preview.rowCount).toBe(2);
    expect(preview.valid).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.sample[0]).toEqual({
      name: 'Séjour',
      level: null,
      area: { value: 24, unit: 'm2' },
      height: null,
    });
  });

  it('signale les lignes invalides sans rien enregistrer', async () => {
    const w = await world();
    const preview = must(
      await app.datasets.importPreview(w.ctx, w.project.id, w.rooms.id, {
        content: bytes('name,area\nSéjour,abc'),
        units: { area: 'm2' },
      }),
    );
    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual([expect.objectContaining({ row: 1, column: 'area' })]);
  });

  it('rejette un fichier illisible (signature XLSX mais contenu corrompu)', async () => {
    const w = await world();
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    const result = await app.datasets.importPreview(w.ctx, w.project.id, w.rooms.id, {
      content: corrupt,
    });
    expect(fails(result)).toBe('IMPORT_UNREADABLE');
  });

  it('renvoie « introuvable » pour un jeu inexistant', async () => {
    const w = await world();
    const result = await app.datasets.importPreview(
      w.ctx,
      w.project.id,
      '00000000-0000-7000-8000-999999999999',
      { content: bytes('a,b\n1,2') },
    );
    expect(fails(result)).toBe('NOT_FOUND');
  });
});

describe('importCommit', () => {
  it('enregistre une révision depuis un CSV (rapprochement auto)', async () => {
    const w = await world();
    const revision = must(
      await app.datasets.importCommit(
        w.ctx,
        w.project.id,
        w.rooms.id,
        {
          content: bytes('name,area\nSéjour,24\nCuisine,12'),
          units: { area: 'm2' },
          note: 'Import test',
        },
        1,
      ),
    );
    expect(revision.number).toBe(1);
    expect(revision.note).toBe('Import test');
    const { revision: current } = must(
      await app.datasets.revision(w.ctx, w.project.id, w.rooms.id),
    );
    expect(current?.rows).toHaveLength(2);
  });

  it('respecte un rapprochement et des unités imposés (points topographiques)', async () => {
    const w = await world();
    const revision = must(
      await app.datasets.importCommit(
        w.ctx,
        w.project.id,
        w.points.id,
        {
          content: bytes('id;est;nord\nP1;1 000,25;2 000,75'),
          delimiter: ';',
          mapping: [
            { key: 'pointId', sourceIndex: 0 },
            { key: 'x', sourceIndex: 1 },
            { key: 'y', sourceIndex: 2 },
          ],
          units: { x: 'm', y: 'm' },
        },
        1,
      ),
    );
    expect(revision.rows).toEqual([
      {
        pointId: 'P1',
        x: { value: 1000.25, unit: 'm' },
        y: { value: 2000.75, unit: 'm' },
        z: null,
        code: null,
        description: null,
      },
    ]);
  });

  it('dépasse le plafond de 5 000 lignes de la saisie (jusqu’à maxRows du type)', async () => {
    const w = await world();
    const header = 'pointId,x,y\n';
    const lines = Array.from({ length: 6000 }, (_, i) => `P${String(i)},${String(i)},${String(i)}`);
    const revision = must(
      await app.datasets.importCommit(
        w.ctx,
        w.project.id,
        w.points.id,
        { content: bytes(header + lines.join('\n')), units: { x: 'm', y: 'm' } },
        1,
      ),
    );
    expect(revision.rows).toHaveLength(6000);
  });

  it('refuse un enregistrement sur une version périmée', async () => {
    const w = await world();
    const result = await app.datasets.importCommit(
      w.ctx,
      w.project.id,
      w.rooms.id,
      { content: bytes('name,area\nSéjour,24'), units: { area: 'm2' } },
      9,
    );
    expect(fails(result)).toBe('VERSION_MISMATCH');
  });

  it('n’enregistre rien quand des lignes sont invalides', async () => {
    const w = await world();
    const result = await app.datasets.importCommit(
      w.ctx,
      w.project.id,
      w.rooms.id,
      { content: bytes('name,area\nSéjour,abc'), units: { area: 'm2' } },
      1,
    );
    expect(fails(result)).toBe('DATASET_ROWS_INVALID');
  });
});
