// Export the main module
export { PermissionsModule } from "./permissions.module";

// Export services
export { PermissionsService } from "./permissions.service";
export { DataScopeService } from "./data-scope/data-scope.service";
export type {
  DataScopeType,
  ResolvedDataScope,
} from "./data-scope/data-scope.types";
export { GeographicScopeService } from "./geographic-scope/geographic-scope.service";
export type {
  GeographicEntityKey,
  GeographicScopeSummary,
  ResolvedGeographicScope,
} from "./geographic-scope/geographic-scope.types";

// Export guards
export { PermissionsGuard } from "./guards/permissions.guard";

// Export decorators
export {
  RequiredPermission,
  RequiredPermissions,
  PERMISSION_KEY,
} from "./decorators/require-permission.decorator";

export {
  DONATION_VIEW_PERMISSIONS,
  DONATION_CREATE_PERMISSIONS,
  DONATION_UPDATE_PERMISSIONS,
  DONATION_DELETE_PERMISSIONS,
  DONATION_VIEW_GUARD,
  DONATION_VIEW_STAFF_GUARD,
  DONATION_LIST_VIEW_PERMISSIONS,
  DONATION_FILTER_OPTIONS_GUARD,
  DONATION_CREATE_GUARD,
  DONATION_UPDATE_GUARD,
  DONATION_DELETE_GUARD,
  DONATION_ALLOTMENT_VIEW_PERMISSIONS,
  DONATION_ALLOTMENT_LIST_VIEW_PERMISSIONS,
  DONATION_ALLOTMENT_CREATE_PERMISSIONS,
  DONATION_ALLOTMENT_APPROVE_PERMISSIONS,
  DONATION_ALLOTMENT_VIEW_GUARD,
  DONATION_ALLOTMENT_LIST_VIEW_GUARD,
  DONATION_ALLOTMENT_CREATE_GUARD,
  DONATION_ALLOTMENT_APPROVE_GUARD,
} from "./donation-permissions.constants";

// Export entities
export { PermissionsEntity } from "./entities/permissions.entity";

// Export controller
export { PermissionsController } from "./permissions.controller";
