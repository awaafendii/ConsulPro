import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('priceItems.update');
export const DELETE = handlerFor('priceItems.remove');

export const dynamic = 'force-dynamic';
