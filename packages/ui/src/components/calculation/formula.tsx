import katex from 'katex';

import { cn } from '../../lib/utils';

export interface FormulaProps {
  /** Formule LaTeX issue des métadonnées du moteur (jamais d'une saisie utilisateur). */
  readonly latex: string;
  readonly display?: boolean;
  readonly className?: string | undefined;
}

/**
 * Rendu KaTeX. La sortie inclut le MathML, lu par les lecteurs d'écran.
 * `trust: false` interdit les commandes LaTeX qui produiraient des liens ou du HTML.
 */
export function Formula({ latex, display = false, className }: FormulaProps) {
  const html = katex.renderToString(latex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
  });
  return (
    <span
      className={cn('formula overflow-x-auto', display && 'block', className)}
      // Contenu produit par KaTeX à partir d'une formule de confiance (métadonnées du moteur).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
