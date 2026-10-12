'use client';

import type { BtpDashboardDto, SubtotalDto } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@consulpro/ui';
import { Building2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { formatMoney } from '@/lib/decimal';

type Project = BtpDashboardDto['projects'][number];

const link = 'font-medium text-primary underline-offset-4 hover:underline';

export function BtpDashboardView({
  orgSlug,
  dashboard,
}: {
  readonly orgSlug: string;
  readonly dashboard: BtpDashboardDto;
}) {
  const t = useTranslations('btp');
  const tBoq = useTranslations('boq');
  const locale = useLocale();

  if (dashboard.projects.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t('empty')}
        description={t('emptyHint')}
        action={
          <AppLink href={`/${orgSlug}/projets`} className={link}>
            {t('open')}
          </AppLink>
        }
      />
    );
  }

  const amount = (subtotal: SubtotalDto, currency: string) =>
    subtotal.lines > 0 && subtotal.unpriced === subtotal.lines
      ? tBoq('notPriced')
      : formatMoney(subtotal.amount, currency, locale);

  const alerts = (p: Project): string[] => {
    const c = p.calculations;
    return [
      c.obsolete > 0 ? `${t('obsolete')} : ${String(c.obsolete)}` : null,
      c.rejected > 0 ? `${t('rejected')} : ${String(c.rejected)}` : null,
      c.nonCompliant > 0 ? `${t('nonCompliant')} : ${String(c.nonCompliant)}` : null,
      c.withoutResult > 0 ? `${t('withoutResult')} : ${String(c.withoutResult)}` : null,
      c.notComputed > 0 ? `${t('notComputed')} : ${String(c.notComputed)}` : null,
      c.withWarnings > 0 ? `${t('withWarnings')} : ${String(c.withWarnings)}` : null,
      ...p.boqs
        .filter((b) => b.outdated)
        .map((b) => `${b.title} : ${tBoq('outdated').toLowerCase()}`),
    ].filter((a): a is string => a !== null);
  };

  return (
    <div className="space-y-6">
      {dashboard.truncated && <p className="text-sm text-muted-foreground">{t('truncated')}</p>}
      <ul className="grid grid-cols-1 gap-6">
        {dashboard.projects.map((p) => {
          const base = `/${orgSlug}/projets/${p.project.id}`;
          const c = p.calculations;
          const projectAlerts = alerts(p);
          return (
            <li key={p.project.id} className="min-w-0">
              <Card>
                <CardHeader>
                  <h2 className="leading-none font-semibold">
                    <AppLink href={base} className={link}>
                      {`${p.project.code} — ${p.project.name}`}
                    </AppLink>
                  </h2>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <section aria-label={t('calculations')} className="min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold">{t('calculations')}</h3>
                    <p>{t('calculationsTotal', { count: c.total })}</p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">{t('assigned')}</dt>
                      <dd className="text-end tabular-nums">{`${String(c.assigned)} / ${String(c.total)}`}</dd>
                      <dt className="text-muted-foreground">{t('verified')}</dt>
                      <dd className="text-end tabular-nums">{`${String(c.verified)} / ${String(c.total)}`}</dd>
                      <dt className="text-muted-foreground">{t('validated')}</dt>
                      <dd className="text-end tabular-nums">{c.validated}</dd>
                      <dt className="text-muted-foreground">{t('computed')}</dt>
                      <dd className="text-end tabular-nums">{c.computed}</dd>
                    </dl>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t('takeoff')} : </span>
                      <AppLink href={`${base}/avant-metre`} className={link}>
                        {t('takeoffSummary', { lots: p.takeoff.lots, nodes: p.takeoff.nodes })}
                      </AppLink>
                    </p>
                  </section>

                  <section aria-label={t('alerts')} className="min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold">{t('alerts')}</h3>
                    {projectAlerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('noAlert')}</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {projectAlerts.map((alert) => (
                          <li key={alert}>
                            <Badge variant="warning">{alert}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section aria-label={t('boqs')} className="min-w-0 space-y-3">
                    <h3 className="text-sm font-semibold">{t('boqs')}</h3>
                    {p.boqs.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t('noBoq')}</p>
                    )}
                    {p.boqs.map((b) => (
                      <div key={b.id} className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-center justify-between gap-2">
                          <AppLink href={`${base}/quantitatifs/${b.id}`} className={link}>
                            {b.title}
                          </AppLink>
                          <span className="font-semibold tabular-nums">
                            {amount(b.total, b.currency)}
                          </span>
                        </p>
                        {b.lots.length > 0 && (
                          <Table>
                            <TableCaption className="sr-only">{b.title}</TableCaption>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('lot')}</TableHead>
                                <TableHead className="text-end">{tBoq('amount')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {b.lots.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell>{`${l.code} — ${l.title}`}</TableCell>
                                  <TableCell className="text-end tabular-nums">
                                    {l.subtotal.lines === 0 ? '—' : amount(l.subtotal, b.currency)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    ))}
                  </section>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
