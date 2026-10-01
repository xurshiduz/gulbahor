import { Injectable, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

import { AppError } from './errors'

/** Validates a body or query against a contract schema and returns the parsed value. */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (result.success) {
      return result.data
    }
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_'
      fields[path] ??= issue.message
    }
    throw AppError.validation(fields)
  }
}

export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema)
