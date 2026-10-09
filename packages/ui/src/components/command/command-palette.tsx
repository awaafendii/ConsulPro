'use client';

import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';

import { ShortcutKeys } from '../shortcuts/shortcuts';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

export interface CommandEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  /** Termes supplémentaires pris en compte par la recherche. */
  readonly keywords?: readonly string[];
  /** Raccourci affiché en regard (ex. `g d`). */
  readonly shortcut?: string;
  /** Raison de l'indisponibilité (ex. « Disponible en Phase 3 ») : l'entrée est affichée, inactive. */
  readonly disabledReason?: string;
  readonly onSelect: () => void;
}

export interface CommandSection {
  readonly heading: string;
  readonly entries: readonly CommandEntry[];
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sections: readonly CommandSection[];
  readonly placeholder?: string;
  readonly emptyLabel?: string;
}

/** Palette de commandes (Ctrl+K) : navigation et actions, filtrées au clavier. */
export function CommandPalette({
  open,
  onOpenChange,
  sections,
  placeholder = 'Rechercher une page ou une action…',
  emptyLabel = 'Aucun résultat.',
}: CommandPaletteProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Palette de commandes"
      description={placeholder}
    >
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {/* Pas de séparateur : role="separator" est interdit dans un listbox ; les intitulés de groupe suffisent. */}
        {sections.map((section) => (
          <Fragment key={section.heading}>
            <CommandGroup heading={section.heading}>
              {section.entries.map(
                ({ id, label, icon: Icon, keywords, shortcut, disabledReason, onSelect }) => (
                  <CommandItem
                    key={id}
                    value={`${label} ${id}`}
                    keywords={keywords ? [...keywords] : []}
                    disabled={disabledReason !== undefined}
                    onSelect={() => {
                      onOpenChange(false);
                      onSelect();
                    }}
                  >
                    {Icon && <Icon aria-hidden />}
                    <span>{label}</span>
                    {disabledReason && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {disabledReason}
                      </span>
                    )}
                    {shortcut && !disabledReason && (
                      <span className="ml-auto">
                        <ShortcutKeys keys={shortcut} />
                      </span>
                    )}
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
