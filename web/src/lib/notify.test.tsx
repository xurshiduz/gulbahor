import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationPrompt } from '@/app/notification-prompt'

import { announce } from './notify'

interface Shown {
  title: string
  body?: string
  tag?: string
  onclick: (() => void) | null
}

/** The browser's notifications, as far as the system uses them. */
function fakeNotifications(permission: NotificationPermission, answer: NotificationPermission = 'granted') {
  const shown: Shown[] = []
  class FakeNotification {
    static permission = permission
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer
      return answer
    })
    onclick: (() => void) | null = null
    close = vi.fn()
    constructor(
      public title: string,
      options: { body?: string; tag?: string } = {},
    ) {
      shown.push(Object.assign(this, options) as unknown as Shown)
    }
  }
  vi.stubGlobal('Notification', FakeNotification)
  return { shown, ask: FakeNotification.requestPermission }
}

const away = (isAway: boolean) => vi.spyOn(document, 'hasFocus').mockReturnValue(!isAway)

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'focus').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('telling a person that something needs them', () => {
  it('goes to the desktop only when they are not working in the system', () => {
    const { shown } = fakeNotifications('granted')
    away(false)
    announce({ title: 'Darvoza', body: 'Futbolka', tag: 'a1' })
    expect(shown).toHaveLength(0)

    away(true)
    const go = vi.fn()
    announce({ title: 'Darvoza', body: 'Futbolka', tag: 'a2', open: { label: 'Jurnal', go } })
    expect(shown).toMatchObject([{ title: 'Darvoza', body: 'Futbolka', tag: 'a2' }])
    // A click on it brings the person to where the thing is dealt with.
    shown[0].onclick?.()
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('stays quiet in a tab in the background while another tab of the system is being worked in', () => {
    const { shown } = fakeNotifications('granted')
    away(true)
    localStorage.setItem('gb.focused-at', String(Date.now()))
    announce({ title: 'Darvoza', tag: 'b1' })
    expect(shown).toHaveLength(0)
    // The other tab was left a while ago.
    localStorage.setItem('gb.focused-at', String(Date.now() - 60_000))
    announce({ title: 'Darvoza', tag: 'b2' })
    expect(shown).toHaveLength(1)
  })

  it('never goes to the desktop without leave', () => {
    const { shown } = fakeNotifications('denied')
    away(true)
    announce({ title: 'Darvoza', tag: 'c1' })
    expect(shown).toHaveLength(0)
  })
})

describe('the question about notifications', () => {
  it('is put with a button, and answered yes shows what one looks like', async () => {
    const { shown, ask } = fakeNotifications('default')
    render(<NotificationPrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Yoqish' }))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(shown).toMatchObject([{ title: 'Bildirishnomalar yoqildi' }])
    expect(screen.queryByRole('button', { name: 'Yoqish' })).toBeNull()
  })

  it('put off, comes back the next day and not before', async () => {
    fakeNotifications('default')
    const first = render(<NotificationPrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Keyinroq' }))
    first.unmount()

    const second = render(<NotificationPrompt />)
    expect(screen.queryByRole('button', { name: 'Yoqish' })).toBeNull()
    second.unmount()

    localStorage.setItem('gb.notify.asked-at', String(Date.now() - 25 * 60 * 60 * 1000))
    render(<NotificationPrompt />)
    expect(screen.getByRole('button', { name: 'Yoqish' })).toBeTruthy()
  })

  it('is not put where the browser has already been answered', () => {
    fakeNotifications('granted')
    render(<NotificationPrompt />)
    expect(screen.queryByRole('button', { name: 'Yoqish' })).toBeNull()
  })
})
