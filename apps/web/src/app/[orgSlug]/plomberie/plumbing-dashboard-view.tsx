'use client';

import type { PlumbingDashboardDto } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  CalculationStatusBadge,
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
import { Droplets } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

type Project = PlumbingDashboardDto['projects'][number];

const link = 'font-medium text-primary underline-offset-4 hover:underline';

export function PlumbingDashboardView({
  orgSlug,
  dashboard,
}: {
  readonly orgSlug: string;
  readonly dashboard: PlumbingDashboardDto;
}) {
  const t = useTranslations('plumbing');
  const format = useFormatter();

  if (dashboard.projects.length === 0) {
    return (
      <EmptyState
        icon={Droplets}
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

  const quantity = (value: number | null, unit: string, digits: number) =>
    value === null
      ? '—'
      : `${format.number(value, { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit === '' ? '' : ` ${unit}`}`;

  const alerts = (p: Project): string[] => {
    const c = p.calculations;
    return [
      c.obsolete > 0 ? `${t('obsolete')} : ${String(c.obsolete)}` : null,
      c.rejected > 0 ? `${t('rejected')} : ${String(c.rejected)}` : null,
      c.nonCompliant > 0 ? `${t('nonCompliant')} : ${String(c.nonCompliant)}` : null,
      c.notComputed > 0 ? `${t('notComputed')} : ${String(c.notComputed)}` : null,
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
                      <dt className="text-muted-foreground">{t('verified')}</dt>
                      <dd className="text-end tabular-nums">{`${String(c.verified)} / ${String(c.total)}`}</dd>
                      <dt className="text-muted-foreground">{t('toVerify')}</dt>
                      <dd className="text-end tabular-nums">{c.toVerify}</dd>
                      <dt className="text-muted-foreground">{t('notComputed')}</dt>
                      <dd className="text-end tabular-nums">{c.notComputed}</dd>
                    </dl>
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
                    {p.nonCompliant.length > 0 && (
                      <>
                        <h4 className="pt-2 text-sm font-semibold">{t('nonCompliantList')}</h4>
                        <ul className="space-y-1 text-sm">
                          {p.nonCompliant.map((n) => (
                            <li key={n.calculationId} className="min-w-0">
                              <AppLink href={`${base}/calculs/${n.calculationId}`} className={link}>
                                {n.title}
                              </AppLink>
                              <span className="text-muted-foreground">{` · ${n.engineTitle}`}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  <section aria-label={t('flows')} className="min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold">{t('flows')}</h3>
                    {p.flows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('noFlow')}</p>
                    ) : (
                      <Table>
                        <TableCaption className="sr-only">{t('flows')}</TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('calculation')}</TableHead>
                            <TableHead className="text-end">{t('fixtures')}</TableHead>
                            <TableHead className="text-end">{t('probableFlow')}</TableHead>
                            <TableHead className="text-end">{t('minPressure')}</TableHead>
                            <TableHead>{t('state')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.flows.map((f) => (
                            <TableRow key={f.calculationId}>
                              <TableCell>
                                <AppLink
                                  href={`${base}/calculs/${f.calculationId}`}
                                  className={link}
                                >
                                  {f.title}
                                </AppLink>
                              </TableCell>
                              <TableCell className="text-end tabular-nums">
                                {quantity(f.fixtureCount, '', 0)}
                              </TableCell>
                              <TableCell className="text-end whitespace-nowrap tabular-nums">
                                {quantity(f.probableFlow, 'L/s', 2)}
                              </TableCell>
                              <TableCell className="text-end whitespace-nowrap tabular-nums">
                                {quantity(f.minPressure, 'kPa', 0)}
                              </TableCell>
                              <TableCell>
                                <span className="flex flex-wrap gap-1">
                                  <CalculationStatusBadge status={f.resultStatus} />
                                  {f.obsolete && <Badge variant="warning">{t('outdated')}</Badge>}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
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
