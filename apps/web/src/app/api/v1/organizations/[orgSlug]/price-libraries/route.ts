import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('priceLibraries.list');
export const POST = handlerFor('priceLibraries.create');

export const dynamic = 'force-dynamic';
