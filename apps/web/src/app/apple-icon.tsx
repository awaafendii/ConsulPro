import { APPLE, renderIcon } from './_pwa/icon-mark';

// Icône d'écran d'accueil iOS (convention Next : <link rel="apple-touch-icon">).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Next.js exige un export par défaut pour ce fichier de convention.
// eslint-disable-next-line no-restricted-syntax
export default function AppleIcon() {
  return renderIcon(180, APPLE);
}
