import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('projectOverrides.list');
export const POST = handlerFor('projectOverrides.create');

export const dynamic = 'force-dynamic';
