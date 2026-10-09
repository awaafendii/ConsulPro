'use client';

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Kbd, KbdGroup } from '../ui/kbd';
import { displayKeys, isEditableTarget, matchesStep, parseKeys, type KeyStep } from './keys';

export interface Shortcut {
  /** Identifiant unique (un second enregistrement remplace le premier). */
  readonly id: string;
  readonly keys: string;
  readonly description: string;
  /** Rubrique de l'aide (« Navigation », « Général »…). */
  readonly group: string;
  readonly handler: () => void;
  /** Actif même quand le focus est dans un champ de saisie (réservé aux combinaisons avec Ctrl/⌘). */
  readonly allowInInputs?: boolean;
}

interface Registry {
  register(shortcut: Shortcut): () => void;
  list(): readonly Shortcut[];
  subscribe(listener: () => void): () => void;
  openHelp(): void;
}

const ShortcutsContext = createContext<Registry | null>(null);
const SEQUENCE_TIMEOUT_MS = 1000;

function useIsMac(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => /mac|iphone|ipad/i.test(navigator.userAgent),
    () => false,
  );
}

/**
 * Registre global des raccourcis clavier. Un seul écouteur ; les séquences
 * (`g d`) expirent après une seconde. `?` ouvre l'aide qui liste tous les raccourcis.
 */
export function ShortcutsProvider({
  children,
  helpTitle = 'Raccourcis clavier',
}: {
  children: ReactNode;
  helpTitle?: string;
}) {
  const shortcuts = useRef(new Map<string, Shortcut>());
  const listeners = useRef(new Set<() => void>());
  const snapshot = useRef<readonly Shortcut[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const registry = useMemo<Registry>(() => {
    const emit = () => {
      snapshot.current = [...shortcuts.current.values()];
      for (const listener of listeners.current) listener();
    };
    return {
      register(shortcut) {
        shortcuts.current.set(shortcut.id, shortcut);
        emit();
        return () => {
          if (shortcuts.current.get(shortcut.id) === shortcut)
            shortcuts.current.delete(shortcut.id);
          emit();
        };
      },
      list: () => snapshot.current,
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
      openHelp: () => {
        setHelpOpen(true);
      },
    };
  }, []);

  useEffect(() => {
    let pending: { steps: readonly KeyStep[]; shortcut: Shortcut; index: number }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        ['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)
      )
        return;
      const editable = isEditableTarget(event.target);

      // Poursuite d'une séquence en cours.
      const continued = pending.filter(({ steps, index }) => {
        const step = steps[index];
        return step !== undefined && matchesStep(step, event);
      });
      pending = [];
      clearTimeout(timer);
      for (const candidate of continued) {
        if (candidate.index + 1 === candidate.steps.length) {
          event.preventDefault();
          candidate.shortcut.handler();
          return;
        }
        pending.push({ ...candidate, index: candidate.index + 1 });
      }
      if (pending.length > 0) {
        timer = setTimeout(() => (pending = []), SEQUENCE_TIMEOUT_MS);
        return;
      }

      for (const shortcut of shortcuts.current.values()) {
        if (editable && !shortcut.allowInInputs) continue;
        const steps = parseKeys(shortcut.keys);
        const first = steps[0];
        if (!first || !matchesStep(first, event)) continue;
        if (steps.length === 1) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
        pending.push({ steps, shortcut, index: 1 });
      }
      if (pending.length > 0) timer = setTimeout(() => (pending = []), SEQUENCE_TIMEOUT_MS);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, []);

  return (
    <ShortcutsContext.Provider value={registry}>
      {children}
      <HelpShortcut />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} title={helpTitle} />
    </ShortcutsContext.Provider>
  );
}

function HelpShortcut() {
  const registry = useContext(ShortcutsContext);
  useShortcut({
    id: 'help',
    keys: '?',
    description: 'Afficher les raccourcis clavier',
    group: 'Général',
    handler: () => registry?.openHelp(),
  });
  return null;
}

/** Enregistre un raccourci pendant la vie du composant. Le gestionnaire le plus récent est toujours appelé. */
export function useShortcut(shortcut: Shortcut, enabled = true): void {
  const registry = useContext(ShortcutsContext);
  const latest = useRef(shortcut.handler);
  useEffect(() => {
    latest.current = shortcut.handler;
  });
  const { id, keys, description, group, allowInInputs } = shortcut;
  useEffect(() => {
    if (!registry || !enabled) return;
    return registry.register({
      id,
      keys,
      description,
      group,
      allowInInputs: allowInInputs ?? false,
      handler: () => {
        latest.current();
      },
    });
  }, [registry, enabled, id, keys, description, group, allowInInputs]);
}

/** Ouvre l'aide des raccourcis (ex. depuis un menu). */
export function useOpenShortcutsHelp(): () => void {
  const registry = useContext(ShortcutsContext);
  return () => registry?.openHelp();
}

export function ShortcutKeys({ keys }: { keys: string }) {
  const isMac = useIsMac();
  const steps = displayKeys(keys, isMac);
  return (
    <span className="inline-flex items-center gap-1">
      {steps.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-xs text-muted-foreground">puis</span>}
          <KbdGroup>
            {step.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </span>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const registry = useContext(ShortcutsContext);
  const list = useSyncExternalStore(
    (listener) => registry?.subscribe(listener) ?? (() => undefined),
    () => registry?.list() ?? [],
    () => [],
  );
  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of list)
    groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), shortcut]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Les raccourcis à une lettre sont inactifs pendant la saisie dans un champ.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {[...groups.entries()].map(([group, items]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </h3>
              <dl className="divide-y">
                {items.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <dt>{s.description}</dt>
                    <dd>
                      <ShortcutKeys keys={s.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
