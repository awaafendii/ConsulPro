import { Brand, Button } from '@consulpro/ui';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Page introuvable (y compris une organisation dont on n'est pas membre : existence non révélée). */
export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main
      id="contenu-principal"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Brand className="text-lg" />
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('notFoundDescription')}</p>
      </div>
      <Button asChild>
        <Link href="/organisations">{t('backHome')}</Link>
      </Button>
    </main>
  );
}
