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

Oxirgi to'liq tekshiruv: 2026-10-05 03:30 — core 103, agent 17, server 188, web 97; typecheck va lint toza

## Ko'z bilan tekshirilmagan (ertalab ko'rib chiqish kerak)

Tunda brauzerda tizimga kira olmadim (parolni o'qish ruxsati yo'q, to'g'ri ham) va toza bazada tovar yo'q, shuning uchun quyidagilar faqat testlar bilan tekshirilgan, ekranda ko'rilmagan:

- Kassa: "Kelishilgan summa" maydoni va yaxlit summa tugmalari (1a).
- Kassa: minimal narxdan past qatorning qizil yozuvi va rahbar tasdig'i (1b).
- Kassa: dollar qatori ostidagi "So'mda hisoblanadi" maydoni (1c); Sozlamalar → Biznes dagi "Dollarni kursdan qimmat olish chegarasi".

## Navbat (KEYINGI-REJA, 14-bo'lim)

1. **Kassa** — bo'laklarga bo'lingan, shu tartibda:
   - [x] 1a. Summani to'g'ridan-to'g'ri belgilash: chek jami yoki qator narxi yoziladi, chegirma o'zi hisoblanadi; yaxlit summa takliflari.
   - [x] 1b. Minimal narx ("pol"): `min` turidagi narx turi (ustama qoidasi yoki qo'lda); kassada qator undan past bo'lsa rahbar tasdig'i.
   - [ ] 1c. Dollarni kelishilgan qiymat bilan olish: farq `fx` hisobiga; chegara sozlamada (2%), oshsa rahbar tasdig'i.
   - [ ] 1d. To'lov alohida bo'limda: chapda chek ko'rinishi, o'ngda tayyor to'lov qatorlari.
2. [ ] Xarajat va kirim-chiqim (xarajat turlari); kartani bir nechta do'konga biriktirish.
3. [ ] Menyu: bo'limlar va ichki menyu.
4. [ ] Kirimda har narx turiga ustun; "qo'shimcha xarajat" ustunini yashirish; narx turida "kassada kim tanlaydi".
5. [ ] Mijozlar: baza, guruh va teg, kassadagi eslatma va taqiqlar, sodiqlik pog'onalari.
6. [ ] Aksiyalar (foiz, belgilangan narx, 1+1), chegirmalar tartibi, promokod.
7. [ ] Chek va etiketka dizayni.
8. [ ] Tovar rasmlari.

Qolgani (donalar ro'yxati, dinamik valyuta, Humo bot, hisobotlar, superadmin) — foydalanuvchi bilan.

## Hozir ishlanayotgan bo'lak

1c. Dollarni kelishilgan qiymat bilan olish (2026-10-05 03:30 da boshlandi).

## Ish daraxti nusxalari

Tiklash: `git read-tree <id>` emas — faqat qarash uchun `git diff <id>` yoki `git archive <id>`.

| Nusxa | Nimadan keyin |
| --- | --- |
| `85854874e3f5aec24b7a9d44fe29c892cc4b9056` | alertlar va bildirishnomalar |
| `73269aa63b14664781f31fe1b1fb24a7d7983387` | yetkazib beruvchi qarzi, reja va Billz tahlili hujjatlari |
| `177eda274d987b42f58cd1e0578cea7ce9486ff9` | 1a: kassada kelishilgan summa |
| `558fe730c903b189f3d035a4162e0d67e0522eb9` | 1b: minimal narx (kassada pol, rahbar tasdig'i) |
