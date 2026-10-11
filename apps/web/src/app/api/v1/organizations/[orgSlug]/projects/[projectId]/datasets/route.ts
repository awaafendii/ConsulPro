import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('datasets.list');
export const POST = handlerFor('datasets.create');

export const dynamic = 'force-dynamic';
