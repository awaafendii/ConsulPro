import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

const TONES = {
  info: { icon: Info, className: 'border-info/30 bg-info-subtle text-info-subtle-foreground' },
  success: {
    icon: CircleCheck,
    className: 'border-success/30 bg-success-subtle text-success-subtle-foreground',
  },
  warning: {
    icon: TriangleAlert,
    className: 'border-warning/40 bg-warning-subtle text-warning-subtle-foreground',
  },
  destructive: {
    icon: OctagonAlert,
    className: 'border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground',
  },
} as const;

export type CalloutTone = keyof typeof TONES;

export interface CalloutProps {
  readonly tone?: CalloutTone;
  readonly title?: ReactNode;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string | undefined;
}

/**
 * Encadré de message. `destructive` est annoncé immédiatement (role="alert") ;
 * les autres tons sont annoncés poliment (role="status").
 */
export function Callout({ tone = 'info', title, children, action, className }: CalloutProps) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', toneClass, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
