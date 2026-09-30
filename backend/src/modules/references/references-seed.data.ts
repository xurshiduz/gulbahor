/**
 * Boshlang'ich ma'lumotnomalar. Faqat jadval BO'SH bo'lganda yoziladi -
 * keyin foydalanuvchi o'zgartirgani yoki o'chirgani qayta tiklanmaydi.
 */

type L = [uz: string, ru: string, en: string];

/** [uz, ru, en, ISO kod] */
export const SEED_COUNTRIES: [...L, string][] = [
  ["O'zbekiston", 'Узбекистан', 'Uzbekistan', 'UZ'],
  ['Turkiya', 'Турция', 'Turkey', 'TR'],
  ['Xitoy', 'Китай', 'China', 'CN'],
  ['Rossiya', 'Россия', 'Russia', 'RU'],
  ["Qozog'iston", 'Казахстан', 'Kazakhstan', 'KZ'],
  ["Qirg'iziston", 'Кыргызстан', 'Kyrgyzstan', 'KG'],
  ['Tojikiston', 'Таджикистан', 'Tajikistan', 'TJ'],
  ['Bangladesh', 'Бангладеш', 'Bangladesh', 'BD'],
  ['Hindiston', 'Индия', 'India', 'IN'],
  ['Pokiston', 'Пакистан', 'Pakistan', 'PK'],
  ['Vyetnam', 'Вьетнам', 'Vietnam', 'VN'],
  ['Janubiy Koreya', 'Южная Корея', 'South Korea', 'KR'],
  ['Italiya', 'Италия', 'Italy', 'IT'],
  ['Germaniya', 'Германия', 'Germany', 'DE'],
  ['Fransiya', 'Франция', 'France', 'FR'],
  ['Ispaniya', 'Испания', 'Spain', 'ES'],
  ['Polsha', 'Польша', 'Poland', 'PL'],
  ['Belarus', 'Беларусь', 'Belarus', 'BY'],
  ['BAA', 'ОАЭ', 'UAE', 'AE'],
  ['AQSH', 'США', 'USA', 'US'],
];

/** O'zbekiston hududlari */
export const SEED_UZ_REGIONS: L[] = [
  ['Toshkent shahri', 'город Ташкент', 'Tashkent city'],
  ['Toshkent viloyati', 'Ташкентская область', 'Tashkent region'],
  ['Andijon viloyati', 'Андижанская область', 'Andijan region'],
  ['Buxoro viloyati', 'Бухарская область', 'Bukhara region'],
  ["Farg'ona viloyati", 'Ферганская область', 'Fergana region'],
  ['Jizzax viloyati', 'Джизакская область', 'Jizzakh region'],
  ['Xorazm viloyati', 'Хорезмская область', 'Khorezm region'],
  ['Namangan viloyati', 'Наманганская область', 'Namangan region'],
  ['Navoiy viloyati', 'Навоийская область', 'Navoiy region'],
  ['Qashqadaryo viloyati', 'Кашкадарьинская область', 'Kashkadarya region'],
  ["Qoraqalpog'iston Respublikasi", 'Республика Каракалпакстан', 'Republic of Karakalpakstan'],
  ['Samarqand viloyati', 'Самаркандская область', 'Samarkand region'],
  ['Sirdaryo viloyati', 'Сырдарьинская область', 'Syrdarya region'],
  ['Surxondaryo viloyati', 'Сурхандарьинская область', 'Surkhandarya region'],
];

/** [to'liq nom uz/ru/en, qisqartma uz/ru/en] */
export const SEED_UNITS: [L, L][] = [
  [['Dona', 'Штука', 'Piece'], ['dona', 'шт', 'pcs']],
  [['Juft', 'Пара', 'Pair'], ['juft', 'пар', 'pr']],
  [['Komplekt', 'Комплект', 'Set'], ['kompl', 'компл', 'set']],
  [['Quti', 'Коробка', 'Box'], ['quti', 'кор', 'box']],
  [['Paket', 'Упаковка', 'Pack'], ['pkt', 'уп', 'pack']],
  [['Kilogramm', 'Килограмм', 'Kilogram'], ['kg', 'кг', 'kg']],
  [['Metr', 'Метр', 'Meter'], ['m', 'м', 'm']],
  [['Rulon', 'Рулон', 'Roll'], ['rulon', 'рул', 'roll']],
];

/** [uz, ru, en, #hex] */
export const SEED_COLORS: [...L, string][] = [
  ['Oq', 'Белый', 'White', '#FFFFFF'],
  ['Qora', 'Чёрный', 'Black', '#000000'],
  ['Kulrang', 'Серый', 'Grey', '#9E9E9E'],
  ['Qizil', 'Красный', 'Red', '#E53935'],
  ['Bordo', 'Бордовый', 'Burgundy', '#7B1E3A'],
  ['Pushti', 'Розовый', 'Pink', '#F48FB1'],
  ["To'q sariq", 'Оранжевый', 'Orange', '#FB8C00'],
  ['Sariq', 'Жёлтый', 'Yellow', '#FDD835'],
  ['Yashil', 'Зелёный', 'Green', '#43A047'],
  ['Xaki', 'Хаки', 'Khaki', '#7C7A4B'],
  ['Havorang', 'Голубой', 'Light blue', '#64B5F6'],
  ["Ko'k", 'Синий', 'Blue', '#1E88E5'],
  ["To'q ko'k", 'Тёмно-синий', 'Navy', '#1A237E'],
  ['Binafsha', 'Фиолетовый', 'Purple', '#8E24AA'],
  ['Jigarrang', 'Коричневый', 'Brown', '#6D4C41'],
  ['Bej', 'Бежевый', 'Beige', '#D9C7A7'],
];

/** Shkala -> o'lchamlar (tartibi bilan) */
export const SEED_SIZES: Record<string, string[]> = {
  Alfa: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'],
  Raqamli: ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'],
  Poyabzal: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  Bolalar: ['80', '86', '92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164'],
};

/** Kiyim-kechak uchun boshlang'ich kategoriyalar: [ota, [bolalari]] */
export const SEED_CATEGORIES: [L, L[]][] = [
  [['Erkaklar kiyimi', 'Мужская одежда', 'Menswear'], [
    ["Ko'ylaklar", 'Рубашки', 'Shirts'],
    ['Futbolkalar', 'Футболки', 'T-shirts'],
    ['Shimlar', 'Брюки', 'Trousers'],
    ['Jinsilar', 'Джинсы', 'Jeans'],
    ['Kostyumlar', 'Костюмы', 'Suits'],
    ['Ustki kiyim', 'Верхняя одежда', 'Outerwear'],
  ]],
  [['Ayollar kiyimi', 'Женская одежда', 'Womenswear'], [
    ["Ko'ylaklar", 'Платья', 'Dresses'],
    ['Bluzkalar', 'Блузки', 'Blouses'],
    ['Yubkalar', 'Юбки', 'Skirts'],
    ['Shimlar', 'Брюки', 'Trousers'],
    ['Ustki kiyim', 'Верхняя одежда', 'Outerwear'],
  ]],
  [['Bolalar kiyimi', 'Детская одежда', 'Kidswear'], [
    ["O'g'il bolalar", 'Для мальчиков', 'Boys'],
    ['Qiz bolalar', 'Для девочек', 'Girls'],
    ['Chaqaloqlar', 'Для малышей', 'Babies'],
  ]],
  [['Poyabzal', 'Обувь', 'Footwear'], []],
  [['Aksessuarlar', 'Аксессуары', 'Accessories'], []],
];
