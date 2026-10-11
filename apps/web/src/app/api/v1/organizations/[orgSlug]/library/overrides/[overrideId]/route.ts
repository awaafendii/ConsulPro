import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('orgOverrides.update');
export const DELETE = handlerFor('orgOverrides.remove');

export const dynamic = 'force-dynamic';
