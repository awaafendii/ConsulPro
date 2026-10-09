import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('members.list');

export const dynamic = 'force-dynamic';
