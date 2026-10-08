import { hasPermission, PERMISSION_GROUPS, type RoleDto } from '@erp/core'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/controls'
import { useSession } from '@/features/auth/session'
import { cn } from '@/lib/cn'

interface ExtraPermissionsProps {
  roles: RoleDto[]
  /** The roles chosen in the form: what they give is shown ticked and cannot be unticked here. */
  roleIds: string[]
  value: string[]
  onChange: (value: string[]) => void
}

/**
 * What a person may do beside what their roles give: a trusted cashier who
 * may sell on credit. Folded away until wanted — most people have only
 * their role. Nobody hands out a permission they do not hold; one the person
 * already has can still be taken away.
 */
export function ExtraPermissions({ roles, roleIds, value, onChange }: ExtraPermissionsProps) {
  const { t } = useTranslation()
  const { can, hasModule } = useSession()
  const [open, setOpen] = useState(value.length > 0)
  const fromRoles = roles.filter((role) => roleIds.includes(role.id)).flatMap((role) => role.permissions)
  const groups = PERMISSION_GROUPS.filter((group) => !group.module || hasModule(group.module))
  // Only what the roles do not give counts: a role chosen later may cover a permission given before.
  const extra = value.filter((key) => !hasPermission(fromRoles, key))

  return (
    <div>
      <button
        type="button"
        data-enter-skip
        onClick={() => setOpen((was) => !was)}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
        {t('users.extraPermissions')}
        {extra.length ? <span className="text-accent-ink">+{extra.length}</span> : null}
      </button>
      {open ? (
        <div className="mt-2" data-enter-skip>
          <p className="mb-2 text-xs text-ink-3">{t('users.extraPermissionsHint')}</p>
          <div className="divide-y divide-line rounded-lg border border-line">
            {groups.map((group) => (
              <div key={group.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_1fr]">
                <p className="text-[13px] font-medium">{group.title}</p>
                <div className="flex flex-col gap-1.5">
                  {group.permissions.map((permission) => {
                    const byRole = hasPermission(fromRoles, permission.key)
                    const checked = byRole || value.includes(permission.key)
                    return (
                      <Checkbox
                        key={permission.key}
                        checked={checked}
                        disabled={byRole || (!can(permission.key) && !checked)}
                        onChange={(next) =>
                          onChange(next ? [...value, permission.key] : value.filter((key) => key !== permission.key))
                        }
                        label={
                          byRole ? (
                            <span>
                              {permission.title} <span className="text-ink-3">· {t('users.fromRole')}</span>
                            </span>
                          ) : (
                            permission.title
                          )
                        }
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
