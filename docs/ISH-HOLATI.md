# Ish holati

Bu fayl — ishning qayerda turganini aytadi. Har sessiya ish boshlashdan oldin o'qiydi va har tugagan bo'lakdan keyin yangilaydi. Reja — `docs/KEYINGI-REJA.md` (14-bo'lim: ish tartibi), Billz'da nima borligi — `docs/BILLZ-TAHLIL.md`, qoidalar — `CLAUDE.md`.

## Qoidalar (foydalanuvchi bilan kelishilgan)

- **Commit ham, push ham faqat foydalanuvchi aytganda qilinadi.** Oradagi har tugagan bo'lakdan keyin ish daraxtining nusxasi olinadi va pastdagi ro'yxatga yoziladi: `git add -A && git write-tree && git reset -q` (bu commit emas, hech narsani o'zgartirmaydi).
- Parol va kalitlar chatga ham, hujjatga ham yozilmaydi (`server/.env`, `server/.env.test-users`).
- Billz'ga kirilmaydi: tahlil tugagan.
- Har bo'lakdan keyin: `npm run typecheck`, `npm run lint`, `npm test` — hammasi yashil bo'lishi shart. Qizil holatda keyingi bo'lakka o'tilmaydi.
- Foydalanuvchiga ko'rinadigan matn o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`); imloga e'tibor (o', g', tutuq belgisi).
- Rejada ochiq qolgan savolda taklif qilingan qiymat olinadi (dollarni kelishilgan qiymat bilan olish chegarasi — 2%) va sozlamadan o'zgartiriladigan qilinadi.
- Katta, daftarga tegadigan ish (dinamik valyuta) foydalanuvchisiz boshlanmaydi.

## Commit holati

2026-10-05 da foydalanuvchi aytgach, `84e8ac1` dan keyingi hamma ish `v2` ga commit qilindi: har bo'lak alohida commit (ish daraxti nusxalaridan yig'ildi). 7b va 8a ham shu kuni alohida commit bo'ldi. Push qilinmagan. Bundan keyingi ish yana commit qilinmagan holda yig'iladi va nusxalari pastdagi ro'yxatga yoziladi.

Oxirgi to'liq tekshiruv: 2026-10-05 (8a dan keyin) — core 151, agent 17, server 257, web 131; typecheck va lint toza.

## Ekranda ko'rib chiqildi (2026-10-05, egasi tizimga kirib bergach)

Brauzerda, egasining hisobi bilan, haqiqiy ma'lumotda ko'rildi (hech narsa saqlanmadi, sotuv qilinmadi):

- Menyu (bo'limlar, ichki bandlar), Bosh sahifa.
- Sozlamalar → Biznes (yangi maydonlar), Sozlamalar → Chek (jonli ko'rinish tugmalarga javob beradi).
- Pul: Kassalar, Hisoblar (hisob formasidagi "Do'konlar"), Xarajat va kirim, Xarajat turlari (13 ta tayyor tur), Dollar kursi; "Xarajat" oynasi (Alt+X), hamkor to'lovi oynasi (Alt+K).
- Mijozlar: ro'yxat va to'rtta ko'rsatkich, Guruhlar, Sodiqlik dasturi; mijoz va guruh formalari.
- Aksiyalar: ro'yxat va forma (to'rt tur).
- Ma'lumotnomalar → Narx turlari va formasidagi "Kassada".
- Kirim: o'tkazilgan K-000001 va yangi kirim formasi (har narx turiga maydon: Chakana, Ulgurji, Minimal; "qo'shimcha xarajat" yashirin).
- Kassa: savat (qidiruv, qator, "Mijoz" maydoni, kelishilgan summa va yaxlit takliflar), F9 bilan to'lov bo'limi (chek ko'rinishi, to'lov qatorlari), Esc bilan qaytish, "Qaytarish" oynasi (F4).
- 7b: "Sozlamalar → Etiketka" (jonli ko'rinish tugmalarga javob beradi), "Sozlamalar → Chek"dagi logotip (sinov rasmi kichrayib chekda chiqdi, saqlanmadi) va chek ostidagi shtrix-kod; kassada chek raqami yozilganda qaytarish oynasi ochilishi.
- 8: tovar kartasidagi "Rasmlar" bo'limi (bo'sh holati haqiqiy tovarda; rasm qo'shish, asosiy qilish, rang, o'chirish, kattalashtirish — vaqtinchalik sahifada, server o'rniga soxta javob bilan); brauzerning rasm tayyorlashi haqiqiy brauzerda o'lchandi (4000×3000 → 1600 / 640 / 160, WebP).
- Qolgan hamma sahifa (cheklar, smenalar, tovarlar, narxlar, etiketkalar, qoldiq, ko'chirish, inventarizatsiya, hisobdan chiqarish, hamkorlar, xodimlar, rollar, joylar, qurilmalar, tarix, profil) ochilib, fokus hoshiyasi kesilmasligi o'lchab chiqildi.

Shu ko'rikda topilib tuzatilgani:

- **Fokus hoshiyasi kesilardi**: aylantiriladigan quti chetiga taqalgan maydonning hoshiyasini kesadi. Kassaning o'ng ustuni ("Mijoz" maydoni, "Smenani yopish") va hujjat formalari (tovar, kirim, sklad hujjatlaridagi tovar qidiruvi) — qutiga chetdan joy berildi (`-m-1 p-1` / `-mx-1 px-1`). Yangi aylantiriladigan quti yozilsa, shu qoida.
- **Kassa qidiruvi**: artikul to'liq yozilib Enter bosilsa, ro'yxatning birinchisi boshqa tovar bo'lib chiqishi mumkin edi ("8018-09" yozilsa "8018-08" tushardi). Endi artikuli yoki shtrix-kodi aynan mos kelgan tovar doim birinchi (`items.ts` dagi `EXACT`).
- Menyu: past oynada qatorlar har xil balandlikka siqilardi — endi menyu aylanadi.
- "Xarajat va kirim" ro'yxatida raqam ustuni "O'tkazma" deb nomlangan edi — "Raqam".
- Tor oynada tablar sahifadan chiqib ketardi — endi tablar qatori o'zi suriladi.
- "Bugungi dollar kursi kiritilmagan" yozuvi hech narsa yozilmasdan qizil turardi — endi xira, dollar qatoriga summa yozilgandagina qizil.

Egasiga aytiladigan (ma'lumotga oid, kod emas):

- K-000001 kirimida "cargo" xarajati 43 000 $ deb yozilgan (tovar qiymati 32 472 $), shuning uchun tannarx chakana narxdan baland va ustama −39% chiqyapti. Xato bo'lsa, kirimning xarajatini tuzatish kerak.
- Bugungi dollar kursi kiritilmagan: kassada dollar qatori "kurs yo'q" deb turadi.
- Sodiqlik pog'onalari hali kiritilmagan (jadval bo'sh).

## Hali ekranda ko'rilmagan

Bular uchun bazada ma'lumot yaratish yoki sotuv qilish kerak edi; egasining bazasini ifloslamaslik uchun qilinmadi, testlar bilan tekshirilgan:

- Kassa: minimal narxdan past qatorning qizil yozuvi va rahbar tasdig'i (1b); dollar qatori ostidagi "So'mda hisoblanadi" (1c, bugun kurs yo'q); "Narx" tanlagichi (4c, hozir hech bir narx turi kassaga ochilmagan); mijoz chegirmasi va guruh eslatmasi (5b, 5c); aksiya yozuvi va "Promokod" (6a, 6b).
- Sotuvni oxirigacha yetkazish, chek oynasi, qaytarish va almashtirish; smena hisobotidagi xarajat qatorlari.
- Haqiqiy printerda chek chop etish (7a), logotip va shtrix-kod qog'ozda qanday chiqishi, shtrix-kodni skaner o'qishi (7b).
- Rasmli tovar haqiqiy bazada: ro'yxat va kassadagi kichik rasmlar, telefondan (kameradan) rasm qo'shish, sudrab tartiblash (8). Egasining bazasiga sinov rasmi qo'yilmadi.
- Haqiqiy printerda etiketka: shablon o'zgartirilgandagi joylashuv (7b). Ekrandagi ko'rinish printer harflarini emas, joylashuvni ko'rsatadi.

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
   - [x] 5c. Mijoz chegirmasi: guruh foizi va sodiqlik pog'onalari (xaridlar summasidan) — avtomatik chegirma, qo'l chegirmasidan alohida.
   - [ ] 5d. Chakana qarz ("Qarzga" to'lov qatori, muddat, qisman to'lash) — daftarga tegadi, foydalanuvchi bilan.
6. **Aksiyalar** — bo'laklarga bo'lingan:
   - [x] 6a. Foizli chegirma va belgilangan narx; muddat, do'konlar, tovar doirasi; mijoz chegirmasi bilan "eng foydalisi"; promokod.
   - [x] 6b. "1+1" (birini olsa ikkinchisi chegirmada), N dona olinsa chegirma.
7. **Chek va etiketka dizayni** — ikki bo'lak:
   - [x] 7a. Chek shabloni: "Sozlamalar → Chek" (jonli ko'rinish, kenglik, qaysi qismlar, pastki matn); chop etish shu shablon bo'yicha.
   - [x] 7b. Etiketka shabloni (o'lcham, maydonlar, narxli yoki narxsiz); chekda logotip va shtrix-kod.
8. **Tovar rasmlari** — ikki bo'lak:
   - [x] 8a. Rasm saqlash (server diskida), tovar kartasida galereya (qo'shish, tartib, rang), ro'yxat va kassada kichik rasm.
   - [ ] 8b. Kirim va qoldiq ro'yxatlarida rasm; Billz'dagi rasmlarni ko'chirish.

Qolgani (donalar ro'yxati, dinamik valyuta, Humo bot, hisobotlar, superadmin) — foydalanuvchi bilan.

## Hozir ishlanayotgan bo'lak

—

## Ish daraxti nusxalari

Tiklash: `git read-tree <id>` emas — faqat qarash uchun `git diff <id>` yoki `git archive <id>`.

| Nusxa | Nimadan keyin |
| --- | --- |
