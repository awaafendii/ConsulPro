import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('projectStandards.list');

export const dynamic = 'force-dynamic';
