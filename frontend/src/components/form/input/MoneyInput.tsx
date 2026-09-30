import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Pul/narx maydoni. Terish paytidayoq minglar ajratib ko'rsatiladi
 * ("1 000 000"), kasr qismi vergul bilan ("1 000,10"; nuqta ham qabul
 * qilinadi, 2 xonagacha). Kursor yozilayotgan joyida qoladi - ajratgich
 * qo'shilganda oxiriga sakrab ketmaydi. Qiymat son sifatida (1000.1)
 * qaytariladi.
 */
const groupInt = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Sondan ko'rsatiladigan matn: 1000.1 -> "1 000,1" (fixed bo'lsa "1 000,10") */
const fromNumber = (n: number, fixed = false) => {
  if (!n) return '';
  const rounded = Math.round(n * 100) / 100;
  const [i, d] = (fixed ? rounded.toFixed(2) : rounded.toString()).split('.');
  return groupInt(i) + (d ? `,${d}` : '');
};

/** Terilgan matndan ko'rsatiladigan matn va son */
const parseTyped = (raw: string): { text: string; value: number } => {
  let clean = raw.replace(/[\s ]/g, '').replace(/,/g, '.');
  const dot = clean.indexOf('.');
  if (dot >= 0) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
  let [intPart, decPart] = clean.split('.');
  intPart = intPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (decPart !== undefined) decPart = decPart.replace(/\D/g, '').slice(0, 2);
  const text = groupInt(intPart) + (dot >= 0 ? `,${decPart || ''}` : '');
  const value = Number(`${intPart || '0'}.${decPart || '0'}`);
  return { text, value: Number.isFinite(value) ? value : 0 };
};

export default function MoneyInput({
  value,
  onChange,
  disabled,
  className,
  placeholder,
  inputMode = 'decimal',
  fixed = false,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
  /** Fokusdan chiqqanda doim 2 xonali kasr: "1 500 000,00" */
  fixed?: boolean;
  [key: `data-${string}`]: string | undefined;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, 'onKeyDown' | 'title'>) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(fromNumber(Number(value) || 0, fixed));
  const [focused, setFocused] = useState(false);
  const caret = useRef<number | null>(null);

  // Tashqaridan o'zgarsa (boshqa maydon orqali, masalan "Summasi") - fokusda bo'lmaganda yangilanadi
  const external = fromNumber(Number(value) || 0, fixed);
  const [lastExternal, setLastExternal] = useState(external);
  if (!focused && external !== lastExternal) {
    setLastExternal(external);
    setText(external);
  }

  // Ajratgich qo'shilgach kursorni o'z joyiga qaytarish
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  return (
    <input
      ref={ref}
      type="text"
      inputMode={inputMode}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onClick={(e) => (e.target as HTMLInputElement).select()}
      onBlur={() => { setFocused(false); const t = fromNumber(Number(value) || 0, fixed); setText(t); setLastExternal(t); }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^[\d\s .,]*$/.test(raw)) return;
        // Kursordan oldingi "ma'noli" belgilar (raqam va kasr ajratgich) soni
        const before = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/[^\d.,]/g, '').length;
        const { text: next, value: n } = parseTyped(raw);
        let pos = 0;
        for (let seen = 0; pos < next.length && seen < before; pos++) if (/[\d,]/.test(next[pos])) seen++;
        caret.current = pos;
        setText(next);
        onChange(Math.round(n * 100) / 100);
      }}
      {...rest}
    />
  );
}
