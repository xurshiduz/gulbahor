# Ish holati

Bu fayl — ishning qayerda turganini aytadi. Har sessiya ish boshlashdan oldin o'qiydi va har tugagan bo'lakdan keyin yangilaydi. Reja — `docs/KEYINGI-REJA.md` (14-bo'lim: ish tartibi), Billz'da nima borligi — `docs/BILLZ-TAHLIL.md`, qoidalar — `CLAUDE.md`.

## Qoidalar (foydalanuvchi bilan kelishilgan)

- **Commit ham, push ham qilinmaydi** — foydalanuvchi alohida aytmaguncha. Har tugagan bo'lakdan keyin ish daraxtining nusxasi olinadi va pastdagi ro'yxatga yoziladi: `git add -A && git write-tree && git reset -q` (bu commit emas, hech narsani o'zgartirmaydi).
- Parol va kalitlar chatga ham, hujjatga ham yozilmaydi (`server/.env`, `server/.env.test-users`).
- Billz'ga kirilmaydi: tahlil tugagan.
- Har bo'lakdan keyin: `npm run typecheck`, `npm run lint`, `npm test` — hammasi yashil bo'lishi shart. Qizil holatda keyingi bo'lakka o'tilmaydi.
- Foydalanuvchiga ko'rinadigan matn o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`); imloga e'tibor (o', g', tutuq belgisi).
- Rejada ochiq qolgan savolda taklif qilingan qiymat olinadi (dollarni kelishilgan qiymat bilan olish chegarasi — 2%) va sozlamadan o'zgartiriladigan qilinadi.
- Katta, daftarga tegadigan ish (dinamik valyuta) foydalanuvchisiz boshlanmaydi.

## Tayyor (commit qilinmagan, ish daraxtida)

`84e8ac1` dan keyin, tartib bilan: hamkor hisobi va to'lovlar; kassada tez skaner tuzatishi; RFID o'quvchilar; Chainway ko'prigi; xususiyat qiymatlarini birlashtirish; tayyor qatorli to'lov oynasi va Alt+K / Alt+C; alertlar va brauzer bildirishnomalari, `money.sent` / `goods.sent`; kirimdan yetkazib beruvchi qarzi; reja va tahlil hujjatlari.

Oxirgi to'liq tekshiruv: 2026-10-05 06:40 — core 107, agent 17, server 225, web 115; typecheck va lint toza

## Ko'z bilan tekshirilmagan (ertalab ko'rib chiqish kerak)

Tunda brauzerda tizimga kira olmadim (parolni o'qish ruxsati yo'q, to'g'ri ham) va toza bazada tovar yo'q, shuning uchun quyidagilar faqat testlar bilan tekshirilgan, ekranda ko'rilmagan:

- Kassa: "Kelishilgan summa" maydoni va yaxlit summa tugmalari (1a).
- Kassa: minimal narxdan past qatorning qizil yozuvi va rahbar tasdig'i (1b).
- Kassa: dollar qatori ostidagi "So'mda hisoblanadi" maydoni (1c); Sozlamalar → Biznes dagi "Dollarni kursdan qimmat olish chegarasi".
- "Mijozlar → Guruhlar" varag'i, mijoz formasidagi guruh va teglar, kassada guruh eslatmasi (5b) — testlar yashil, ekranda ko'rilmagan.
- "Mijozlar" sahifasi va kassadagi "Mijoz" maydoni (5a) — testlar yashil, ekranda ko'rilmagan.
- Kassa: "Narx" tanlagichi va narx turi formasidagi "Kassada" sozlamasi (4c) — testlar yashil, ekranda ko'rilmagan.
- Kirim: har narx turiga maydon va yashirin "qo'shimcha xarajat" (4a, 4b); Sozlamalar → Biznes dagi yoqish tugmasi — testlar yashil, ekranda ko'rilmagan.
- Menyu (3): yon panelning o'zi alohida sahifada brauzerda ko'rildi (yoyilgan va tor holat, yonidan chiqadigan ro'yxat, o'tish); butun tizim ichida, haqiqiy ruxsatlar bilan ko'rilmagan.
- Pul → Hisoblar: karta formasidagi "Do'konlar" (bir nechta tanlash) maydoni (2b) — testlar yashil, ekranda ko'rilmagan.
- Pul: "Xarajat" oynasi (Alt+X), "Xarajat va kirim" ro'yxati va "Xarajat turlari" (2a) — testlar yashil, ekranda ko'rilmagan.
- Kassa: to'lov bo'limi (1d). To'lov paneli va chek ko'rinishi alohida sahifada brauzerda ko'rildi (1440 kenglikda joylashuvi, Enter / Tab / "=" yurishi), lekin butun kassa sahifasi ichida — savatdan F9 bilan o'tish, Esc bilan qaytish, qaytarish va almashtirish — ko'rilmagan.

## Navbat (KEYINGI-REJA, 14-bo'lim)

1. **Kassa** — bo'laklarga bo'lingan, shu tartibda:
   - [x] 1a. Summani to'g'ridan-to'g'ri belgilash: chek jami yoki qator narxi yoziladi, chegirma o'zi hisoblanadi; yaxlit summa takliflari.
   - [x] 1b. Minimal narx ("pol"): `min` turidagi narx turi (ustama qoidasi yoki qo'lda); kassada qator undan past bo'lsa rahbar tasdig'i.
   - [x] 1c. Dollarni kelishilgan qiymat bilan olish: farq `fx` hisobiga; chegara sozlamada (2%), oshsa rahbar tasdig'i.
   - [x] 1d. To'lov alohida bo'limda: chapda chek ko'rinishi, o'ngda tayyor to'lov qatorlari.
2. **Pul** — ikki bo'lak:
   - [x] 2a. Xarajat va boshqa kirim, xarajat turlari, smena hisobotida xarajatlar.
   - [x] 2b. Kartani bir nechta do'konga biriktirish.
3. [x] Menyu: bo'limlar va ichki menyu.
4. **Narx turlari** — uch bo'lak:
   - [x] 4a. Kirimda har narx turiga maydon (tizim taklifi bilan), o'tkazilganda tovarga qo'yiladi.
   - [x] 4b. Kirimdagi "qo'shimcha xarajat" maydoni yashirin, sozlamadan yoqiladi.
   - [x] 4c. Kassada narx turini tanlash: narx turida "kassada kim tanlaydi", chekda qaysi narx va kim tanlagani.
5. **Mijozlar** — bo'laklarga bo'lingan:
   - [x] 5a. Mijozlar bazasi, "Mijozlar" sahifasi, kassada mijozni topish va qo'shish, chekda mijoz.
   - [x] 5b. Guruh va teglar: guruhning narx turi, kassadagi eslatma va taqiqlar.
   - [ ] 5c. Mijoz chegirmasi: guruh foizi va sodiqlik pog'onalari (xaridlar summasidan) — avtomatik chegirma, qo'l chegirmasidan alohida.
   - [ ] 5d. Chakana qarz ("Qarzga" to'lov qatori, muddat, qisman to'lash) — daftarga tegadi, foydalanuvchi bilan.
6. [ ] Aksiyalar (foiz, belgilangan narx, 1+1), chegirmalar tartibi, promokod.
7. [ ] Chek va etiketka dizayni.
8. [ ] Tovar rasmlari.

Qolgani (donalar ro'yxati, dinamik valyuta, Humo bot, hisobotlar, superadmin) — foydalanuvchi bilan.

## Hozir ishlanayotgan bo'lak

5b. Mijoz guruhlari va teglar (2026-10-05 06:40 da boshlandi).

## Ish daraxti nusxalari

Tiklash: `git read-tree <id>` emas — faqat qarash uchun `git diff <id>` yoki `git archive <id>`.

| Nusxa | Nimadan keyin |
| --- | --- |
| `85854874e3f5aec24b7a9d44fe29c892cc4b9056` | alertlar va bildirishnomalar |
| `73269aa63b14664781f31fe1b1fb24a7d7983387` | yetkazib beruvchi qarzi, reja va Billz tahlili hujjatlari |
| `177eda274d987b42f58cd1e0578cea7ce9486ff9` | 1a: kassada kelishilgan summa |
| `558fe730c903b189f3d035a4162e0d67e0522eb9` | 1b: minimal narx (kassada pol, rahbar tasdig'i) |
| `c6ccc3d7bcb6cf87087952dc7b0294c92ffeb10a` | 1c: dollar kelishilgan qiymatda (kurs farqi hisobi, chegara sozlamada) |
| `df2ad66ebaf3bd5f7652c6ec8bab65b7e7f691c8` | 1d: to'lov alohida bo'limda (chek ko'rinishi, har karta va terminalga qator) |
| `d725b5010953f920fda997a9b912a6a6c2f9cb01` | 2a: xarajat va boshqa kirim, xarajat turlari |
| `b9e526a513b9e4de5f7cf2326dadba0295efda4b` | 2b: kartani bir nechta do'konga biriktirish |
| `b08a7b585c7280cea885044745f33a75325ff447` | 3: ikki qavatli menyu |
| `380ff425678d9d26e9fa3b357c67043618f747f0` | 4a, 4b: kirimda har narx turiga maydon; qo'shimcha xarajat sozlamada |
| `c399bb632b1c172ce15a59138711616e37436811` | 4c: kassada narx turini tanlash |
| `ee1f55472caebeb66f9b99b16aabe23d000f9f4c` | 5a: mijozlar bazasi va kassada mijoz |
