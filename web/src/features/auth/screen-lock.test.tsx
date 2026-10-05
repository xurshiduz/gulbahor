import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '@/lib/api'

import { ScreenLock } from './screen-lock'

const logout = vi.fn(() => Promise.resolve())

// The session itself needs a server; the lock needs only a name and a way out.
vi.mock('./session', () => ({
  useSession: () => ({ me: { user: { fullName: 'Dilnoza Karimova' } }, logout }),
}))

const field = () => screen.getByLabelText('PIN kod') as HTMLInputElement
const boxes = () => [...document.querySelectorAll('[data-pin-box]')].map((box) => box.getAttribute('data-pin-box'))

afterEach(() => {
  vi.restoreAllMocks()
  logout.mockClear()
})

describe('the locked screen', () => {
  it('opens as the fourth digit goes in, with nothing more pressed', async () => {
    const asked = vi.spyOn(api, 'post').mockResolvedValue(undefined as never)
    const opened = vi.fn()
    render(<ScreenLock onUnlocked={opened} />)
    expect(screen.getByText('Dilnoza Karimova')).toBeTruthy()
    // The cursor is in the PIN from the start.
    expect(document.activeElement).toBe(field())

    await userEvent.keyboard('482')
    expect(asked).not.toHaveBeenCalled()
    await userEvent.keyboard('1')
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(asked).toHaveBeenCalledTimes(1)
    expect(asked).toHaveBeenCalledWith('/auth/unlock', { pin: '4821' })
  })

  it('shakes, turns red and empties when the PIN is wrong, ready for another try', async () => {
    const asked = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiError(400, 'VALIDATION', 'Xato', { pin: "PIN noto'g'ri. Yana 4 ta urinish qoldi" }))
      .mockResolvedValueOnce(undefined as never)
    const opened = vi.fn()
    render(<ScreenLock onUnlocked={opened} />)

    await userEvent.keyboard('0000')
    expect((await screen.findByRole('alert')).textContent).toBe("PIN noto'g'ri. Yana 4 ta urinish qoldi")
    expect(opened).not.toHaveBeenCalled()
    expect(boxes()).toEqual(['empty', 'empty', 'empty', 'empty'])
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect((document.querySelector('[data-pin] > div') as HTMLElement).className).toContain('animate-shake')
    // The cursor is back in the boxes: the right one is typed straight away.
    expect(document.activeElement).toBe(field())

    await userEvent.keyboard('4')
    // Typing again takes the red away.
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.keyboard('821')
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(asked).toHaveBeenLastCalledWith('/auth/unlock', { pin: '4821' })
  })

  it('ends the session when the PIN was wrong too many times', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sessiya tugadi'))
    const opened = vi.fn()
    render(<ScreenLock onUnlocked={opened} />)
    await userEvent.keyboard('0000')
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(opened).toHaveBeenCalledTimes(1)
  })
})
