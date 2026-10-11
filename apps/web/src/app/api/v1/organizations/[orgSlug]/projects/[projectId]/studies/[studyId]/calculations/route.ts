import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('calculations.list');
export const POST = handlerFor('calculations.create');

export const dynamic = 'force-dynamic';
