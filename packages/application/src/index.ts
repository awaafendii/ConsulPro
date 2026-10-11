import { createAccountService } from './account/account-service';
import { createAuditService } from './audit/audit-service';
import { createCalculationService } from './calculations/calculation-service';
import { createDatasetService } from './calculations/dataset-service';
import { createStudyService } from './calculations/study-service';
import { createLibraryService } from './library/library-service';
import { createInvitationService } from './organizations/invitation-service';
import { createMemberService } from './organizations/member-service';
import { createOrganizationService } from './organizations/organization-service';
import type { ApplicationDeps } from './ports';
import { createProjectMemberService } from './projects/project-member-service';
import { createProjectService } from './projects/project-service';

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
    account: createAccountService(deps),
  };
}

export type Application = ReturnType<typeof createApplication>;
