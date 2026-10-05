import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HotkeyScope, useCovered, useHotkey } from './hotkeys'
import { useScanner } from './scanner'

interface KeysProps {
  onKey: () => void
  onScan?: (code: string) => void
  onCovered?: (covered: boolean) => void
  everywhere?: boolean
}

/** A reader types far faster than a person: all of this lands within a millisecond or two. */
const scan = (code: string) => {
  for (const key of [...code, 'Enter']) {
    fireEvent.keyDown(document.body, { key })
  }
}

/** A screen, or a window over it: answers F9 and listens for a scanner. */
function Keys({ onKey, onScan, onCovered, everywhere }: KeysProps) {
  useHotkey('f9', onKey, { everywhere })
  useScanner((code) => onScan?.(code))
  const covered = useCovered()
  onCovered?.(covered)
  return null
}

describe('a window opened over any screen', () => {
  it('takes the keys: the screen under it does not answer until it closes', async () => {
    const screenKey = vi.fn()
    const windowKey = vi.fn()
    const Both = ({ open }: { open: boolean }) => (
      <>
        <Keys onKey={screenKey} />
        {open ? (
          <HotkeyScope>
            <Keys onKey={windowKey} />
          </HotkeyScope>
        ) : null}
      </>
    )
    const view = render(<Both open={false} />)
    await userEvent.keyboard('{F9}')
    expect(screenKey).toHaveBeenCalledTimes(1)

    view.rerender(<Both open />)
    await userEvent.keyboard('{F9}')
    expect(windowKey).toHaveBeenCalledTimes(1)
    expect(screenKey).toHaveBeenCalledTimes(1)

    view.rerender(<Both open={false} />)
    await userEvent.keyboard('{F9}')
    expect(screenKey).toHaveBeenCalledTimes(2)
  })

  it('leaves the keys that must answer everywhere, and holds scanned codes back from the screen', async () => {
    const lock = vi.fn()
    const scanned = vi.fn()
    const covered: boolean[] = []
    const Both = ({ open }: { open: boolean }) => (
      <>
        <Keys onKey={lock} onScan={scanned} onCovered={(value) => covered.push(value)} everywhere />
        {open ? (
          <HotkeyScope>
            <Keys onKey={() => false} />
          </HotkeyScope>
        ) : null}
      </>
    )
    const view = render(<Both open />)
    await userEvent.keyboard('{F9}')
    expect(lock).toHaveBeenCalledTimes(1)
    expect(covered.at(-1)).toBe(true)
    scan('4780012345678')
    expect(scanned).not.toHaveBeenCalled()

    view.rerender(<Both open={false} />)
    expect(covered.at(-1)).toBe(false)
    scan('4780012345678')
    expect(scanned).toHaveBeenCalledWith('4780012345678')
  })
})
