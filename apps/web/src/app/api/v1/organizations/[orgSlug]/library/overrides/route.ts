import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('orgOverrides.list');
export const POST = handlerFor('orgOverrides.create');

export const dynamic = 'force-dynamic';
