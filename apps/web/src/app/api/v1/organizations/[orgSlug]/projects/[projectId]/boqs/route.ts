import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('boqs.list');
export const POST = handlerFor('boqs.create');

export const dynamic = 'force-dynamic';
