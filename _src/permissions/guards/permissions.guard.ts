import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsService } from '../permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Get the required permission from the decorator
      const requiredPermission = this.reflector.getAllAndOverride<string | string[]>(
        PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

      // If no permission is required, allow access
      if (!requiredPermission) {
        return true;
      }

      // Get the request object
      const request = context.switchToHttp().getRequest();
      const user = request.user;
console.log("23456753424567", user);
      // If no user is authenticated, deny access
      if (!user || !user.id) {
        this.logger.warn('No authenticated user found');
        throw new ForbiddenException('Authentication required');
      }

      // Check if user has any of the required permissions (OR logic)
      let hasPermission = false;
      
      if (Array.isArray(requiredPermission)) {
        // Check if user has ANY of the permissions in the array
        for (const permission of requiredPermission) {
          const hasThisPermission = await this.permissionsService.hasPermission(
            user.id,
            permission,
          );
          if (hasThisPermission) {
            hasPermission = true;
            break; // User has at least one required permission
          }
        }
      } else {
        // Single permission check
        hasPermission = await this.permissionsService.hasPermission(
          user.id,
          requiredPermission,
        );
      }

      if (!hasPermission) {
        this.logger.warn(
          `User ${user.id} does not have any of the required permissions: ${JSON.stringify(requiredPermission)}`,
        );
        throw new ForbiddenException('Insufficient permissions');
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      this.logger.error('Error in permissions guard:', error.stack);
      throw new ForbiddenException('Permission check failed');
    }
  }
} 