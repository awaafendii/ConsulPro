import { createAuditService } from './audit/audit-service';
import { createInvitationService } from './organizations/invitation-service';
import { createMemberService } from './organizations/member-service';
import { createOrganizationService } from './organizations/organization-service';
import type { ApplicationDeps } from './ports';

export { createAuditService, type AuditService } from './audit/audit-service';
export {
  authorize,
  type Actor,
  type OrgContext,
  type RequestMeta,
  type UserContext,
} from './context';
export {
  appError,
  fromDomain,
  notFound,
  staleVersion,
  type AppError,
  type AppErrorKind,
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
export type * from './ports';

/** Assemble les services applicatifs à partir des implémentations des ports. */
export function createApplication(deps: ApplicationDeps) {
  return {
    organizations: createOrganizationService(deps),
    members: createMemberService(deps),
    invitations: createInvitationService(deps),
    audit: createAuditService(deps),
  };
}

export type Application = ReturnType<typeof createApplication>;
