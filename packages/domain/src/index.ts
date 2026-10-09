export { can, grantFor, PERMISSIONS, type Grant, type Permission } from './access/permissions';
export { isOrgRole, ORG_ROLES, ROLE_LABELS, roleRank, type OrgRole } from './access/roles';
export { AUDIT_ACTIONS, type AuditAction } from './audit/actions';
export type { DomainError } from './errors';
export {
  checkInvitation,
  checkRemoval,
  checkRoleChange,
  INVITATION_TTL_DAYS,
  type MemberChange,
} from './organization/membership-policy';
export {
  NAME_MAX,
  SLUG_MAX,
  SLUG_MIN,
  SLUG_PATTERN,
  validateNewOrganization,
  type NewOrganization,
} from './organization/organization';
export {
  isModuleAvailable,
  LATEST_DELIVERED_PHASE,
  MODULES,
  type ModuleDescriptor,
  type ModuleSection,
} from './modules/registry';
