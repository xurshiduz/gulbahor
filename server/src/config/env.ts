import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  WEB_ORIGIN: z.string().url().default('http://localhost:5190'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  DB_TEST_NAME: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  /** Where photographs are kept. Left out: `uploads` beside the server. */
  UPLOADS_DIR: z.string().min(1).optional(),

  SEED_OWNER_LOGIN: z.string().default('admin'),
  SEED_OWNER_PASSWORD: z.string().optional(),
})

export type Env = z.infer<typeof schema>

/** Fails at start-up, with every problem listed, rather than at the first request. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid environment:\n${problems}`)
  }
  return parsed.data
}
