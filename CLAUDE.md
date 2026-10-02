# Gulbahor

Kiyim savdosi uchun ERP. Biznes talablari, qarorlar va bosqichlar `docs/REJA.md` da. Kod yozishdan oldin tegishli bo'limini o'qing: u yerda nima qilinishi va nima uchun qilinmasligi yozilgan.

## Muloqot va kod uslubi

- Foydalanuvchi bilan o'zbek tilida. Kod, identifikatorlar va commit xabarlari ingliz tilida. Foydalanuvchiga ko'rinadigan hamma matn o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`); server xato xabarlari hozircha faqat o'zbekcha.
- Izoh kam: faqat kod o'zi ayta olmaydigan sababni yozadi.
- Prettier: nuqta-vergulsiz, bitta qo'shtirnoq, 120 ustun. O'zbekcha matnda apostrof oddiy `'`, shuning uchun bunday satrlar ikki qo'shtirnoqda yoziladi.
- Tugatishdan oldin: `npm run typecheck`, `npm run lint`, `npm test`.

## Tuzilishi

- `packages/core` — bog'liqliksiz (faqat zod) umumiy qoidalar: `money.ts` (minor birlik, `allocate`, `convert`), `expression.ts` va `amount.ts` (kiritilgan summani o'qish), `date.ts`, `phone.ts`, `text.ts` (qidiruv kaliti), `access.ts` (modullar, ruxsatlar, tayyor rollar), `schemas.ts` (API shartnomalari va DTO tiplar), `catalog.ts` (tovar: shartnomalar, shtrix-kod, variant kombinatsiyalari), `purchasing.ts` (hamkor, kirim, qoldiq shartnomalari va `costReceipt` — tannarx hisobi), `import.ts` (Excel ustunlarini tanish va qatorni o'qish), `stockdocs.ts` (ko'chirish, hisobdan chiqarish, inventarizatsiya shartnomalari), `labels.ts` (EPC, etiketkaning ZPL buyruqlari, printer va agent shartnomalari), `pricing.ts` (ustama qoidasini tanlash, narxni ommaviy o'zgartirish shartnomalari; yaxlitlash — `money.ts` dagi `roundPrice`). Server uni yig'ilgan holda (`dist`), web manbadan (`vite` alias) oladi. **Core o'zgarsa, server uchun `npm run build:core` kerak** (`dev:server` buni o'zi qiladi).
- `server/src` — `modules/<nom>/` ichida controller, service, module. `database/` — entity'lar (faqat tip uchun), migratsiyalar, `Db`.
- `web/src` — `app/` (qobiq, router, navigatsiya, Ctrl+K), `components/ui/` (umumiy komponentlar), `features/<nom>/` (sahifalar), `lib/` (api, hotkeys, scanner, realtime).
- `agent` — do'kon kompyuterida ishlaydigan dastur (`agent/README.md`). Core'ga bog'liq emas: yolg'iz o'zi o'rnatiladi. Server testlari uning yig'ilgan holini ishlatadi (`npm run build:agent`).

## Server qoidalari

- **Ma'lumotga faqat `Db.tenant(orgId, ({ em, afterCommit }) => ...)` orqali kiriladi.** U tranzaksiya ochadi va `app.org_id` ni qo'yadi; RLS qolganini qiladi. Tashkilot hali noma'lum bo'lgan joylar (login, refresh, biznes yaratish) uchun `Db.system`. Repository'ni to'g'ridan-to'g'ri inject qilib ishlatmang: tranzaksiyadan tashqarida u hech narsa ko'rmaydi.
- Yangi jadval: `org_id` ustuni, migratsiyada RLS siyosati (`migrations/rls.ts` dagi `tenantPolicy(jadval)`), entity `database/entities.ts` ga, migratsiya `migrations/index.ts` ga. Migratsiya ichida mavjud bizneslar uchun ma'lumot yozilsa, `app.bypass_rls` yoqiladi va oxirida o'chiriladi (`1790000001000-catalog.ts` ga qarang).
- Ketma-ket raqamlar (artikul, ichki shtrix-kod, keyin hujjat raqamlari): `modules/catalog/counters.ts` dagi `nextNumbers(em, orgId, kalit, soni)`.
- Bitta tranzaksiyada so'rovlar ketma-ket yuboriladi: `Promise.all` bilan parallel yuborilmaydi (bitta ulanish).
- Har o'zgarish o'sha tranzaksiyada `AuditService.record` bilan tarixga yoziladi (`diff()` bilan), commit'dan keyin `RealtimeService.changed(orgId, ['resurs'])` chaqiriladi. Resurs nomi web'dagi query key'ning birinchi elementi bilan bir xil bo'lishi shart.
- Ruxsat: controller'da `@Can('guruh.amal')`, modul: `@RequireModule('kalit')`. Ruxsat yoki modul qo'shilsa — `packages/core/src/access.ts`.
- Kiruvchi ma'lumot `zod(schema)` pipe bilan tekshiriladi, sxema `core/schemas.ts` yoki `core/catalog.ts` da. Xatolar `AppError` orqali: `{ error: { code, message, fields? } }`.
- Ruxsat yoki sessiyaga ta'sir qiladigan o'zgarishdan keyin `ActorService.invalidate()`.
- Pul: faqat butun minor birlik va `core/money.ts` funksiyalari. Taqsimlash — `allocate` (og'irliklar butun son bo'lsa `allocateExact`). Float bilan hisob yo'q. `CurrencyCode` (UZS, USD) — biznesning o'z puli va narxlari; `AnyCurrency` — bunga qo'shimcha xarid valyutalari (CNY, KGS, TRY...).
- **Qoldiq — daftar.** Miqdor va qiymat faqat `StockService.apply(em, orgId, actorId, movements)` orqali o'zgaradi: u `stock_movements` ga yozadi (o'zgarmas) va `stock_balances` ni shu tranzaksiyada suradi. Balansni to'g'ridan-to'g'ri o'zgartirmang. Yangi harakat turi qo'shilsa — `stock_movements_kind` cheklovi va `StockMovementKind`.
- Hujjat (kirim va keyingilari): qoralama → o'tkazilgan → bekor qilingan. O'tkazilgan hujjat tahrirlanmaydi; tuzatish — bekor qilib nusxa olish yoki maxsus amal (kirimda `updateExpenses`). Hujjat o'tkazishdan oldin `FOR UPDATE` bilan qulflanadi.
- Chiqim doim FIFO: `StockService.pick` (yoki `pickBatches`) eng eski partiyadan boshlab oladi va qatorlarni qulflaydi; hujjat qaysi partiyadan nechta olganini o'zida saqlaydi (`stock_document_items`), bekor qilish aynan shularni qaytaradi.
- "Yo'lda" — har biznesning ko'rinmas joyi (`locations.kind = 'transit'`, `StockService.transit`). Jo'natilgan ko'chirish tovarni shu yerga suradi, qabul u yerdan oladi. U joylar ro'yxatida chiqmaydi (`LocationsService` dagi `REAL_PLACE`) va unga kirim qilib bo'lmaydi.
- **Server printerga o'zi ulanmaydi.** Tizim domenda, printer do'kon tarmog'ida turadi. Chop etish — `print_jobs` ga ish yozish (`PrintQueueService.enqueueIn`) va commit'dan keyin `dispatch(orgId, agentId)`; ishni do'kon agenti `/agent` socket'i orqali oladi. Agent faqat lokal tarmoq manzillariga yuboradi (`isLocalHost` — core'da va agentning o'zida).
- RFID dona (`rfid_units`): kodi (`EPC_PREFIX` + hamma biznes uchun umumiy `rfid_epc_serial` ketma-ketligi) bir marta beriladi va o'zgarmaydi. Kirim donalari kirim bilan birga yuradi: `modules/labels/units.ts` dagi `settleReceiptUnits` (o'tkazilganda), `voidReceiptUnits` (bekor qilinganda yoki o'chirilganda).
- Narxni ommaviy o'zgartirish — `PricingService.reprice`: `dryRun` bilan faqat hisoblaydi, usiz yozadi va `price_revisions` ga eski-yangi narxlarni saqlaydi (`revert` shulardan qaytaradi). Modelning o'z narxi o'zgaradi, alohida o'lcham yoki do'kon narxi unga mutanosib suriladi.
- Ko'chirish, hisobdan chiqarish va inventarizatsiya bitta jadvalda (`stock_documents.kind`) va bitta modulda (`modules/stockdocs`). Ruxsat hujjat turiga bog'liq bo'lgani uchun controller'da emas, servisda tekshiriladi (`need(actor, kind, 'view' | 'manage' | 'post')`).
- Bir tranzaksiyada boshqa modul ishini bajarish kerak bo'lsa, o'sha servisning `...In(em, ...)` metodi ishlatiladi (`ProductsService.createIn`, `ReceiptsService.createIn`). Sinov rejimi (import `dryRun`) — haqiqiy ishni bajarib, tranzaksiyani qaytarish.

## Web qoidalari

- So'rovlar `lib/api.ts` orqali, holat TanStack Query'da. Query key resurs nomi bilan boshlanadi (`['users', 'list', filters]`).
- Ro'yxat sahifasi: `DataTable` + manzildagi holat (`lib/list-search.ts`, route'da `validateSearch`). Forma: `Form` + `zodSubmit(form, schema, ...)` + `applyServerErrors`; so'rov forma maydonlaridan boshqacha tuzilsa — `zodCheck(form, schema, data)`.
- `Form` ichida Enter keyingi maydonga o'tadi. Kam ishlatiladigan boshqaruv elementi `data-enter-skip` ichiga qo'yilsa, Enter uni chetlab o'tadi (Tab bilan baribir yetiladi).
- Inputlar: summa — `MoneyInput`, miqdor — `NumberInput`, telefon — `PhoneInput`, sana — `DateInput`, tanlash — `Combobox`, kodlar ro'yxati (shtrix-kod) — `TagInput`, rang × o'lcham bo'yicha miqdor — `QtyMatrix`, tovar qidirish (serverda) — `features/catalog/product-picker`. Oddiy `<input type="number">` ishlatilmaydi.
- `Combobox` da "Yangi: «…»" qatori hech qachon o'zi tanlanmaydi: xato yozilgan matn yoki skanerlangan kod Enter bilan yangi yozuv yaratib qo'ymasligi kerak. Unga ↓ bilan ataylab tushiladi. Ko'p tanlovda matn bo'sh bo'lsa, Enter "tugatdim" degani va keyingi maydonga o'tkazadi.
- `useHotkey('escape', ...)` ustida ochiq oyna yoki ro'yxat bo'lsa ishlamaydi: Esc avval o'shani yopadi.
- Tugmalar: `useHotkey(combo, handler, { label, group })`. `label` berilsa, F1 oynasida ko'rinadi.
- Yangi sahifa: `app/router.tsx` (route), `app/navigation.ts` (menyu, ruxsat, modul), `i18n/uz.ts` va `ru.ts`.
- Tasdiq oynasi (`useConfirm`) doim "…-simi?" savoli: rad tugmasi "Yo'q", tasdiq tugmasi amal nomi (`confirmLabel`).
- `Form` Ctrl+Enter va oxirgi maydondagi Enter'da formani bir lahza keyin yuboradi: `NumberInput`/`MoneyInput` qiymatni Enter yoki fokus ketganda xabar qiladi va `useState` bilan yuritilgan forma uni o'qib olishga ulgurishi kerak.
- `MoneyInput` da `fillValue` + `placeholder` — taklif: bo'sh maydonda xira ko'rinadi, «=» bilan olinadi (kirimdagi narx taklifi).
- `Dialog` ichida Ctrl+Enter fokus qayerda bo'lsa ham `type="submit"` tugmasini bosadi.
- Skanerlangan kod RFID belgi bo'lsa, `/products/lookup` javobida `epc` keladi: forma uni eslab qoladi va o'sha donani ikkinchi marta sanamaydi (`seenTags`).
- `QtyMatrix`: `hints` — bo'sh katakda xira ko'rinadigan son (qoldiq), `limits` — undan oshsa katak qizaradi, `zero` — yozilgan 0 saqlanadi (inventarizatsiyada "qaradim, yo'q").
- Hujjat formasi (tovar, kirim, sklad hujjatlari) serverdan kelgan holatni bir marta oladi va o'zi yuritadi. Realtime qayta yuklash formani qayta boshlamasligi kerak: forma `key` i faqat o'zining saqlashlari bilan o'zgaradi (`receipt-page.tsx` dagi `version`).
- Excel: o'qish — `read-excel-file/browser`, yozish — `write-excel-file/browser`, ikkalasi ham kerak bo'lganda `import()` bilan yuklanadi.
- Ro'yxatni Excel'ga chiqarish: ustunning `meta.export` i qatordan oddiy qiymat qaytaradi (pul — `moneyCell`, sana — `dayCell`, vaqt — `timeCell`, `lib/excel.ts`), `DataTable` ga `exportAs={{ fileName, rows: () => fetchAll(path, filtr) }}` beriladi. Ekranda boshqa ustunga qo'shib ko'rsatilgan narsa (brend) uchun `meta.exportOnly` ustun yoziladi. `export` siz ustun faylga tushmaydi.

## Lokal muhit

- `npm run dev:server` (3100) va `npm run dev:web` (5190). Baza `gulbahor`, testlar `gulbahor_test` da.
- Lokal bazada har tayyor rolga bittadan sinov xodimi bor; login va parollari `server/.env.test-users` da (git'ga tushmaydi). Egasiniki `server/.env` da.
- Server testlari haqiqiy bazada ishlaydi va ikki biznes orasidagi ajratishni tekshiradi. Har modulning o'z `*.spec.ts` fayli bor (`app.spec.ts`, `catalog.spec.ts`, `receiving.spec.ts`, `import.spec.ts`, `stockdocs.spec.ts`, `labels.spec.ts`, `pricing.spec.ts`), hammasi `testing/harness.ts` dagi `startApp()` bilan boshlanadi: u bazani tozalaydi va sozlangan ikki biznesni (Alpha, Beta) beradi. Fayllar navbat bilan ishlaydi (`maxWorkers: 1`).

## Holat

1-bosqich (asos) tayyor. 2-bosqichdan tovar katalogi tayyor: kategoriyalar, brendlar, xususiyatlar (rang, o'lcham shkalalari), narx turlari, model × variant, shtrix-kodlar, narxlar (`modules/catalog`, `features/catalog`). Tovar bo'yicha model: `products` (model, 3 tagacha o'q) → `product_variants` (har o'q bo'yicha bitta qiymat) → `variant_barcodes`; `prices` modelga qo'yiladi, variant yoki joy ko'rsatilgan qator uni o'sha yerda almashtiradi. Qoldiq, kirim va sotuv doim variantga bog'lanadi.

Kirim va qoldiq ham tayyor (`modules/receipts`, `modules/stock`, `modules/partners`): kirim hujjati istalgan xarid valyutasida, xarajatlar qiymat, dona yoki vazn bo'yicha taqsimlanadi, o'tkazilganda har qator bitta partiya (`stock_batches`) bo'lib qoldiqqa tushadi; kechikkan xarajat tannarxni qayta hisoblaydi; Excel'dan kirim (akaning Bishkek, Xitoy, Turkiya shablonlari taniladi).

Sklad hujjatlari ham tayyor (`modules/stockdocs`, `features/stockdocs`): ko'chirish (qoralama → yo'lda → qabul; kam kelgani `transfer_loss` bo'lib chiqadi; qabulgacha qaytarib olinadi), hisobdan chiqarish (sabab bilan; tasdiq — `writeoffs.post`; bekor qilinsa tovar qaytadi), inventarizatsiya (qisman yoki to'liq; ortiqcha shu tovarning qoldiqdagi o'rtacha tannarxi bilan yangi partiya bo'ladi; `counts.post` yo'q xodim qoralamada hisobdagi sonni ko'rmaydi).

Etiketka va RFID donalar ham tayyor (`modules/labels`, `features/labels`, `features/devices`, `agent/`): oddiy yoki RFID etiketka kirimdan (F8) yoki qoldiqdan chop etiladi, printer va agentlar "Qurilmalar" sahifasida sozlanadi. Uskuna: Chainway CP30 printeri (ZPL), Chainway C72 qo'l terminali. Haqiqiy printerda hali sinalmagan. Dona hozircha yaratilgan joyini biladi; hujjatlar bo'yicha joy va holatini yuritish 3-bosqichda.

Narxlar ham tayyor (`modules/pricing`, `features/pricing`): narx turining yaxlitlash qoidasi, ustama qoidalari (kategoriya, brend, sezon; eng aniq mos kelgani ishlaydi), "Narxlar" sahifasi — ro'yxat filtri ommaviy o'zgartirishning qamrovi ham, tarix va qaytarish, kirimda narx taklifi.

Asosiy ro'yxatlar Excel'ga chiqariladi. Web hamma tarmoq interfeysida tinglaydi (`vite.config.ts` da `host: true`), mavzu standart holatda yorug'.

2-bosqichning qolgani: hisobdan chiqarishga rasm biriktirish, narx o'zgargan tovarga yorliqni qayta chop etish. Gulbahor'ning eski kodi `main` branch tarixida: RFID uchun `backend/src/modules/inbound-documents/labels/{epc,zpl}.ts`, to'lov integratsiyalari uchun `backend/src/modules/integrations/clients`.

Foydalanuvchidan kutilayotganlar `docs/REJA.md` ning oxirgi bo'limida: 3-bosqichdan oldin RFID uskunalari modellari, 6-bosqichdan oldin bank botlari xabar namunalari so'raladi.
