import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApprovalDialog } from './approval'

const MANAGER = '11111111-1111-4111-8111-111111111111'

describe('ApprovalDialog', () => {
  const open = (onApprove = vi.fn()) => {
    render(
      <ApprovalDialog
        approvers={[{ id: MANAGER, name: 'Anvar Menejer' }]}
        reason="Chegirma 20% — chegara 10%"
        onApprove={onApprove}
        onClose={() => undefined}
      />,
    )
    return onApprove
  }

  it("says what is being allowed and by whom, and takes the manager's PIN", async () => {
    const onApprove = open()
    expect(screen.getByText('Chegirma 20% — chegara 10%')).toBeTruthy()
    expect(screen.getByText('Anvar Menejer')).toBeTruthy()

    const pin = screen.getByLabelText(/PIN kod/) as HTMLInputElement
    // The PIN is not shown, and holds digits only.
    expect(pin.type).toBe('password')
    await userEvent.type(pin, '48a2 1')
    expect(pin.value).toBe('4821')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledWith({ userId: MANAGER, pin: '4821' }))
  })

  it('does not go on without a whole PIN', async () => {
    const onApprove = open()
    await userEvent.type(screen.getByLabelText(/PIN kod/), '48{Enter}')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onApprove).not.toHaveBeenCalled()
  })
})
