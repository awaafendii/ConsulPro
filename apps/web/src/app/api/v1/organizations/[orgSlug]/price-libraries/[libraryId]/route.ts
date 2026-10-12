import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('priceLibraries.get');
export const PATCH = handlerFor('priceLibraries.update');
export const DELETE = handlerFor('priceLibraries.remove');

export const dynamic = 'force-dynamic';
