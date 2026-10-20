import type { CardNoticeDto, CardPickDto } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NoticePicks, pickTime } from './notice-picks'
import { NoticeStanding } from './notice-parts'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const pick = (id: string, amount: number, at: string): CardPickDto => ({
  id,
  accountId: 'card',
  direction: 'in',
  amount,
  currency: 'UZS',
  at,
  receivedAt: `${at}:30.000Z`,
  heading: 'To‘ldirish',
  place: 'ZOOMRAD P2P',
})

describe('money picked from what the bank wrote', () => {
  it('says the bank’s minute short: today’s by the clock alone', () => {
    const today = new Date(2026, 9, 12, 18, 0)
    expect(pickTime({ at: '2026-10-12T14:05', receivedAt: '' }, today)).toBe('14:05')
    expect(pickTime({ at: '2026-10-11T20:04', receivedAt: '' }, today)).toBe('11.10 20:04')
  })

  it('makes the line’s sum of what is picked, and lets go of what is picked again', async () => {
    const onChange = vi.fn()
    const picks = [pick('a', 15_000_000, '2026-10-12T14:05'), pick('b', 5_000_000, '2026-10-12T13:58')]
    const { rerender } = render(<NoticePicks picks={picks} chosen={[]} onChange={onChange} />)
    expect(plain(screen.getByRole('button', { name: /14:05/ }).textContent)).toMatch(/150 000/)
    await userEvent.click(screen.getByRole('button', { name: /14:05/ }))
    expect(onChange).toHaveBeenLastCalledWith(['a'], 15_000_000)

    rerender(<NoticePicks picks={picks} chosen={['a']} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /14:05/ }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: /13:58/ }))
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'], 20_000_000)
    await userEvent.click(screen.getByRole('button', { name: /14:05/ }))
    expect(onChange).toHaveBeenLastCalledWith([], 0)
  })

  it('stands aside where the bank wrote nothing', () => {
    const { container } = render(<NoticePicks picks={[]} chosen={[]} onChange={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('where a notice stands', () => {
  const notice = (more: Partial<CardNoticeDto>) => ({ standing: 'open', ...more }) as CardNoticeDto

  it('names the document a notice is tied to, and the reason one is left off', () => {
    const { rerender } = render(<NoticeStanding notice={notice({})} />)
    expect(screen.getByText('hal qilinmagan')).toBeTruthy()
    rerender(
      <NoticeStanding
        notice={notice({
          standing: 'linked',
          linkWay: 'auto',
          document: { type: 'customer_payment', id: 'p1', number: 'TL-000004', who: 'Nodira' },
        })}
      />,
    )
    expect(plain(document.body.textContent)).toContain('To‘lov TL-000004 · Nodira')
    rerender(<NoticeStanding notice={notice({ standing: 'dismissed', reason: 'Egasining puli' })} />)
    expect(plain(document.body.textContent)).toContain('hisobga olinmadi')
    expect(plain(document.body.textContent)).toContain('Egasining puli')
  })
})
