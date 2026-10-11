'use client';

import type { WorkflowStatusDto } from '@consulpro/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Textarea,
  toast,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { CheckCheck, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly revision: {
    readonly id: string;
    readonly number: number;
    readonly workflowStatus: WorkflowStatusDto;
    readonly can: { readonly validate: boolean; readonly verify: boolean };
  };
}

/** Validation par l'auteur, puis vérification (ou rejet motivé) par une autre personne. */
export function ReviewActions({ orgSlug, projectId, revision }: Props) {
  const t = useTranslations('calculations');
  const router = useRouter();
  const base = `/organizations/${orgSlug}/projects/${projectId}/revisions/${revision.id}`;
  const [open, setOpen] = useState<'validate' | 'verify' | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (decision: 'VALIDATE' | 'APPROVED' | 'REJECTED') =>
      decision === 'VALIDATE'
        ? api(`${base}/validate`, {
            method: 'POST',
            json: comment.trim() ? { comment } : {},
          })
        : api(`${base}/verify`, {
            method: 'POST',
            json: { decision, ...(comment.trim() ? { comment } : {}) },
          }),
    onSuccess: (_data, decision) => {
      toast.success(
        decision === 'VALIDATE'
          ? t('validated')
          : decision === 'APPROVED'
            ? t('verified')
            : t('rejected'),
      );
      setOpen(null);
      setComment('');
      router.refresh();
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  if (!revision.can.validate && !revision.can.verify) return null;
  const kind = revision.can.validate ? 'validate' : 'verify';

  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => {
        setOpen(next ? kind : null);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          {kind === 'validate' ? <CheckCheck aria-hidden /> : <ShieldCheck aria-hidden />}
          {kind === 'validate' ? t('validate') : t('verify')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === 'validate'
              ? t('validateTitle', { number: revision.number })
              : t('verifyTitle', { number: revision.number })}
          </DialogTitle>
          <DialogDescription>
            {kind === 'validate' ? t('validateDescription') : t('verifyDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="review-comment">{t('comment')}</Label>
          <Textarea
            id="review-comment"
            rows={3}
            value={comment}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'review-comment-error' : undefined}
            onChange={(e) => {
              setComment(e.target.value);
            }}
          />
          {error && (
            <p id="review-comment-error" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {kind === 'validate' ? (
            <Button
              loading={submit.isPending}
              onClick={() => {
                submit.mutate('VALIDATE');
              }}
            >
              <CheckCheck aria-hidden />
              {t('validate')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={submit.isPending}
                onClick={() => {
                  if (comment.trim().length < 3) {
                    setError(t('commentRequired'));
                    return;
                  }
                  submit.mutate('REJECTED');
                }}
              >
                <X aria-hidden />
                {t('reject')}
              </Button>
              <Button
                loading={submit.isPending}
                onClick={() => {
                  submit.mutate('APPROVED');
                }}
              >
                <ShieldCheck aria-hidden />
                {t('approve')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
