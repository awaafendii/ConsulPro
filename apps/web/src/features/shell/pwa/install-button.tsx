'use client';

import { Button } from '@consulpro/ui';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Événement d'installation PWA (non typé par la lib DOM standard). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Bouton « Installer l'application » dans l'en-tête de la coquille.
 *
 * N'apparaît que lorsque le navigateur propose réellement l'installation
 * (événement `beforeinstallprompt` : Chrome/Edge sur ordinateur, Chrome sur
 * Android). Disparaît une fois l'app installée. Sur iOS/Safari — qui n'émet pas
 * cet événement — le bouton reste masqué : l'installation s'y fait via
 * « Partager » → « Sur l'écran d'accueil ». Aucune UI fictive.
 */
export function InstallButton() {
  const t = useTranslations('pwa');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('install')}
      title={t('install')}
      onClick={() => {
        const event = deferred;
        setDeferred(null);
        void event.prompt();
      }}
    >
      <Download aria-hidden />
    </Button>
  );
}
