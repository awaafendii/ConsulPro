/**
 * Exemples ILLUSTRATIFS pour Storybook et les tests. Aucune portée normative :
 * les paramètres sont volontairement « à vérifier » (docs/architecture/10-moteur-de-calcul.md §6).
 */
import type { CalculationView } from '@consulpro/contracts';

const units = {
  V: 'V',
  m: 'm',
  mm2: 'mm²',
  A: 'A',
  '%': '%',
  'ohm.mm2/m': 'Ω·mm²/m',
  'mohm/m': 'mΩ/m',
};

export const voltageDropExample: CalculationView = {
  engine: {
    id: 'elec.voltage-drop',
    version: '1.0.0',
    title: 'Chute de tension (exemple illustratif)',
  },
  status: 'OK_WITH_WARNINGS',
  preview: false,
  standards: [{ code: 'NFC15-100', version: 'à préciser' }],
  units,
  inputs: [
    { key: 'system', label: 'Réseau', value: 'Monophasé', defaulted: false },
    { key: 'voltage', label: 'Tension simple U₀', value: 230, unit: 'V', defaulted: false },
    { key: 'length', label: 'Longueur du câble L', value: 30, unit: 'm', defaulted: false },
    { key: 'section', label: 'Section S', value: 2.5, unit: 'mm2', defaulted: false },
    { key: 'conductor', label: 'Âme', value: 'Cuivre', defaulted: false },
    { key: 'current', label: 'Courant d’emploi I_B', value: 10, unit: 'A', defaulted: false },
    { key: 'powerFactor', label: 'Facteur de puissance cos φ', value: 1, defaulted: true },
  ],
  hypotheses: [
    {
      code: 'ELEC.STEADY_STATE',
      text: 'Chute de tension calculée en régime permanent, conducteurs à leur température de service.',
      origin: 'ENGINE',
    },
    {
      code: 'DEFAULT.powerFactor',
      text: 'cos φ non renseigné : 1 retenu (terme réactif nul).',
      origin: 'DEFAULT_VALUE',
    },
  ],
  parameters: [
    {
      key: 'elec.conductor.resistivity.cu.service',
      label: 'Résistivité du cuivre en service ρ₁',
      kind: 'SCALAR',
      value: 0.0225,
      unit: 'ohm.mm2/m',
      source: { document: 'NF C 15-100', note: 'Article à citer' },
      verification: 'TO_VERIFY',
      used: true,
    },
    {
      key: 'elec.conductor.reactance.linear',
      label: 'Réactance linéique λ',
      kind: 'SCALAR',
      value: 0.08,
      unit: 'mohm/m',
      source: { document: 'NF C 15-100', note: 'Article à citer' },
      verification: 'TO_VERIFY',
      used: true,
    },
    {
      key: 'elec.voltage_drop.limit.other.public_lv',
      label: 'Limite de chute de tension (autres usages)',
      kind: 'SCALAR',
      value: 5,
      unit: '%',
      source: { document: 'NF C 15-100', table: 'Tableau à citer' },
      verification: 'TO_VERIFY',
      used: true,
    },
  ],
  outputs: [
    { key: 'voltageDrop', label: 'Chute de tension u', value: 5.4, unit: 'V', precision: 2 },
    {
      key: 'voltageDropPercent',
      label: 'Chute de tension relative Δu',
      value: 2.347826,
      unit: '%',
      precision: 2,
    },
  ],
  checks: [
    {
      rule: 'elec.voltage-drop.limit',
      label: 'Chute de tension admissible',
      status: 'PASS',
      severity: 'BLOCKING',
      measured: 2.347826,
      limit: 5,
      comparison: '<=',
      unit: '%',
      clause: 'à préciser',
    },
  ],
  warnings: [
    {
      code: 'PARAMETER_TO_VERIFY',
      severity: 'WARNING',
      origin: 'PARAMETER_TO_VERIFY',
      text: 'Paramètre non vérifié utilisé : elec.conductor.resistivity.cu.service (source : NF C 15-100).',
    },
    {
      code: 'PARAMETER_TO_VERIFY',
      severity: 'WARNING',
      origin: 'PARAMETER_TO_VERIFY',
      text: 'Paramètre non vérifié utilisé : elec.voltage_drop.limit.other.public_lv (source : NF C 15-100).',
    },
  ],
  trace: [
    { id: 'T1', label: 'Coefficient de réseau (monophasé)', formula: 'b = 2', value: 2 },
    {
      id: 'T2',
      label: 'Chute de tension',
      formula:
        'u = b \\left( \\rho_1 \\frac{L}{S} \\cos\\varphi + \\lambda L \\sin\\varphi \\right) I_B',
      substitutions: [
        { symbol: 'ρ₁', value: 0.0225, unit: 'ohm.mm2/m' },
        { symbol: 'L', value: 30, unit: 'm' },
        { symbol: 'S', value: 2.5, unit: 'mm2' },
        { symbol: 'I_B', value: 10, unit: 'A' },
      ],
      value: 5.4,
      unit: 'V',
    },
    {
      id: 'T3',
      label: 'Chute de tension relative',
      formula: '\\Delta u = \\frac{100\\, u}{U_0}',
      value: 2.347826,
      unit: '%',
    },
  ],
  errors: [],
  failure: null,
};

const limitCheck = voltageDropExample.checks[0];
if (!limitCheck) throw new Error('Exemple incomplet : vérification attendue.');

export const nonCompliantExample: CalculationView = {
  ...voltageDropExample,
  status: 'NON_COMPLIANT',
  inputs: voltageDropExample.inputs.map((i) => (i.key === 'length' ? { ...i, value: 75 } : i)),
  outputs: [
    { key: 'voltageDrop', label: 'Chute de tension u', value: 13.5, unit: 'V', precision: 2 },
    {
      key: 'voltageDropPercent',
      label: 'Chute de tension relative Δu',
      value: 5.869565,
      unit: '%',
      precision: 2,
    },
  ],
  checks: [{ ...limitCheck, status: 'FAIL', measured: 5.869565 }],
};

export const invalidExample: CalculationView = {
  ...voltageDropExample,
  status: 'INVALID',
  inputs: [],
  outputs: [],
  checks: [],
  warnings: [],
  trace: [],
  hypotheses: [],
  errors: [
    {
      path: 'length.value',
      code: 'OUT_OF_RANGE',
      message: 'Valeur hors du domaine admissible (en SI : > 0)',
    },
    {
      path: 'section.unit',
      code: 'UNIT_INCOMPATIBLE',
      message: 'Unité « kg » incompatible avec la grandeur area',
    },
  ],
};

export const errorExample: CalculationView = {
  ...voltageDropExample,
  status: 'ERROR',
  outputs: [],
  checks: [],
  failure: {
    code: 'NON_CONVERGENCE',
    message: 'Le calcul itératif n’a pas convergé en 50 itérations.',
  },
};

export const previewExample: CalculationView = { ...voltageDropExample, preview: true };
