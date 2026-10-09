/** Parcours réels : connexion, validation des formulaires, invitation, confirmation, audit. */
import { expect, test } from '@playwright/test';

import { anonymous, fixture } from './fixture';
import { PASSWORD } from './support';

test.describe('sans session', () => {
  test.use(anonymous);

  test('connexion par le formulaire puis accès à « Mes organisations »', async ({ page }) => {
    const { ownerEmail, orgName } = fixture();
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill(ownerEmail);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/organisations$/);
    await expect(page.getByRole('link', { name: new RegExp(orgName) })).toBeVisible();
  });

  test('erreurs de saisie annoncées et liées aux champs', async ({ page }) => {
    await page.goto('/inscription');
    await page.getByLabel('Nom complet').fill('A');
    await page.getByLabel('Adresse e-mail').fill('pas-une-adresse');
    await page.getByLabel('Mot de passe (12 caractères minimum)').fill('court');
    await page.getByLabel('Confirmer le mot de passe').fill('autre');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    const email = page.getByLabel('Adresse e-mail');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible();
    await expect(
      page.getByText('Le mot de passe doit comporter entre 12 et 128 caractères.'),
    ).toBeVisible();
  });

  test('page privée sans session : redirection vers la connexion', async ({ page }) => {
    await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
    await expect(page).toHaveURL(/\/connexion\?redirect=/);
  });
});

test('invitation : envoi, confirmation de révocation (Échap annule), trace dans l’audit', async ({
  page,
}) => {
  const { orgSlug } = fixture();
  const invitee = `invite.${Date.now().toString(36)}@bet-sahel.test`;
  await page.goto(`/${orgSlug}/organisation/membres`);

  await page.getByLabel('Adresse e-mail').fill(invitee);
  await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await expect(page.getByText(`Invitation envoyée à ${invitee}.`)).toBeVisible();
  const pending = page.getByRole('grid', { name: 'Invitations en attente' });
  await expect(pending.getByText(invitee)).toBeVisible();

  await pending.getByRole('button', { name: `Révoquer ${invitee}` }).click();
  const dialog = page.getByRole('alertdialog', { name: `Révoquer l’invitation de ${invitee} ?` });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(pending.getByText(invitee)).toBeVisible();

  await pending.getByRole('button', { name: `Révoquer ${invitee}` }).click();
  await dialog.getByRole('button', { name: 'Révoquer' }).click();
  await expect(page.getByText(`Invitation de ${invitee} révoquée.`)).toBeVisible();
  await expect(pending.getByText(invitee)).toBeHidden();

  await page.goto(`/${orgSlug}/organisation/journal-audit`);
  const audit = page.getByRole('grid', { name: 'Journal d’audit' });
  await expect(audit.getByText('Invitation révoquée').first()).toBeVisible();
  await expect(audit.getByText('Invitation envoyée').first()).toBeVisible();
});
