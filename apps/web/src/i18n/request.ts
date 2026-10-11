import { getRequestConfig } from 'next-intl/server';

import { getServer } from '@/server/container';
import { currentUserContext } from '@/server/session';

import messages from '../../messages/fr.json';

/**
 * Textes d'interface centralisés (05-conventions §1). Une seule langue pour l'instant.
 * Fuseau d'affichage : celui choisi par l'utilisateur connecté (page « Mon compte »),
 * sinon celui de l'application (APP_TIME_ZONE). Les dates sont stockées en UTC.
 */
// next-intl exige un export par défaut pour ce fichier.
// eslint-disable-next-line no-restricted-syntax
export default getRequestConfig(async () => {
  const fallback = process.env.APP_TIME_ZONE ?? 'Africa/Abidjan';
  const user = await currentUserContext();
  const prefs = user ? await getServer().infra.app.account.preferences(user) : null;
  return {
    locale: 'fr',
    messages,
    timeZone: prefs?.ok ? prefs.value.effectiveTimeZone : fallback,
  };
});
