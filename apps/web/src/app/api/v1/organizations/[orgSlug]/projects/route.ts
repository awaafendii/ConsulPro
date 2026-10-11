import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('projects.list');
export const POST = handlerFor('projects.create');

export const dynamic = 'force-dynamic';
