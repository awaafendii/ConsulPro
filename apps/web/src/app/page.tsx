import { redirect } from 'next/navigation';

import { currentUserContext } from '@/server/session';

export default async function Home() {
  redirect((await currentUserContext()) ? '/organisations' : '/connexion');
}
