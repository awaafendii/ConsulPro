import { renderIcon, STANDARD } from './_pwa/icon-mark';

// Icône d'application / favicon (convention Next : injectée dans <head>).
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

// Next.js exige un export par défaut pour ce fichier de convention.
// eslint-disable-next-line no-restricted-syntax
export default function Icon() {
  return renderIcon(512, STANDARD);
}
