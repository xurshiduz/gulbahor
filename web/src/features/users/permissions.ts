import { hasPermission, PERMISSION_GROUPS, type RoleDto } from '@gulbahor/core'

// Kept apart from the form: these are read by tests, which have no session.

/** The permissions to send: those the roles do not give already. */
export const extrasBeyond = (roles: RoleDto[], roleIds: string[], value: string[]) => {
  const fromRoles = roles.filter((role) => roleIds.includes(role.id)).flatMap((role) => role.permissions)
  return value.filter((key) => !hasPermission(fromRoles, key))
}

/** "Kassa: Qarzga sotish, Hisobotlar: Savdo": permissions as the screens name them. */
export const permissionNames = (keys: string[]) =>
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.filter((item) => keys.includes(item.key)).map((item) => `${group.title}: ${item.title}`),
  ).join(', ')
