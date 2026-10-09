/**
 * Règles de dépendances entre couches (docs/architecture/04-dependances.md §2, ADR-0002).
 * Exécution : `pnpm depcruise`. Toute violation fait échouer la CI.
 */
const NODE_BUILTINS = { dependencyTypes: ['core'] };

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Aucune dépendance circulaire.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'calc-core-is-pure',
      severity: 'error',
      comment: 'calc-core ne dépend d’aucun autre package interne ni de Node.js (principe P2).',
      from: { path: '^packages/calc-core/src', pathNot: '__tests__' },
      to: { path: '^(packages/(?!calc-core/)|apps/)' },
    },
    {
      name: 'calc-core-no-node',
      severity: 'error',
      comment: 'Moteurs purs : aucun module Node.js.',
      from: { path: '^packages/calc-[^/]+/src', pathNot: '__tests__' },
      to: NODE_BUILTINS,
    },
    {
      name: 'engines-depend-on-core-only',
      severity: 'error',
      comment: 'Un moteur métier ne dépend que de calc-core.',
      from: { path: '^packages/calc-(?!core/)[^/]+/src' },
      to: { path: '^(packages/(?!calc-core/)|apps/)' },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'Le domaine ne dépend que de calc-core.',
      from: { path: '^packages/domain/src', pathNot: '__tests__' },
      to: { path: '^(packages/(?!(domain|calc-core)/)|apps/)' },
    },
    {
      name: 'contracts-standalone',
      severity: 'error',
      comment: 'Les contrats ne dépendent d’aucun package interne.',
      from: { path: '^packages/contracts/src' },
      to: { path: '^(packages/(?!contracts/)|apps/)' },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment:
        'L’application ne connaît ni la base, ni l’infrastructure, ni Next.js (ports et adaptateurs).',
      from: { path: '^packages/application/src' },
      to: {
        path: '^(packages/(infrastructure|db|test-utils)/|apps/|node_modules/(next|react|@prisma|pg|better-auth)/)',
      },
    },
    {
      name: 'packages-not-apps',
      severity: 'error',
      comment: 'Un package ne dépend jamais d’une application.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'ui-no-data-access',
      severity: 'error',
      comment:
        'Les composants n’accèdent ni à la base ni aux moteurs (P5) : ils passent par l’API ou les services.',
      from: { path: '^apps/web/src/(app|components|features)/.*\\.tsx$' },
      to: { path: '^(packages/(db|calc-[^/]+|infrastructure)/|node_modules/(@prisma|pg)/)' },
    },
    {
      name: 'design-system-isolated',
      severity: 'error',
      comment:
        'Le design system ne dépend que des contrats (types d’API) : ni domaine, ni moteurs, ni base, ni Next.js.',
      from: { path: '^packages/ui/(src|\\.storybook)/' },
      to: {
        path: '^(packages/(?!(ui|contracts)/)|apps/|node_modules/(next|@prisma|pg|better-auth)/)',
      },
    },
    {
      name: 'tests-utils-only-in-tests',
      severity: 'error',
      comment: 'test-utils ne sert qu’aux tests.',
      from: { pathNot: '(^packages/test-utils/|__tests__|\\.test\\.ts$|vitest\\.)' },
      to: { path: '^packages/test-utils/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'Tout import doit être résolu (un package interne non déclaré en dépendance est refusé).',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(\\.next|/generated/|/coverage/|/dist/|storybook-static|playwright-report|test-results|next-env\\.d\\.ts)',
    },
    tsPreCompilationDeps: true,
    // Résolution de l'alias `@/` de apps/web.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
