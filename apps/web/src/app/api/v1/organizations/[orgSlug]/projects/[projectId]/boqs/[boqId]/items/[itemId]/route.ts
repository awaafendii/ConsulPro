import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('boqItems.update');
export const DELETE = handlerFor('boqItems.remove');

export const dynamic = 'force-dynamic';
