import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('invitations.list');
export const POST = handlerFor('invitations.create');

export const dynamic = 'force-dynamic';
