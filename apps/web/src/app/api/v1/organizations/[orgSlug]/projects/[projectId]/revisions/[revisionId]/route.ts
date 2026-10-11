import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('revisions.get');

export const dynamic = 'force-dynamic';
