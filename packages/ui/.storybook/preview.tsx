import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import { ConfirmProvider } from '../src/components/feedback/confirm';
import { ShortcutsProvider } from '../src/components/shortcuts/shortcuts';
import { Toaster } from '../src/components/ui/sonner';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // Toute violation axe est une erreur (Phase 2 : zéro violation).
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
  decorators: [
    withThemeByClassName({ themes: { Clair: '', Sombre: 'dark' }, defaultTheme: 'Clair' }),
    (Story) => (
      <TooltipProvider>
        <ShortcutsProvider>
          <ConfirmProvider>
            <Story />
            <Toaster />
          </ConfirmProvider>
        </ShortcutsProvider>
      </TooltipProvider>
    ),
  ],
};

export default preview;
