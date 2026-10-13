import { describe, expect, it } from 'vitest';

import { isModuleAvailable, LATEST_DELIVERED_PHASE, MODULES } from '../modules/registry';

describe('registre des modules', () => {
  it('identifiants, chemins et raccourcis uniques', () => {
    const unique = (values: readonly (string | undefined)[]) =>
      new Set(values).size === values.length;
    expect(unique(MODULES.map((m) => m.id))).toBe(true);
    expect(unique(MODULES.map((m) => m.path))).toBe(true);
    expect(unique(MODULES.flatMap((m) => (m.shortcut ? [m.shortcut] : [])))).toBe(true);
  });

  it('chemins d’URL en français sans accents', () => {
    for (const m of MODULES) expect(m.path, m.id).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/);
  });

  it('disponibilité selon la phase livrée', () => {
    const available = MODULES.filter((m) => isModuleAvailable(m)).map((m) => m.id);
    expect(available).toEqual([
      'dashboard',
      'projects',
      'library',
      'btp',
      'electricity',
      'members',
      'audit',
      'settings',
    ]);
    expect(isModuleAvailable({ id: 'x', section: 'workspace', path: 'x', phase: 3 }, 3)).toBe(true);
    expect(LATEST_DELIVERED_PHASE).toBe(5);
  });
});
