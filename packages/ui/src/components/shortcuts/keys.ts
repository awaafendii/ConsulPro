/*
 * Syntaxe des raccourcis : étapes séparées par des espaces, modificateurs par `+`.
 *   'mod+k'  → Ctrl+K (⌘K sur macOS)
 *   '?'      → touche « ? »
 *   'g d'    → G puis D (séquence)
 */

export interface KeyStep {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

export function parseKeys(keys: string): readonly KeyStep[] {
  return keys
    .trim()
    .split(/\s+/)
    .map((step) => {
      const parts = step.split('+');
      const key = (parts.pop() ?? '').toLowerCase();
      return {
        mod: parts.includes('mod'),
        alt: parts.includes('alt'),
        shift: parts.includes('shift'),
        key,
      };
    });
}

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** La touche « ? » s'obtient avec Maj sur la plupart des claviers : Maj n'est exigé que s'il est déclaré. */
export function matchesStep(step: KeyStep, event: KeyEventLike): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (mod !== step.mod || event.altKey !== step.alt) return false;
  if (step.shift && !event.shiftKey) return false;
  return event.key.toLowerCase() === step.key;
}

const LABELS: Readonly<Record<string, string>> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Entrée',
  escape: 'Échap',
};

/** Libellés de touches à afficher, étape par étape. */
export function displayKeys(keys: string, isMac: boolean): readonly (readonly string[])[] {
  return parseKeys(keys).map((step) => {
    const out: string[] = [];
    if (step.mod) out.push(isMac ? '⌘' : 'Ctrl');
    if (step.alt) out.push(isMac ? '⌥' : 'Alt');
    if (step.shift) out.push(isMac ? '⇧' : 'Maj');
    out.push(LABELS[step.key] ?? step.key.toUpperCase());
    return out;
  });
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
