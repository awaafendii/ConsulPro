/**
 * Phase 7 (07-roadmap.md) : projet de topographie → calcul de polygonale (cheminement) saisi
 * tronçon par tronçon → fermeture hors tolérance (non conforme) → tableau de bord Topographie
 * qui met en avant le cheminement et sa non-conformité.
 */
import { expect, test, type Page } from '@playwright/test';

import { fixture } from './fixture';
import { BASE_URL } from './support';

const headers = { origin: BASE_URL };

async function fillField(page: Page, label: string, value: string, unit?: string) {
  const group = page.getByRole('group', { name: label });
  await group.getByRole('textbox', { name: label }).fill(value);
  if (unit) {
    await group.getByRole('combobox', { name: `Unité de ${label}` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

async function fillLeg(page: Page, field: string, value: string, unit?: string) {
  const name = `${field}, ligne 1`;
  await page.getByRole('textbox', { name }).fill(value);
  if (unit) {
    await page.getByRole('combobox', { name: `${name} — Unité` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

test('polygonale saisie tronçon par tronçon, fermeture hors tolérance, tableau de bord Topographie', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { orgSlug } = fixture();
  const code = `TOP-${Date.now().toString(36).toUpperCase()}`;

  // Projet de topographie (créé par l'API : le parcours porte sur le calcul de polygonale).
  const created = await page.request.post(`/api/v1/organizations/${orgSlug}/projects`, {
    headers,
    data: { code, name: 'Lotissement de Ratoma', disciplines: ['TOPO'] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: projectId } = (await created.json()) as { id: string };
  const base = `/${orgSlug}/projets/${projectId}`;

  // 1. Étude et calcul « Polygonale de contrôle » : les tronçons se saisissent à la main.
  await page.goto(`${base}/etudes`);
  await page.getByLabel('Intitulé').fill('Cheminements');
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  await expect(page.getByRole('heading', { name: 'Cheminements' })).toBeVisible();
  await page.getByLabel('Intitulé du calcul').fill('Polygonale de contrôle');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /Polygonale/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await expect(page.getByRole('heading', { name: 'Polygonale de contrôle' })).toBeVisible();

  // Cheminement fermé qui ne revient pas à son origine : un seul tronçon de 100 m plein Est.
  await page.getByRole('combobox', { name: 'Type de cheminement' }).click();
  await page.getByRole('option', { name: 'Fermé (retour au point de départ)' }).click();
  await fillField(page, 'X du point de départ (Est)', '0', 'm');
  await fillField(page, 'Y du point de départ (Nord)', '0', 'm');
  await fillField(page, 'Gisement de départ (premier tronçon)', '100', 'gon');
  await page
    .getByRole('button', { name: 'Ajouter une ligne (Tronçons (angle de station et longueur))' })
    .click();
  await fillLeg(page, 'Angle de station (à droite)', '100', 'gon');
  await fillLeg(page, 'Longueur du tronçon', '100');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(page.getByText('Moteur non contre-vérifié')).toBeVisible();

  // La précision relative (f_L / ΣD = 1) dépasse la tolérance : résultat non conforme.
  const results = page.getByRole('region', { name: /^Résultats/ });
  await expect(
    results
      .getByRole('term')
      .filter({ hasText: 'Précision relative 1 / N' })
      .first(),
  ).toBeVisible();

  // 2. Tableau de bord Topographie : le projet, son cheminement et sa non-conformité.
  await page.goto(`/${orgSlug}/topographie`);
  await expect(page.getByRole('heading', { level: 1, name: 'Topographie' })).toBeVisible();
  const projectLink = page.getByRole('link', { name: `${code} — Lotissement de Ratoma` });
  await expect(projectLink).toBeVisible();
  const card = page.getByRole('listitem').filter({ has: projectLink });
  const traverse = card.getByRole('row', { name: /Polygonale de contrôle/ });
  await expect(traverse).toContainText('1 / 1');
  await expect(card.getByText('Calculs non conformes')).toBeVisible();
});
