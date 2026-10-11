'use client';

import type { NotificationDto } from '@consulpro/contracts';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, useNavigate } from '@consulpro/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { api } from '@/lib/api';

interface Page {
  readonly items: NotificationDto[];
  readonly unreadCount: number;
}

const KEY = ['me', 'notifications'] as const;

/** Centre de notifications in-app (calculs à vérifier, vérifiés, rejetés…). */
export function NotificationsBell() {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const page = useQuery({
    queryKey: KEY,
    queryFn: () => api<Page>('/me/notifications?limit=15'),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids: readonly string[] | null) =>
      api('/me/notifications/read', { method: 'POST', json: ids ? { ids } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const unread = page.data?.unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('open', { count: unread })}
        >
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[0.625rem] leading-4 font-semibold text-primary-foreground"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        aria-label={t('title')}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                markRead.mutate(null);
              }}
            >
              {t('markAll')}
            </Button>
          )}
        </div>
        {page.data && page.data.items.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto">
            {page.data.items.map((n) => (
              <li key={n.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                    n.readAt === null && 'bg-info-subtle/40',
                  )}
                  onClick={() => {
                    if (n.readAt === null) markRead.mutate([n.id]);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className="font-medium">
                    {n.readAt === null && <span className="sr-only">{t('unread')} : </span>}
                    {n.title}
                  </span>
                  {n.body && <span className="text-muted-foreground">{n.body}</span>}
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(n.createdAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
