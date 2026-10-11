/** Phase 3 — projets et référentiels : parcours réels dans le navigateur. */
import { expect, test } from '@playwright/test';

import { fixture } from './fixture';

test('bibliothèque : consultation d’une version, surcharge d’organisation justifiée', async ({
  page,
}) => {
  const { orgSlug } = fixture();
  await page.goto(`/${orgSlug}/bibliotheque`);
  const standards = page.getByRole('grid', { name: 'Référentiels' });
  await expect(standards.getByText('DEMO', { exact: true })).toBeVisible();
  await standards.getByRole('link', { name: 'Consulter DEMO version 1' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /^DEMO — Référentiel de démonstration/ }),
  ).toBeVisible();

  const parameters = page.getByRole('grid', { name: 'Paramètres de la version' });
  await expect(parameters.getByText('demo.max_area')).toBeVisible();
  await expect(parameters.getByText('À vérifier').first()).toBeVisible();

  const label = 'Surface maximale (démonstration)';
  const existing = parameters.getByRole('button', { name: `Supprimer la surcharge de ${label}` });
  if (await existing.isVisible()) {
    await existing.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(existing).toBeHidden();
  }
  await parameters.getByRole('button', { name: `Surcharger ${label}` }).click();
  const dialog = page.getByRole('dialog', { name: `Surcharger « ${label} »` });
  await dialog.getByLabel(/Nouvelle valeur/).fill('400');
  // Justification obligatoire : l'erreur est annoncée et liée au champ.
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByLabel('Justification')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('Justification').fill('Pratique du bureau pour les dalles');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Surcharge enregistrée.')).toBeVisible();
  await expect(
    parameters.getByText('Pratique du bureau pour les dalles', { exact: false }),
  ).toBeVisible();
});

test('projet : création, référentiel retenu, surcharge de projet, activité, archivage', async ({
  page,
}) => {
  const { orgSlug } = fixture();
  const code = `PONT-${Date.now().toString(36).toUpperCase()}`;

  await page.goto(`/${orgSlug}/projets`);
  await page.getByRole('link', { name: 'Nouveau projet' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nouveau projet' })).toBeVisible();
  // Règles du domaine reprises côté client : métier obligatoire.
  await page.getByLabel('Code du projet').fill(code.toLowerCase());
  await page.getByLabel('Nom', { exact: true }).fill('Pont de Rosso');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByText('Activez au moins un métier.')).toBeVisible();
  await page.getByLabel('BTP / Génie civil').check();
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `${code} — Pont de Rosso` }),
  ).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Sections du projet' });
  await expect(tabs.getByText('Documents')).toHaveAttribute('aria-disabled', 'true');

  // Référentiels : DEMO retenu par défaut ; la surcharge d'organisation s'applique.
  await tabs.getByRole('link', { name: 'Référentiels' }).click();
  const table = page.getByRole('grid', { name: 'Paramètres de DEMO 1' });
  const waste = table.getByRole('row', { name: /Taux de pertes/ });
  await expect(waste.getByText('Référentiel', { exact: true })).toBeVisible();
  await expect(
    table.getByRole('row', { name: /Surface maximale/ }).getByText('Organisation', { exact: true }),
  ).toBeVisible();

  await waste.getByRole('button', { name: 'Surcharger Taux de pertes (démonstration)' }).click();
  const dialog = page.getByRole('dialog', { name: /Surcharger « Taux de pertes/ });
  await dialog.getByLabel(/Nouvelle valeur/).fill('6,5');
  await dialog.getByLabel('Justification').fill('Chantier en zone inondable');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Surcharge enregistrée.')).toBeVisible();
  await expect(waste.getByText('Projet', { exact: true })).toBeVisible();
  await expect(waste.getByText(/6,5/).first()).toBeVisible();

  // Activité : chaque action est tracée, la plus récente en premier.
  await tabs.getByRole('link', { name: 'Activité' }).click();
  const feed = page.getByRole('list').filter({ hasText: 'a créé le projet' });
  await expect(feed.getByRole('listitem').first()).toContainText('a surchargé un paramètre');
  await expect(feed).toContainText('Chantier en zone inondable');

  // Archivage : confirmation, lecture seule, désarchivage.
  await tabs.getByRole('link', { name: 'Paramètres' }).click();
  await page.getByRole('button', { name: 'Archiver le projet' }).click();
  await page
    .getByRole('alertdialog', { name: `Archiver ${code} ?` })
    .getByRole('button', { name: 'Archiver le projet' })
    .click();
  await expect(page.getByText(/Ce projet est archivé/)).toBeVisible();
  await expect(page.getByLabel('Nom', { exact: true })).toBeDisabled();
  await tabs.getByRole('link', { name: 'Référentiels' }).click();
  await expect(page.getByRole('button', { name: /^Surcharger/ })).toHaveCount(0);
  await tabs.getByRole('link', { name: 'Paramètres' }).click();
  await page.getByRole('button', { name: 'Désarchiver le projet' }).click();
  await expect(page.getByText('Projet désarchivé.')).toBeVisible();
  await expect(page.getByLabel('Nom', { exact: true })).toBeEnabled();

  // Liste : le projet figure parmi les projets actifs.
  await page.goto(`/${orgSlug}/projets`);
  await expect(
    page.getByRole('grid', { name: 'Projets' }).getByRole('link', { name: code }),
  ).toBeVisible();
});

test('projet inexistant ou identifiant invalide : page introuvable, non indexée', async ({
  page,
}) => {
  const { orgSlug } = fixture();
  // La page est diffusée en flux (loading.tsx de l'organisation) : le statut HTTP est déjà
  // envoyé quand le projet est cherché. Le contenu et la balise noindex signalent l'absence,
  // sans distinguer un projet inexistant d'un projet inaccessible.
  for (const id of ['pas-un-uuid', '01900000-0000-7000-8000-000000000000']) {
    await page.goto(`/${orgSlug}/projets/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  }
});
