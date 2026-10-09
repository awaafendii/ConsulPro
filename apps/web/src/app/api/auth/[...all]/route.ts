import { toNextJsHandler } from 'better-auth/next-js';

import { getServer } from '@/server/container';

/** Endpoints d'authentification Better Auth (/api/auth/*). */
export const GET = (request: Request) => toNextJsHandler(getServer().infra.auth).GET(request);
export const POST = (request: Request) => toNextJsHandler(getServer().infra.auth).POST(request);

export const dynamic = 'force-dynamic';
