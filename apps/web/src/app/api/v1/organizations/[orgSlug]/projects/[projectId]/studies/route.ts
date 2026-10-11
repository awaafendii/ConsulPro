import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('studies.list');
export const POST = handlerFor('studies.create');

export const dynamic = 'force-dynamic';
