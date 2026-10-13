import { err, fromSI, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { designCurrent, SQRT3, tableValue } from '../common/formulas';
import {
  COS_PHI_INPUT,
  cosPhi,
  ELEC_HYPOTHESIS,
  power,
  POWER_INPUT,
  SYSTEM_INPUT,
  systemSchema,
  voltage,
  VOLTAGE_INPUT,
} from '../common/inputs';

/* Courant d'emploi d'un récepteur et bilan de puissance d'une arborescence de tableaux. */

const nonNegative = z.number().nonnegative();

// --- Courant d'emploi ---------------------------------------------------------------------

const designInput = z.object({ power, system: systemSchema, voltage, cosPhi });
const designOutput = z.object({ current: nonNegative, apparentPower: nonNegative });

export const elecDesignCurrent: EngineDefinition<
  z.output<typeof designInput>,
  z.output<typeof designOutput>
> = {
  id: 'elec.design-current',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Courant d’emploi',
  inputSchema: designInput,
  outputSchema: designOutput,
  parameters: [],
  formulas: [
    {
      id: 'design-current',
      label: 'Courant d’emploi',
      latex:
        'I_B = \\frac{P}{V \\cos\\varphi} \\text{ (mono)} ; \\; I_B = \\frac{P}{\\sqrt{3}\\, U \\cos\\varphi} \\text{ (tri)}',
      symbols: [
        { symbol: 'P', meaning: 'puissance active absorbée', unit: 'W' },
        { symbol: 'V', meaning: 'tension entre phase et neutre', unit: 'V' },
        { symbol: 'U', meaning: 'tension entre phases', unit: 'V' },
      ],
      source: 'UTE C 15-105',
    },
  ],
  hypotheses: [ELEC_HYPOTHESIS],
  presentation: {
    description: 'Courant d’emploi I_B et puissance apparente d’un récepteur ou d’un circuit.',
    inputs: [POWER_INPUT, SYSTEM_INPUT, VOLTAGE_INPUT, COS_PHI_INPUT],
    outputs: [
      { key: 'current', label: 'Courant d’emploi I_B', unit: 'A', precision: 2 },
      { key: 'apparentPower', label: 'Puissance apparente', unit: 'kVA', precision: 3 },
    ],
  },
  calculate(i, ctx) {
    const { current, apparent } = designCurrent(ctx, 'T1', {
      power: i.power.si,
      system: i.system,
      voltage: i.voltage.si,
      cosPhi: i.cosPhi.si,
    });
    return ok({ current, apparentPower: fromSI(apparent, 'kVA') });
  },
  verify() {
    return [];
  },
};

// --- Bilan de puissance -------------------------------------------------------------------

const coefficient = z.number().gt(0).lte(1);
const treeRow = z.object({
  code: z.string().min(1),
  parent: z.string().nullable(),
  type: z.enum(['BOARD', 'LOAD']),
  designation: z.string().nullable().optional(),
  power: quantity('power', { min: 0, exclusiveMin: true }).nullable(),
  count: z.number().int().min(1).nullable(),
  ku: coefficient.nullable(),
  cosPhi: coefficient.nullable(),
  ks: coefficient.nullable(),
});
type TreeRow = z.output<typeof treeRow>;

/** Arborescence valide : mêmes règles que le type de données ELEC_BOARD_TREE. */
function checkTree(rows: readonly TreeRow[], ctx: z.RefinementCtx): void {
  const issue = (index: number, field: string, message: string) => {
    ctx.addIssue({
      code: 'custom',
      path: [index, field],
      message,
      params: { code: 'TREE_INVALID' },
    });
  };
  const byCode = new Map<string, TreeRow>();
  rows.forEach((row, index) => {
    if (byCode.has(row.code)) issue(index, 'code', `Repère « ${row.code} » en double.`);
    else byCode.set(row.code, row);
  });
  const roots = rows.filter((r) => !r.parent);
  if (roots.length !== 1 || roots[0]?.type !== 'BOARD') {
    issue(0, 'parent', 'L’arborescence doit avoir un seul tableau d’origine (sans amont).');
  }
  rows.forEach((row, index) => {
    if (row.parent) {
      const upstream = byCode.get(row.parent);
      if (upstream?.type !== 'BOARD') {
        issue(
          index,
          'parent',
          `Tableau amont « ${row.parent} » inconnu ou qui n’est pas un tableau.`,
        );
      }
    }
    if (row.type === 'LOAD' && (row.power === null || row.cosPhi === null)) {
      issue(index, 'power', 'Un départ porte sa puissance et son cos φ.');
    }
    const seen = new Set<string>();
    let code: string | null = row.code;
    while (code) {
      if (seen.has(code)) {
        issue(index, 'parent', 'Boucle dans l’arborescence.');
        break;
      }
      seen.add(code);
      code = byCode.get(code)?.parent ?? null;
    }
  });
}

const balanceInput = z.object({
  tree: z.array(treeRow).min(1).max(2000).superRefine(checkTree),
  system: systemSchema,
  voltage,
});
const balanceOutput = z.object({
  installedPower: nonNegative,
  absorbedPower: nonNegative,
  reactivePower: nonNegative,
  apparentPower: nonNegative,
  powerFactor: z.number().gt(0).lte(1),
  current: nonNegative,
  boards: z.number().int().nonnegative(),
  loads: z.number().int().nonnegative(),
});

export const elecPowerBalance: EngineDefinition<
  z.output<typeof balanceInput>,
  z.output<typeof balanceOutput>
> = {
  id: 'elec.power-balance',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Bilan de puissance',
  inputSchema: balanceInput,
  outputSchema: balanceOutput,
  parameters: [
    {
      key: 'elec.ks.distribution',
      kind: 'TABLE',
      unitKind: 'dimensionless',
      description: 'Coefficient de simultanéité d’un tableau selon le nombre de circuits',
    },
  ],
  formulas: [
    {
      id: 'balance',
      label: 'Bilan par tableau, des départs vers l’origine',
      latex:
        'P_d = n \\, P_u \\, k_u ; \\; Q_d = P_d \\tan\\varphi ; \\; P_T = k_s \\sum P ; \\; Q_T = k_s \\sum Q ; \\; S = \\sqrt{P^2 + Q^2}',
      symbols: [
        { symbol: 'n', meaning: 'nombre de récepteurs identiques' },
        { symbol: 'k_u', meaning: 'coefficient d’utilisation' },
        { symbol: 'k_s', meaning: 'coefficient de simultanéité du tableau' },
      ],
      source: 'UTE C 15-105 (bilan de puissance)',
    },
  ],
  hypotheses: [
    ELEC_HYPOTHESIS,
    {
      code: 'ELEC.BALANCE_ARITHMETIC',
      text: 'Puissances actives et réactives additionnées arithmétiquement à chaque tableau, puis pondérées par son ks.',
    },
  ],
  presentation: {
    description:
      'Puissance installée, puissances absorbées (active, réactive, apparente), cos φ et courant à l’origine, tableau par tableau.',
    inputs: [
      {
        key: 'tree',
        label: 'Tableaux, départs et récepteurs',
        kind: 'dataset',
        datasetKind: 'ELEC_BOARD_TREE',
        help: 'Révision courante du jeu de données choisi ; le calcul garde la trace de la révision lue.',
      },
      { ...SYSTEM_INPUT, label: 'Réseau à l’origine' },
      VOLTAGE_INPUT,
    ],
    outputs: [
      { key: 'installedPower', label: 'Puissance installée', unit: 'kW', precision: 2 },
      { key: 'absorbedPower', label: 'Puissance active absorbée', unit: 'kW', precision: 2 },
      { key: 'reactivePower', label: 'Puissance réactive', unit: 'kvar', precision: 2 },
      { key: 'apparentPower', label: 'Puissance apparente', unit: 'kVA', precision: 2 },
      { key: 'powerFactor', label: 'Facteur de puissance global', unit: '1', precision: 3 },
      { key: 'current', label: 'Courant d’emploi à l’origine', unit: 'A', precision: 1 },
      { key: 'boards', label: 'Tableaux', unit: '1', precision: 0 },
      { key: 'loads', label: 'Départs', unit: '1', precision: 0 },
    ],
  },
  calculate(i, ctx) {
    const rows = i.tree;
    const children = new Map<string, TreeRow[]>();
    for (const row of rows) {
      if (!row.parent) continue;
      children.set(row.parent, [...(children.get(row.parent) ?? []), row]);
    }
    if (rows.some((r) => r.type === 'LOAD' && r.count === null)) {
      ctx.assume.defaulted('tree.count', 1, 'Départ sans nombre de récepteurs : un récepteur.');
    }
    if (rows.some((r) => r.type === 'LOAD' && r.ku === null)) {
      ctx.assume.defaulted(
        'tree.ku',
        1,
        'Départ sans ku : puissance installée entièrement utilisée.',
      );
    }
    let installed = 0;
    let step = 0;
    /** Puissances active et réactive (W, var) d'une ligne, des feuilles vers la racine. */
    const balance = (row: TreeRow): { p: number; q: number } => {
      if (row.type === 'LOAD') {
        // Garanti par le schéma d'entrée : un départ porte puissance et cos φ.
        const unit = row.power?.si ?? 0;
        const cos = row.cosPhi ?? 1;
        const count = row.count ?? 1;
        installed += count * unit;
        const p = count * unit * (row.ku ?? 1);
        return { p, q: (p * Math.sqrt(1 - cos ** 2)) / cos };
      }
      const below = children.get(row.code) ?? [];
      if (below.length === 0) {
        ctx.warn.warn('ELEC.EMPTY_BOARD', `Tableau « ${row.code} » sans départ : puissance nulle.`);
      }
      const sum = below.map(balance).reduce((t, x) => ({ p: t.p + x.p, q: t.q + x.q }), {
        p: 0,
        q: 0,
      });
      const ks =
        row.ks ??
        tableValue(ctx, 'elec.ks.distribution', { circuits: Math.max(1, below.length) }, '1');
      step += 1;
      ctx.trace.step({
        id: `T${String(step)}`,
        label: `Tableau ${row.code}${row.designation ? ` — ${row.designation}` : ''}`,
        formula: 'P_T = k_s \\sum P ; \\; Q_T = k_s \\sum Q',
        substitutions: [
          { symbol: 'n', value: below.length },
          { symbol: 'k_s', value: ks },
          { symbol: '\\sum P', value: fromSI(sum.p, 'kW'), unit: 'kW' },
        ],
        value: fromSI(ks * sum.p, 'kW'),
        unit: 'kW',
        source:
          row.ks === null
            ? 'Référentiel UTE C 15-105 (elec.ks.distribution)'
            : 'ks saisi pour ce tableau',
      });
      return { p: ks * sum.p, q: ks * sum.q };
    };

    const root = rows.find((r) => !r.parent);
    if (!root) return err({ code: 'TREE_WITHOUT_ORIGIN', message: 'Arborescence sans origine.' });
    const total = balance(root);
    const apparent = Math.hypot(total.p, total.q);
    if (apparent === 0) {
      return err({
        code: 'ZERO_POWER',
        message: 'Puissance nulle à l’origine : aucun départ ne porte de puissance.',
      });
    }
    const mono = i.system === 'MONO';
    const current = mono ? apparent / i.voltage.si : apparent / (SQRT3 * i.voltage.si);
    ctx.trace.step({
      id: `T${String(step + 1)}`,
      label: 'Origine de l’installation',
      formula: mono
        ? 'S = \\sqrt{P^2 + Q^2} ; \\; \\cos\\varphi = P / S ; \\; I = S / V'
        : 'S = \\sqrt{P^2 + Q^2} ; \\; \\cos\\varphi = P / S ; \\; I = \\frac{S}{\\sqrt{3}\\, U}',
      substitutions: [
        { symbol: 'P', value: fromSI(total.p, 'kW'), unit: 'kW' },
        { symbol: 'Q', value: fromSI(total.q, 'kvar'), unit: 'kvar' },
        { symbol: mono ? 'V' : 'U', value: i.voltage.si, unit: 'V' },
      ],
      value: current,
      unit: 'A',
    });
    return ok({
      installedPower: fromSI(installed, 'kW'),
      absorbedPower: fromSI(total.p, 'kW'),
      reactivePower: fromSI(total.q, 'kvar'),
      apparentPower: fromSI(apparent, 'kVA'),
      powerFactor: total.p / apparent,
      current,
      boards: rows.filter((r) => r.type === 'BOARD').length,
      loads: rows.filter((r) => r.type === 'LOAD').length,
    });
  },
  verify() {
    return [];
  },
};
