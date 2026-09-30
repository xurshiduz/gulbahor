import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Foydalanuvchi huquqlari.
 *
 * Huquq nomi `${action}:${resource}` ko'rinishida bo'ladi (masalan `read:users`).
 * Foydalanuvchining huquqlari rollari orqali keladi (/api/auth/me javobida
 * roles -> permissions bilan birga qaytadi).
 *
 * "Admin" va "Super admin" rollari barcha huquqlarga ega deb hisoblanadi -
 * backenddagi permissions.util.ts bilan bir xil qoida.
 */

interface PermissionLike {
  name?: string;
  action?: string;
  resource?: string;
}

interface RoleLike {
  name?: string;
  permissions?: PermissionLike[];
}

const ADMIN_ROLE_PATTERN = /^(admin|administrator|superadmin|super admin)$/i;
const SUPER_ADMIN_ROLE_PATTERN = /^(superadmin|super admin)$/i;

const permissionName = (perm: PermissionLike) =>
  perm?.name || (perm?.action && perm?.resource ? `${perm.action}:${perm.resource}` : null);

export function usePermissions() {
  const { user } = useAuth();

  const { isAdmin, isSuperAdmin, granted } = useMemo(() => {
    const roles: RoleLike[] = Array.isArray(user?.roles) ? user.roles : [];
    const admin = roles.some((r) => ADMIN_ROLE_PATTERN.test((r?.name || "").trim()));
    const superAdmin = roles.some((r) => SUPER_ADMIN_ROLE_PATTERN.test((r?.name || "").trim()));

    const names = new Set<string>();
    for (const role of roles) {
      for (const perm of role?.permissions || []) {
        const name = permissionName(perm);
        if (name) names.add(name);
      }
    }
    // Qo'shimcha huquqlar - Foydalanuvchilar sahifasida shu xodimga alohida berilgan
    for (const perm of (Array.isArray(user?.extraPermissions) ? user.extraPermissions : []) as PermissionLike[]) {
      const name = permissionName(perm);
      if (name) names.add(name);
    }
    return { isAdmin: admin, isSuperAdmin: superAdmin, granted: names };
  }, [user]);

  // Funksiyalar barqaror bo'lsin - useMemo/useEffect ichida ishlatiladi
  /** Aniq huquq nomi bo'yicha tekshirish: can("update:users") */
  const can = useCallback(
    (permissionName: string) => isAdmin || granted.has(permissionName),
    [isAdmin, granted],
  );

  /** Bo'limni ko'rish huquqi. `action` berilsa aynan shu huquq tekshiriladi */
  const canView = useCallback(
    (resource: string, action?: string) => can(`${action || "read"}:${resource}`),
    [can],
  );

  const canCreate = useCallback((resource: string) => can(`create:${resource}`), [can]);
  const canUpdate = useCallback((resource: string) => can(`update:${resource}`), [can]);
  const canDelete = useCallback((resource: string) => can(`delete:${resource}`), [can]);

  return { isAdmin, isSuperAdmin, can, canView, canCreate, canUpdate, canDelete };
}
