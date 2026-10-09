import { getRequestConfig } from 'next-intl/server';

import messages from '../../messages/fr.json';

/**
 * Textes d'interface centralisés (05-conventions §1). Une seule langue pour l'instant ;
 * le fuseau d'affichage par défaut est configurable, en attendant la préférence
 * par utilisateur (Phase 3).
 */
// next-intl exige un export par défaut pour ce fichier.
// eslint-disable-next-line no-restricted-syntax
export default getRequestConfig(() => ({
  locale: 'fr',
  messages,
  timeZone: process.env.APP_TIME_ZONE ?? 'Africa/Abidjan',
}));
