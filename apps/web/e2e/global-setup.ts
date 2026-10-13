/**
 * Préparation E2E : un propriétaire (inscription réelle + vérification par e-mail via
 * Mailpit) et son organisation. Les compteurs de limitation de débit de l'environnement
 * de DÉVELOPPEMENT sont remis à zéro, pour que les exécutions successives restent possibles.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { request } from '@playwright/test';
import pg from 'pg';

import { BASE_URL, lastLinkTo, PASSWORD, type Fixture } from './support';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? 'postgresql://consulpro:consulpro@localhost:5434/consulpro';

async function adminQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

const INFRASTRUCTURE = new URL('../../../packages/infrastructure/', import.meta.url);

/** CLI d'administration (la même qu'en exploitation), lancée sans shell. */
const cli = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('node_modules/tsx/dist/cli.mjs', INFRASTRUCTURE)),
      fileURLToPath(new URL('src/cli/main.ts', INFRASTRUCTURE)),
      ...args,
    ],
    { stdio: 'pipe', env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL } },
  );

/**
 * Référentiels publiés, comme en exploitation : un administrateur de la plateforme (rôle
 * attribué par la CLI) publie les fichiers validés (idempotent) — démonstration, usages
 * du métré BTP (Phase 4), NF C 15-100 et guide UTE C 15-105 (Phase 5).
 */
async function publishStandards(): Promise<string> {
  const email = 'plateforme.e2e@consulpro.test';
  await adminQuery(
    `INSERT INTO users (id, name, email, email_verified, updated_at)
     VALUES (gen_random_uuid(), 'Plateforme E2E', $1, true, now()) ON CONFLICT (email) DO NOTHING`,
    [email],
  );
  cli('platform:grant-admin', email);
  for (const seed of [
    'demo/demo-1.json',
    'btp/usages-metre-1.json',
    'elec/nfc15-100-2002.json',
    'elec/ute-c15-105-2003.json',
  ]) {
    const file = fileURLToPath(
      new URL(`../../../packages/standards/seeds/${seed}`, import.meta.url),
    );
    cli('standards:load', file, '--publish-as', email);
  }
  const [row] = await adminQuery<{ id: string }>(
    `SELECT v.id FROM standard_versions v JOIN standards s ON s.id = v.standard_id
      WHERE s.organization_id IS NULL AND s.code = 'DEMO' AND v.label = '1' AND v.status = 'PUBLISHED'`,
  );
  if (!row) throw new Error('Référentiel DEMO non publié');
  return row.id;
}

// Playwright exige un export par défaut pour le globalSetup.
// eslint-disable-next-line no-restricted-syntax
export default async function globalSetup(): Promise<void> {
  await adminQuery('DELETE FROM rate_limits');
  const demoVersionId = await publishStandards();
  const stamp = Date.now().toString(36);
  const base = {
    ownerEmail: `awa.diop.${stamp}@bet-sahel.test`,
    ownerName: 'Awa Diop',
    orgSlug: `bet-sahel-${stamp}`,
    orgName: 'BET Sahel Ingénierie',
  };

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const signUp = await api.post('/api/auth/sign-up/email', {
    data: {
      email: base.ownerEmail,
      password: PASSWORD,
      name: base.ownerName,
      callbackURL: '/organisations',
    },
  });
  if (!signUp.ok())
    throw new Error(`Inscription impossible : ${signUp.status()} ${await signUp.text()}`);
  // La vérification connecte automatiquement l'utilisateur (cookie de session).
  const verify = await api.get(await lastLinkTo(base.ownerEmail, 'Confirmez'));
  if (verify.status() >= 400) throw new Error(`Vérification impossible : ${verify.status()}`);
  const org = await api.post('/api/v1/organizations', {
    data: { name: base.orgName, slug: base.orgSlug },
  });
  if (org.status() !== 201)
    throw new Error(`Organisation non créée : ${org.status()} ${await org.text()}`);

  const projectCode = `IMM-${stamp.toUpperCase()}`;
  const project = await api.post(`/api/v1/organizations/${base.orgSlug}/projects`, {
    data: {
      code: projectCode,
      name: 'Immeuble R+3 Plateau',
      client: 'SCI Plateau',
      location: 'Dakar',
      disciplines: ['BTP'],
    },
  });
  if (project.status() !== 201)
    throw new Error(`Projet non créé : ${project.status()} ${await project.text()}`);
  const { id: projectId } = (await project.json()) as { id: string };
  const projectApi = `/api/v1/organizations/${base.orgSlug}/projects/${projectId}`;
  const created = async (path: string, data: unknown) => {
    const response = await api.post(`${projectApi}${path}`, { data });
    if (response.status() !== 201)
      throw new Error(`${path} : ${String(response.status())} ${await response.text()}`);
    return ((await response.json()) as { id: string }).id;
  };
  const studyId = await created('/studies', { discipline: 'BTP', title: 'Dalles du bâtiment A' });
  const calculationId = await created(`/studies/${studyId}/calculations`, {
    title: 'Dalle R+1',
    engineId: 'demo.slab-volume',
  });
  await created(`/calculations/${calculationId}/runs`, {
    inputs: {
      length: { value: 10, unit: 'm' },
      width: { value: 5, unit: 'm' },
      thickness: { value: 20, unit: 'cm' },
    },
  });
  const datasetId = await created('/datasets', { kind: 'ROOMS', title: 'Pièces du R+1' });

  // Métré BTP (Phase 4) : un lot, des semelles rattachées, un quantitatif chiffré.
  const lotId = await created('/takeoff/nodes', {
    parentId: null,
    kind: 'LOT',
    code: '1',
    title: 'Fondations',
  });
  const footingId = await created(`/studies/${studyId}/calculations`, {
    title: 'Semelles S1',
    engineId: 'btp.footings',
  });
  const m = (value: number) => ({ value, unit: 'm' });
  await created(`/calculations/${footingId}/runs`, {
    inputs: { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 6 },
  });
  const assigned = await api.put(`${projectApi}/takeoff/assignments/${footingId}`, {
    data: { nodeId: lotId },
  });
  if (assigned.status() !== 204) throw new Error(`Rattachement : ${String(assigned.status())}`);
  const boqId = await created('/boqs', { title: 'DQE fondations' });
  const libraries = `/api/v1/organizations/${base.orgSlug}/price-libraries`;
  const library = await api.post(libraries, {
    data: { name: 'Prix Dakar 2026', currency: 'XOF', validFrom: '2026-01-01' },
  });
  if (library.status() !== 201) throw new Error(`Bibliothèque : ${String(library.status())}`);
  const { id: priceLibraryId } = (await library.json()) as { id: string };
  const item = await api.post(`${libraries}/${priceLibraryId}/items`, {
    data: {
      code: 'GO-01',
      designation: 'Béton armé en fondation',
      unit: 'm3',
      price: '65000',
      workKey: 'btp.footings.concrete',
    },
  });
  if (item.status() !== 201) throw new Error(`Article : ${String(item.status())}`);
  const applied = await api.post(`${projectApi}/boqs/${boqId}/prices`, {
    data: { libraryId: priceLibraryId },
  });
  if (applied.status() !== 200)
    throw new Error(`Application des prix : ${String(applied.status())}`);
  // Électricité (Phase 5) : tableaux et départs, bilan lu depuis le jeu, départ non conforme.
  const elecProject = await api.post(`/api/v1/organizations/${base.orgSlug}/projects`, {
    data: {
      code: `EL-${stamp.toUpperCase()}`,
      name: 'Clinique de Kaloum',
      location: 'Conakry',
      disciplines: ['ELEC'],
    },
  });
  if (elecProject.status() !== 201)
    throw new Error(`Projet électrique : ${String(elecProject.status())}`);
  const { id: elecProjectId } = (await elecProject.json()) as { id: string };
  const elecApi = `/api/v1/organizations/${base.orgSlug}/projects/${elecProjectId}`;
  const elecCreated = async (path: string, data: unknown, headers: Record<string, string> = {}) => {
    const response = await api.post(`${elecApi}${path}`, { data, headers });
    if (response.status() !== 201)
      throw new Error(`${path} : ${String(response.status())} ${await response.text()}`);
    return ((await response.json()) as { id: string }).id;
  };
  const elecStudyId = await elecCreated('/studies', { discipline: 'ELEC', title: 'Distribution' });
  const elecDatasetId = await elecCreated('/datasets', {
    kind: 'ELEC_BOARD_TREE',
    title: 'Tableaux et départs',
  });
  const kw = (value: number) => ({ value, unit: 'kW' });
  await elecCreated(
    `/datasets/${elecDatasetId}/revisions`,
    {
      rows: [
        { code: 'TGBT', type: 'BOARD', designation: 'Tableau général' },
        { code: 'TD1', parent: 'TGBT', type: 'BOARD', designation: 'Bloc opératoire' },
        {
          code: 'P1',
          parent: 'TD1',
          type: 'LOAD',
          designation: 'Prises',
          power: kw(0.3),
          count: 12,
          ku: 0.5,
          cosPhi: 0.9,
        },
        {
          code: 'E1',
          parent: 'TD1',
          type: 'LOAD',
          designation: 'Éclairage',
          power: kw(1.2),
          cosPhi: 0.95,
        },
        {
          code: 'C1',
          parent: 'TGBT',
          type: 'LOAD',
          designation: 'Climatisation',
          power: kw(9),
          cosPhi: 0.85,
        },
      ],
    },
    { 'if-match': '"1"' },
  );
  const elecCalculationId = await elecCreated(`/studies/${elecStudyId}/calculations`, {
    title: 'Bilan général',
    engineId: 'elec.power-balance',
  });
  await elecCreated(`/calculations/${elecCalculationId}/runs`, {
    inputs: {
      tree: { fromDataset: elecDatasetId },
      system: 'TRI',
      voltage: { value: 400, unit: 'V' },
    },
  });
  const protectionId = await elecCreated(`/studies/${elecStudyId}/calculations`, {
    title: 'Départ climatisation',
    engineId: 'elec.protection',
  });
  await elecCreated(`/calculations/${protectionId}/runs`, {
    inputs: {
      current: { value: 30, unit: 'A' },
      iz: { value: 20, unit: 'A' },
      device: 'BREAKER',
      circuitType: 'OTHER',
    },
  });

  const fixture: Fixture = {
    ...base,
    projectId,
    projectCode,
    demoVersionId,
    studyId,
    calculationId,
    datasetId,
    boqId,
    priceLibraryId,
    elecProjectId,
    elecDatasetId,
    elecCalculationId,
  };

  mkdirSync('e2e/.auth', { recursive: true });
  await api.storageState({ path: 'e2e/.auth/owner.json' });
  writeFileSync('e2e/.auth/fixture.json', JSON.stringify(fixture, null, 2));
  await api.dispose();
}
