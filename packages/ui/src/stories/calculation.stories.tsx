import type { Meta, StoryObj } from '@storybook/react-vite';

import { CalculationReport } from '../components/calculation/calculation-report';
import {
  errorExample,
  invalidExample,
  nonCompliantExample,
  previewExample,
  voltageDropExample,
} from '../components/calculation/examples';
import { Formula } from '../components/calculation/formula';
import { CalculationStatusBadge } from '../components/calculation/status';

/**
 * Affichage d'un résultat de calcul. EXEMPLES ILLUSTRATIFS : les paramètres sont
 * « à vérifier » et n'ont aucune portée normative.
 */
const meta: Meta<typeof CalculationReport> = {
  title: 'Calculs/Résultat',
  component: CalculationReport,
};
export default meta;
type Story = StoryObj<typeof CalculationReport>;

export const AvecAvertissements: Story = { args: { view: voltageDropExample, traceOpen: true } };
export const NonConforme: Story = { args: { view: nonCompliantExample } };
export const DonneesInvalides: Story = { args: { view: invalidExample } };
export const ErreurDeCalcul: Story = { args: { view: errorExample } };
export const Apercu: Story = { args: { view: previewExample } };

export const Statuts: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <CalculationStatusBadge status="OK" />
      <CalculationStatusBadge status="OK_WITH_WARNINGS" />
      <CalculationStatusBadge status="NON_COMPLIANT" />
      <CalculationStatusBadge status="INVALID" />
      <CalculationStatusBadge status="ERROR" />
    </div>
  ),
};

export const Formules: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <Formula
        display
        latex="u = b \left( \rho_1 \frac{L}{S} \cos\varphi + \lambda L \sin\varphi \right) I_B"
      />
      <Formula display latex="I_B = \frac{P}{\sqrt{3}\, U \cos\varphi}" />
    </div>
  ),
};
