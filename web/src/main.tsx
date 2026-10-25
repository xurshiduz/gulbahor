import './styles/index.css'
import './i18n'

import { configureValidationMessages } from '@erp/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'

import { AppErrorBoundary } from './app/error-screen'
import { router } from './app/router'
import { ConfirmProvider } from './components/ui/dialog'
import { TooltipProvider } from './components/ui/feedback'
import { SessionGate } from './features/auth/session'
import { SetupPage } from './features/setup/setup-page'
import { queryClient } from './lib/query'
import { installSoftKeyboard } from './lib/soft-keyboard'

configureValidationMessages()
installSoftKeyboard()

// Installable as an app (on a phone's home screen, or as a window of its own). Only where it is served for real:
// the dev server's own reloading is left alone.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={350}>
          <ConfirmProvider>
            <SessionGate setup={<SetupPage />}>
              <RouterProvider router={router} />
            </SessionGate>
          </ConfirmProvider>
          {/* Messages come up in the top right corner, under the top bar; what they look like is in lib/toast.tsx. */}
          <Toaster position="top-right" expand visibleToasts={5} gap={8} offset={{ top: 56, right: 16 }} />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
