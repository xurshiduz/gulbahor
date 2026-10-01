import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/ui/dialog'
import { Kbd, Shortcut } from '@/components/ui/feedback'
import { useRegisteredHotkeys } from '@/lib/hotkeys'

/**
 * F1: every shortcut that works on the current screen. The registered ones
 * are listed live; the ones built into lists and forms are written out,
 * because they work the same everywhere.
 */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const registered = useRegisteredHotkeys()

  const groups = new Map<string, { keys: React.ReactNode; label: string }[]>()
  const add = (group: string, keys: React.ReactNode, label: string) => {
    groups.set(group, [...(groups.get(group) ?? []), { keys, label }])
  }

  for (const hotkey of registered) {
    add(hotkey.group || t('shortcuts.groupGlobal'), <Shortcut combo={hotkey.combo} />, hotkey.label)
  }

  const list = t('shortcuts.groupList')
  add(list, <><Kbd>↑</Kbd><Kbd>↓</Kbd></>, t('shortcuts.rowUpDown'))
  add(list, <Kbd>Enter</Kbd>, t('shortcuts.rowOpen'))
  add(list, <Kbd>PgUp</Kbd>, t('shortcuts.prevPage'))
  add(list, <Kbd>PgDn</Kbd>, t('shortcuts.nextPage'))

  const form = t('shortcuts.groupForm')
  add(form, <Kbd>Enter</Kbd>, t('shortcuts.nextField'))
  add(form, <Shortcut combo="mod+enter" />, t('shortcuts.submit'))
  add(form, <Kbd>Esc</Kbd>, t('shortcuts.closeDialog'))

  return (
    <Dialog open={open} onClose={onClose} title={t('shortcuts.title')} size="lg">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {[...groups.entries()].map(([group, items]) => (
          <section key={group}>
            <h3 className="eyebrow mb-1.5">{group}</h3>
            <ul>
              {items.map((item, index) => (
                <li key={index} className="flex h-8 items-center justify-between gap-4 border-b border-line text-[13px] last:border-0">
                  <span className="truncate text-ink-2">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-0.5">{item.keys}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
