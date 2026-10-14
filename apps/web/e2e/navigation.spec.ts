/** Clavier, palette Ctrl+K, raccourcis, navigation mobile et registre des modules. */
import { MODULES, isModuleAvailable } from '@consulpro/domain';
import { expect, test } from '@playwright/test';

import { fixture } from './fixture';

test('lien d’évitement : premier élément atteint au clavier, il mène au contenu', async ({
  page,
}) => {
  await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu principal' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenu-principal$/);
});

test('Ctrl+K : palette, recherche et navigation au clavier', async ({ page }) => {
  await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Palette de commandes' });
  await expect(palette).toBeVisible();
  // Plomberie : livrée en Phase 6 ; Topographie : module de la Phase 7, affiché inactif.
  await expect(palette.getByRole('option', { name: /Plomberie/ })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(palette.getByRole('option', { name: /Topographie/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.type('membres');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/organisation\/membres$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Membres' })).toBeVisible();
});

test('raccourcis : « g a », « g d » et aide « ? »', async ({ page }) => {
  await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('a');
  await expect(page).toHaveURL(/journal-audit$/);
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/tableau-de-bord$/);
  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: 'Raccourcis clavier' });
  await expect(help).toContainText('Ouvrir la palette de commandes');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('mobile (360 px) : navigation dans un panneau ouvert depuis l’en-tête', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
  const panel = page.getByRole('dialog', { name: 'Navigation' });
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Afficher ou masquer la navigation' }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('link', { name: 'Membres' }).click();
  await expect(page).toHaveURL(/organisation\/membres$/);
  // Le panneau se referme après la navigation.
  await expect(panel).toBeHidden();
});

test('registre des modules : chaque module disponible mène à une page existante, les autres sont inactifs', async ({
  page,
}) => {
  const { orgSlug } = fixture();
  for (const mod of MODULES) {
    if (isModuleAvailable(mod)) {
      const response = await page.goto(`/${orgSlug}/${mod.path}`);
      expect(response?.status(), mod.id).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), mod.id).toBeVisible();
    }
  }
  await page.goto(`/${orgSlug}/tableau-de-bord`);
  const nav = page
    .getByRole('navigation', { name: 'Navigation principale' })
    .or(page.locator('[data-slot="sidebar"]'));
  for (const mod of MODULES.filter((m) => !isModuleAvailable(m))) {
    await expect(nav.getByText(`Phase ${mod.phase}`).first()).toBeVisible();
  }
});

test('thème : le choix « Sombre » s’applique et persiste', async ({ page }) => {
  await page.goto(`/${fixture().orgSlug}/tableau-de-bord`);
  await page.getByRole('button', { name: 'Thème d’affichage' }).click();
  await page.getByRole('menuitemradio', { name: 'Sombre' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});
