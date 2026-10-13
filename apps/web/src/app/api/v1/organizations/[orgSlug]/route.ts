import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('organization.get');
export const PATCH = handlerFor('organization.update');

export const dynamic = 'force-dynamic';
