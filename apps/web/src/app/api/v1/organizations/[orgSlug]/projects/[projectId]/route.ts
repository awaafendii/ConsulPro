import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('projects.get');
export const PATCH = handlerFor('projects.update');

export const dynamic = 'force-dynamic';
