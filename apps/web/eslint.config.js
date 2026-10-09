import { base } from '@consulpro/config-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base({ tsconfigRootDir: import.meta.dirname }),
  {
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Conventions Next.js : pages, layouts et fichiers de configuration exportent par défaut.
    files: [
      'src/app/**/page.tsx',
      'src/app/**/layout.tsx',
      'src/app/**/not-found.tsx',
      'src/app/**/error.tsx',
      'src/app/**/loading.tsx',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Les composants n'accèdent jamais directement à la base ni aux moteurs (ADR-0002).
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@consulpro/db', '@prisma/*'],
              message: 'Accès aux données via les services applicatifs uniquement.',
            },
            {
              group: ['@consulpro/calc-*'],
              message: 'Formules interdites dans l’UI (principe P5).',
            },
          ],
        },
      ],
    },
  },
];
