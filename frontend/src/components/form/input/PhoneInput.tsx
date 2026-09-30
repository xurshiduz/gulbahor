/**
 * O'zbekiston telefon raqami: "+998" prefiksi doimiy, foydalanuvchi faqat
 * qolgan 9 raqamni teradi. Qiymat "+998XXXXXXXXX" ko'rinishida saqlanadi
 * (bo'sh bo'lsa ""). Eski yozuvlardagi boshqa ko'rinishlar (90 123 45 67,
 * 998901234567) ham o'qiladi - raqamlarning oxirgi 9 tasi olinadi.
 */

const PREFIX = '+998';

/** Saqlangan qiymatdan prefiksdan keyingi raqamlarni ajratish */
const localDigits = (value: string) => {
  const raw = String(value || '').trim();
  // O'zimiz saqlagan ko'rinish: prefiksdan keyingisi - nechta bo'lsa ham
  // (terish paytida "+9989" 4 ta raqam emas, "9" - bitta raqam)
  if (raw.startsWith(PREFIX)) return raw.slice(PREFIX.length).replace(/\D/g, '').slice(0, 9);
  const digits = raw.replace(/\D/g, '');
  const rest = digits.startsWith('998') && digits.length > 9 ? digits.slice(3) : digits;
  return rest.slice(-9);
};

/** 90 123 45 67 ko'rinishida ajratib ko'rsatish */
const pretty = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');

export default function PhoneInput({
  value,
  onChange,
  placeholder = '90 123 45 67',
  size = 'md',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
}) {
  const digits = localDigits(value);
  const h = size === 'sm' ? 'h-9 text-sm' : 'h-11 text-sm';

  return (
    <div className={`flex w-full items-stretch rounded-lg border border-gray-300 shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/20 dark:border-gray-700 dark:focus-within:border-brand-800 ${h}`}>
      <span className="flex items-center select-none rounded-l-lg border-r border-gray-300 bg-gray-50 px-3 font-mono text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        {PREFIX}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        value={pretty(digits)}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 9);
          onChange(next ? `${PREFIX}${next}` : '');
        }}
        className="min-w-0 flex-1 rounded-r-lg bg-transparent px-3 font-mono text-gray-800 placeholder:text-gray-400 focus:outline-hidden dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
      />
    </div>
  );
}
