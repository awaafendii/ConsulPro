/**
 * Critères de sortie de la Phase 2 : zéro violation axe (navigateur réel, contraste compris)
 * en clair ET en sombre, et aucune barre de défilement horizontale de 360 à 1920 px.
 */
import { expect, test } from '@playwright/test';

import { anonymous, fixture } from './fixture';
import { expectAccessible, expectNoHorizontalScroll } from './support';

const WIDTHS = [360, 768, 1280, 1920] as const;
const THEMES = ['light', 'dark'] as const;

const publicPages: { name: string; path: string; heading: string | RegExp }[] = [
  { name: 'connexion', path: '/connexion', heading: 'Connexion' },
  { name: 'inscription', path: '/inscription', heading: 'Créer un compte' },
  { name: 'mot de passe oublié', path: '/mot-de-passe-oublie', heading: 'Mot de passe oublié' },
  { name: 'page introuvable', path: '/chemin/qui/n-existe/pas', heading: 'Page introuvable' },
];

const privatePages = () => {
  const {
    orgSlug,
    projectId,
    projectCode,
    demoVersionId,
    studyId,
    calculationId,
    datasetId,
    boqId,
    priceLibraryId,
  } = fixture();
  const project = `/${orgSlug}/projets/${projectId}`;
  const projectHeading = `${projectCode} — Immeuble R+3 Plateau`;
  return [
    { name: 'projets', path: `/${orgSlug}/projets`, heading: 'Projets' },
    { name: 'nouveau projet', path: `/${orgSlug}/projets/nouveau`, heading: 'Nouveau projet' },
    { name: 'projet', path: project, heading: projectHeading },
    { name: 'membres du projet', path: `${project}/membres`, heading: projectHeading },
    { name: 'référentiels du projet', path: `${project}/referentiels`, heading: projectHeading },
    { name: 'activité du projet', path: `${project}/activite`, heading: projectHeading },
    { name: 'paramètres du projet', path: `${project}/parametres`, heading: projectHeading },
    { name: 'études', path: `${project}/etudes`, heading: projectHeading },
    { name: 'étude', path: `${project}/etudes/${studyId}`, heading: projectHeading },
    { name: 'calcul', path: `${project}/calculs/${calculationId}`, heading: projectHeading },
    { name: 'données', path: `${project}/donnees`, heading: projectHeading },
    { name: 'jeu de données', path: `${project}/donnees/${datasetId}`, heading: projectHeading },
    { name: 'avant-métré', path: `${project}/avant-metre`, heading: projectHeading },
    { name: 'quantitatifs', path: `${project}/quantitatifs`, heading: projectHeading },
    { name: 'quantitatif', path: `${project}/quantitatifs/${boqId}`, heading: projectHeading },
    { name: 'tableau de bord BTP', path: `/${orgSlug}/btp`, heading: 'BTP / Génie civil' },
    {
      name: 'prix unitaires',
      path: `/${orgSlug}/bibliotheque/prix`,
      heading: 'Bibliothèque technique',
    },
    {
      name: 'bibliothèque de prix',
      path: `/${orgSlug}/bibliotheque/prix/${priceLibraryId}`,
      heading: 'Bibliothèque technique',
    },
    { name: 'recherche', path: `/${orgSlug}/recherche?q=immeuble`, heading: 'Recherche' },
    { name: 'mon compte', path: '/compte', heading: 'Mon compte' },
    { name: 'bibliothèque', path: `/${orgSlug}/bibliotheque`, heading: 'Bibliothèque technique' },
    {
      name: 'version de référentiel',
      path: `/${orgSlug}/bibliotheque/${demoVersionId}`,
      heading: /^DEMO — /,
    },
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
