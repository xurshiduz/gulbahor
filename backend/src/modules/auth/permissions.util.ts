/**
 * Backendda huquq tekshirish - frontenddagi usePermissions bilan bir xil qoida.
 *
 * Huquq nomi `${action}:${resource}`. Foydalanuvchining huquqlari rollari
 * orqali keladi (req.user da roles -> permissions bor). Admin va Super
 * admin rollari barcha huquqlarga ega.
 */

export const ADMIN_ROLE_PATTERN = /^(admin|administrator|superadmin|super admin)$/i;
export const SUPER_ADMIN_ROLE_PATTERN = /^(superadmin|super admin)$/i;

export function userIsAdmin(user: any): boolean {
  const roles: any[] = user?.roles || [];
  return roles.some((r) => ADMIN_ROLE_PATTERN.test(String(r?.name || '').trim()));
}

export function userIsSuperAdmin(user: any): boolean {
  const roles: any[] = user?.roles || [];
  return roles.some((r) => SUPER_ADMIN_ROLE_PATTERN.test(String(r?.name || '').trim()));
}

/** Aniq huquq nomi bo'yicha: userCan(user, 'update:users') */
export function userCan(user: any, permission: string): boolean {
  if (userIsAdmin(user)) return true;
  const permName = (perm: any) =>
    perm?.name || (perm?.action && perm?.resource ? `${perm.action}:${perm.resource}` : null);
  const roles: any[] = user?.roles || [];
  for (const role of roles) {
    for (const perm of role?.permissions || []) {
      if (permName(perm) === permission) return true;
    }
  }
  // Qo'shimcha huquqlar - rolsiz, shu xodimga alohida berilgan
  for (const perm of user?.extraPermissions || []) {
    if (permName(perm) === permission) return true;
  }
  return false;
}
