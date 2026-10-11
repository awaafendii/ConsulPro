import { handlerFor } from '@/server/next-handler';

export const POST = handlerFor('projects.unarchive');

export const dynamic = 'force-dynamic';
