import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('preferences.get');
export const PUT = handlerFor('preferences.update');

export const dynamic = 'force-dynamic';
