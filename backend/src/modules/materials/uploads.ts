import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, resolve, sep } from 'path';
import { diskStorage } from 'multer';

/**
 * Yuklangan fayllar papkasi. UPLOADS_DIR (.env) berilmasa - backend
 * papkasidagi `uploads`. Brauzerga `/uploads/...` manzilida beriladi (main.ts).
 */
export const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR?.trim() || join(process.cwd(), 'uploads'));
export const UPLOADS_URL = '/uploads';

const MATERIALS_DIR = join(UPLOADS_ROOT, 'materials');

/** Ruxsat etilgan rasm turlari. Kengaytma fayl nomidan emas, shu jadvaldan olinadi */
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_MATERIAL = 10;

/** Material rasmlari uchun multer sozlamasi: tasodifiy nom, faqat rasm, 5 MB gacha */
export const materialImageUpload = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(MATERIALS_DIR)) mkdirSync(MATERIALS_DIR, { recursive: true });
      cb(null, MATERIALS_DIR);
    },
    // Foydalanuvchi bergan nom ishlatilmaydi - tasodifiy nom va turiga mos kengaytma
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] || ''}`),
  }),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_IMAGES_PER_MATERIAL },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin'), false);
  },
};

export const materialImageUrl = (filename: string) => `${UPLOADS_URL}/materials/${filename}`;

/** Rasm faylini diskdan o'chiradi. Faqat uploads papkasi ichidagi fayl o'chiriladi */
export function removeUploadedFile(url: string) {
  if (!url?.startsWith(`${UPLOADS_URL}/`)) return;
  const path = resolve(UPLOADS_ROOT, url.slice(UPLOADS_URL.length + 1));
  if (!path.startsWith(UPLOADS_ROOT + sep)) return;
  try {
    unlinkSync(path);
  } catch {
    // Fayl allaqachon yo'q bo'lsa - e'tiborsiz
  }
}
