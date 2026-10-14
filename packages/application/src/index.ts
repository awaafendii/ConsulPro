import { createAccountService } from './account/account-service';
import { createAuditService } from './audit/audit-service';
import { createCalculationService } from './calculations/calculation-service';
import { createDatasetService } from './calculations/dataset-service';
import { createElecDashboardService } from './calculations/elec-dashboard-service';
import { createPlumbingDashboardService } from './calculations/plumbing-dashboard-service';
import { createStudyService } from './calculations/study-service';
import { createLibraryService } from './library/library-service';
import { createInvitationService } from './organizations/invitation-service';
import { createMemberService } from './organizations/member-service';
import { createOrganizationService } from './organizations/organization-service';
import type { ApplicationDeps } from './ports';
import { createProjectMemberService } from './projects/project-member-service';
import { createProjectService } from './projects/project-service';
import { createBoqService } from './quantities/boq-service';
import { createBtpDashboardService } from './quantities/btp-dashboard-service';
import { createPriceService } from './quantities/price-service';
import { createTakeoffService } from './quantities/takeoff-service';

export {
  createAccountService,
  isTimeZone,
  type AccountService,
  type SearchResult,
} from './account/account-service';
export { createAuditService, type AuditService } from './audit/audit-service';
export {
  createCalculationService,
  type CalculationService,
  type CalculationSummary,
  type LinkableOutput,
  type RevisionView,
} from './calculations/calculation-service';
export { createDatasetService, type DatasetService } from './calculations/dataset-service';
export {
  createElecDashboardService,
  type ElecDashboard,
  type ElecDashboardService,
  type ElecPowerBalanceSummary,
  type ElecProjectSummary,
} from './calculations/elec-dashboard-service';
export { engineVerification, type EngineVerification } from './calculations/engine-verification';
export {
  createPlumbingDashboardService,
  type PlumbingDashboard,
  type PlumbingDashboardService,
  type PlumbingFlowSummary,
  type PlumbingProjectSummary,
} from './calculations/plumbing-dashboard-service';
export type {
  CalculationStats,
  NonCompliantCalculation,
} from './calculations/discipline-dashboard';
export { toCalculationView } from './calculations/presenter';
export { createStudyService, type StudyService } from './calculations/study-service';
export {
  authorize,
  type Actor,
  type OrgContext,
  type RequestMeta,
  type UserContext,
} from './context';
export {
  appError,
  forbidden,
  fromDomain,
  notFound,
  staleVersion,
  type AppError,
  type AppErrorKind,
  type Issue,
} from './errors';
export {
  createInvitationService,
  type InvitationService,
} from './organizations/invitation-service';
export { createMemberService, type MemberService } from './organizations/member-service';
export {
  createOrganizationService,
  type OrganizationService,
} from './organizations/organization-service';
export {
  createLibraryService,
  type EffectiveParameter,
  type LibraryService,
  type OverrideInput,
  type OverrideView,
  type ProjectStandardsView,
} from './library/library-service';
export type * from './ports';
export type * from './ports-calculations';
export type * from './ports-projects';
export type * from './ports-quantities';
export {
  createBoqService,
  type BoqItemView,
  type BoqNodeView,
  type BoqService,
  type BoqSummary,
  type BoqView,
  type ItemSource,
  type PendingChanges,
} from './quantities/boq-service';
export {
  createBtpDashboardService,
  type BtpBoqSummary,
  type BtpCalculationStats,
  type BtpDashboard,
  type BtpDashboardService,
  type BtpProjectSummary,
} from './quantities/btp-dashboard-service';
export {
  createPriceService,
  type PriceItemInput,
  type PriceLibraryView,
  type PriceService,
  type WorkItem,
} from './quantities/price-service';
export {
  createTakeoffService,
  type TakeoffCalculation,
  type TakeoffService,
  type TakeoffView,
} from './quantities/takeoff-service';
export {
  authorizeProject,
  inProject,
  loadProject,
  type ProjectAccess,
  type ProjectContext,
} from './projects/project-context';
export {
  createProjectMemberService,
  type ProjectMemberService,
} from './projects/project-member-service';
export {
  createProjectService,
  type ProjectService,
  type ProjectView,
} from './projects/project-service';

/** Assemble les services applicatifs à partir des implémentations des ports. */
export function createApplication(deps: ApplicationDeps) {
  return {
    organizations: createOrganizationService(deps),
    members: createMemberService(deps),
    invitations: createInvitationService(deps),
    audit: createAuditService(deps),
    projects: createProjectService(deps),
    projectMembers: createProjectMemberService(deps),
    library: createLibraryService(deps),
    studies: createStudyService(deps),
    calculations: createCalculationService(deps),
    datasets: createDatasetService(deps),
    takeoff: createTakeoffService(deps),
    boqs: createBoqService(deps),
    prices: createPriceService(deps),
    btpDashboard: createBtpDashboardService(deps),
    elecDashboard: createElecDashboardService(deps),
    plumbingDashboard: createPlumbingDashboardService(deps),
    account: createAccountService(deps),
  };
}

export type Application = ReturnType<typeof createApplication>;
