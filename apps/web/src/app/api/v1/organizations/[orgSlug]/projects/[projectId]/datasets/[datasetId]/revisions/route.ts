import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('datasets.revisions');
export const POST = handlerFor('datasets.saveRevision');

export const dynamic = 'force-dynamic';
