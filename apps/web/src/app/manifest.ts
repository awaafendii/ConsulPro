import type { MetadataRoute } from 'next';

/**
 * Manifeste de l'application web (PWA). Next l'expose à `/manifest.webmanifest`
 * et injecte automatiquement `<link rel="manifest">`.
 *
 * Couleurs littérales (voir `app/_pwa/icon-mark.tsx`) : le format manifeste
 * n'accepte pas les tokens CSS. `background_color` / `theme_color` reprennent
 * l'ivoire du thème clair, aligné sur `viewport.themeColor` du layout racine.
 */
export const dynamic = 'force-static';

// Next.js exige un export par défaut pour ce fichier de convention.
// eslint-disable-next-line no-restricted-syntax
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ConsulPro',
    short_name: 'ConsulPro',
    description: 'La plateforme métier des professionnels de la construction.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fbf9f6',
    theme_color: '#fbf9f6',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
