'use client';

import {
  ConfirmProvider,
  LinkProvider,
  NavigateProvider,
  ShortcutsProvider,
  ThemeProvider,
  Toaster,
  TooltipProvider,
  type RenderLink,
} from '@consulpro/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';

const renderLink: RenderLink = ({ href, children, className, onClick, ...rest }) => (
  <Link
    href={href}
    aria-current={rest['aria-current']}
    {...(className ? { className } : {})}
    {...(onClick ? { onClick } : {})}
  >
    {children}
  </Link>
);

/** Fournisseurs d'interface : thème, données serveur, raccourcis, confirmations, liens Next.js. */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Une erreur d'accès (4xx) ne se corrige pas en réessayant.
            retry: (failures, error) =>
              !(error instanceof ApiError && error.problem.status < 500) && failures < 2,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LinkProvider render={renderLink}>
          <NavigateProvider
            navigate={(href) => {
              router.push(href);
            }}
          >
            <TooltipProvider>
              <ShortcutsProvider>
                <ConfirmProvider>
                  {children}
                  <Toaster richColors closeButton position="top-right" />
                </ConfirmProvider>
              </ShortcutsProvider>
            </TooltipProvider>
          </NavigateProvider>
        </LinkProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
