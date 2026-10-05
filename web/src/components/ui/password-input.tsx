import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, type InputProps } from './input'

/**
 * A password, with an eye to look at what was typed: a slip of the finger
 * is seen before it is sent, not after. Tab goes past the eye — it is for
 * the mouse, in the middle of typing.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'prefix' | 'suffix'>>(
  function PasswordInput(props, ref) {
    const { t } = useTranslation()
    const [shown, setShown] = useState(false)
    const label = shown ? t('auth.hidePassword') : t('auth.showPassword')
    return (
      <Input
        ref={ref}
        type={shown ? 'text' : 'password'}
        suffix={
          <button
            type="button"
            tabIndex={-1}
            title={label}
            aria-label={label}
            aria-pressed={shown}
            disabled={props.disabled}
            // The field keeps the cursor.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShown((now) => !now)}
            className="-mr-1 flex size-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-sunken hover:text-ink [&_svg]:size-4"
          >
            {shown ? <EyeOff /> : <Eye />}
          </button>
        }
        {...props}
      />
    )
  },
)
