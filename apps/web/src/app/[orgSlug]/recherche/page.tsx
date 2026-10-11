import {
  AppLink,
  Badge,
  Button,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Section,
} from '@consulpro/ui';
import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { requireOrganization } from '@/server/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('search'))('title') };
}

/** Recherche globale : projets, études et calculs accessibles (formulaire GET, sans script). */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgSlug } = await params;
  const { q = '' } = await searchParams;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('search');
  const text = q.trim().slice(0, 100);
  const result = text.length >= 2 ? await getServer().infra.app.account.search(ctx, text) : null;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <form
        role="search"
        method="get"
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="search-q">{t('label')}</Label>
          <Input
            id="search-q"
            name="q"
            type="search"
            defaultValue={text}
            placeholder={t('placeholder')}
            minLength={2}
            maxLength={100}
          />
        </div>
        <Button type="submit">
          <Search aria-hidden />
          {t('submit')}
        </Button>
      </form>
      {text.length > 0 && text.length < 2 && (
        <p className="text-sm text-muted-foreground">{t('minLength')}</p>
      )}
      {result && !result.ok && (
        <ErrorState message={result.error.message} requestId={ctx.meta.requestId} />
      )}
      {result?.ok && (
        <Section title={t('results', { count: result.value.length })}>
          {result.value.length > 0 && (
            <ul className="divide-y">
              {result.value.map((hit) => (
                <li
                  key={`${hit.type}-${hit.id}`}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Badge variant="outline">{t(`types.${hit.type}`)}</Badge>
                  <AppLink
                    href={hit.href}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {hit.title}
                  </AppLink>
                  {hit.subtitle && (
                    <span className="text-sm text-muted-foreground">{hit.subtitle}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
