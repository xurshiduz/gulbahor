/**
 * RFID skanerlar EPC ni turli ko'rinishda beradi: kichik harf, bo'shliq yoki
 * tire bilan, ba'zilari oldiga PC so'zini (4 hex: 3000, 3400...) qo'shadi.
 * Hammasi bitta ko'rinishga keltiriladi: 24 ta katta hex belgi (96 bit).
 * EPC ga o'xshamasa null (masalan oddiy shtrix-kod).
 */
export function normalizeEpc(raw: string): string | null {
  const value = String(raw || '').trim().toUpperCase().replace(/[\s:-]/g, '');
  if (!/^[0-9A-F]+$/.test(value)) return null;
  if (value.length === 24) return value;
  // PC (Protocol Control) so'zi + EPC
  if (value.length === 28) return value.slice(4);
  // Ba'zi skanerlar oxiriga CRC (4 hex) ham qo'shadi: PC + EPC + CRC
  if (value.length === 32) return value.slice(4, 28);
  return null;
}
