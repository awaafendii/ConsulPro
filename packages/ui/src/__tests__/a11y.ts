import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Analyse axe-core dans jsdom. Deux règles sont désactivées ici car jsdom ne peut
 * pas les évaluer ou parce qu'un composant isolé n'a pas de page autour :
 * - `color-contrast` : couvert par le test des tokens et par l'E2E navigateur ;
 * - `region` : couvert par l'E2E sur les vraies pages.
 */
export async function expectNoA11yViolations(context: Element = document.body): Promise<void> {
  const results = await axe.run(context, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  const violations = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? '?'}) : ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(violations).toEqual([]);
}
