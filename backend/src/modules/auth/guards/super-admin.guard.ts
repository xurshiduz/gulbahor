import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { userIsSuperAdmin } from '../permissions.util';

/** Faqat Super admin: Administratsiya -> Tizim boshqarish (sinxronizatsiya, tozalash) */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!userIsSuperAdmin(req.user)) throw new ForbiddenException('Faqat Super admin uchun');
    return true;
  }
}
