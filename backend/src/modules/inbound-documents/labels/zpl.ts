/**
 * Etiketka uchun ZPL buyruqlari (RFID printer: Chainway CP30 va ZPL
 * tushunadigan boshqa printerlar).
 *
 * Bitta etiketka = bitta ^XA...^XZ bloki: matn, shtrix-kod va RFID chipga
 * yoziladigan EPC kodi. Printer etiketkani bosish bilan birga chipni ham
 * yozadi - alohida qadam kerak emas.
 */

export interface LabelSize {
  /** mm */
  width: number;
  height: number;
}

/** Tanlash mumkin bo'lgan o'lchamlar (mm). Kalit frontend bilan bir xil */
export const LABEL_SIZES: Record<string, LabelSize> = {
  '40x30': { width: 40, height: 30 },
  '50x30': { width: 50, height: 30 },
  '60x40': { width: 60, height: 40 },
  '70x40': { width: 70, height: 40 },
};
export const DEFAULT_LABEL_SIZE = '50x30';

export interface LabelData {
  name: string;
  /** "M · Qora · Zara" */
  details: string;
  sku: string | null;
  barcode: string | null;
  epc: string;
  /** "3/10" - shu tovarning nechanchi donasi */
  unit: string;
}

/** Printer aniqligi: 203 dpi = 8 nuqta/mm (CP30 standart kallagi) */
const DOTS_PER_MM = 8;

/** ^ va ~ ZPL da buyruq boshlanishi - ma'lumot ichida bo'lmasligi kerak */
const clean = (value: string | null | undefined) => String(value || '').replace(/[\^~\\]/g, ' ').replace(/\s+/g, ' ').trim();

export function buildLabelZpl(label: LabelData, size: LabelSize, withRfid = true): string {
  const width = size.width * DOTS_PER_MM;
  const height = size.height * DOTS_PER_MM;
  const margin = 16;
  const inner = width - margin * 2;
  const small = size.height <= 30;

  const nameFont = small ? 24 : 30;
  const textFont = small ? 20 : 24;
  const barcodeHeight = small ? 50 : 80;
  const code = clean(label.barcode) || clean(label.sku);

  const lines = [
    '^XA',
    '^CI28', // UTF-8: o'zbekcha va kirill harflar
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
  ];

  if (withRfid) {
    // Chipga EPC yozish: hex ko'rinishida, 96 bit. Yozib bo'lmasa printer
    // etiketkani "VOID" qilib, keyingisida qayta urinadi (2 martagacha)
    lines.push('^RS8,,,2', `^RFW,H^FD${label.epc}^FS`);
  }

  let y = margin;
  lines.push(`^FO${margin},${y}^A0N,${nameFont},${nameFont}^FB${inner},2,2,L,0^FD${clean(label.name)}^FS`);
  y += nameFont * 2 + 8;

  const details = [clean(label.details), clean(label.sku)].filter(Boolean).join('  ');
  if (details) {
    lines.push(`^FO${margin},${y}^A0N,${textFont},${textFont}^FB${inner},1,0,L,0^FD${details}^FS`);
    y += textFont + 8;
  }

  if (code) {
    // Code 128; tagida raqami o'qiladigan matn bilan
    lines.push(`^FO${margin},${y}^BY2,3,${barcodeHeight}^BCN,${barcodeHeight},Y,N,N^FD${code}^FS`);
  }

  // Pastki qator: EPC (o'qib tekshirish uchun) va dona raqami
  const footer = height - margin - 16;
  lines.push(`^FO${margin},${footer}^A0N,16,16^FD${label.epc}^FS`);
  lines.push(`^FO${margin},${footer}^A0N,16,16^FB${inner},1,0,R,0^FD${clean(label.unit)}^FS`);

  lines.push('^PQ1', '^XZ');
  return lines.join('\n');
}
