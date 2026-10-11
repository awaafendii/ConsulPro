/** Double authentification TOTP facultative : activation, connexion en deux étapes. */
import { expect, request, test } from '@playwright/test';

import { anonymous } from './fixture';
import { BASE_URL, lastLinkTo, PASSWORD, totp } from './support';

test.use(anonymous);

test('activation puis connexion avec le code de l’application d’authentification', async ({
  browser,
}) => {
  const email = `deux.facteurs.${Date.now().toString(36)}@bet-sahel.test`;
  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const signUp = await api.post('/api/auth/sign-up/email', {
    data: { email, password: PASSWORD, name: 'Fatou Ndiaye', callbackURL: '/organisations' },
  });
  expect(signUp.ok()).toBe(true);
  await api.get(await lastLinkTo(email, 'Confirmez'));
  const context = await browser.newContext({ storageState: await api.storageState() });
  await api.dispose();
  const page = await context.newPage();

  // Activation : mot de passe, puis code de l'application.
  await page.goto('/compte');
  await expect(page.getByText('Désactivée')).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
  await page.getByRole('button', { name: 'Activer' }).click();
  const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await expect(page.getByRole('img', { name: /Configurer votre application/ })).toBeVisible();
  await page.getByLabel('Code à 6 chiffres').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByText('Double authentification activée.')).toBeVisible();
  await expect(page.getByText('Activée', { exact: true })).toBeVisible();

  // Déconnexion puis connexion : le code est exigé avant l'ouverture de la session.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Vérification en deux étapes')).toBeVisible();
  await page.getByLabel('Code de vérification').fill('000000');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByText('Code invalide.')).toBeVisible();
  await page.getByLabel('Code de vérification').fill(totp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await context.close();
});
