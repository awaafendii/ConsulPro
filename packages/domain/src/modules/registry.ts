/**
 * Registre des modules (docs/architecture/03-modules.md §1) : source unique de la
 * navigation et de la palette Ctrl+K. Un module dont la phase n'est pas livrée est
 * affiché inactif avec la mention « Disponible en Phase N » (principe P7).
 *
 * À chaque phase terminée, relever LATEST_DELIVERED_PHASE ; un test E2E vérifie que
 * chaque module disponible mène à une page qui existe.
 */
export const LATEST_DELIVERED_PHASE = 2;

export type ModuleSection = 'workspace' | 'trades' | 'organization';

export interface ModuleDescriptor {
  readonly id: string;
  readonly section: ModuleSection;
  /** Segment d'URL sous /[orgSlug]/ (français, sans accents). */
  readonly path: string;
  /** Phase de livraison. */
  readonly phase: number;
  /** Raccourci de navigation (séquence clavier), le cas échéant. */
  readonly shortcut?: string;
  /** Permission requise pour voir le module (sinon visible de tout membre). */
  readonly permission?: 'audit.read';
}

export const MODULES: readonly ModuleDescriptor[] = [
  { id: 'dashboard', section: 'workspace', path: 'tableau-de-bord', phase: 1, shortcut: 'g d' },
  { id: 'projects', section: 'workspace', path: 'projets', phase: 3, shortcut: 'g p' },
  { id: 'library', section: 'workspace', path: 'bibliotheque', phase: 3, shortcut: 'g b' },
  { id: 'btp', section: 'trades', path: 'btp', phase: 4 },
  { id: 'electricity', section: 'trades', path: 'electricite', phase: 5 },
  { id: 'plumbing', section: 'trades', path: 'plomberie', phase: 6 },
  { id: 'topography', section: 'trades', path: 'topographie', phase: 7 },
  {
    id: 'members',
    section: 'organization',
    path: 'organisation/membres',
    phase: 1,
    shortcut: 'g m',
  },
  {
    id: 'audit',
    section: 'organization',
    path: 'organisation/journal-audit',
    phase: 1,
    shortcut: 'g a',
    permission: 'audit.read',
  },
];

export function isModuleAvailable(
  module: ModuleDescriptor,
  deliveredPhase = LATEST_DELIVERED_PHASE,
): boolean {
  return module.phase <= deliveredPhase;
}
