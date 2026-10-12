/**
 * Phase 4 (07-roadmap.md) : avant-métré → calcul BTP → quantitatif → prix → quantité retenue,
 * avec traçabilité de la ligne vers la révision et décomposition en matériaux.
 */
import { expect, test, type Page } from '@playwright/test';

import { fixture } from './fixture';
import { BASE_URL } from './support';

async function fillField(page: Page, label: string, value: string, unit?: string) {
  const group = page.getByRole('group', { name: label });
  await group.getByRole('textbox', { name: label }).fill(value);
  if (unit) {
    await group.getByRole('combobox', { name: `Unité de ${label}` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

test('métré BTP : avant-métré, calcul, quantitatif chiffré, quantité retenue et matériaux', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { orgSlug } = fixture();
  const stamp = Date.now().toString(36).toUpperCase();

  // Projet BTP neuf (créé par l'API : le parcours porte sur le métré).
  const created = await page.request.post(`/api/v1/organizations/${orgSlug}/projects`, {
    headers: { origin: BASE_URL },
    data: { code: `MET-${stamp}`, name: 'Centre de santé', disciplines: ['BTP'] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: projectId } = (await created.json()) as { id: string };
  const base = `/${orgSlug}/projets/${projectId}`;

  // 1. Avant-métré : un lot.
  await page.goto(`${base}/avant-metre`);
  await page.getByRole('button', { name: 'Nouveau lot' }).click();
  const nodeDialog = page.getByRole('dialog', { name: 'Ajouter un nœud' });
  await nodeDialog.getByLabel('Code').fill('1');
  await nodeDialog.getByLabel('Intitulé').fill('Fondations');
  await nodeDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('« 1 — Fondations » ajouté.')).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Structure de l’avant-métré' })).toContainText(
    'Fondations',
  );

  // 2. Étude et calcul de semelles, exécuté par le serveur.
  await page.goto(`${base}/etudes`);
  await page.getByLabel('Intitulé').fill('Fondations');
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  await expect(page.getByRole('heading', { name: 'Fondations' })).toBeVisible();
  await page.getByLabel('Intitulé du calcul').fill('Semelles S1');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /Semelles isolées ou filantes/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await expect(page.getByRole('heading', { name: 'Semelles S1' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Type de semelle' }).click();
  await page.getByRole('option', { name: 'Isolée', exact: true }).click();
  await fillField(page, 'Longueur (côté, ou longueur totale si filante)', '1,2', 'm');
  await fillField(page, 'Largeur', '1,2', 'm');
  await fillField(page, 'Hauteur', '40', 'cm');
  await fillField(page, 'Nombre de semelles identiques', '6');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(page.getByText('Moteur non contre-vérifié')).toBeVisible();

  // 3. Rattachement du calcul au lot.
  await page.goto(`${base}/avant-metre`);
  await page.getByRole('combobox', { name: 'Nœud de rattachement de Semelles S1' }).click();
  await page.getByRole('option', { name: '1 — Fondations' }).click();
  await expect(page.getByText('Semelles S1 rattaché à 1 — Fondations.')).toBeVisible();

  // 4. Quantitatif : quantités reprises de l'avant-métré, sans aucun prix.
  await page.goto(`${base}/quantitatifs`);
  await page.getByLabel('Intitulé').fill('DQE fondations');
  await page.getByRole('button', { name: 'Créer le quantitatif' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'DQE fondations' })).toBeVisible();
  await expect(page.getByText('Quantitatif sans prix')).toBeVisible();
  const concrete = page.getByRole('row', { name: /Semelles S1 — Béton armé/ });
  await expect(concrete).toContainText('3,456');
  // Traçabilité : la ligne mène à la révision qui l'a produite.
  await expect(
    concrete.getByRole('link', { name: 'Calcul « Semelles S1 », révision 1' }),
  ).toHaveAttribute('href', /\/calculs\/[0-9a-f-]{36}\?revision=[0-9a-f-]{36}$/);

  // 5. Prix unitaire saisi : montant exact, arrondi au franc.
  await concrete.getByRole('button', { name: /Actions sur la ligne/ }).click();
  await page.getByRole('menuitem', { name: 'Prix unitaire…' }).click();
  const priceDialog = page.getByRole('dialog', { name: /Prix unitaire de/ });
  await priceDialog.getByLabel(/Prix unitaire/).fill('65 000');
  await priceDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Ligne enregistrée.')).toBeVisible();
  await expect(concrete).toContainText(/224\s640/);
  await expect(page.getByText('Total partiel')).toBeVisible();

  // 6. Quantité retenue, justifiée et affichée à côté de la quantité calculée.
  await concrete.getByRole('button', { name: /Actions sur la ligne/ }).click();
  await page.getByRole('menuitem', { name: 'Quantité retenue…' }).click();
  const overrideDialog = page.getByRole('dialog', { name: /Quantité retenue pour/ });
  await overrideDialog.getByLabel(/Quantité retenue/).fill('3,5');
  await overrideDialog.getByLabel('Justification').fill('Relevé contradictoire sur site');
  await overrideDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(concrete).toContainText('Calculée : 3,456');
  await expect(concrete).toContainText('Relevé contradictoire sur site');
  await expect(concrete).toContainText(/227\s500/);

  // 7. Décomposition en matériaux : ciment cumulé, lié au calcul.
  const materials = page.getByRole('table', { name: 'Matériaux' });
  await expect(materials.getByRole('row', { name: /^Ciment [0-9]/ })).toContainText('Semelles S1');

  // 8. Tableau de bord BTP : le projet, son lot et son quantitatif.
  await page.goto(`/${orgSlug}/btp`);
  await expect(page.getByRole('heading', { level: 1, name: 'BTP / Génie civil' })).toBeVisible();
  await expect(page.getByRole('link', { name: `MET-${stamp} — Centre de santé` })).toBeVisible();
});

test('bibliothèque de prix : article lié à un ouvrage', async ({ page }) => {
  const { orgSlug, priceLibraryId } = fixture();
  await page.goto(`/${orgSlug}/bibliotheque/prix/${priceLibraryId}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Prix Dakar 2026' })).toBeVisible();
  const items = page.getByRole('grid', { name: 'Articles de la bibliothèque' });
  await expect(items).toContainText('GO-01');
  await expect(items).toContainText('Semelles isolées ou filantes — Béton armé');

  await page.getByRole('button', { name: 'Ajouter un article' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvel article' });
  await dialog.getByRole('combobox', { name: 'Ouvrage' }).click();
  await page.getByRole('option', { name: /^Poteaux — Béton armé/ }).click();
  await dialog.getByLabel('Code').fill('GO-02');
  await dialog.getByLabel(/Prix unitaire/).fill('80 000,5');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Article enregistré.')).toBeVisible();
  await expect(items).toContainText('GO-02');
  await expect(items).toContainText('Poteaux — Béton armé');
});
