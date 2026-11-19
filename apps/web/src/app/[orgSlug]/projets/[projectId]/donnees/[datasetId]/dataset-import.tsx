'use client';

import type {
  DatasetImportPreviewDto,
  DatasetKindDto,
  DatasetRevisionDto,
  ImportDelimiter,
} from '@consulpro/contracts';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  formatAuto,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  withUnit,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api, ApiError } from '@/lib/api';

type Mapping = readonly { key: string; sourceIndex: number | null }[];
type CellValue = string | number | { value: number; unit: string } | null | undefined;

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly datasetId: string;
  readonly version: number;
  readonly kind: DatasetKindDto;
}

/** Encode des octets en base64 sans dépasser la pile d'arguments (gros fichiers). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Unités par défaut : première unité de chaque colonne de grandeur. */
function defaultUnits(kind: DatasetKindDto): Record<string, string> {
  const units: Record<string, string> = {};
  for (const c of kind.columns) {
    if (c.type === 'quantity') units[c.key] = c.units[0]?.symbol ?? '';
  }
  return units;
}

const NONE = '__none__';

export function DatasetImport({ orgSlug, projectId, datasetId, version, kind }: Props) {
  const t = useTranslations('datasets');
  const router = useRouter();
  const base = `/organizations/${orgSlug}/projects/${projectId}/datasets/${datasetId}`;

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [delimiter, setDelimiter] = useState<ImportDelimiter | ''>('');
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [units, setUnits] = useState<Record<string, string>>(() => defaultUnits(kind));
  const [preview, setPreview] = useState<DatasetImportPreviewDto | null>(null);
  const [note, setNote] = useState('');

  const reset = () => {
    setSource('file');
    setContent(null);
    setFileName('');
    setPaste('');
    setDelimiter('');
    setMapping(null);
    setUnits(defaultUnits(kind));
    setPreview(null);
    setNote('');
  };

  const body = (withMapping: boolean) => ({
    content: content ?? '',
    ...(delimiter ? { delimiter } : {}),
    ...(withMapping && mapping ? { mapping } : {}),
    units,
  });

  const previewMutation = useMutation({
    mutationFn: (withMapping: boolean) =>
      api<DatasetImportPreviewDto>(`${base}/import/preview`, {
        method: 'POST',
        json: body(withMapping),
      }),
    onSuccess: (result) => {
      setPreview(result);
      setMapping(result.mapping);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      api<DatasetRevisionDto>(`${base}/import`, {
        method: 'POST',
        headers: { 'if-match': `"${String(version)}"` },
        json: { ...body(true), ...(note.trim() ? { note } : {}) },
      }),
    onSuccess: (saved) => {
      toast.success(t('import.done', { number: saved.number }));
      setOpen(false);
      reset();
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
      if (error instanceof ApiError && error.problem.status === 412) {
        setOpen(false);
        router.refresh();
      }
    },
  });

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setMapping(null);
    if (!file) {
      setContent(null);
      setFileName('');
      return;
    }
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    setContent(toBase64(new Uint8Array(buffer)));
  };

  const onPaste = (text: string) => {
    setPaste(text);
    setPreview(null);
    setMapping(null);
    setContent(text.trim() ? toBase64(new TextEncoder().encode(text)) : null);
  };

  const headerLabel = (index: number) =>
    preview?.headers[index]?.trim() || t('import.columnN', { index: index + 1 });

  const sourceFor = (key: string): string => {
    const entry = mapping?.find((m) => m.key === key);
    return entry && entry.sourceIndex !== null ? String(entry.sourceIndex) : NONE;
  };

  const setSourceFor = (key: string, value: string) => {
    const sourceIndex = value === NONE ? null : Number(value);
    setMapping((current) => {
      const existing = current ?? kind.columns.map((c) => ({ key: c.key, sourceIndex: null }));
      const next = existing.map((m) => (m.key === key ? { key, sourceIndex } : m));
      return next.some((m) => m.key === key) ? next : [...next, { key, sourceIndex }];
    });
  };

  const formatCell = (value: CellValue, type: string, unitDisplay?: string): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value === '' ? '—' : value;
    if (typeof value === 'number') return String(value);
    return withUnit(formatAuto(value.value), unitDisplay ?? value.unit);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload aria-hidden />
          {t('import.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={source}
          onValueChange={(value) => {
            if (value === 'file' || value === 'paste') {
              setSource(value);
              setContent(null);
              setPreview(null);
              setMapping(null);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="file">{t('import.fromFile')}</TabsTrigger>
            <TabsTrigger value="paste">{t('import.fromPaste')}</TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="space-y-2 pt-2">
            <Label htmlFor="import-file">{t('import.file')}</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
              }}
            />
            {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
          </TabsContent>
          <TabsContent value="paste" className="space-y-2 pt-2">
            <Label htmlFor="import-paste">{t('import.paste')}</Label>
            <Textarea
              id="import-paste"
              rows={6}
              value={paste}
              placeholder={t('import.pastePlaceholder')}
              onChange={(e) => {
                onPaste(e.target.value);
              }}
            />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="import-delimiter">{t('import.delimiter')}</Label>
            <Select
              value={delimiter === '' ? 'auto' : delimiter}
              onValueChange={(value) => {
                setDelimiter(value === 'auto' ? '' : (value as ImportDelimiter));
                setPreview(null);
                setMapping(null);
              }}
            >
              <SelectTrigger id="import-delimiter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('import.delimiterAuto')}</SelectItem>
                <SelectItem value=",">{t('import.delimiterComma')}</SelectItem>
                <SelectItem value=";">{t('import.delimiterSemicolon')}</SelectItem>
                <SelectItem value={'\t'}>{t('import.delimiterTab')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!content}
            loading={previewMutation.isPending}
            onClick={() => {
              previewMutation.mutate(preview !== null);
            }}
          >
            {preview ? t('import.reanalyze') : t('import.preview')}
          </Button>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="muted">
                {t('import.formatLabel', {
                  format: t(preview.format === 'xlsx' ? 'import.formatXlsx' : 'import.formatCsv'),
                })}
              </Badge>
              <Badge variant="muted">{t('import.rowCount', { count: preview.rowCount })}</Badge>
              {preview.valid ? (
                <Badge variant="success">{t('import.valid')}</Badge>
              ) : (
                <Badge variant="destructive">
                  {t('import.invalid', { count: preview.errors.length })}
                </Badge>
              )}
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t('import.mapping')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {kind.columns.map((c) => (
                  <div key={c.key} className="space-y-1.5">
                    <Label htmlFor={`map-${c.key}`}>
                      {c.label}
                      {c.required ? ' *' : ''}
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={sourceFor(c.key)}
                        onValueChange={(value) => {
                          if (value) setSourceFor(c.key, value);
                        }}
                      >
                        <SelectTrigger id={`map-${c.key}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('import.noColumn')}</SelectItem>
                          {preview.headers.map((_, index) => (
                            <SelectItem key={index} value={String(index)}>
                              {headerLabel(index)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {c.type === 'quantity' && c.units.length > 1 && (
                        <Select
                          value={units[c.key] ?? c.units[0]?.symbol ?? ''}
                          onValueChange={(unit) => {
                            if (unit) setUnits((u) => ({ ...u, [c.key]: unit }));
                          }}
                        >
                          <SelectTrigger
                            className="w-24"
                            aria-label={t('import.unitOf', { column: c.label })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {c.units.map((u) => (
                              <SelectItem key={u.symbol} value={u.symbol}>
                                {u.display}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {c.type === 'quantity' && c.units.length === 1 && (
                        <span className="self-center text-sm text-muted-foreground">
                          {c.units[0]?.display}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>

            {!preview.valid && preview.errors.length > 0 && (
              <Callout tone="destructive" title={t('import.errorsTitle')}>
                <ul className="list-inside list-disc text-sm">
                  {preview.errors.slice(0, 10).map((e) => (
                    <li key={`${String(e.row)}-${e.column}-${e.message}`}>
                      {t('import.errorItem', { row: e.row + 1, column: e.column })} — {e.message}
                    </li>
                  ))}
                  {preview.errors.length > 10 && (
                    <li>{t('import.moreErrors', { count: preview.errors.length - 10 })}</li>
                  )}
                </ul>
              </Callout>
            )}

            {preview.sample.length > 0 && (
              <div className="rounded-lg border">
                <Table regionLabel={t('import.sample')}>
                  <TableCaption className="sr-only">{t('import.sample')}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      {kind.columns.map((c) => (
                        <TableHead key={c.key}>{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((row, index) => (
                      <TableRow key={index}>
                        {kind.columns.map((c) => {
                          const unitDisplay =
                            c.type === 'quantity'
                              ? (c.units.find((u) => u.symbol === units[c.key])?.display ??
                                units[c.key])
                              : undefined;
                          return (
                            <TableCell key={c.key}>
                              {formatCell(row[c.key], c.type, unitDisplay)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.rowCount > preview.sample.length && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {t('import.sampleNote', {
                      shown: preview.sample.length,
                      total: preview.rowCount,
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="import-note">{t('note')}</Label>
              <Input
                id="import-note"
                value={note}
                maxLength={500}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              reset();
            }}
          >
            {t('import.cancel')}
          </Button>
          <Button
            disabled={!preview || !preview.valid || preview.rowCount === 0}
            loading={commit.isPending}
            onClick={() => {
              commit.mutate();
            }}
          >
            <Upload aria-hidden />
            {t('import.commit', { count: preview?.rowCount ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
