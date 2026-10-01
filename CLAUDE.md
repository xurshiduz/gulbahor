# Gulbahor

Kiyim savdosi uchun ERP. Biznes talablari, qarorlar va bosqichlar `docs/REJA.md` da. Kod yozishdan oldin tegishli bo'limini o'qing: u yerda nima qilinishi va nima uchun qilinmasligi yozilgan.

## Muloqot va kod uslubi

- Foydalanuvchi bilan o'zbek tilida. Kod, identifikatorlar va commit xabarlari ingliz tilida. Foydalanuvchiga ko'rinadigan hamma matn o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`); server xato xabarlari hozircha faqat o'zbekcha.
- Izoh kam: faqat kod o'zi ayta olmaydigan sababni yozadi.
- Prettier: nuqta-vergulsiz, bitta qo'shtirnoq, 120 ustun. O'zbekcha matnda apostrof oddiy `'`, shuning uchun bunday satrlar ikki qo'shtirnoqda yoziladi.
- Tugatishdan oldin: `npm run typecheck`, `npm run lint`, `npm test`.

## Tuzilishi

- `packages/core` — bog'liqliksiz (faqat zod) umumiy qoidalar: `money.ts` (minor birlik, `allocate`, `convert`), `expression.ts` va `amount.ts` (kiritilgan summani o'qish), `date.ts`, `phone.ts`, `text.ts` (qidiruv kaliti), `access.ts` (modullar, ruxsatlar, tayyor rollar), `schemas.ts` (API shartnomalari va DTO tiplar). Server uni yig'ilgan holda (`dist`), web manbadan (`vite` alias) oladi. **Core o'zgarsa, server uchun `npm run build:core` kerak** (`dev:server` buni o'zi qiladi).
- `server/src` — `modules/<nom>/` ichida controller, service, module. `database/` — entity'lar (faqat tip uchun), migratsiyalar, `Db`.
- `web/src` — `app/` (qobiq, router, navigatsiya, Ctrl+K), `components/ui/` (umumiy komponentlar), `features/<nom>/` (sahifalar), `lib/` (api, hotkeys, scanner, realtime).

## Server qoidalari

- **Ma'lumotga faqat `Db.tenant(orgId, ({ em, afterCommit }) => ...)` orqali kiriladi.** U tranzaksiya ochadi va `app.org_id` ni qo'yadi; RLS qolganini qiladi. Tashkilot hali noma'lum bo'lgan joylar (login, refresh, biznes yaratish) uchun `Db.system`. Repository'ni to'g'ridan-to'g'ri inject qilib ishlatmang: tranzaksiyadan tashqarida u hech narsa ko'rmaydi.
- Yangi jadval: `org_id` ustuni, migratsiyada RLS siyosati (`1790000000000-foundation.ts` dagi `policy()` kabi), entity `database/entities.ts` ga, migratsiya `migrations/index.ts` ga.
- Har o'zgarish o'sha tranzaksiyada `AuditService.record` bilan tarixga yoziladi (`diff()` bilan), commit'dan keyin `RealtimeService.changed(orgId, ['resurs'])` chaqiriladi. Resurs nomi web'dagi query key'ning birinchi elementi bilan bir xil bo'lishi shart.
- Ruxsat: controller'da `@Can('guruh.amal')`, modul: `@RequireModule('kalit')`. Ruxsat yoki modul qo'shilsa — `packages/core/src/access.ts`.
- Kiruvchi ma'lumot `zod(schema)` pipe bilan tekshiriladi, sxema `core/schemas.ts` da. Xatolar `AppError` orqali: `{ error: { code, message, fields? } }`.
- Ruxsat yoki sessiyaga ta'sir qiladigan o'zgarishdan keyin `ActorService.invalidate()`.
- Pul: faqat butun minor birlik va `core/money.ts` funksiyalari. Taqsimlash — `allocate`. Float bilan hisob yo'q.

## Web qoidalari

- So'rovlar `lib/api.ts` orqali, holat TanStack Query'da. Query key resurs nomi bilan boshlanadi (`['users', 'list', filters]`).
- Ro'yxat sahifasi: `DataTable` + manzildagi holat (`lib/list-search.ts`, route'da `validateSearch`). Forma: `Form` + `zodSubmit(form, schema, ...)` + `applyServerErrors`.
- Inputlar: summa — `MoneyInput`, miqdor — `NumberInput`, telefon — `PhoneInput`, sana — `DateInput`, tanlash — `Combobox`. Oddiy `<input type="number">` ishlatilmaydi.
- Tugmalar: `useHotkey(combo, handler, { label, group })`. `label` berilsa, F1 oynasida ko'rinadi.
- Yangi sahifa: `app/router.tsx` (route), `app/navigation.ts` (menyu, ruxsat, modul), `i18n/uz.ts` va `ru.ts`.

## Lokal muhit

- `npm run dev:server` (3100) va `npm run dev:web` (5190). Baza `gulbahor`, testlar `gulbahor_test` da.
- Server testlari (`server/src/app.spec.ts`) haqiqiy bazada ishlaydi va ikki biznes orasidagi ajratishni tekshiradi; yangi modulga shu faylga o'xshash test yoziladi.

## Holat

1-bosqich (asos) tayyor. Keyingisi — 2-bosqich: tovar (model × variant), kirim, RFID donalar, ko'chirish, inventarizatsiya. Gulbahor'ning eski kodi `main` branch tarixida: RFID uchun `backend/src/modules/inbound-documents/labels/{epc,zpl}.ts`, to'lov integratsiyalari uchun `backend/src/modules/integrations/clients`.

Foydalanuvchidan kutilayotganlar `docs/REJA.md` ning oxirgi bo'limida: 3-bosqichdan oldin RFID uskunalari modellari, 6-bosqichdan oldin bank botlari xabar namunalari so'raladi.
