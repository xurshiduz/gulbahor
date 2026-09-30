import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { userCan } from '../permissions.util';

const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Endpoint uchun kerakli huquq. Bir nechta berilsa - bittasi yetarli
 * (masalan rollar ro'yxati foydalanuvchi formasida ham kerak).
 * JwtAuthGuard dan keyin ishlaydi: @UseGuards(JwtAuthGuard, PermissionsGuard).
 */
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    if (required.some((permission) => userCan(req.user, permission))) return true;
    throw new ForbiddenException("Bu amal uchun huquqingiz yo'q");
  }
}
