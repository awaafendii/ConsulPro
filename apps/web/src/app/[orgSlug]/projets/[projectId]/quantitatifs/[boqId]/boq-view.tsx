'use client';

import type {
  ApplyPricesResultDto,
  BoqDto,
  BoqGroupDto,
  BoqItemDto,
  BoqPresentationDto,
  BoqSyncResultDto,
  CurrencyDto,
  MaterialRowDto,
  PriceLibraryDto,
} from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Button,
  Callout,
  CalculationStatusBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  useConfirm,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Plus, RefreshCw, Tags } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';

import { WorkflowBadge } from '@/features/calculations/workflow-badge';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatQuantity, formatUnitPrice } from '@/lib/decimal';

import {
  ApplyPricesDialog,
  BoqSettingsDialog,
  LineDialog,
  OverrideDialog,
  PriceDialog,
  type LineDialogState,
  type LineValues,
} from './boq-dialogs';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canManage: boolean;
  readonly boq: BoqDto;
  readonly materials: readonly MaterialRowDto[];
  readonly libraries: readonly PriceLibraryDto[];
}

export function BoqView({ orgSlug, projectId, canManage, boq, materials, libraries }: Props) {
  const t = useTranslations('boq');
  const tUnits = useTranslations('units');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const confirm = useConfirm();
  const [priceFor, setPriceFor] = useState<BoqItemDto | null>(null);
  const [overrideFor, setOverrideFor] = useState<BoqItemDto | null>(null);
  const [lineDialog, setLineDialog] = useState<LineDialogState | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const api_ = `/organizations/${orgSlug}/projects/${projectId}/boqs/${boq.id}`;
  const page = `/${orgSlug}/projets/${projectId}`;
  const currency: CurrencyDto = boq.currency;
  const unit = (u: string) => (tUnits.has(u as never) ? tUnits(u as never) : u);
  const money = (value: string) => formatMoney(value, currency, locale);

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };
  /** Appel d'API qui rafraîchit la page ; l'erreur est signalée puis relancée (boîte ouverte). */
  const mutate = async (run: () => Promise<unknown>, success?: string) => {
    try {
      await run();
      if (success) toast.success(success);
      router.refresh();
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  };

  const sync = useMutation({
    mutationFn: () => api<BoqSyncResultDto>(`${api_}/sync`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.success(
        t('synced', { added: result.added, updated: result.updated, removed: result.removed }),
      );
      router.refresh();
    },
    onError,
  });

  const removeLine = useMutation({
    mutationFn: (item: BoqItemDto) =>
      api(`${api_}/items/${item.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${String(item.version)}"` },
      }),
    onSuccess: () => {
      toast.success(t('lineDeleted'));
      router.refresh();
    },
    onError,
  });

  const removeBoq = useMutation({
    mutationFn: () =>
      api(api_, { method: 'DELETE', headers: { 'if-match': `"${String(boq.version)}"` } }),
    onSuccess: () => {
      toast.success(t('deleted'));
      router.push(`${page}/quantitatifs`);
    },
    onError,
  });

  const patchItem = (item: BoqItemDto, json: Record<string, unknown>) =>
    mutate(
      () =>
        api(`${api_}/items/${item.id}`, {
          method: 'PATCH',
          json,
          headers: { 'if-match': `"${String(item.version)}"` },
        }),
      t('lineSaved'),
    );

  const saveLine = (values: LineValues) =>
    lineDialog?.mode === 'edit'
      ? patchItem(lineDialog.item, {
          designation: values.designation,
          unit: values.unit,
          quantity: values.quantity,
          unitPrice: values.unitPrice,
        })
      : mutate(() => api(`${api_}/items`, { method: 'POST', json: values }), t('lineSaved'));

  const pending = boq.pending.add + boq.pending.update + boq.pending.remove;
  const aggregated = boq.presentation === 'AGGREGATED';
  const groupOf = new Map<string, BoqGroupDto>(
    aggregated ? boq.groups.flatMap((g) => g.itemIds.map((id) => [id, g] as const)) : [],
  );
  const setPresentation = (presentation: BoqPresentationDto) =>
    mutate(
      () =>
        api(api_, {
          method: 'PATCH',
          json: { presentation },
          headers: { 'if-match': `"${String(boq.version)}"` },
        }),
      t('saved'),
    );
  const unverified = boq.items.some((i) => i.source && !i.source.engineVerified);
  const allUnpriced = boq.items.length > 0 && boq.total.unpriced === boq.items.length;
  const currencyLocked = boq.items.some((i) => i.unitPrice !== null);
  const columns = canManage ? 7 : 6;

  return (
    <>
      <div className="mb-4">
        <AppLink
          href={`${page}/quantitatifs`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('backToList')}
        </AppLink>
      </div>
      <Section
        title={boq.title}
        description={t('header', { currency, lines: t('lines', { count: boq.items.length }) })}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={pending > 0 ? 'default' : 'outline'}
                loading={sync.isPending}
                onClick={() => {
                  sync.mutate();
                }}
              >
                <RefreshCw aria-hidden />
                {t('sync')}
              </Button>
              {boq.nodes.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setLineDialog({ mode: 'create' });
                  }}
                >
                  <Plus aria-hidden />
                  {t('addLine')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setApplyOpen(true);
                }}
              >
                <Tags aria-hidden />
                {t('applyPrices')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('settingsTitle')}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setSettingsOpen(true);
                    }}
                  >
                    {t('settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      void confirm({
                        title: t('deleteTitle', { title: boq.title }),
                        description: t('deleteDescription'),
                        confirmLabel: t('deleteBoq'),
                        tone: 'destructive',
                      }).then((ok) => {
                        if (ok) removeBoq.mutate();
                      });
                    }}
                  >
                    {t('deleteBoq')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : undefined
        }
      >
        <div className="mb-6 space-y-3">
          {pending > 0 && (
            <Callout tone="warning" title={t('pendingTitle')}>
              {t('pending', boq.pending)}
            </Callout>
          )}
          {unverified && (
            <Callout tone="warning" title={t('unverifiedTitle')}>
              {t('unverified')}
            </Callout>
          )}
          {allUnpriced && (
            <Callout tone="info" title={t('noPriceTitle')}>
              {t('noPrice')}
            </Callout>
          )}
          {!allUnpriced && boq.total.unpriced > 0 && (
            <Callout tone="info" title={t('partialTitle')}>
              {t('partial', { count: boq.total.unpriced })}
            </Callout>
          )}
        </div>

        {boq.groups.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Label htmlFor="boq-presentation">{t('presentation')}</Label>
            <Select
              value={boq.presentation}
              disabled={!canManage}
              onValueChange={(value) => {
                if (value === 'DETAILED' || value === 'AGGREGATED') void setPresentation(value);
              }}
            >
              <SelectTrigger id="boq-presentation" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DETAILED">{t('presentationDetailed')}</SelectItem>
                <SelectItem value="AGGREGATED">{t('presentationAggregated')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="w-full text-sm text-muted-foreground">{t('presentationHelp')}</p>
          </div>
        )}

        <Table>
          <TableCaption className="sr-only">{t('table')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t('number')}</TableHead>
              <TableHead>{t('designation')}</TableHead>
              <TableHead className="w-14">{t('unit')}</TableHead>
              <TableHead className="text-end">{t('quantity')}</TableHead>
              <TableHead className="text-end">{t('unitPrice')}</TableHead>
              <TableHead className="text-end">{t('amount')}</TableHead>
              {canManage && (
                <TableHead className="w-12">
                  <span className="sr-only">{t('rowActions', { number: '' })}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {boq.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns} className="text-muted-foreground">
                  {t('noLines')}
                </TableCell>
              </TableRow>
            )}
            {boq.items.length > 0 &&
              boq.nodes.map((node) => {
                const items = boq.items.filter((i) => i.nodeId === node.id);
                if (node.subtotal.lines === 0) return null;
                return (
                  <Fragment key={node.id}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell className="font-mono text-sm font-semibold">{node.code}</TableCell>
                      <TableCell
                        colSpan={4}
                        className="font-semibold"
                        style={{ paddingInlineStart: `${String(0.5 + node.depth)}rem` }}
                      >
                        {node.title}
                        {node.subtotal.unpriced > 0 &&
                          node.subtotal.unpriced < node.subtotal.lines && (
                            <span className="ms-2 text-sm font-normal text-muted-foreground">
                              {t('unpricedCount', { count: node.subtotal.unpriced })}
                            </span>
                          )}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {node.subtotal.unpriced < node.subtotal.lines
                          ? money(node.subtotal.amount)
                          : '—'}
                      </TableCell>
                      {canManage && <TableCell />}
                    </TableRow>
                    {rowsOf(items, groupOf).map((row, index) => {
                      const number = `${node.code}.${String(index + 1)}`;
                      if (row.kind === 'group') {
                        const group = row.group;
                        return (
                          <TableRow key={group.key}>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {number}
                            </TableCell>
                            <TableCell className="min-w-56">
                              <div className="font-medium">{group.designation}</div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {t('groupedLines', { count: group.lines })}
                                {group.unpriced > 0 && group.unpriced < group.lines
                                  ? ` · ${t('unpricedCount', { count: group.unpriced })}`
                                  : ''}
                              </p>
                            </TableCell>
                            <TableCell>{unit(group.unit)}</TableCell>
                            <TableCell className="text-end tabular-nums">
                              {formatQuantity(group.quantity, locale)}
                            </TableCell>
                            <TableCell className="text-end tabular-nums">—</TableCell>
                            <TableCell className="text-end tabular-nums">
                              {group.amount !== null ? money(group.amount) : '—'}
                            </TableCell>
                            {canManage && <TableCell />}
                          </TableRow>
                        );
                      }
                      const item = row.item;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {number}
                          </TableCell>
                          <TableCell className="min-w-56">
                            <div className="font-medium">{item.designation}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                              {item.source && item.calculationId && item.sourceRevisionId ? (
                                <>
                                  <AppLink
                                    href={`${page}/calculs/${item.calculationId}?revision=${item.sourceRevisionId}`}
                                    className="text-primary underline-offset-4 hover:underline"
                                  >
                                    {t('fromCalculation', {
                                      title: item.source.calculationTitle,
                                      number: item.source.revisionNumber,
                                    })}
                                  </AppLink>
                                  <WorkflowBadge status={item.source.workflowStatus} />
                                  {item.source.resultStatus !== 'OK' && (
                                    <CalculationStatusBadge status={item.source.resultStatus} />
                                  )}
                                  {item.source.superseded && (
                                    <Badge variant="warning">{t('superseded')}</Badge>
                                  )}
                                </>
                              ) : (
                                <Badge variant="muted">{t('manual')}</Badge>
                              )}
                            </div>
                            {item.overrideQuantity !== null && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {t('computedQuantity', {
                                  quantity: formatQuantity(item.quantity, locale),
                                })}{' '}
                                ·{' '}
                                {t('retained', { justification: item.overrideJustification ?? '' })}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>{unit(item.unit)}</TableCell>
                          <TableCell
                            className={`text-end tabular-nums ${item.overrideQuantity !== null ? 'font-semibold' : ''}`}
                          >
                            {formatQuantity(item.effectiveQuantity, locale)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {item.unitPrice !== null ? (
                              <span className="flex flex-col items-end">
                                {formatUnitPrice(item.unitPrice, currency, locale)}
                                {item.priceItemId && (
                                  <span className="text-xs text-muted-foreground">
                                    {t('libraryPrice')}
                                  </span>
                                )}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {item.amount !== null ? money(item.amount) : '—'}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t('rowActions', { number })}
                                  >
                                    <MoreHorizontal aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setPriceFor(item);
                                    }}
                                  >
                                    {t('editPrice')}
                                  </DropdownMenuItem>
                                  {item.origin === 'CALCULATION' ? (
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        setOverrideFor(item);
                                      }}
                                    >
                                      {t('override')}
                                    </DropdownMenuItem>
                                  ) : (
                                    <>
                                      <DropdownMenuItem
                                        onSelect={() => {
                                          setLineDialog({ mode: 'edit', item });
                                        }}
                                      >
                                        {t('editLine')}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => {
                                          void confirm({
                                            title: t('deleteLineTitle', {
                                              designation: item.designation,
                                            }),
                                            description: t('deleteLineDescription'),
                                            confirmLabel: t('deleteLine'),
                                            tone: 'destructive',
                                          }).then((ok) => {
                                            if (ok) removeLine.mutate(item);
                                          });
                                        }}
                                      >
                                        {t('deleteLine')}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
          </TableBody>
          {boq.items.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">
                  {t('grandTotal')}
                  {boq.total.unpriced > 0 && !allUnpriced && (
                    <span className="ms-2 text-sm font-normal text-muted-foreground">
                      {t('unpricedCount', { count: boq.total.unpriced })}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-end font-semibold tabular-nums">
                  {allUnpriced ? t('notPriced') : money(boq.total.amount)}
                </TableCell>
                {canManage && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Section>

      <Section title={t('materials')} description={t('materialsDescription')}>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('materialsEmpty')}</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">{t('materialsTable')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('material')}</TableHead>
                <TableHead className="text-end">{t('quantity')}</TableHead>
                <TableHead>{t('detail')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((row, index) => (
                <TableRow key={`${row.key}-${String(index)}`}>
                  <TableCell className="font-medium">
                    {row.label}
                    {!row.additive && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t('perCalculation')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {`${format.number(row.total, { maximumFractionDigits: row.precision })} ${row.unitDisplay === '1' ? '' : row.unitDisplay}`.trim()}
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-0.5 text-sm">
                      {row.contributions.map((c) => (
                        <li key={c.revisionId}>
                          <AppLink
                            href={`${page}/calculs/${c.calculationId}?revision=${c.revisionId}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {c.calculationTitle}
                          </AppLink>
                          {row.contributions.length > 1 && (
                            <span className="text-muted-foreground">
                              {' '}
                              : {format.number(c.value, { maximumFractionDigits: row.precision })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <PriceDialog
        item={priceFor}
        currency={currency}
        unitLabel={priceFor ? unit(priceFor.unit) : ''}
        onClose={() => {
          setPriceFor(null);
        }}
        onSave={(unitPrice) => (priceFor ? patchItem(priceFor, { unitPrice }) : Promise.resolve())}
      />
      <OverrideDialog
        item={overrideFor}
        unitLabel={overrideFor ? unit(overrideFor.unit) : ''}
        onClose={() => {
          setOverrideFor(null);
        }}
        onSave={(override) =>
          overrideFor ? patchItem(overrideFor, { override }) : Promise.resolve()
        }
      />
      <LineDialog
        state={lineDialog}
        nodes={boq.nodes}
        onClose={() => {
          setLineDialog(null);
        }}
        onSave={saveLine}
      />
      <ApplyPricesDialog
        open={applyOpen}
        currency={currency}
        libraries={libraries}
        onClose={() => {
          setApplyOpen(false);
        }}
        onApply={(values) =>
          mutate(async () => {
            const result = await api<ApplyPricesResultDto>(`${api_}/prices`, {
              method: 'POST',
              json: values,
            });
            toast.success(
              t('applied', {
                applied: result.applied,
                unmatched: result.unmatched,
                kept: result.kept,
              }),
            );
          })
        }
      />
      <BoqSettingsDialog
        open={settingsOpen}
        title={boq.title}
        currency={currency}
        currencyLocked={currencyLocked}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={(values) =>
          mutate(
            () =>
              api(api_, {
                method: 'PATCH',
                json: currencyLocked ? { title: values.title } : values,
                headers: { 'if-match': `"${String(boq.version)}"` },
              }),
            t('saved'),
          )
        }
      />
    </>
  );
}

type DisplayRow =
  | { readonly kind: 'item'; readonly item: BoqItemDto }
  | { readonly kind: 'group'; readonly group: BoqGroupDto };

/** Lignes affichées d'un nœud : chaque groupe remplace ses entrées, à la place de la première. */
function rowsOf(
  items: readonly BoqItemDto[],
  groupOf: ReadonlyMap<string, BoqGroupDto>,
): DisplayRow[] {
  const shown = new Set<string>();
  return items.flatMap((item): DisplayRow[] => {
    const group = groupOf.get(item.id);
    if (!group) return [{ kind: 'item', item }];
    if (shown.has(group.key)) return [];
    shown.add(group.key);
    return [{ kind: 'group', group }];
  });
}
