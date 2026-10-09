import type {
  Check,
  CheckSeverity,
  Comparison,
  Hypothesis,
  TraceStep,
  Warning,
} from '../result/calculation-result';
import type { UnitSymbol } from '../units/registry';

/** Enregistre les étapes de calcul (formule, substitutions, résultat). */
export class TraceRecorder {
  private readonly steps: TraceStep[] = [];
  private readonly ids = new Set<string>();

  step(step: TraceStep): void {
    if (this.ids.has(step.id)) {
      throw new Error(`Étape de trace en double : ${step.id}`);
    }
    this.ids.add(step.id);
    this.steps.push(step);
  }

  all(): readonly TraceStep[] {
    return [...this.steps];
  }
}

/** Enregistre les hypothèses. Toute valeur par défaut appliquée DOIT passer par `defaulted` (P4). */
export class HypothesisRecorder {
  private readonly items: Hypothesis[] = [];

  engine(code: string, text: string): void {
    this.items.push({ code, text, origin: 'ENGINE' });
  }

  defaulted(field: string, value: unknown, text: string): void {
    this.items.push({ code: `DEFAULT.${field}`, text, origin: 'DEFAULT_VALUE', field, value });
  }

  all(): readonly Hypothesis[] {
    return [...this.items];
  }
}

export class WarningRecorder {
  private readonly items: Warning[] = [];

  warn(code: string, text: string, severity: Warning['severity'] = 'WARNING'): void {
    this.items.push({ code, text, severity, origin: 'ENGINE' });
  }

  all(): readonly Warning[] {
    return [...this.items];
  }
}

/** Tolérance relative pour absorber la représentation flottante aux limites. */
const LIMIT_TOLERANCE = 1e-9;

export interface LimitCheck {
  readonly rule: string;
  readonly label: string;
  readonly measured: number;
  readonly limit: number;
  readonly comparison: Comparison;
  readonly severity: CheckSeverity;
  readonly unit?: UnitSymbol;
  readonly clause?: string;
}

/** Compare une valeur à une limite et produit une vérification traçable. */
export function checkLimit(check: LimitCheck): Check {
  const { measured, limit, comparison } = check;
  const tolerance = LIMIT_TOLERANCE * Math.max(1, Math.abs(limit));
  let pass: boolean;
  switch (comparison) {
    case '<=':
      pass = measured <= limit + tolerance;
      break;
    case '<':
      pass = measured < limit;
      break;
    case '>=':
      pass = measured >= limit - tolerance;
      break;
    case '>':
      pass = measured > limit;
      break;
  }
  return { ...check, status: pass ? 'PASS' : 'FAIL' };
}
