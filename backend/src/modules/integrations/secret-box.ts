import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Integratsiya kalitlarini bazada shifrlab saqlash (AES-256-GCM).
 *
 * Shifr kaliti serverdagi JWT_SECRET dan hosil qilinadi: bazani o'g'irlagan
 * odam kalitlarni o'qiy olmaydi. JWT_SECRET almashtirilsa eski kalitlar
 * ochilmaydi - ularni sozlamalardan qayta kiritish kerak bo'ladi.
 */

const PREFIX = 'enc:v1:';

function key() {
  const base = process.env.INTEGRATIONS_SECRET || process.env.JWT_SECRET || '';
  if (!base) throw new Error('JWT_SECRET sozlanmagan - kalitlarni shifrlab bo`lmaydi');
  return createHash('sha256').update(`${base}:gulbahor-integrations`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

/** Ochib bo'lmasa null (kalit almashgan yoki buzilgan) */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Javobda ko'rsatish uchun: faqat oxirgi 4 belgisi */
export function maskSecret(plain: string | null) {
  if (!plain) return null;
  return plain.length <= 4 ? '••••' : `••••${plain.slice(-4)}`;
}
