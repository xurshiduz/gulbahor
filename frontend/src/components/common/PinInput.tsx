import { useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";

/**
 * 4 ta katakchali PIN kiritish maydoni.
 *
 * - faqat raqam qabul qiladi
 * - bitta raqam yozilgach o'zi keyingi katakchaga o'tadi
 * - Backspace bosilganda: katakcha bo'sh bo'lsa oldingisiga qaytib o'sha
 *   yerdagi raqamni o'chiradi, bo'sh bo'lmasa o'zinikini o'chiradi
 *
 * Qiymat tashqarida saqlanadi (masalan "12" - ikkita raqam kiritilgan).
 *
 * Katakcha soni sozlanadi: 4 ta PIN uchun, 9 ta telefon raqami uchun.
 * Uzunroq maydonda ("sm") katakchalar qat'iy kenglikda emas, bor joyni
 * teng bo'lib oladi - aks holda 9 tasi modaldan chiqib ketardi.
 */
export default function PinInput({
  value,
  onChange,
  onComplete,
  length = 4,
  autoFocus = false,
  disabled = false,
  invalid = false,
  size = "md",
  masked = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  size?: "md" | "sm";
  /** Raqamlar o'rniga nuqta ko'rsatiladi (ekran bloki - yonidagi odam ko'rmasin) */
  masked?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const focusAt = (index: number) => {
    const target = inputs.current[Math.max(0, Math.min(index, length - 1))];
    target?.focus();
    target?.select();
  };

  const emit = (next: string) => {
    onChange(next);
    // Oradagi katakcha bo'sh qolishi mumkin - faqat to'liq raqamli bo'lsa tayyor
    if (next.length === length && /^\d+$/.test(next)) onComplete?.(next);
  };

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    // Telefon klaviaturasi bir vaqtda bir nechta belgi yuborishi mumkin
    const digits = event.target.value.replace(/\D/g, "");

    // Raqam bo'lmagan belgi kiritilsa React holati o'zgarmaydi, demak qayta
    // render ham bo'lmaydi va katakchada o'sha harf qolib ketardi - keyin
    // maxLength=1 sababli katakcha "band" bo'lib, raqam kiritib bo'lmasdi.
    // Shuning uchun DOM qiymatini qo'lda holatga qaytaramiz.
    if (!digits) {
      const current = value[index];
      event.target.value = current && current !== " " ? current : "";
      return;
    }

    const chars = value.padEnd(length, " ").split("");
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= length) break;
      chars[cursor] = digit;
      cursor += 1;
    }

    emit(chars.join("").trimEnd());
    focusAt(cursor);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const chars = value.padEnd(length, " ").split("");

      if (chars[index] && chars[index] !== " ") {
        // Shu katakchada raqam bor - o'zini o'chiramiz
        chars[index] = " ";
        emit(chars.join("").trimEnd());
        return;
      }

      // Bo'sh katakcha - oldingisiga o'tib, o'shanikini o'chiramiz
      if (index > 0) {
        chars[index - 1] = " ";
        emit(chars.join("").trimEnd());
        focusAt(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    emit(digits);
    focusAt(digits.length);
  };

  const box = size === "sm" ? "flex-1 min-w-0 h-11 text-lg" : "w-12 h-14 text-2xl";

  return (
    <div className={`flex items-center ${size === "sm" ? "w-full gap-1" : "gap-2.5"}`}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(element) => { inputs.current[index] = element; }}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          value={value[index] && value[index] !== " " ? value[index] : ""}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={`${box} text-center font-semibold rounded-xl border bg-white text-gray-900 shadow-sm transition-colors focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-white ${
            invalid
              ? "border-red-400 focus:border-red-500 focus:ring-red-200 dark:border-red-500 dark:focus:ring-red-500/30"
              : "border-gray-200 focus:border-brand-500 focus:ring-brand-200 dark:border-gray-700 dark:focus:ring-brand-500/30"
          } disabled:opacity-50`}
        />
      ))}
    </div>
  );
}
