/**
 * Critères de sortie de la Phase 2 : zéro violation axe (navigateur réel, contraste compris)
 * en clair ET en sombre, et aucune barre de défilement horizontale de 360 à 1920 px.
 */
import { expect, test } from '@playwright/test';

import { anonymous, fixture } from './fixture';
import { expectAccessible, expectNoHorizontalScroll } from './support';

const WIDTHS = [360, 768, 1280, 1920] as const;
const THEMES = ['light', 'dark'] as const;

const publicPages = [
  { name: 'connexion', path: '/connexion', heading: 'Connexion' },
  { name: 'inscription', path: '/inscription', heading: 'Créer un compte' },
  { name: 'mot de passe oublié', path: '/mot-de-passe-oublie', heading: 'Mot de passe oublié' },
  { name: 'page introuvable', path: '/chemin/qui/n-existe/pas', heading: 'Page introuvable' },
];

const privatePages = () => {
  const { orgSlug } = fixture();
  return [
    { name: 'mes organisations', path: '/organisations', heading: 'Mes organisations' },
    // Organisation inconnue ou dont on n'est pas membre : 404, existence non révélée.
    {
      name: 'organisation inconnue',
      path: '/organisation-inexistante-xyz/tableau-de-bord',
      heading: 'Page introuvable',
    },
    { name: 'tableau de bord', path: `/${orgSlug}/tableau-de-bord`, heading: 'Tableau de bord' },
    { name: 'membres', path: `/${orgSlug}/organisation/membres`, heading: 'Membres' },
    {
      name: 'journal d’audit',
      path: `/${orgSlug}/organisation/journal-audit`,
      heading: 'Journal d’audit',
    },
  ];
};

for (const theme of THEMES) {
  test.describe(`thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme: theme });

    test.describe('pages publiques', () => {
      test.use(anonymous);
      for (const p of publicPages) {
        test(`${p.name} : accessible et sans débordement`, async ({ page }) => {
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(p.path);
            await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
            await expect(page.locator('html')).toHaveClass(
              theme === 'dark' ? /dark/ : /^(?!.*dark)/,
            );
            await expectNoHorizontalScroll(page, `${p.name} @${width}px`);
            if (width === 360 || width === 1280)
              await expectAccessible(page, `${p.name} @${width}px (${theme})`);
          }
        });
      }
    });

    test.describe('pages connectées', () => {
      for (const p of privatePages()) {
        test(`${p.name} : accessible et sans débordement`, async ({ page }) => {
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(p.path);
            await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
            await expectNoHorizontalScroll(page, `${p.name} @${width}px`);
            if (width === 360 || width === 1280)
              await expectAccessible(page, `${p.name} @${width}px (${theme})`);
          }
        });
      }
    });
  });
}
