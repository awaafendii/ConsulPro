import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Certains tests (tokens) s'exécutent sans DOM : les bouchons ne s'appliquent qu'avec jsdom.
if (typeof window !== 'undefined') {
  afterEach(() => {
    cleanup();
  });

  // jsdom n'implémente pas ces API utilisées par Radix UI et cmdk, bien que les types DOM les déclarent.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/unbound-method */
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  /* eslint-enable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/unbound-method */
}

// Décorateurs et paramètres de Storybook appliqués aux stories rendues dans les tests.
if (typeof window !== 'undefined') {
  const { setProjectAnnotations } = await import('@storybook/react-vite');
  const preview = await import('./.storybook/preview');
  setProjectAnnotations([preview.default]);
}
