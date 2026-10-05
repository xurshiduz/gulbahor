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
    // The PIN holds digits only, and the cursor is in it from the start.
    expect(document.activeElement).toBe(pin)
    await userEvent.type(pin, '48a2 ')
    expect(pin.value).toBe('482')
    expect(onApprove).not.toHaveBeenCalled()
    // It is not shown: the boxes only say how far it has got.
    expect(document.querySelectorAll('[data-pin-box="filled"]').length).toBe(3)
    expect(document.querySelector('[data-pin]')?.textContent).toBe('')
    // The last digit is the manager's word: nothing more is pressed.
    await userEvent.keyboard('1')
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledWith({ userId: MANAGER, pin: '4821' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('does not go on without a whole PIN', async () => {
    const onApprove = open()
    await userEvent.type(screen.getByLabelText(/PIN kod/), '48{Enter}')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onApprove).not.toHaveBeenCalled()
  })
})
