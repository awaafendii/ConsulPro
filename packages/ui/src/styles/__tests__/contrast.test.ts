// @vitest-environment node
/**
 * Contrastes WCAG 2.2 AA des tokens, lus directement dans globals.css.
 * Texte : ≥ 4,5:1 (1.4.3). Contours de composants et indicateur de focus : ≥ 3:1 (1.4.11).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../globals.css', import.meta.url)), 'utf8');

function tokens(selector: ':root' | '.dark'): Map<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const block = CSS.slice(start, CSS.indexOf('}', start));
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*(oklch\([^)]+\))/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

const light = tokens(':root');
const dark = new Map([...light, ...tokens('.dark')]);

/** [premier plan, arrière-plan, ratio minimal] */
const TEXT = 4.5;
const UI = 3;
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['foreground', 'background', TEXT],
  ['card-foreground', 'card', TEXT],
  ['popover-foreground', 'popover', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['primary', 'background', TEXT],
  ['primary', 'card', TEXT],
  ['secondary-foreground', 'secondary', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'card', TEXT],
  ['muted-foreground', 'muted', TEXT],
  ['accent-foreground', 'accent', TEXT],
  ['destructive-foreground', 'destructive', TEXT],
  ['destructive-subtle-foreground', 'destructive-subtle', TEXT],
  ['destructive', 'background', TEXT],
  ['success-foreground', 'success', TEXT],
  ['success-subtle-foreground', 'success-subtle', TEXT],
  ['warning-foreground', 'warning', TEXT],
  ['warning-subtle-foreground', 'warning-subtle', TEXT],
  ['info-foreground', 'info', TEXT],
  ['info-subtle-foreground', 'info-subtle', TEXT],
  ['sidebar-foreground', 'sidebar', TEXT],
  ['sidebar-accent-foreground', 'sidebar-accent', TEXT],
  ['sidebar-primary-foreground', 'sidebar-primary', TEXT],
  ['input', 'background', UI],
  ['input', 'card', UI],
  ['ring', 'background', UI],
  ['ring', 'card', UI],
  ['sidebar-ring', 'sidebar', UI],
];

describe.each([
  ['clair', light],
  ['sombre', dark],
] as const)('thème %s', (_name, theme) => {
  it.each(PAIRS)('%s sur %s ≥ %d:1', (fg, bg, min) => {
    const a = parse(theme.get(fg) ?? '');
    const b = parse(theme.get(bg) ?? '');
    expect(a, `token --${fg} introuvable ou illisible`).toBeDefined();
    expect(b, `token --${bg} introuvable ou illisible`).toBeDefined();
    const ratio = wcagContrast(a!, b!);
    expect(ratio, `--${fg} / --${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});

it('le thème sombre redéfinit toutes les couleurs du thème clair', () => {
  const darkOnly = tokens('.dark');
  const colors = [...light.keys()];
  expect(colors.filter((k) => !darkOnly.has(k))).toEqual([]);
});
