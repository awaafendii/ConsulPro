'use client';

import type {
  TakeoffCalculationDto,
  TakeoffDto,
  TakeoffNodeDto,
  TakeoffNodeKindDto,
} from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Button,
  CalculationStatusBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  useConfirm,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { FolderTree, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { WorkflowBadge } from '@/features/calculations/workflow-badge';
import { api, ApiError } from '@/lib/api';

import { NodeDialog, type NodeDialogState } from './node-dialog';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canManage: boolean;
  readonly takeoff: TakeoffDto;
}

const KIND_VARIANT = { LOT: 'default', LEVEL: 'secondary', ELEMENT: 'outline' } as const;
/** Natures admises sous un nœud (mêmes règles que le domaine, revérifiées par le serveur). */
const CHILD_KINDS: Readonly<Record<TakeoffNodeKindDto, readonly TakeoffNodeKindDto[]>> = {
  LOT: ['LEVEL', 'ELEMENT'],
  LEVEL: ['ELEMENT'],
  ELEMENT: [],
};
/** Valeur de la liste « non rattaché » (Radix interdit la chaîne vide). */
const NONE = 'none';

export function TakeoffView({ orgSlug, projectId, canManage, takeoff }: Props) {
  const t = useTranslations('takeoff');
  const confirm = useConfirm();
  const router = useRouter();
  const [dialog, setDialog] = useState<NodeDialogState | null>(null);
  const base = `/organizations/${orgSlug}/projects/${projectId}/takeoff`;
  const nodeLabel = (n: TakeoffNodeDto) => `${n.code} — ${n.title}`;
  const byId = new Map(takeoff.nodes.map((n) => [n.id, n]));
  const counts = new Map<string, number>();
  for (const c of takeoff.calculations) {
    if (c.nodeId) counts.set(c.nodeId, (counts.get(c.nodeId) ?? 0) + 1);
  }

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };

  const remove = useMutation({
    mutationFn: (node: TakeoffNodeDto) =>
      api(`${base}/nodes/${node.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${String(node.version)}"` },
      }),
    onSuccess: () => {
      toast.success(t('deleted'));
      router.refresh();
    },
    onError,
  });

  const assign = useMutation({
    mutationFn: ({
      calculation,
      nodeId,
    }: {
      calculation: TakeoffCalculationDto;
      nodeId: string | null;
    }) => api(`${base}/assignments/${calculation.id}`, { method: 'PUT', json: { nodeId } }),
    onSuccess: (_data, { calculation, nodeId }) => {
      const node = nodeId ? byId.get(nodeId) : undefined;
      toast.success(
        node
          ? t('assigned', { title: calculation.title, node: nodeLabel(node) })
          : t('unassignedDone', { title: calculation.title }),
      );
      router.refresh();
    },
    onError,
  });

  const createNode = async (
    parent: TakeoffNodeDto | null,
    values: { kind: TakeoffNodeKindDto; code: string; title: string },
  ) => {
    try {
      const node = await api<TakeoffNodeDto>(`${base}/nodes`, {
        method: 'POST',
        json: { parentId: parent?.id ?? null, ...values },
      });
      toast.success(t('created', { code: node.code, title: node.title }));
      router.refresh();
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  };

  const updateNode = async (node: TakeoffNodeDto, values: { code: string; title: string }) => {
    try {
      await api(`${base}/nodes/${node.id}`, {
        method: 'PATCH',
        json: values,
        headers: { 'if-match': `"${String(node.version)}"` },
      });
      toast.success(t('updated'));
      router.refresh();
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  };

  const structure: DataColumn<TakeoffNodeDto>[] = [
    {
      id: 'title',
      header: t('title'),
      cell: (n) => (
        <span
          className="flex min-w-0 items-baseline gap-2"
          style={{ paddingInlineStart: `${String(n.depth * 1.5)}rem` }}
        >
          <span className="font-mono text-sm text-muted-foreground">{n.code}</span>
          <span className="font-medium">{n.title}</span>
        </span>
      ),
      filterValue: (n) => `${n.code} ${n.title}`,
    },
    {
      id: 'kind',
      header: t('kind'),
      cell: (n) => <Badge variant={KIND_VARIANT[n.kind]}>{t(`kinds.${n.kind}`)}</Badge>,
    },
    {
      id: 'calculations',
      header: t('calculations'),
      align: 'end',
      cell: (n) => t('assignedCount', { count: counts.get(n.id) ?? 0 }),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('actions'),
            align: 'end' as const,
            cell: (n: TakeoffNodeDto) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('actionsOf', { code: n.code, title: n.title })}
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {CHILD_KINDS[n.kind].length > 0 && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ mode: 'create', parent: n, kinds: CHILD_KINDS[n.kind] });
                      }}
                    >
                      {t('addChild')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      setDialog({ mode: 'edit', node: n });
                    }}
                  >
                    {t('rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      void confirm({
                        title: t('deleteTitle', { code: n.code, title: n.title }),
                        description: t('deleteDescription'),
                        confirmLabel: t('delete'),
                        tone: 'destructive',
                      }).then((ok) => {
                        if (ok) remove.mutate(n);
                      });
                    }}
                  >
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  const calculations: DataColumn<TakeoffCalculationDto>[] = [
    {
      id: 'title',
      header: t('calculation'),
      cell: (c) => (
        <AppLink
          href={`/${orgSlug}/projets/${projectId}/calculs/${c.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {c.title}
        </AppLink>
      ),
      sortValue: (c) => c.title,
      filterValue: (c) => `${c.title} ${c.studyTitle}`,
    },
    { id: 'study', header: t('study'), cell: (c) => c.studyTitle, sortValue: (c) => c.studyTitle },
    {
      id: 'revision',
      header: t('revision'),
      cell: (c) =>
        c.current ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">n° {c.current.number}</span>
            <CalculationStatusBadge status={c.current.resultStatus} />
            <WorkflowBadge status={c.current.workflowStatus} />
            {c.obsolete && <Badge variant="warning">{t('obsolete')}</Badge>}
          </span>
        ) : (
          <Badge variant="muted">{t('notComputed')}</Badge>
        ),
    },
    {
      id: 'node',
      header: t('node'),
      sortValue: (c) => (c.nodeId ? (byId.get(c.nodeId)?.code ?? '') : '~'),
      cell: (c) => {
        const node = c.nodeId ? byId.get(c.nodeId) : undefined;
        if (!canManage || takeoff.nodes.length === 0) {
          return node ? (
            nodeLabel(node)
          ) : (
            <span className="text-muted-foreground">{t('unassigned')}</span>
          );
        }
        return (
          <Select
            value={c.nodeId ?? NONE}
            disabled={assign.isPending}
            onValueChange={(value) => {
              // Radix peut émettre '' quand la liste change : ignoré.
              if (value === '' || value === (c.nodeId ?? NONE)) return;
              assign.mutate({ calculation: c, nodeId: value === NONE ? null : value });
            }}
          >
            <SelectTrigger size="sm" className="w-56" aria-label={t('nodeOf', { title: c.title })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('unassigned')}</SelectItem>
              {takeoff.nodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {`${'  '.repeat(n.depth)}${nodeLabel(n)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      <NodeDialog
        state={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onCreate={createNode}
        onUpdate={updateNode}
      />
      <section aria-labelledby="takeoff-structure" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="takeoff-structure" className="text-base font-semibold">
            {t('structure')}
          </h3>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setDialog({ mode: 'create', parent: null, kinds: ['LOT'] });
              }}
            >
              <Plus aria-hidden />
              {t('newLot')}
            </Button>
          )}
        </div>
        <DataTable
          caption={t('structureTable')}
          columns={structure}
          rows={takeoff.nodes}
          getRowId={(n) => n.id}
          empty={<EmptyState icon={FolderTree} title={t('empty')} description={t('emptyHint')} />}
        />
      </section>

      <section aria-labelledby="takeoff-calculations" className="space-y-3">
        <div>
          <h3 id="takeoff-calculations" className="text-base font-semibold">
            {t('calculations')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('calculationsDescription')}</p>
        </div>
        {canManage && takeoff.nodes.length === 0 && takeoff.calculations.length > 0 && (
          <p className="text-sm text-muted-foreground">{t('needNodes')}</p>
        )}
        <DataTable
          caption={t('calculationsTable')}
          columns={calculations}
          rows={takeoff.calculations}
          getRowId={(c) => c.id}
          empty={<EmptyState icon={FolderTree} title={t('calculationsEmpty')} />}
        />
      </section>
    </div>
  );
}
