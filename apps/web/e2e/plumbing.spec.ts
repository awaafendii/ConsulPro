/**
 * Phase 6 (07-roadmap.md) : réseau d'alimentation lu dans un jeu de données → calcul (débits,
 * diamètres, Colebrook-White, pressions) → avant-métré → DQE ventilé par diamètre (Q9),
 * présentation agrégée par matériau → tableau de bord Plomberie.
 */
import { expect, test, type Page } from '@playwright/test';

import { fixture } from './fixture';
import { BASE_URL } from './support';

const headers = { origin: BASE_URL };
const m = (value: number) => ({ value, unit: 'm' });
const NETWORK = [
  { code: 'A', length: m(10), elevation: m(0), location: 'BASEMENT' },
  {
    code: 'B',
    parent: 'A',
    length: m(5),
    elevation: m(3),
    location: 'FLOOR',
    fixture: 'WASHBASIN',
    count: 2,
  },
  {
    code: 'C',
    parent: 'A',
    length: m(7),
    elevation: m(3),
    location: 'FLOOR',
    fixture: 'WC_CISTERN',
    count: 2,
  },
];

async function fillQuantity(page: Page, label: string, value: string, unit?: string) {
  const group = page.getByRole('group', { name: label });
  await group.getByRole('textbox', { name: label }).fill(value);
  if (unit) {
    await group.getByRole('combobox', { name: `Unité de ${label}` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

test('réseau d’alimentation, avant-métré, DQE par diamètre puis agrégé, tableau de bord', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { orgSlug } = fixture();
  const code = `PLR-${Date.now().toString(36).toUpperCase()}`;

  // Projet de plomberie et tronçons du réseau (créés par l'API : le parcours porte sur le calcul).
  const created = await page.request.post(`/api/v1/organizations/${orgSlug}/projects`, {
    headers,
    data: { code, name: 'Maternité de Kipé', disciplines: ['PLUMBING'] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: projectId } = (await created.json()) as { id: string };
  const projectApi = `/api/v1/organizations/${orgSlug}/projects/${projectId}`;
  const dataset = await page.request.post(`${projectApi}/datasets`, {
    headers,
    data: { kind: 'PLUMBING_NETWORK', title: 'Réseau' },
  });
  expect(dataset.status(), await dataset.text()).toBe(201);
  const { id: datasetId } = (await dataset.json()) as { id: string };
  const revision = await page.request.post(`${projectApi}/datasets/${datasetId}/revisions`, {
    headers: { ...headers, 'if-match': '"1"' },
    data: { rows: NETWORK },
  });
  expect(revision.status(), await revision.text()).toBe(201);
  const base = `/${orgSlug}/projets/${projectId}`;

  // 1. Étude et calcul du réseau, lu dans le jeu de données.
  await page.goto(`${base}/etudes`);
  await page.getByLabel('Intitulé').fill('Alimentation');
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  await expect(page.getByRole('heading', { name: 'Alimentation' })).toBeVisible();
  await page.getByLabel('Intitulé du calcul').fill('Réseau eau froide');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /Réseau d’alimentation/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await expect(page.getByRole('heading', { name: 'Réseau eau froide' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Jeu de données pour Tronçons du réseau' }).click();
  await page.getByRole('option', { name: 'Réseau — révision 1, 3 lignes' }).click();
  await page.getByRole('combobox', { name: 'Matériau des tubes' }).click();
  await page.getByRole('option', { name: 'Tube PPR PN20', exact: true }).click();
  await fillQuantity(page, 'Pression disponible à l’origine', '250', 'kPa');
  await fillQuantity(page, 'Température de l’eau', '25');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(page.getByText('Moteur non contre-vérifié')).toBeVisible();
  const results = page.getByRole('region', { name: /^Résultats/ });
  await expect(
    results
      .getByRole('term')
      .filter({ hasText: /^Linéaire de tubes — Tube PPR PN20 Ø\d+$/ })
      .first(),
  ).toBeVisible();

  // 2. Avant-métré : un lot « Plomberie », le calcul y est rattaché.
  await page.goto(`${base}/avant-metre`);
  await page.getByRole('button', { name: 'Nouveau lot' }).click();
  const nodeDialog = page.getByRole('dialog', { name: 'Ajouter un nœud' });
  await nodeDialog.getByLabel('Code').fill('5');
  await nodeDialog.getByLabel('Intitulé').fill('Plomberie');
  await nodeDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('« 5 — Plomberie » ajouté.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Nœud de rattachement de Réseau eau froide' }).click();
  await page.getByRole('option', { name: '5 — Plomberie' }).click();
  await expect(page.getByText('Réseau eau froide rattaché à 5 — Plomberie.')).toBeVisible();

  // 3. Quantitatif : une ligne par diamètre, puis présentation agrégée par matériau.
  await page.goto(`${base}/quantitatifs`);
  await page.getByLabel('Intitulé').fill('DQE plomberie');
  await page.getByRole('button', { name: 'Créer le quantitatif' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'DQE plomberie' })).toBeVisible();
  const detailed = page.getByRole('row', { name: /Réseau eau froide — Tube PPR PN20 Ø\d+/ });
  await expect(detailed.first()).toBeVisible();
  expect(await detailed.count()).toBeGreaterThanOrEqual(2);
  await page.getByRole('combobox', { name: 'Présentation des tubes et appareils' }).click();
  await page.getByRole('option', { name: /^Agrégée/ }).click();
  await expect(page.getByText('Quantitatif enregistré.')).toBeVisible();
  const grouped = page.getByRole('row', {
    name: /Réseau eau froide — Tube PPR PN20 .*lignes regroupées/,
  });
  await expect(grouped).toBeVisible();
  await expect(grouped).toContainText('22');

  // 4. Tableau de bord Plomberie : le réseau, son débit probable et sa pression la plus faible.
  await page.goto(`/${orgSlug}/plomberie`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Plomberie & Sanitaire' }),
  ).toBeVisible();
  const projectLink = page.getByRole('link', { name: `${code} — Maternité de Kipé` });
  await expect(projectLink).toBeVisible();
  const card = page.getByRole('listitem').filter({ has: projectLink });
  await expect(card.getByRole('row', { name: /Réseau eau froide/ })).toContainText('L/s');
});
