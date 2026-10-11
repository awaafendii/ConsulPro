'use client';

import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Client d'authentification (même origine : /api/auth). La double authentification est
 * gérée par le formulaire de connexion (réponse `twoFactorRedirect`).
 */
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
