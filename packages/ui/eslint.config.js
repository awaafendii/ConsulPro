import { base } from '@consulpro/config-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['storybook-static/**'] },
  ...base({ tsconfigRootDir: import.meta.dirname }),
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Le package est consommé par apps/web, dont l'alias `@/` désigne un autre dossier.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*'], message: 'Imports relatifs uniquement dans packages/ui.' },
            {
              group: [
                '@consulpro/calc-*',
                '@consulpro/db',
                '@consulpro/application',
                '@consulpro/domain',
              ],
              message: 'Le design system ne dépend que des contrats (ADR-0002).',
            },
            {
              group: ['next', 'next/*'],
              message: 'Le design system reste indépendant de Next.js.',
            },
          ],
        },
      ],
    },
  },
  {
    // Stories et configuration Storybook : exports par défaut imposés par le format CSF.
    files: ['**/*.stories.tsx', '.storybook/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
