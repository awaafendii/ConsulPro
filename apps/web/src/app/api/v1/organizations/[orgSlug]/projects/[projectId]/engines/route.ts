import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('engines.list');

export const dynamic = 'force-dynamic';
