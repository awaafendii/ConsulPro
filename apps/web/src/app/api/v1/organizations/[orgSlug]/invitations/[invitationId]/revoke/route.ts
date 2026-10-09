import { handlerFor } from '@/server/next-handler';

export const POST = handlerFor('invitations.revoke');

export const dynamic = 'force-dynamic';
