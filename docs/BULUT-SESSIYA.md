# Bulut sessiyasida ishlash

Bu hujjat — Claude'ning bulut sessiyasi (claude.ai/code) uchun ko'rsatma. Ish GitHub'dagi shu repodan davom etadi; tugagach, natijani lokal sessiya tekshiradi (u yerda haqiqiy baza, brauzer va egasi bor), keyin `v2` ga qo'shadi.

## 1. Avval o'qiladi

1. `CLAUDE.md` — kod qoidalari (server, veb, pul daftari, valyutalar). Majburiy.
2. `docs/ISH-HOLATI.md` — ish qayerda turgani, foydalanuvchi bilan kelishilgan qoidalar.
3. `docs/KEYINGI-REJA.md`:
   - 7-bo'lim oxiri, "Juft maydon, pul joylarining nomi, Pul holati" — juft maydon qoidasi;
   - 8-bo'lim, "Yakuniy qarorlar" va "Valyuta va hamkor ishining bosqichlari", "1-bosqich qanday qurildi", "2-bosqich qanday qurildi".
4. Shu hujjatning 4-bo'limi — navbatdagi ishlar.

## 2. Muhit

Sessiya boshlanganda `scripts/cloud-setup.sh` o'zi ishlaydi (`.claude/settings.json` dagi hook): PostgreSQL'ni ishga tushiradi, `gulbahor` va `gulbahor_test` bazalarini ochadi, `server/.env` ni yozadi (qiymatlari shu mashinaning o'zi uchun o'ylab topilgan, sir emas), paketlarni o'rnatadi, `core` va `agent` ni yig'adi.

Birinchi ish — muhit ishlayotganini tekshirish:

```bash
npm run typecheck && npm run lint && npm test
```

Kutiladigan natija (2026-10-06 holati): core 199, agent 17, server 319, web 191 — hammasi yashil. Server testlari ishlamasa: `bash scripts/cloud-setup.sh` ni qo'lda yurgizing va chiqqan xabarni o'qing (`service postgresql start`, `pg_isready`). Skriptning o'zida xato bo'lsa — tuzating va shu tuzatishni ham commit qiling.

Server testlarini umuman ishga tushirib bo'lmasa, ishni to'xtatmang, lekin hisobotda **ochiq yozing**: qaysi testlar yurmagan. "Tayyor" deb faqat hamma test o'tgan bo'lak aytiladi.

## 3. Qanday ishlanadi

- **Branch.** Sessiyaning o'z branchida ishlang (`v2` dan). `v2` va `main` ga to'g'ridan-to'g'ri push qilinmaydi, merge qilinmaydi. Oxirida `v2` ga PR oching.
- **Commit.** Har tugagan bo'lak — alohida commit (bu yerda commit qilish mumkin va kerak: ish GitHub orqali topshiriladi). Xabar ingliz tilida, repodagi commitlar uslubida (`git log --oneline -20`).
- **Har commitdan oldin:** `npm run typecheck`, `npm run lint`, `npm test` — yashil; `python tools/check_i18n.py` — "only uz" va "only ru" bo'sh, "missing" 13 ta (ro'yxati skript boshida).
- **Prettier** faqat o'zingiz tegingan fayllarga. Bu fayllar HEAD'da formatlanmagan — ularga prettier yurgizilmaydi, faqat kerakli qatorlar o'zgartiriladi: `web/src/app/shell.tsx`, `web/src/app/command-palette.tsx`, `web/src/main.tsx`, `web/src/styles/index.css`, `web/src/features/settings/settings-page.tsx`, `web/src/features/profile/profile-page.tsx`, `web/src/features/dashboard/home-page.tsx`, `web/src/features/auth/login-page.tsx`, `web/src/features/auth/change-password-page.tsx`, `web/src/features/dev/inputs-demo-page.tsx`, `web/src/features/setup/setup-page.tsx`, `web/src/components/ui/number-input.tsx`, `web/src/components/ui/input.tsx`, `server/src/modules/auth/auth.service.ts`.
- **Matn.** Ekrandagi har so'z o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`). O'zbekcha matnda o‘ va g‘ — `‘` (U+2018), tutuq belgisi — `’` (U+2019); istisnolari `CLAUDE.md` da.
- **Pul.** Faqat butun minor birlik; konvertatsiya faqat `core/currencies.ts` va `core/settlements.ts` funksiyalari bilan; kursi yo'q valyuta hech qachon 1:1 emas; har daftar yozuvi nolga teng. Yangi kodda `'UZS'` deb emas, biznesning asosiy valyutasi deb yoziladi (`book.base`, `me.org.baseCurrency`).
- **Holat.** Bo'lak boshlanganda va tugaganda `docs/ISH-HOLATI.md` yangilanadi: `python tools/progress.py start "…"`, `python tools/progress.py done "<bo'lak>" <tree> "<nima>"`, `python tools/progress.py counts "…"` (qo'llanmasi skript boshida).
- **Hujjat.** Har bo'lakdan keyin: `docs/KEYINGI-REJA.md` ga "N-bosqich qanday qurildi" (foydalanuvchi tilida, qisqa), `CLAUDE.md` ga kod qoidasi (keyingi sessiya bilishi shart bo'lgan narsa).
- **Qaror kerak bo'lsa.** Hujjatlarda javobi yo'q savol chiqsa, "Yakuniy qarorlar"ga eng mos variantni tanlang, ishni to'xtatmang va tanlovni hisobotning "Qarorlar" qismiga yozing.
- **Ekranda ko'rish.** Bulutda brauzer yo'q: ekranlar test bilan tekshiriladi (ko'rinish komponentlari sessiyasiz yoziladi — `currencies-view.tsx`, `stand-view.tsx` kabi). Ekranda ko'rilishi kerak bo'lgan har narsa hisobotning "Lokal tekshiruvga" ro'yxatiga yoziladi.
- **Boshlanmaydi** (so'ralmagan): hisobotlar 10b–10g, Humo bot, superadmin, 5-bosqich (asosiy valyutani tanlash), 6- va 7-bosqich.
- Parol va kalitlar hujjatga ham, commitga ham yozilmaydi; `server/.env` gitga tushmaydi.

## 4. Navbatdagi ishlar

Tartib bilan. Har biri bir nechta bo'lakdan iborat; bo'lak yashil holatda tugamasa, uni boshlanmagandek qoldiring (yarim ishlaydigan narsa commit qilinmaydi).

### A. 4-bosqich: ayirboshlash — o'tkazmada va kassadan pul olishda juft maydon

Foydalanuvchi so'zi (2026-10-06): "pul o'tkazmalarida ham, kassadan pul olib qolishda ham, ERP kabi juft inputlardan ishlataylik".

**Hozir.** O'tkazma (`money_transfers`, `server/src/modules/money/transfers.service.ts`, `web/src/features/money/transfers.tsx`) faqat bir xil valyutadagi ikki joy orasida; boshqa valyutadagi joyga rad etiladi. Kassadan seyfga topshirish — `web/src/features/pos/handover.tsx`.

**Kerak.**

1. **Ikki xil valyutadagi joylar orasida o'tkazma — ayirboshlash.** Oynada ikki summa: "Chiqadi" (qayerdan, o'z valyutasida) va "Kiradi" (qayerga, o'z valyutasida). Bir xil valyutada — hozirgidek bitta maydon.
2. **Juft qoida** (to'lov oynasidagi bilan bir xil): chiqadigan summa — langar; u yozilsa, kiradigan summa kun kursidan taklif bo'lib chiqadi; kiradigan summa ustidan yozilsa — bu kelishilgan summa, chiqadigan summaga **tegilmaydi**; chiqadigan summa bo'sh turib kiradigani yozilsa, chiqadigani kursdan chiqariladi.
3. **Izoh** maydonlar ostida, saqlashdan oldin: "Kelishilgan kurs 12 600, kun kursi 12 650 (0,4% farq): 50 000 so'm foydamizga" yoki "…zararimizga". Chiqqan pulning kun kursidagi qiymati kirgan pulnikidan ko'p bo'lsa — zarar. Kurs juftlikning o'z ko'rinishida (`dayPairRate`, `pairRate`).
4. **Chegara.** Kun kursidan `OrgSettings.maxRateLossPercent` dan uzoq kelishuv faqat `money.rates` egasidan qabul qilinadi (`valueLine` / `straysFromRate` qayta ishlatiladi: "pul" — chiqadigan summa, "yopiladigan valyuta" — qabul qiluvchi joyning valyutasi).
5. **Server.**
   - `moneyTransferInputSchema` ga `received` (qabul qiluvchi joy valyutasida; faqat valyutalar har xil bo'lganda hisobga olinadi; yuborilmasa — kun kursidan).
   - `money_transfers` ga ustunlar (yangi migratsiya; mavjud qatorlar: `to_currency = currency`, `to_amount = amount`, `to_base = base`, `fx = 0`): `to_currency`, `to_amount`, `to_base`, `fx`.
   - Yuborilganda (hozirgidek): `from` hisobdan `amount` chiqadi, qiymati kun kursida (`base`), `transit` ga `base` kiradi. Kurs **shu paytda qotadi**: `to_amount`, `to_base`, `fx` ham shu yerda hisoblanib saqlanadi.
   - Qabul qilinganda: `transit` dan `base` chiqadi, `to` hisobga `to_amount` kiradi (qiymati `to_base`), farq `fx` tizim hisobiga tushadi (`base − to_base`). Yozuv nolga teng. Qatorda `fx` — biznes foydasi musbat (`to_base − base`).
   - Rad etilsa yoki qaytarib olinsa: pul `from` ga o'z summasi bilan qaytadi, kurs farqi yozilmaydi.
   - "Hisobda buncha pul yo'q" — `amount` bo'yicha; kursi yo'q valyuta — `wantingRate` (ikkala valyuta uchun).
   - Smena hisobi (`ofShift`): tortmadan chiqqani `amount`/`currency` bo'yicha, tortmaga kirgani `to_amount`/`to_currency` bo'yicha.
   - `MoneyTransferDto`: `toCurrency`, `toAmount`, `fx`. Ro'yxat va "Pul holati"dagi "yo'lda" qatorida: "1 000 $ → 7 250 ¥".
6. **Veb.** `TransferDialog`: "Qayerga" ro'yxati boshqa valyutadagi joylarni ham ko'rsatadi; valyuta farq qilsa ikkinchi maydon, kurs va izoh chiqadi (`useRateBook()`). Kassadagi "Inkassatsiya" / "Kassaga pul berish" oynasida ham xuddi shunday: boshqa valyutadagi joy tanlansa — juft maydon. Smena yopilishidagi topshirish bir xil valyutada qoladi.
7. **Komissiya** bu bo'lakka kirmaydi (keyin).
8. **Testlar.** Server (`money-exchange.spec.ts` yoki `money-transfers.spec.ts` ichida): so'm → dollar kun kursida (faqat yaxlitlash farqi), kelishilgan summa (farq `fx` da), chegara, yuan ↔ dollar zanjir orqali, rad etish va qaytarib olish (pul aynan qaytadi), smena hisobi, kursi yo'q valyuta, daftar yig'indisi nol. Veb: oynadagi juft maydon xatti-harakati (uch holat), izoh matni, bir xil valyutada bitta maydon.

### B. 3-bosqich: hamkor

Qarorlar — `docs/KEYINGI-REJA.md`, 8-bo'lim, "Yakuniy qarorlar" → "Hamkor va mijoz". Bo'laklar shu tartibda:

**B1. Hamkor hisobi istalgan yoqilgan valyutada.**
- `partners.currency`, `partner_payments.currency` cheklovlari yoqilgan valyutalarga ochiladi (migratsiya; namuna — `1790000029000-money-in-any-currency.ts`); `PartnerDto.currency` — `AnyCurrency`; hamkor formasidagi valyuta ro'yxati — `CurrenciesService.kept` (veb: `useCurrencies()`).
- Bitta hamkor — bitta valyuta; birinchi yozuvdan keyin o'zgarmaydi (hozirgidek).
- Boshlang'ich qoldiq (`partners.adjust`) va hisob-kitob qiymati kitob bilan (`worthInBase`); to'lov allaqachon umumiy (`valueLine(…, partner.currency, book, …)`) — yuan hisobli hamkorga so'm, dollar va yuanda to'lash testlari qo'shiladi.
- Hamkor valyutasi kursi yo'q bo'lsa — `wantingRate`.

**B2. Kirimdan yetkazib beruvchi qarzi o'z valyutasida** (`ReceiptsService.owe`).
- Kirim valyutasi hamkor valyutasiga teng bo'lsa — tovar qiymati aynan o'sha summada yoziladi (kursga bog'liq emas).
- Teng bo'lmasa — kirimning o'z kurslari bilan (kirimda yozilgan), ular yetmasa kun kitobi bilan.
- Kirim bekor qilinsa, aynan yozilgan summa qaytadi.

**B3. Kassadan hamkorga sotuv.**
- Kassadagi "Mijoz" maydoni hamkorni ham topadi (belgi bilan: "hamkor"); hamkor tanlanganda chakana mijoz qoidalari (sodiqlik, guruh chegirmasi) qo'llanmaydi.
- To'lov bo'limida "Hisobiga" qatori ("Qarzga" kabi, summalardan alohida blokda): chekning to'lanmagan qismi hamkor hisobiga yoziladi. Chek asosiy valyutada; hisobiga hamkor valyutasida tushadi — kun kursida yoki kelishilgan summa bilan (juft maydon; chegara va rahbar tasdig'i dollarni kelishilgan qiymatda olishdagi kabi). Ikkala son sotuvdan oldin ko'rinadi: "1 265 000 so'm → 100,00 $".
- Hisobiga **chegirmadan keyingi** summa yoziladi; chegirma chekda qoladi. Chegirma chegaralari va minimal narx hamkorga ham ishlaydi.
- Alohida ruxsat (`pos.partner_sale`; kassirda sukut holatda yo'q), ruxsatsiz kassir — rahbar PIN'i bilan. Kassirga hamkor qoldig'i ko'rsatilmaydi.
- Chekda: "Hamkor hisobiga: 1 265 000 so'm (100,00 $)". Smena hisobotida alohida qator; naqd sanog'iga aralashmaydi.
- Qaytarishda hamkor hisobidan **o'sha sotuvda yozilgan** summaning tegishli qismi ayriladi (bugungi kursda emas) — `returnShare` mantig'i.
- Hamkorning hisob-kitobida sotuv chek raqami bilan ko'rinadi.

**B4. Hamkorga narx turi.** Hamkor kartasiga narx turi biriktiriladi (mijoz guruhlaridagi kabi): hamkor tanlanganda kassa narxni o'zi almashtiradi.

**B5. Yetkazib beruvchiga tovar qaytarish.** Yangi hujjat (sklad hujjatlari qatorida): tovarni skladdan chiqaradi (qaysi kirimdan kelgani bilan, o'sha partiyadan), bizning qarzimizni kirim narxida, hamkor valyutasida kamaytiradi; bekor qilinsa tovar ham, qarz ham qaytadi.

Har bo'lakka: server spec, core va veb testlari, ikki tilda matn, `ISH-HOLATI` va hujjatlar.

## 5. Topshirish

PR tavsifida (va `docs/ISH-HOLATI.md` da) shu to'rt narsa bo'lsin:

1. **Qilindi** — bo'laklar bo'yicha, foydalanuvchi tilida, qisqa.
2. **Tekshiruv** — oxirgi to'liq yurish natijasi (to'rtta son) va yurmagan narsa bo'lsa, o'shani ochiq.
3. **Qarorlar** — hujjatlarda javobi bo'lmagan va o'zingiz tanlagan har narsa, sababi bilan.
4. **Lokal tekshiruvga** — ekranda ko'rilishi kerak bo'lgan har oyna va holat (qaysi sahifa, nima kiritiladi, nima ko'rinishi kerak), haqiqiy bazada tekshirilishi kerak bo'lgan har narsa (migratsiya mavjud ma'lumotga qanday ta'sir qiladi).

## 6. Lokal tekshiruv (bulut sessiyasidan keyin)

Lokal sessiya branchni oladi va: to'liq testlarni haqiqiy PostgreSQL bilan yurgizadi; migratsiyalarni lokal bazaga qo'llaydi; "Lokal tekshiruvga" ro'yxatidagi har oynani brauzerda ko'radi; kodni shu hujjatdagi talab bilan solishtiradi; topilgan kamchilikni tuzatadi yoki qaytaradi; keyin `v2` ga qo'shadi.
