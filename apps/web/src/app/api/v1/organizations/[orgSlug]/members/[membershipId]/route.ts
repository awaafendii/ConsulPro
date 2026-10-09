import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('members.update');
export const DELETE = handlerFor('members.remove');

export const dynamic = 'force-dynamic';
