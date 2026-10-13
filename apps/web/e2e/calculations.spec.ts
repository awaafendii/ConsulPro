/**
 * Critère de sortie de la Phase 3 (07-roadmap.md) : créer un projet → inviter un membre →
 * créer une étude → calculer (moteur de démonstration) → valider → vérifier par un autre
 * utilisateur. Deux navigateurs : le propriétaire (auteur) et l'ingénieur invité (vérificateur).
 */
import { expect, request, test, type Browser, type Page } from '@playwright/test';

import { fixture } from './fixture';
import { BASE_URL, lastLinkTo, PASSWORD } from './support';

/** Compte réel (inscription + vérification par e-mail) dans un navigateur séparé. */
async function signedInContext(browser: Browser, email: string, name: string) {
  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const signUp = await api.post('/api/auth/sign-up/email', {
    data: { email, password: PASSWORD, name, callbackURL: '/organisations' },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const verify = await api.get(await lastLinkTo(email, 'Confirmez'));
  expect(verify.status()).toBeLessThan(400);
  const context = await browser.newContext({ storageState: await api.storageState() });
  await api.dispose();
  return context;
}

async function fillQuantity(page: Page, label: string, value: string, unit?: string) {
  const group = page.getByRole('group', { name: label });
  await group.getByRole('textbox', { name: label }).fill(value);
  if (unit) {
    await group.getByRole('combobox', { name: `Unité de ${label}` }).click();
    await page.getByRole('option', { name: unit, exact: true }).click();
  }
}

test('parcours complet : projet, invitation, étude, calcul, validation, vérification par un tiers', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { orgSlug } = fixture();
  const stamp = Date.now().toString(36);
  const code = `CALC-${stamp.toUpperCase()}`;
  const engineerEmail = `ingenieur.${stamp}@bet-sahel.test`;

  // 1. Projet.
  await page.goto(`/${orgSlug}/projets/nouveau`);
  await page.getByLabel('Code du projet').fill(code);
  await page.getByLabel('Nom', { exact: true }).fill('Groupe scolaire');
  await page.getByLabel('BTP / Génie civil').check();
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `${code} — Groupe scolaire` }),
  ).toBeVisible();
  const projectUrl = page.url();

  // 2. Invitation d'un ingénieur, acceptée dans son propre navigateur.
  const engineer = await signedInContext(browser, engineerEmail, 'Moussa Traoré');
  await page.goto(`/${orgSlug}/organisation/membres`);
  await page.getByLabel('Adresse e-mail').fill(engineerEmail);
  await page.getByRole('combobox', { name: 'Rôle' }).click();
  await page.getByRole('option', { name: 'Ingénieur' }).click();
  await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await expect(page.getByText(`Invitation envoyée à ${engineerEmail}.`)).toBeVisible();
  const enginePage = await engineer.newPage();
  await enginePage.goto(await lastLinkTo(engineerEmail, 'Invitation'));
  await enginePage.getByRole('button', { name: 'Accepter l’invitation' }).click();
  await expect(enginePage).toHaveURL(new RegExp(`/${orgSlug}/`));

  // Affectation au projet (un ingénieur n'accède qu'aux projets dont il est membre).
  await page.goto(`${projectUrl}/membres`);
  await page.getByRole('combobox', { name: 'Membre de l’organisation' }).click();
  await page.getByRole('option', { name: new RegExp(engineerEmail) }).click();
  await page.getByRole('button', { name: 'Affecter' }).click();
  await expect(page.getByText('Moussa Traoré a été affecté au projet.')).toBeVisible();

  // 3. Étude.
  await page.goto(`${projectUrl}/etudes`);
  await page.getByLabel('Intitulé').fill('Dalles du bâtiment A');
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  await expect(page.getByRole('heading', { name: 'Dalles du bâtiment A' })).toBeVisible();

  // 4. Calcul avec le moteur de démonstration, exécuté par le serveur.
  await page.getByLabel('Intitulé du calcul').fill('Dalle haute R+1');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /volume de béton d’une dalle/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await expect(page.getByRole('heading', { name: 'Dalle haute R+1' })).toBeVisible();
  // Entrée refusée : aucune révision, erreur liée au champ.
  await fillQuantity(page, 'Longueur', '10');
  await fillQuantity(page, 'Largeur', '5');
  await fillQuantity(page, 'Épaisseur', '900');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(
    page.getByRole('group', { name: 'Épaisseur' }).getByText(/hors du domaine/),
  ).toBeVisible();
  await fillQuantity(page, 'Épaisseur', '20');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  const report = page.getByRole('article', { name: /Résultat : Démonstration/ });
  await expect(report).toContainText('Moteur de démonstration : résultat sans valeur technique');
  await expect(report).toContainText('Paramètre non vérifié utilisé');

  // 5. Validation par l'auteur.
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Révision validée : les vérificateurs sont notifiés.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vérifier' })).toHaveCount(0);
  const calculationUrl = page.url();

  // 6. Vérification par l'ingénieur invité, prévenu par une notification.
  await enginePage.goto(`/${orgSlug}/tableau-de-bord`);
  await enginePage.getByRole('button', { name: /Notifications \(1 non lue\)/ }).click();
  await enginePage.getByRole('button', { name: /Calcul à vérifier : Dalle haute R\+1/ }).click();
  await expect(enginePage).toHaveURL(calculationUrl.split('?')[0] ?? calculationUrl);
  await enginePage.getByRole('button', { name: 'Vérifier' }).click();
  const verify = enginePage.getByRole('dialog', { name: 'Vérifier la révision 1' });
  await verify.getByLabel('Commentaire').fill('Conforme aux hypothèses de démonstration.');
  await verify.getByRole('button', { name: 'Approuver' }).click();
  await expect(enginePage.getByText('Révision vérifiée.')).toBeVisible();
  await expect(
    enginePage.getByText('Vérification approuvée par Moussa Traoré', { exact: false }),
  ).toBeVisible();

  // L'auteur est notifié ; l'historique et l'audit gardent la trace.
  await page.reload();
  await expect(page.getByRole('button', { name: /Notifications \(1 non lue\)/ })).toBeVisible();
  await expect(page.getByText('Validation approuvée par Awa Diop', { exact: false })).toBeVisible();
  await page.goto(`/${orgSlug}/organisation/journal-audit`);
  const audit = page.getByRole('grid', { name: 'Journal d’audit' });
  await expect(audit.getByText('Calcul vérifié').first()).toBeVisible();
  await engineer.close();
});

test('révisions : recalcul, comparaison, dépendance et obsolescence', async ({ page }) => {
  const { orgSlug, projectId } = fixture();
  const base = `/${orgSlug}/projets/${projectId}`;
  await page.goto(`${base}/etudes`);
  await page.getByLabel('Intitulé').fill(`Étude ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Créer l’étude' }).click();
  const studyUrl = await page.waitForURL(/\/etudes\/[0-9a-f-]{36}$/).then(() => page.url());

  // Calcul source.
  await page.getByLabel('Intitulé du calcul').fill('Volume source');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /volume de béton d’une dalle/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  await fillQuantity(page, 'Longueur', '10');
  await fillQuantity(page, 'Largeur', '5');
  await fillQuantity(page, 'Épaisseur', '20');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  const sourceUrl = page.url();

  // Calcul aval : la masse reprend le volume avec pertes du calcul source.
  await page.goto(studyUrl);
  await page.getByLabel('Intitulé du calcul').fill('Masse liée');
  await page.getByRole('combobox', { name: 'Moteur de calcul' }).click();
  await page.getByRole('option', { name: /masse d’un volume/ }).click();
  await page.getByRole('button', { name: 'Créer le calcul' }).click();
  const volume = page.getByRole('group', { name: 'Volume' });
  await volume.getByRole('radio', { name: 'Sortie d’un autre calcul' }).click();
  await volume.getByRole('combobox', { name: 'Calcul repris pour Volume' }).click();
  await page.getByRole('option', { name: /Volume source — Volume avec pertes/ }).click();
  await fillQuantity(page, 'Masse volumique', '2,4', 't/m³');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(
    page.getByText(/volume : sortie « volumeWithWaste » de « Volume source »/),
  ).toBeVisible();
  const massUrl = page.url();

  // Recalcul de la source : révision 2, comparaison, aval signalé obsolète.
  await page.goto(sourceUrl);
  await fillQuantity(page, 'Longueur', '12');
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByText('Révision 2 enregistrée.')).toBeVisible();
  await page.getByRole('button', { name: 'Comparer' }).click();
  const diff = page.getByRole('grid', { name: 'Différences entre révisions' });
  await expect(diff.getByText('length.value')).toBeVisible();
  await expect(diff.getByText('volumeWithWaste')).toBeVisible();

  await page.goto(massUrl);
  await expect(page.getByText(/repris par ce calcul a changé depuis/)).toBeVisible();
  await page.goto(studyUrl);
  await expect(
    page.getByRole('grid', { name: 'Calculs de l’étude' }).getByText('Obsolète'),
  ).toBeVisible();
});

test('données de projet : saisie tabulaire, révision immuable, erreurs ligne par ligne', async ({
  page,
}) => {
  const { orgSlug, projectId } = fixture();
  await page.goto(`/${orgSlug}/projets/${projectId}/donnees`);
  await page.getByLabel('Intitulé').fill(`Pièces ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Créer' }).click();
  await page.waitForURL(/\/donnees\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click();
  await page.getByLabel('Surface, ligne 1').fill('24,5');
  await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await expect(page.getByText('Ligne 1 — Pièce : valeur obligatoire.')).toBeVisible();
  await page.getByLabel('Pièce, ligne 1').fill('Séjour');
  await page.getByLabel('Note de révision (facultatif)').fill('Relevé du 9 octobre');
  await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await expect(page.getByText('Révision 1 enregistrée.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Révision 1 — 1 lignes/ })).toBeVisible();
});

test('recherche globale et page « Mon compte »', async ({ page }) => {
  const { orgSlug, projectCode } = fixture();
  await page.goto(`/${orgSlug}/tableau-de-bord`);
  await page.getByRole('link', { name: 'Rechercher' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill(projectCode.toLowerCase());
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(projectCode) })).toBeVisible();

  await page.goto('/compte');
  await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Fuseau horaire' }).click();
  await page.getByRole('option', { name: 'Africa/Dakar' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fuseau horaire enregistré.')).toBeVisible();
  await expect(page.getByText('Désactivée')).toBeVisible();
});
