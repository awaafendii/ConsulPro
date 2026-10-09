/*
 * @consulpro/ui — design system de ConsulPro.
 * Documentation : docs/architecture/14-design-system.md (et Storybook : pnpm --filter @consulpro/ui storybook).
 */

// Utilitaires
export { cn } from './lib/utils';
export {
  formatAuto,
  formatDate,
  formatDateTime,
  formatNumber,
  unitLabel,
  withUnit,
} from './lib/format';
export { useIsMobile } from './hooks/use-mobile';

// Primitives (shadcn/ui adaptées)
export * from './components/ui/alert-dialog';
export * from './components/ui/avatar';
export * from './components/ui/badge';
export * from './components/ui/breadcrumb';
export * from './components/ui/button';
export * from './components/ui/card';
export * from './components/ui/checkbox';
export * from './components/ui/command';
export * from './components/ui/dialog';
export * from './components/ui/dropdown-menu';
export * from './components/ui/form';
export * from './components/ui/input';
export * from './components/ui/kbd';
export * from './components/ui/label';
export * from './components/ui/popover';
export * from './components/ui/scroll-area';
export * from './components/ui/select';
export * from './components/ui/separator';
export * from './components/ui/sheet';
export * from './components/ui/skeleton';
export * from './components/ui/sonner';
export * from './components/ui/switch';
export * from './components/ui/table';
export * from './components/ui/tabs';
export * from './components/ui/textarea';
export * from './components/ui/tooltip';
export { toast } from 'sonner';

// États et retours
export { Callout, type CalloutProps, type CalloutTone } from './components/feedback/callout';
export { ConfirmProvider, useConfirm, type ConfirmOptions } from './components/feedback/confirm';
export {
  EmptyState,
  ErrorState,
  LoadingState,
  type EmptyStateProps,
  type ErrorStateProps,
  type LoadingStateProps,
} from './components/feedback/states';

// Navigation, coquille, mise en page
export {
  AppLink,
  LinkProvider,
  NavigateProvider,
  useNavigate,
  type AppLinkProps,
  type RenderLink,
} from './components/navigation/link';
export {
  AppShell,
  type AppShellProps,
  type NavItem,
  type NavSection,
} from './components/shell/app-shell';
export {
  AuthLayout,
  Brand,
  PageHeader,
  Section,
  type AuthLayoutProps,
  type PageHeaderProps,
  type SectionProps,
} from './components/shell/layout';
export {
  initials,
  OrganizationSwitcher,
  UserMenu,
  type OrganizationOption,
  type OrganizationSwitcherProps,
  type UserMenuItem,
  type UserMenuProps,
} from './components/shell/menus';
export { ThemeProvider, ThemeToggle } from './components/shell/theme';
export { useTheme } from 'next-themes';

// Palette de commandes et raccourcis
export {
  CommandPalette,
  type CommandEntry,
  type CommandPaletteProps,
  type CommandSection,
} from './components/command/command-palette';
export { displayKeys, matchesStep, parseKeys, type KeyStep } from './components/shortcuts/keys';
export {
  ShortcutKeys,
  ShortcutsProvider,
  useOpenShortcutsHelp,
  useShortcut,
  type Shortcut,
} from './components/shortcuts/shortcuts';

// Données
export {
  DataTable,
  type ColumnEditor,
  type CursorPagination,
  type DataColumn,
  type DataTableProps,
} from './components/data-table/data-table';

// Calculs
export {
  CalculationReport,
  type CalculationReportProps,
} from './components/calculation/calculation-report';
export { Formula, type FormulaProps } from './components/calculation/formula';
export {
  CalculationStatusBadge,
  CheckStatusBadge,
  statusLabel,
  VerificationBadge,
} from './components/calculation/status';
