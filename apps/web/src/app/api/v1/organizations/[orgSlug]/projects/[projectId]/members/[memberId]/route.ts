import { handlerFor } from '@/server/next-handler';

export const PATCH = handlerFor('projectMembers.update');
export const DELETE = handlerFor('projectMembers.remove');

export const dynamic = 'force-dynamic';
