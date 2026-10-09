'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface AppLinkProps {
  readonly href: string;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
  readonly 'aria-current'?: 'page' | undefined;
  readonly onClick?: (() => void) | undefined;
}

export type RenderLink = (props: AppLinkProps) => ReactNode;

/** Lien par défaut : simple ancre. L'application fournit le sien (ex. `next/link`). */
const renderAnchor: RenderLink = ({ href, children, ...props }) => (
  <a href={href} {...props}>
    {children}
  </a>
);

const LinkContext = createContext<RenderLink>(renderAnchor);

/** Rend le design system indépendant du routeur : l'application injecte le rendu de ses liens. */
export function LinkProvider({ render, children }: { render: RenderLink; children: ReactNode }) {
  return <LinkContext.Provider value={render}>{children}</LinkContext.Provider>;
}

export function AppLink(props: AppLinkProps) {
  return useContext(LinkContext)(props);
}

/** Navigation programmatique fournie par l'application (palette de commandes, raccourcis). */
const NavigateContext = createContext<(href: string) => void>((href) => {
  window.location.assign(href);
});

export function NavigateProvider({
  navigate,
  children,
}: {
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  return <NavigateContext.Provider value={navigate}>{children}</NavigateContext.Provider>;
}

export function useNavigate(): (href: string) => void {
  return useContext(NavigateContext);
}
