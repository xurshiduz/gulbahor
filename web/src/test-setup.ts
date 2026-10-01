import './i18n'

import { configureValidationMessages } from '@gulbahor/core'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

configureValidationMessages()

// jsdom lays nothing out, so it has nothing to scroll.
Element.prototype.scrollIntoView ??= () => {}

afterEach(() => cleanup())
