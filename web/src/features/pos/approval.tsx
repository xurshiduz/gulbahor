import { approvalSchema, type ApprovalInput } from '@gulbahor/core'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { PinInput } from '@/components/ui/pin-input'
import { toast } from '@/lib/toast'

interface ApprovalDialogProps {
  /** Those who may allow this, and have a PIN. */
  approvers: { id: string; name: string }[]
  /** What is being allowed, in a line: "Chegirma 20% — chegara 10%". */
  reason: string
  onApprove: (approval: ApprovalInput) => void
  onClose: () => void
}

/**
 * A manager's word at the till. They come to the cashier's screen and type
 * their own PIN; it goes with the sale and is kept nowhere. A wrong PIN is
 * counted against its owner, so it cannot be guessed here.
 */
export function ApprovalDialog({ approvers, reason, onApprove, onClose }: ApprovalDialogProps) {
  const { t } = useTranslation()
  const [userId, setUserId] = useState(approvers[0]?.id ?? '')
  const [pin, setPin] = useState('')

  const submit = (code = pin) => {
    const parsed = approvalSchema.safeParse({ userId, pin: code })
    if (!parsed.success) {
      toast.error(t('pos.pinNeeded'))
      return
    }
    onApprove(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('pos.approvalTitle')}
      description={reason}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="approval-form" variant="primary">
            <ShieldCheck />
            {t('pos.approve')}
          </Button>
        </>
      }
    >
      <Form id="approval-form" onSubmit={() => submit()}>
        <Field label={t('pos.approver')}>
          {(id) =>
            approvers.length > 1 ? (
              <Select
                id={id}
                value={userId}
                onChange={setUserId}
                options={approvers.map((approver) => ({ value: approver.id, label: approver.name }))}
              />
            ) : (
              <p className="text-[13px] font-medium">{approvers[0]?.name}</p>
            )
          }
        </Field>
        <Field label={t('pos.pin')} required>
          {/* The last digit is the manager's word: nothing more is pressed. */}
          {(id) => <PinInput id={id} autoFocus value={pin} onChange={setPin} onComplete={submit} />}
        </Field>
      </Form>
    </Dialog>
  )
}
