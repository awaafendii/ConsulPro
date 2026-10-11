import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('projectOverrides.update');
export const DELETE = handlerFor('projectOverrides.remove');

export const dynamic = 'force-dynamic';
