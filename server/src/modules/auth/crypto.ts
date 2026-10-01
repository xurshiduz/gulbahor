import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const KEY_LENGTH = 64

/** Hashes a password or PIN with scrypt: "scrypt$<salt>$<hash>". */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(secret, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, salt, hash] = (stored ?? '').split('$')
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false
  }
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scrypt(secret, Buffer.from(salt, 'base64url'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Burns the same time as a real check, so a missing login is not faster than a wrong password. */
export async function fakeVerify(secret: string): Promise<void> {
  await scrypt(secret, Buffer.alloc(16), KEY_LENGTH)
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Refresh tokens are stored hashed: a leaked database does not hand out sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}
