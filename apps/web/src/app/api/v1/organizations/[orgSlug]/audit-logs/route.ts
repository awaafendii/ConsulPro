import { handlerFor } from '@/server/next-handler';

export const GET = handlerFor('audit.list');

export const dynamic = 'force-dynamic';
