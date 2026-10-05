import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { TabPanel, Tabs } from './controls'
import { DataTable } from './data-table'
import { Dialog } from './dialog'
import { TooltipProvider } from './feedback'
import { Page, PageActions, PageChrome } from './page'

const rowOf = (element: HTMLElement) => element.parentElement?.parentElement

/** A list remembers its columns through the query client. */
const inApp = (screenOf: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{screenOf}</TooltipProvider>
    </QueryClientProvider>,
  )

describe('Page', () => {
  it('shows its name above the content when it stands alone', () => {
    render(
      <Page title="Kirim" note="Chilonzor" actions={<button>Yaratish</button>}>
        <p>Mazmun</p>
      </Page>,
    )
    expect(screen.getByRole('heading', { name: 'Kirim' })).toBeTruthy()
    expect(screen.getByText('Chilonzor')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yaratish' })).toBeTruthy()
    expect(document.title).toBe('Kirim · Gulbahor')
  })

  it("puts its name into the frame's top bar and keeps the buttons with the content", () => {
    function Frame() {
      const [slot, setSlot] = useState<HTMLElement | null>(null)
      return (
        <>
          <header ref={setSlot} />
          <main>
            <PageChrome.Provider value={{ title: slot }}>
              <Page title="Kirim" actions={<button>Yaratish</button>}>
                <p>Mazmun</p>
              </Page>
            </PageChrome.Provider>
          </main>
        </>
      )
    }
    render(<Frame />)
    expect(screen.getByRole('heading', { name: 'Kirim' }).closest('header')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yaratish' }).closest('main')).toBeTruthy()
  })

  it('gives the buttons no row of their own when the tabs have room for them', () => {
    inApp(
      <Page title="Ma’lumotnomalar" actions={<button>Yuklash</button>}>
        <Tabs value="brands" onChange={() => undefined} tabs={[{ value: 'brands', label: 'Brendlar' }]}>
          <TabPanel value="brands">
            <PageActions>
              <button>Brend qo‘shish</button>
            </PageActions>
            <DataTable
              columns={[{ id: 'name', header: 'Nomi' }]}
              data={[]}
              rowId={(row: { id: string }) => row.id}
              toolbar={<input aria-label="Qidiruv" />}
            />
          </TabPanel>
        </Tabs>
      </Page>,
    )
    // The screen's button and the tab's button both sit in the row of the tabs.
    const tabsRow = rowOf(screen.getByRole('tab', { name: 'Brendlar' }))
    expect(tabsRow?.contains(screen.getByRole('button', { name: 'Yuklash' }))).toBe(true)
    expect(tabsRow?.contains(screen.getByRole('button', { name: 'Brend qo‘shish' }))).toBe(true)
    expect(tabsRow?.contains(screen.getByLabelText('Qidiruv'))).toBe(false)
  })

  it("ends a list's filter row with the buttons when there are no tabs", () => {
    inApp(
      <Page title="Kirim" actions={<button>Yaratish</button>}>
        <DataTable
          columns={[{ id: 'name', header: 'Nomi' }]}
          data={[]}
          rowId={(row: { id: string }) => row.id}
          toolbar={<input aria-label="Qidiruv" />}
        />
      </Page>,
    )
    const filterRow = rowOf(screen.getByLabelText('Qidiruv'))
    expect(filterRow?.contains(screen.getByRole('button', { name: 'Yaratish' }))).toBe(true)
  })

  it('leaves the rows of a dialog out of it', () => {
    inApp(
      <Page title="Kirim" actions={<button>Yaratish</button>}>
        <Dialog open onClose={() => undefined} title="Tanlash">
          <DataTable
            columns={[{ id: 'name', header: 'Nomi' }]}
            data={[]}
            rowId={(row: { id: string }) => row.id}
            toolbar={<input aria-label="Qidiruv" />}
          />
        </Dialog>
      </Page>,
    )
    expect(screen.getByRole('dialog').contains(screen.getByRole('button', { name: 'Yaratish', hidden: true }))).toBe(
      false,
    )
  })
})

describe('DataTable filters', () => {
  it('puts each filter under the header of its column, and one whose column is not shown beside the search', () => {
    inApp(
      <DataTable
        columns={[
          { id: 'name', header: 'Nomi' },
          { id: 'status', header: 'Holati' },
        ]}
        data={[]}
        rowId={(row: { id: string }) => row.id}
        toolbar={<input aria-label="Qidiruv" />}
        filters={{
          status: <input aria-label="Holat filtri" />,
          gone: <input aria-label="Ustunsiz filtr" />,
        }}
      />,
    )
    const header = screen.getByRole('columnheader', { name: 'Holati' }) as HTMLTableCellElement
    const cell = screen.getByLabelText('Holat filtri').closest('th')
    expect(cell?.cellIndex).toBe(header.cellIndex)
    expect(cell?.parentElement).not.toBe(header.parentElement)
    // No column to sit under: it stays within reach, in the row of the search.
    expect(screen.getByLabelText('Ustunsiz filtr').closest('th')).toBeNull()
    expect(rowOf(screen.getByLabelText('Qidiruv'))?.contains(screen.getByLabelText('Ustunsiz filtr'))).toBe(true)
  })
})
