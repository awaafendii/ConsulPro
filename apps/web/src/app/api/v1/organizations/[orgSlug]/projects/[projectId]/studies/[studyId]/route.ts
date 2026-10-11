import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('studies.get');
export const PATCH = handlerFor('studies.update');

export const dynamic = 'force-dynamic';
