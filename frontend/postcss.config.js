import postcssPresetEnv from 'postcss-preset-env';

/**
 * Tailwind v4 zamonaviy CSS chiqaradi: @layer, oklch(), color-mix() -
 * Chrome 111+ kerak. Ombordagi TSD terminallar Android 11 / Chrome 88
 * bilan ishlaydi va u yerda sahifa umuman uslubsiz ochilardi (@layer
 * ichidagi barcha qoidalar tashlab yuborilardi). postcss-preset-env
 * Tailwind'dan keyin ishlab, shularni eski brauzer tushunadigan
 * ko'rinishga o'tkazadi: qatlamlar ochiladi, ranglar rgb ga aylanadi.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    'postcss-preset-env': {
      browsers: 'chrome >= 88, android >= 88, safari >= 14, firefox >= 90',
      features: {
        'cascade-layers': true,
        'oklab-function': { preserve: false },
        'color-mix': { preserve: false },
        'color-function': { preserve: false },
        // Tailwind o'zi nesting'ni ochib beradi, bu yerda kerak emas
        'nesting-rules': false,
      },
    },
  },
}
