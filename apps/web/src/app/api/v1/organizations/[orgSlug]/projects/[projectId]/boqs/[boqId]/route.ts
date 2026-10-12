import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('boqs.get');
export const PATCH = handlerFor('boqs.update');
export const DELETE = handlerFor('boqs.remove');

export const dynamic = 'force-dynamic';
