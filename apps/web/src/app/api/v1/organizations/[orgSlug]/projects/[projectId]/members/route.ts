import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('projectMembers.list');
export const POST = handlerFor('projectMembers.add');

export const dynamic = 'force-dynamic';
