import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PasswordInput } from './password-input'

describe('a password field', () => {
  it('hides what is typed until its eye is pressed, and hides it again', async () => {
    render(
      <label>
        Parol
        <PasswordInput />
      </label>,
    )
    const field = screen.getByLabelText('Parol') as HTMLInputElement
    expect(field.type).toBe('password')
    await userEvent.type(field, 'sirli-so‘z')

    await userEvent.click(screen.getByRole('button', { name: 'Parolni ko‘rsatish' }))
    expect(field.type).toBe('text')
    expect(field.value).toBe('sirli-so‘z')
    // The cursor stays in the field: the eye is pressed in the middle of typing.
    expect(document.activeElement).toBe(field)

    await userEvent.click(screen.getByRole('button', { name: 'Parolni yashirish' }))
    expect(field.type).toBe('password')
  })

  it('is passed by when Tab goes on from the password', async () => {
    render(
      <>
        <PasswordInput aria-label="Parol" />
        <button type="button">Kirish</button>
      </>,
    )
    screen.getByLabelText('Parol').focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kirish' }))
  })
})
