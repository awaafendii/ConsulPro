'use client';

import { createAuthClient } from 'better-auth/react';

/** Client d'authentification (même origine : /api/auth). */
export const authClient = createAuthClient();
