import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  displayKeys,
  isEditableTarget,
  matchesStep,
  parseKeys,
} from '../components/shortcuts/keys';
import {
  ShortcutKeys,
  ShortcutsProvider,
  useOpenShortcutsHelp,
  useShortcut,
} from '../components/shortcuts/shortcuts';

const event = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('syntaxe des raccourcis', () => {
  it('analyse combinaisons et séquences', () => {
    expect(parseKeys('mod+k')).toEqual([{ mod: true, alt: false, shift: false, key: 'k' }]);
    expect(parseKeys('g d').map((s) => s.key)).toEqual(['g', 'd']);
    expect(parseKeys('alt+shift+P')[0]).toEqual({ mod: false, alt: true, shift: true, key: 'p' });
  });

  it('Ctrl et ⌘ sont équivalents ; Maj n’est exigé que s’il est déclaré', () => {
    const [modK] = parseKeys('mod+k');
    expect(matchesStep(modK!, event('k', { ctrlKey: true }))).toBe(true);
    expect(matchesStep(modK!, event('K', { metaKey: true }))).toBe(true);
    expect(matchesStep(modK!, event('k'))).toBe(false);
    const [question] = parseKeys('?');
    expect(matchesStep(question!, event('?', { shiftKey: true }))).toBe(true);
    const [shiftP] = parseKeys('shift+p');
    expect(matchesStep(shiftP!, event('p'))).toBe(false);
    const [alt] = parseKeys('alt+x');
    expect(matchesStep(alt!, event('x'))).toBe(false);
  });

  it('libellés selon la plateforme', () => {
    expect(displayKeys('mod+k', false)).toEqual([['Ctrl', 'K']]);
    expect(displayKeys('mod+alt+shift+enter', true)).toEqual([['⌘', '⌥', '⇧', 'Entrée']]);
    expect(displayKeys('g d', false)).toEqual([['G'], ['D']]);
    expect(displayKeys('alt+shift+arrowup', false)).toEqual([['Alt', 'Maj', '↑']]);
  });

  it('détecte les cibles de saisie', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

function Harness({ onPalette, onGoto }: { onPalette: () => void; onGoto: () => void }) {
  useShortcut({
    id: 'p',
    keys: 'mod+k',
    description: 'Palette',
    group: 'Général',
    allowInInputs: true,
    handler: onPalette,
  });
  useShortcut({
    id: 'g',
    keys: 'g d',
    description: 'Aller au tableau de bord',
    group: 'Navigation',
    handler: onGoto,
  });
  const openHelp = useOpenShortcutsHelp();
  return (
    <>
      <label htmlFor="champ">Champ</label>
      <input id="champ" />
      <button type="button" onClick={openHelp}>
        Aide
      </button>
    </>
  );
}

describe('registre des raccourcis', () => {
  it('déclenche combinaisons et séquences ; ignore les lettres dans un champ', async () => {
    const user = userEvent.setup();
    const onPalette = vi.fn();
    const onGoto = vi.fn();
    render(
      <ShortcutsProvider>
        <Harness onPalette={onPalette} onGoto={onGoto} />
      </ShortcutsProvider>,
    );
    await user.keyboard('{Control>}k{/Control}');
    expect(onPalette).toHaveBeenCalledTimes(1);

    await user.keyboard('gd');
    expect(onGoto).toHaveBeenCalledTimes(1);

    await user.keyboard('gx');
    expect(onGoto).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText('Champ'));
    await user.keyboard('gd');
    expect(onGoto).toHaveBeenCalledTimes(1);
    await user.keyboard('{Control>}k{/Control}');
    expect(onPalette).toHaveBeenCalledTimes(2);
  });

  it('une séquence expire après une seconde', () => {
    vi.useFakeTimers();
    const onGoto = vi.fn();
    render(
      <ShortcutsProvider>
        <Harness onPalette={() => undefined} onGoto={onGoto} />
      </ShortcutsProvider>,
    );
    const press = (key: string) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    };
    press('g');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    press('d');
    expect(onGoto).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('« ? » ouvre l’aide qui liste les raccourcis enregistrés', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutsProvider>
        <Harness onPalette={() => undefined} onGoto={() => undefined} />
      </ShortcutsProvider>,
    );
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Raccourcis clavier' });
    expect(dialog).toHaveTextContent('Aller au tableau de bord');
    expect(dialog).toHaveTextContent('Afficher les raccourcis clavier');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Aide' }));
    expect(await screen.findByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
  });

  it('le désenregistrement retire le raccourci', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    function Toggle() {
      const [on, setOn] = useState(true);
      useShortcut({ id: 'x', keys: 'x', description: 'X', group: 'G', handler }, on);
      return (
        <button
          type="button"
          onClick={() => {
            setOn(false);
          }}
        >
          Désactiver
        </button>
      );
    }
    render(
      <ShortcutsProvider>
        <Toggle />
      </ShortcutsProvider>,
    );
    await user.keyboard('x');
    await user.click(screen.getByRole('button', { name: 'Désactiver' }));
    await user.keyboard('x');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('affiche les touches', () => {
    render(<ShortcutKeys keys="g d" />);
    expect(screen.getByText('puis')).toBeInTheDocument();
  });
});
