import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('organizations.list');
export const POST = handlerFor('organizations.create');

export const dynamic = 'force-dynamic';
