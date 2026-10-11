'use client';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';

const DEFAULT = '__application__';

export function TimeZoneForm({
  zones,
  current,
  appDefault,
}: {
  zones: readonly string[];
  current: string | null;
  appDefault: string;
}) {
  const t = useTranslations('account');
  const router = useRouter();
  const [value, setValue] = useState(current ?? DEFAULT);

  const save = useMutation({
    mutationFn: () =>
      api('/me/preferences', {
        method: 'PUT',
        json: { timeZone: value === DEFAULT ? null : value },
      }),
    onSuccess: () => {
      toast.success(t('timeZoneSaved'));
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="time-zone">{t('timeZone')}</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger id="time-zone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={DEFAULT}>{t('timeZoneDefault', { zone: appDefault })}</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" loading={save.isPending}>
        {t('save')}
      </Button>
    </form>
  );
}
