'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker (`/sw.js`) pour rendre l'application installable
 * et fournir le repli hors-ligne. Ne rend aucun élément visible.
 *
 * Uniquement en production : en développement, un service worker en cache gêne
 * le rechargement à chaud. Désactivé aussi en environnement de test (`enabled`),
 * où un service worker introduirait du non-déterminisme dans les E2E. Silencieux
 * si le navigateur ne le prend pas en charge.
 */
export function PwaRegister({ enabled = true }: { readonly enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Échec silencieux : l'app reste pleinement fonctionnelle sans PWA.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => {
      window.removeEventListener('load', register);
    };
  }, [enabled]);

  return null;
}
