import type { PosCustomerDto } from '@erp/core'

import { CustomerDialog } from '@/features/customers/customers-page'
import { useCustomerGroups } from '@/features/customers/groups-tab'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'

/** The customer book's whole card, opened at the till by whoever keeps the book; the new customer comes back as the till knows them. */
export default function BookCustomerDialog({
  initial,
  onClose,
  onAdded,
}: {
  initial: { name?: string; phone?: string }
  onClose: () => void
  onAdded: (customer: PosCustomerDto) => void
}) {
  const groups = useCustomerGroups()
  return (
    <CustomerDialog
      customer={null}
      initial={initial}
      groups={(groups.data ?? []).filter((group) => group.isActive)}
      onClose={onClose}
      onSaved={(saved) =>
        void api
          .get<PosCustomerDto>(`/pos/customers/${saved.id}`)
          .then(onAdded)
          .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
      }
    />
  )
}
