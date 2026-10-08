/**
 * Everything a person may do, as SQL over a row `u` of `users`: what their
 * roles give, and what was given to them beside the roles. Who signs in and
 * who may give a manager's word at the till read it the same way.
 */
export const USER_PERMISSIONS = `coalesce((
  SELECT array_agg(DISTINCT granted.permission)
  FROM (
    SELECT unnest(r.permissions) AS permission
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id
    UNION
    SELECT unnest(u.extra_permissions)
  ) granted
), '{}')`
