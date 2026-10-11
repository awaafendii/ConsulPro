import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('notifications.list');

export const dynamic = 'force-dynamic';
