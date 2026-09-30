import { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Russian } from 'flatpickr/dist/l10n/ru.js';
import 'flatpickr/dist/flatpickr.css';
import { CalendarDays, X } from 'lucide-react';

/**
 * Sana oralig'i - bitta maydon, bosilganda kalendar ochiladi, undan
 * boshlanish va tugash sanasi ketma-ket tanlanadi. Qiymatlar YYYY-MM-DD.
 * Brauzerning o'z sana maydoni o'rniga: hamma joyda bir xil kalendar.
 */
export default function DateRangePicker({
  start,
  end,
  onChange,
  className = 'w-56',
  clearable = false,
  single = false,
  minDate,
  maxDate,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  /** Tashqi o'ram sinfi - kenglik shu yerda (sukut w-56) */
  className?: string;
  /** Bo'sh qoldirish mumkin - "x" bilan tozalanadi (filtrlarda) */
  clearable?: boolean;
  /** Bitta sana - onChange(sana, sana) */
  single?: boolean;
  /** Tanlash mumkin bo'lgan oraliq (YYYY-MM-DD) */
  minDate?: string;
  maxDate?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<flatpickr.Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current) return;
    /*
     * altInput va static ishlatilmaydi: ular maydonni o'rab, ikkinchi input
     * qo'shib DOM'ni o'zgartiradi - React bilan chalkashib ikkita maydon
     * ko'rinib qolardi. Maydonda d.m.Y ko'rinadi, tashqariga Y-m-d beriladi.
     */
    const picker = flatpickr(inputRef.current, {
      mode: single ? 'single' : 'range',
      // Qo'lda ham yoziladi: 01.09.2026 - 20.09.2026 (Enter yoki chiqib ketganda qabul qilinadi)
      allowInput: true,
      minDate: minDate ? new Date(minDate) : undefined,
      maxDate: maxDate ? new Date(maxDate) : undefined,
      locale: Russian,
      dateFormat: 'd.m.Y',
      defaultDate: single ? (start ? new Date(start) : undefined) : start && end ? [new Date(start), new Date(end)] : undefined,
      onClose: (dates, _str, instance) => {
        if (single) {
          if (dates.length) { const day = instance.formatDate(dates[0], 'Y-m-d'); onChangeRef.current(day, day); }
          return;
        }
        if (dates.length === 2) {
          onChangeRef.current(instance.formatDate(dates[0], 'Y-m-d'), instance.formatDate(dates[1], 'Y-m-d'));
        } else if (dates.length === 1) {
          // Bitta kun tanlab yopilsa - shu kunning o'zi
          const day = instance.formatDate(dates[0], 'Y-m-d');
          instance.setDate([dates[0], dates[0]], false);
          onChangeRef.current(day, day);
        }
      },
    });
    pickerRef.current = picker;
    return () => picker.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tashqaridan (tez tugmalar) o'zgarsa kalendar ham yangilanadi
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    if (single) {
      const cur = picker.selectedDates[0] ? picker.formatDate(picker.selectedDates[0], 'Y-m-d') : '';
      if (!start) { if (cur) picker.clear(false); } else if (cur !== start) picker.setDate(new Date(start), false);
      return;
    }
    if (!start || !end) { if (picker.selectedDates.length) picker.clear(false); return; }
    const current = picker.selectedDates.map((d) => picker.formatDate(d, 'Y-m-d'));
    if (current[0] !== start || current[1] !== end) picker.setDate([new Date(start), new Date(end)], false);
  }, [start, end]);

  const clear = () => { pickerRef.current?.clear(false); onChangeRef.current('', ''); };

  /**
   * Qo'lda yozilgan sanani qabul qilish. "01.09.2026 - 20.09.2026",
   * "01.09.2026 — 20.09.2026", "1.9.26 20.9.26" - hammasi o'qiladi;
   * bitta sana yozilsa o'sha kunning o'zi. O'qib bo'lmasa avvalgi qiymat qaytadi.
   */
  const commitTyped = () => {
    const picker = pickerRef.current;
    const input = inputRef.current;
    if (!picker || !input) return;
    const text = input.value.trim();
    if (!text) { if (start) clear(); return; }
    const found = [...text.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/g)]
      .map((m) => {
        const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
        return d.getFullYear() === y && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]) ? d : null;
      })
      .filter((d): d is Date => !!d)
      // Qo'lda yozilgan sana ham ruxsat etilgan oraliqdan chiqmasin
      .map((d) => {
        if (minDate && d < new Date(`${minDate}T00:00:00`)) return new Date(`${minDate}T00:00:00`);
        if (maxDate && d > new Date(`${maxDate}T00:00:00`)) return new Date(`${maxDate}T00:00:00`);
        return d;
      });
    const fmt = (d: Date) => picker.formatDate(d, 'Y-m-d');
    const revert = () => picker.setDate(picker.selectedDates, false);
    if (!found.length) { revert(); return; }
    if (single) {
      picker.setDate(found[0], false);
      onChangeRef.current(fmt(found[0]), fmt(found[0]));
      return;
    }
    const [a, b] = found.length >= 2 ? [found[0], found[1]].sort((x, y) => x.getTime() - y.getTime()) : [found[0], found[0]];
    picker.setDate([a, b], false);
    onChangeRef.current(fmt(a), fmt(b));
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        placeholder={single ? 'Sana' : "Sana oralig'i (01.09.2026 - 20.09.2026)"}
        title="Kalendardan tanlang yoki qo'lda yozing: 01.09.2026 - 20.09.2026"
        onBlur={commitTyped}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTyped(); pickerRef.current?.close(); } }}
        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-3 pr-9 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      {clearable && start ? (
        <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Tozalash">
          <X className="h-4 w-4" />
        </button>
      ) : (
        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      )}
    </div>
  );
}
