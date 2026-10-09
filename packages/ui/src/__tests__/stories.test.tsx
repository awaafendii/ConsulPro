/**
 * Chaque story est rendue et analysée par axe-core : un composant ajouté avec ses
 * stories est automatiquement testé (critère de sortie de la Phase 2).
 */
import { composeStories } from '@storybook/react-vite';
import { act, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, it } from 'vitest';

import { expectNoA11yViolations } from './a11y';

type StoryModule = Parameters<typeof composeStories>[0];

const modules = import.meta.glob<StoryModule>('../stories/*.stories.tsx', { eager: true });

describe.each(Object.entries(modules))('%s', (_file, module) => {
  const stories: [string, ComponentType][] = Object.entries(composeStories(module));
  it.each(stories)('%s : rendu sans violation d’accessibilité', async (_name, Story) => {
    await act(async () => {
      render(<Story />);
      await Promise.resolve();
    });
    await expectNoA11yViolations();
  });
});
