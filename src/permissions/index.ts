// Export the main module
export { PermissionsModule } from "./permissions.module";

// Export services
export { PermissionsService } from "./permissions.service";
export { DataScopeService } from "./data-scope/data-scope.service";
export type {
  DataScopeType,
  ResolvedDataScope,
} from "./data-scope/data-scope.types";

// Export guards
export { PermissionsGuard } from "./guards/permissions.guard";

// Export decorators
export {
  RequiredPermission,
  RequiredPermissions,
  PERMISSION_KEY,
} from "./decorators/require-permission.decorator";

// Export entities
export { PermissionsEntity } from "./entities/permissions.entity";

// Export controller
export { PermissionsController } from "./permissions.controller";
