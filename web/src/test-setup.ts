import './i18n'

import { configureValidationMessages } from '@gulbahor/core'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

configureValidationMessages()

afterEach(() => cleanup())
