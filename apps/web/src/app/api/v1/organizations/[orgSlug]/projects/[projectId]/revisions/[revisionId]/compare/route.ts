import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('revisions.compare');

export const dynamic = 'force-dynamic';
