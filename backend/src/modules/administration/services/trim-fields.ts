import { DeepPartial } from 'typeorm';

/**
 * Matn maydonlarini tozalaydi: chetidagi bo'sh joylar olib tashlanadi,
 * bo'sh satr esa null bo'ladi (forma to'ldirilmagan maydonni "" yuboradi).
 * Yuborilmagan (undefined) maydonlarga tegilmaydi.
 */
export function trimFields<T>(dto: DeepPartial<T>, fields: (keyof T)[]): DeepPartial<T> {
  const data: any = { ...dto };
  for (const field of fields) {
    if (data[field] === undefined) continue;
    data[field] = String(data[field] ?? '').trim() || null;
  }
  return data;
}
