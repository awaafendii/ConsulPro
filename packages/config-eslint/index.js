// Configuration ESLint partagée (flat config).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Règles communes à tous les packages TypeScript.
 * @param {{ tsconfigRootDir: string }} options
 */
export function base({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: ['**/dist/**', '**/coverage/**', '**/src/generated/**', '**/.next/**'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message: 'Exports nommés uniquement (voir docs/architecture/05-conventions.md).',
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/__tests__/**'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        // Les faux (in-memory) implémentent des ports asynchrones sans attendre quoi que ce soit.
        '@typescript-eslint/require-await': 'off',
      },
    },
    prettier,
  );
}

const forbiddenInEngines = [
  { name: 'Date', message: 'Moteur pur : pas d’horloge (principe P2).' },
  { name: 'fetch', message: 'Moteur pur : pas d’entrée-sortie (principe P2).' },
  { name: 'process', message: 'Moteur pur : pas d’accès à l’environnement (principe P2).' },
  { name: 'console', message: 'Moteur pur : utiliser la trace, pas la console.' },
  { name: 'setTimeout', message: 'Moteur pur : pas de minuterie.' },
  { name: 'setInterval', message: 'Moteur pur : pas de minuterie.' },
  { name: 'performance', message: 'Moteur pur : pas d’horloge.' },
  { name: 'crypto', message: 'Moteur pur : pas d’aléa.' },
];

/**
 * Restrictions des moteurs de calcul (calc-core, calc-*) : déterminisme garanti.
 * Les fichiers de test en sont exemptés.
 */
export const pureEngine = [
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    rules: {
      'no-restricted-globals': ['error', ...forbiddenInEngines],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Moteur pur : pas d’aléa (principe P2).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'net'],
              message: 'Moteur pur : aucun module Node.js.',
            },
          ],
        },
      ],
    },
  },
];
