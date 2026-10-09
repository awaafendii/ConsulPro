import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClipboardList, FolderKanban, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CalculationReport } from '../components/calculation/calculation-report';
import {
  errorExample,
  invalidExample,
  previewExample,
  voltageDropExample,
} from '../components/calculation/examples';
import { ConfirmProvider, useConfirm } from '../components/feedback/confirm';
import { AppLink, LinkProvider, NavigateProvider } from '../components/navigation/link';
import { AppShell } from '../components/shell/app-shell';
import { initials } from '../components/shell/menus';
import { ShortcutsProvider } from '../components/shortcuts/shortcuts';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  formatAuto,
  formatDate,
  formatDateTime,
  formatNumber,
  unitLabel,
  withUnit,
} from '../lib/format';
import { expectNoA11yViolations } from './a11y';

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

describe('formatage fr-FR', () => {
  it('nombres, unités et dates', () => {
    expect(formatNumber(1234.5, 2)).toBe(`1${NNBSP}234,50`);
    expect(formatAuto(2.347826)).toBe('2,3478');
    expect(formatAuto(Number.NaN)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY, 2)).toBe('—');
    expect(withUnit('5,40', 'V')).toBe(`5,40${NBSP}V`);
    expect(withUnit('2,35', '%')).toBe(`2,35${NNBSP}%`);
    expect(withUnit('3', undefined)).toBe('3');
    expect(unitLabel('mm2', { mm2: 'mm²' })).toBe('mm²');
    expect(unitLabel('kVA', {})).toBe('kVA');
    expect(unitLabel('1', {})).toBeUndefined();
    expect(formatDate('2026-10-08T10:00:00.000Z')).toContain('2026');
    expect(formatDateTime(new Date('2026-10-08T10:00:00.000Z'))).toContain('08/10/2026');
  });

  it('initiales de l’avatar', () => {
    expect(initials('Awa Diop')).toBe('AD');
    expect(initials('Moussa Bakary Traoré')).toBe('MT');
    expect(initials('awa')).toBe('A');
  });
});

describe('confirmation', () => {
  function Demo({ onResult }: { onResult: (ok: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <button
        type="button"
        onClick={() => {
          void confirm({
            title: 'Retirer Moussa ?',
            confirmLabel: 'Retirer',
            tone: 'destructive',
          }).then(onResult);
        }}
      >
        Retirer
      </button>
    );
  }

  it('résout à vrai sur confirmation, à faux sur annulation ou Échap', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Demo onResult={onResult} />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Retirer Moussa ?' });
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    expect(onResult).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(onResult).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(onResult).toHaveBeenLastCalledWith(false);
    expect(onResult).toHaveBeenCalledTimes(3);
  });

  it('useConfirm hors fournisseur : erreur explicite', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Demo onResult={() => undefined} />)).toThrow(/ConfirmProvider/);
    spy.mockRestore();
  });
});

describe('coquille de l’application', () => {
  function renderShell(navigate = vi.fn()) {
    render(
      <TooltipProvider>
        <ShortcutsProvider>
          <NavigateProvider navigate={navigate}>
            <AppShell
              sidebarHeader={<span>BET Sahel</span>}
              sidebarFooter={<span>Awa Diop</span>}
              headerStart={<span>Tableau de bord</span>}
              sections={[
                {
                  id: 'ws',
                  label: 'Espace de travail',
                  items: [
                    {
                      id: 'dashboard',
                      label: 'Tableau de bord',
                      href: '/o/tableau-de-bord',
                      icon: LayoutDashboard,
                      active: true,
                      shortcut: 'g d',
                    },
                    {
                      id: 'projects',
                      label: 'Projets',
                      href: '/o/projets',
                      icon: FolderKanban,
                      disabledReason: 'Disponible en Phase 3',
                    },
                    {
                      id: 'audit',
                      label: 'Journal d’audit',
                      href: '/o/audit',
                      icon: ClipboardList,
                      shortcut: 'g a',
                    },
                  ],
                },
              ]}
            >
              <p>Contenu</p>
            </AppShell>
          </NavigateProvider>
        </ShortcutsProvider>
      </TooltipProvider>,
    );
    return navigate;
  }

  it('lien d’évitement, zone principale unique, page active, module non livré inactif', async () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute(
      'href',
      '#contenu-principal',
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toContainElement(
      screen.getByRole('link', { name: 'Tableau de bord' }),
    );
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: /Projets/ })).not.toBeInTheDocument();
    expect(screen.getByText('Phase 3')).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it('Ctrl+K ouvre la palette ; un module non livré y est inactif ; la sélection navigue', async () => {
    const user = userEvent.setup();
    const navigate = renderShell();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Palette de commandes' });
    expect(within(dialog).getByRole('option', { name: /Projets/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.type(within(dialog).getByRole('combobox'), 'journal');
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/o/audit');
  });

  it('le bouton Rechercher ouvre aussi la palette', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Rechercher (palette de commandes)' }));
    expect(await screen.findByRole('dialog', { name: 'Palette de commandes' })).toBeInTheDocument();
  });

  it('raccourcis de navigation (g a) et Ctrl+B (barre latérale)', async () => {
    const user = userEvent.setup();
    const navigate = renderShell();
    await user.keyboard('ga');
    expect(navigate).toHaveBeenCalledWith('/o/audit');
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await user.keyboard('{Control>}b{/Control}');
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await user.click(screen.getByRole('button', { name: 'Afficher ou masquer la navigation' }));
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
  });

  it('les liens passent par le composant fourni par l’application', () => {
    render(
      <LinkProvider render={({ href, children }) => <a href={`/x${href}`}>{children}</a>}>
        <AppLink href="/a">A</AppLink>
      </LinkProvider>,
    );
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('href', '/x/a');
  });
});

describe('résultat de calcul', () => {
  const headings = () =>
    screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent.replace(/\d+$/, ''));

  it('sections dans l’ordre imposé, hypothèses et avertissements visibles', () => {
    render(<CalculationReport view={voltageDropExample} />);
    expect(headings()).toEqual([
      'Données d’entrée',
      'Hypothèses',
      'Paramètres',
      'Résultats',
      'Vérifications',
      'Avertissements',
    ]);
    expect(screen.getByText('Conforme avec avertissements')).toBeInTheDocument();
    expect(screen.getAllByText('À vérifier')).toHaveLength(3);
    expect(screen.getAllByText('valeur par défaut').length).toBeGreaterThanOrEqual(2);
    // Testing Library normalise les espaces du DOM (espace fine insécable → espace).
    expect(screen.getByText('2,35 %')).toBeInTheDocument();
    expect(screen.getByText('2,3478 % ≤ 5 %')).toBeInTheDocument();
    expect(screen.getByText(/Trace détaillée du calcul \(3 étapes\)/)).toBeInTheDocument();
    // La formule est rendue par KaTeX, avec son équivalent MathML.
    expect(document.querySelector('.katex math')).not.toBeNull();
  });

  it('ERREUR : aucun résultat ni vérification n’est présenté', () => {
    render(<CalculationReport view={errorExample} />);
    expect(screen.getByRole('alert')).toHaveTextContent('NON_CONVERGENCE');
    expect(headings()).not.toContain('Résultats');
    expect(headings()).not.toContain('Vérifications');
  });

  it('DONNÉES INVALIDES : erreurs par champ, aucun résultat', () => {
    render(<CalculationReport view={invalidExample} />);
    expect(screen.getByRole('alert')).toHaveTextContent('length.value');
    expect(headings()).toEqual(['Hypothèses', 'Paramètres', 'Avertissements']);
    expect(screen.getByText('Aucune hypothèse.')).toBeInTheDocument();
    expect(screen.getByText('Aucun avertissement.')).toBeInTheDocument();
  });

  it('APERÇU : mention explicite « non enregistré »', () => {
    render(<CalculationReport view={previewExample} />);
    expect(screen.getByText('Aperçu non enregistré')).toBeInTheDocument();
  });

  it('paramètre surchargé, non utilisé, sans vérification ni paramètre', async () => {
    const view = {
      ...voltageDropExample,
      status: 'OK' as const,
      warnings: [],
      checks: [],
      parameters: [
        {
          ...voltageDropExample.parameters[2]!,
          verification: 'VERIFIED' as const,
          used: false,
          override: {
            referenceValue: 5,
            justification: 'Exigence du maître d’ouvrage.',
            scope: 'PROJECT' as const,
          },
        },
      ],
    };
    const { rerender } = render(<CalculationReport view={view} traceOpen />);
    expect(screen.getByText('Vérifié')).toBeInTheDocument();
    expect(screen.getByText('non utilisé')).toBeInTheDocument();
    expect(screen.getByText(/Surchargé \(projet\)/)).toBeInTheDocument();
    expect(
      screen.getByText('Aucune vérification réglementaire pour ce calcul.'),
    ).toBeInTheDocument();
    await expectNoA11yViolations();
    rerender(<CalculationReport view={{ ...view, parameters: [], standards: [] }} />);
    expect(screen.getByText('Aucun paramètre de référentiel.')).toBeInTheDocument();
  });
});

describe('états interactifs', () => {
  it('bouton en chargement : désactivé et annoncé', async () => {
    const { Button } = await import('../components/ui/button');
    function Demo() {
      const [loading, setLoading] = useState(false);
      return (
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true);
          }}
        >
          Enregistrer
        </Button>
      );
    }
    render(<Demo />);
    const button = screen.getByRole('button', { name: 'Enregistrer' });
    act(() => {
      button.click();
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
