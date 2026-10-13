/**
 * Phase 5 (07-roadmap.md) : arbre « tableaux et départs » → bilan de puissance qui lit la
 * révision courante du jeu → recalcul signalé quand le jeu change → tableau de bord Électricité ;
 * paramètres d'organisation (décision Q3 : Guinée, GNF).
 */
import { expect, test, type Page } from '@playwright/test';

import { fixture } from './fixture';
import { BASE_URL } from './support';

const headers = { origin: BASE_URL };
const kw = (value: number) => ({ value, unit: 'kW' });
const TREE = [
  { code: 'TGBT', type: 'BOARD' },
  { code: 'D1', parent: 'TGBT', type: 'LOAD', power: kw(2), count: 10, ku: 0.75, cosPhi: 0.9 },
  { code: 'D2', parent: 'TGBT', type: 'LOAD', power: kw(3), cosPhi: 0.8 },
];

async function fillQuantity(page: Page, label: string, value: string, unit?: string) {
  const group = page.getByRole('group', { name: label });
  await group.getByRole('textbox', { name: label }).fill(value);
  if (unit) {
    await group.getByRole('combobox', { name: `Unité de ${label}` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

test('bilan de puissance lu depuis le jeu de données, puis tableau de bord Électricité', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { orgSlug } = fixture();
  const code = `ELB-${Date.now().toString(36).toUpperCase()}`;

  // Projet électrique et arbre des tableaux (créés par l'API : le parcours porte sur le calcul).
  const created = await page.request.post(`/api/v1/organizations/${orgSlug}/projects`, {
    headers,
    data: { code, name: 'Dispensaire de Dixinn', disciplines: ['ELEC'] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: projectId } = (await created.json()) as { id: string };
  const projectApi = `/api/v1/organizations/${orgSlug}/projects/${projectId}`;
  const dataset = await page.request.post(`${projectApi}/datasets`, {
    headers,
    data: { kind: 'ELEC_BOARD_TREE', title: 'Tableaux' },
  });
  expect(dataset.status(), await dataset.text()).toBe(201);
  const { id: datasetId } = (await dataset.json()) as { id: string };
  const save = (rows: unknown[], version: number) =>
    page.request.post(`${projectApi}/datasets/${datasetId}/revisions`, {
      headers: { ...headers, 'if-match': `"${String(version)}"` },
      data: { rows },
    });
  expect((await save(TREE, 1)).status()).toBe(201);
  const base = `/${orgSlug}/projets/${projectId}`;

  // 1. Étude et calcul « Bilan de puissance » : le jeu se choisit, les lignes ne se saisissent pas.
  await page.goto(`${base}/etudes`);
  await page.getByLabel('Intitulé').fill('Distribution');
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  await expect(page.getByRole('heading', { name: 'Distribution' })).toBeVisible();
  await page.getByLabel('Intitulé du calcul').fill('Bilan général');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /Bilan de puissance/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await expect(page.getByRole('heading', { name: 'Bilan général' })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Jeu de données pour Tableaux, départs et récepteurs' })
    .click();
  await page.getByRole('option', { name: 'Tableaux — révision 1, 3 lignes' }).click();
  await page.getByRole('combobox', { name: 'Réseau' }).click();
  await page.getByRole('option', { name: 'Triphasé', exact: true }).click();
  await fillQuantity(page, 'Tension nominale', '400', 'V');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(page.getByText('Moteur non contre-vérifié')).toBeVisible();
  // 16,2 kW absorbés : ks 0,9 (2 circuits) × (10 × 2 × 0,75 + 3) ; révision du jeu tracée.
  const absorbed = page
    .getByRole('region', { name: /^Résultats/ })
    .getByRole('term')
    .filter({ hasText: 'Puissance active absorbée' });
  await expect(absorbed.locator('xpath=following-sibling::dd[1]')).toHaveText('16,20 kW');
  await expect(
    page.getByRole('link', { name: '« Tableaux », révision 1 (3 lignes)' }),
  ).toBeVisible();

  // 2. Nouvelle révision du jeu : le calcul est signalé à recalculer.
  expect(
    (
      await save(
        [...TREE, { code: 'D3', parent: 'TGBT', type: 'LOAD', power: kw(1), cosPhi: 1 }],
        2,
      )
    ).status(),
  ).toBe(201);
  await page.reload();
  await expect(page.getByText(/recalculez pour utiliser les données à jour/)).toBeVisible();

  // 3. Tableau de bord Électricité : le projet, son bilan et l'alerte de recalcul.
  await page.goto(`/${orgSlug}/electricite`);
  await expect(page.getByRole('heading', { level: 1, name: 'Électricité' })).toBeVisible();
  const projectLink = page.getByRole('link', { name: `${code} — Dispensaire de Dixinn` });
  await expect(projectLink).toBeVisible();
  const card = page.getByRole('listitem').filter({ has: projectLink });
  const balance = card.getByRole('row', { name: /Bilan général/ });
  await expect(balance).toContainText('16,20 kW');
  await expect(balance).toContainText('À recalculer');
});

test('paramètres d’organisation : Guinée, devise GNF proposée puis reprise par les quantitatifs', async ({
  page,
}) => {
  const slug = `bet-conakry-${Date.now().toString(36)}`;
  const org = await page.request.post('/api/v1/organizations', {
    headers,
    data: { name: 'BET Conakry', slug },
  });
  expect(org.status(), await org.text()).toBe(201);

  await page.goto(`/${slug}/organisation/parametres`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Paramètres de l’organisation' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Pays' }).click();
  await page.getByRole('option', { name: 'Guinée', exact: true }).click();
  // La devise usuelle du pays est proposée.
  await expect(page.getByRole('combobox', { name: 'Devise' })).toContainText('GNF');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Paramètres enregistrés.')).toBeVisible();

  // Un nouveau quantitatif propose la devise de l'organisation.
  const project = await page.request.post(`/api/v1/organizations/${slug}/projects`, {
    headers,
    data: { code: 'DISP-1', name: 'Dispensaire', disciplines: ['BTP'] },
  });
  expect(project.status(), await project.text()).toBe(201);
  const { id: projectId } = (await project.json()) as { id: string };
  await page.goto(`/${slug}/projets/${projectId}/quantitatifs`);
  await expect(page.getByRole('combobox', { name: 'Devise' })).toContainText('GNF');
});
