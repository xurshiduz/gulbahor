import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Dialog } from './dialog'
import { Form } from './form'

describe('Dialog', () => {
  const open = (onSubmit: () => void) =>
    render(
      <Dialog
        open
        onClose={() => undefined}
        title="Etiketka"
        footer={
          <button type="submit" form="dialog-form">
            Saqlash
          </button>
        }
      >
        <Form id="dialog-form" onSubmit={onSubmit}>
          <input aria-label="Nomi" />
        </Form>
      </Dialog>,
    )

  it('saves with Ctrl+Enter wherever the cursor is, and only once', async () => {
    const onSubmit = vi.fn()
    open(onSubmit)

    // Outside the form: on the button that closes the dialog.
    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Inside the form the form itself takes the key; the dialog must not send it again.
    screen.getByLabelText('Nomi').focus()
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('leaves a plain Enter alone', async () => {
    const onSubmit = vi.fn()
    open(onSubmit)
    screen.getAllByRole('button')[0].focus()
    // Enter on the close button presses it; nothing is saved.
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
