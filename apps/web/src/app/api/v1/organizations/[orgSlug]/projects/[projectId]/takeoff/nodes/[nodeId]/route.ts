import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('takeoffNodes.update');
export const DELETE = handlerFor('takeoffNodes.remove');

export const dynamic = 'force-dynamic';
