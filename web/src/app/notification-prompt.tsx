import { BellRing } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { allowNotifications, askToNotifyLater, greet, shouldAskToNotify } from '@/lib/notify'

/**
 * Asks, on coming into the system, whether desktop notifications may be
 * shown. The browser only puts its own question when a person clicks, so
 * this is a card with a button rather than a prompt fired on load. "Later"
 * is asked again the next day.
 */
export function NotificationPrompt() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(shouldAskToNotify)

  if (!visible) {
    return null
  }

  const later = () => {
    askToNotifyLater()
    setVisible(false)
  }
  const enable = async () => {
    setVisible(false)
    if (await allowNotifications()) {
      greet(t('notify.onTitle'), t('notify.onBody'))
    }
  }

  return (
    <div
      role="region"
      aria-labelledby="notification-prompt-title"
      className="fixed right-4 bottom-4 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 shadow-float"
    >
      <div className="flex gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p id="notification-prompt-title" className="text-sm font-semibold">
            {t('notify.promptTitle')}
          </p>
          <p className="mt-1 text-[13px] text-ink-2">{t('notify.promptBody')}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => void enable()}>
              {t('notify.enable')}
            </Button>
            <Button variant="ghost" onClick={later}>
              {t('notify.later')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
