# Ish holati

Bu fayl — ishning qayerda turganini aytadi. Har sessiya ish boshlashdan oldin o'qiydi va har tugagan bo'lakdan keyin yangilaydi. Reja — `docs/KEYINGI-REJA.md` (14-bo'lim: ish tartibi), Billz'da nima borligi — `docs/BILLZ-TAHLIL.md`, qoidalar — `CLAUDE.md`.

## Qoidalar (foydalanuvchi bilan kelishilgan)

- **Bulut sessiyasi** (claude.ai/code) uchun alohida tartib bor — `docs/BULUT-SESSIYA.md`: u o'z branchida ishlaydi, har bo'lakni commit qiladi va `main` ga PR ochadi; natijani lokal sessiya tekshiradi.
- **Branchlar** (2026-10-08, foydalanuvchi so'rovi): ish `main` da. Eski tizimning kodi (`backend/`, `frontend/`) — `v1` branchida; `v2` `main` ga birlashtirilgan.
- **Commit ham, push ham faqat foydalanuvchi aytganda qilinadi** (lokal sessiyada). Oradagi har tugagan bo'lakdan keyin ish daraxtining nusxasi olinadi va pastdagi ro'yxatga yoziladi: `git add -A && git write-tree && git reset -q` (bu commit emas, hech narsani o'zgartirmaydi).
- Parol va kalitlar chatga ham, hujjatga ham yozilmaydi (`server/.env`, `server/.env.test-users`).
- Billz'ga kirilmaydi: tahlil tugagan.
- Har bo'lakdan keyin: `npm run typecheck`, `npm run lint`, `npm test` — hammasi yashil bo'lishi shart. Qizil holatda keyingi bo'lakka o'tilmaydi.
- Foydalanuvchiga ko'rinadigan matn o'zbek va rus tilida (`web/src/i18n/uz.ts`, `ru.ts`); imloga e'tibor (o', g', tutuq belgisi).
- Rejada ochiq qolgan savolda taklif qilingan qiymat olinadi (dollarni kelishilgan qiymat bilan olish chegarasi — 2%) va sozlamadan o'zgartiriladigan qilinadi.
- Katta, daftarga tegadigan ish (dinamik valyuta) foydalanuvchisiz boshlanmaydi.

## Commit holati

2026-10-05 da foydalanuvchi aytgach, `84e8ac1` dan keyingi hamma ish `v2` ga commit qilindi: har bo'lak alohida commit (ish daraxti nusxalaridan yig'ildi). 7b, 8a, 8b, 9, UI tuzatishlar, 5d va PIN kataklari ham shu kuni alohida commit bo'ldi. Push qilinmagan. Bundan keyingi ish yana commit qilinmagan holda yig'iladi va nusxalari pastdagi ro'yxatga yoziladi.

2026-10-06 da foydalanuvchi aytgach yana to'rtta commit qilindi (`58abc6f` PIN'ni o'chirish va parol ko'zi, `47f23ba` savdo hisoboti, `65ed5c7` juft maydon, pul joylari va "Pul holati", `2f50d01` o‘/g‘ imlosi va Ctrl+Q). Shu kuni keyinroq V1 (valyutalar va kurslar), V2 (pul joylari istalgan valyutada) va bulut sessiyasiga tayyorgarlik ham commit qilindi va `v2` GitHub'ga chiqarildi (foydalanuvchi so'rovi: ish bulut sessiyasida davom etadi).

2026-10-08 da foydalanuvchi aytgach bulut sessiyasining `cloud/exchange-partners` branchi (V4, V3) ekranda tekshirilgan UI tuzatishlar bilan birga commit qilindi va `v2` ga qo'shildi (fast-forward). Push qilinmagan.

Lokal bazada bemalol ishlash mumkin (foydalanuvchi so'zi, 2026-10-06): sinov yozuvlari, migratsiyani qo'llash va qaytarish. Avtomatik testlar o'z bazasida (`gulbahor_test`) qoladi, chunki har yurishda bazani bo'shatadi.

Oxirgi to'liq tekshiruv: 2026-10-08, 9b dan keyin: core 208, web 215, agent 17, server 380 (32 fayl); typecheck, lint, check_i18n toza.

## Bulut sessiyasi hisoboti (2026-10-06, branch `cloud/exchange-partners`)

### Qilindi

- **Muhit.** Agent testidagi poyga tuzatildi: printer baytlarni agent "tugatdim" deganidan bir lahza keyin o'qiydi — test endi shuni kutadi (`vi.waitFor`). Bulutda uch marta ketma-ket qizil edi.
- **A. Ayirboshlash (V4).** "Pul o'tkazish" oynasida boshqa valyutadagi joy ham tanlanadi; valyuta har xil bo'lsa ikki summa — "Chiqadi" va "Kiradi", ostida kun kursi. Juft qoida to'lov oynasidagidek: chiqadigan summa langar, kiradigan summa ustidan yozilsa kelishilgan summa ("… foydamizga / zararimizga" izohi), chiqadigan bo'sh bo'lsa kursdan chiqadi. Kun kursidan 2% dan uzoq kelishuv faqat kurs qo'yish ruxsati bilan. Kurs yuborilganda qotadi; qabulda farq "Kurs farqi"ga, rad etilsa yoki qaytarib olinsa pul aynan qaytadi. Kassadagi "Inkassatsiya"da do'konning hamma seyfi (boshqa valyutadagisi ham) — tanlansa xuddi shu juft maydon; smena yopilishidagi topshirish o'z valyutasida qoladi. Ro'yxatda, kassada va "Pul holati"da "1 000 $ → 7 250 ¥".
- **B1. Hamkor istalgan valyutada.** Hamkor formasidagi valyuta — biznes yoqqan valyutalar; boshlang'ich qoldiq zanjirli kurs bilan; kurs yo'q bo'lsa qaysi biri yetishmasligi aytiladi.
- **B2. Kirim qarzi o'z valyutasida.** Kirim hamkor valyutasida bo'lsa — aynan yozilgan summa; dollar/so'm hamkorga — kirim kurslarida (avvalgidek); boshqa valyutada — kirimdagi dollar summasi kirim kunining kursi bilan. Bekor qilinsa aynan qaytadi.
- **B3. Kassadan hamkorga sotuv.** "Mijoz" maydoni hamkorni ham topadi ("hamkor · USD"); to'lov bo'limida "Hisobiga · Elaris" qatori (summalardan alohida, «=» bilan); boshqa valyutadagi hamkorga ikkinchi maydon (kun kursi yoki kelishilgan summa). Ruxsat `pos.partner_sale` (kassirda yo'q — rahbar PIN'i). Chegirmadan keyingi summa yoziladi. Chekda "Hamkor: …" va "Hamkor hisobiga: 1 265 000 so'm (100,00 $)"; smena hisobotida alohida qator. Qaytarishda o'sha sotuvda yozilgan ulush ayiriladi (bugungi kurs emas), kurs farqining ulushi ham qaytadi. Hisob-kitobda "Kassadan sotuv CH-…", "Tovar qaytarildi", "Chek bekor qilindi".
- **B4. Hamkorga narx turi.** Hamkor formasida "Narx"; kassada hamkor tanlansa savat o'zi shu narxga o'tadi, ruxsat va PIN so'ralmaydi.
- **B5. Yetkazib beruvchiga qaytarish.** "Sklad → Yetkazib beruvchiga qaytarish" (YQ-…): kirim tanlanadi, tovar faqat shu kirim partiyalaridan chiqadi, qarzimiz kirim narxida hamkor valyutasida kamayadi; bekor qilinsa ikkalasi qaytadi. Yangi ruxsat guruhi `supplier_returns`.

### Tekshiruv

Oxirgi to'liq yurish (B5 dan keyin): **core 199, agent 17, server 354, web 204** — hammasi yashil; `typecheck`, `lint` toza; `check_i18n`: only uz/ru bo'sh, missing 13. Server testlari bulutdagi haqiqiy PostgreSQL'da yurdi. Yangi spec'lar: `money-exchange.spec.ts`, `partner-sales.spec.ts`, `supplier-returns.spec.ts`; qo'shimchalar `money-currencies`, `receiving`, `money-transfers`, `returns`, `customer-debts`, `till-controls`, `till-prices` spec'larida. Veb: `exchange.test.tsx`, `partner-sale.test.tsx`, `handover.test.tsx`, `payment-lines.test.tsx`.

Testsiz qolgan (sessiyaga bog'liq sahifalar, jsdom'da yurmaydi): `TransferDialog` va `HandoverDialog` ning o'zi (ichidagi `ReceivedField`/`HandoverFields` sinalgan), kassa sahifasining hamkor bilan to'liq oqimi (`pos-page.tsx`; `TenderPanel` va `CustomerPicker` alohida sinalgan), hamkor formasidagi "Narx" maydoni (B4 veb), "Yetkazib beruvchiga qaytarish" sahifalari (B5 veb). Server tomoni har birida testlangan.

### Qarorlar

1. **Branch.** Sessiya `v2` da ishlashga sozlangan edi, lekin `docs/BULUT-SESSIYA.md` `v2` ga to'g'ridan-to'g'ri push qilmaslikni aytadi — ish `cloud/exchange-partners` branchida, `v2` ga PR bilan.
2. **O'tkazmada `received`** faqat kelishilgan summa bo'lsa yuboriladi; aks holda server kun kursidan o'zi hisoblaydi (ekran bilan server orasida kurs o'zgarsa, server kursi ustun — natija toast va ro'yxatda ko'rinadi). `RATE_CHANGED` qo'shilmadi: o'tkazmada jami summa yo'q.
3. **Inkassatsiyada chegara** — `money.rates` egasi uchun yo'q, boshqalarga `maxRateLossPercent` (to'lov oynalari bilan bir xil). Hamkorga sotuvda esa chegara `pos.discount` bilan (kassadagi dollarni kelishilgan qiymatda olish kabi) — BULUT-SESSIYA B3 shuni aytadi.
4. **B2, uchinchi valyuta.** Kirim liroda, hamkor yuanda bo'lsa — kirimdagi **dollar** summasi kirim sanasining kitobi bilan yuanga o'tkaziladi (yuan kursi odatda dollarga nisbatan). Kurs yo'q bo'lsa kirim o'tkazilmaydi (`RATE_MISSING`, nima yetishmasligi aytiladi).
5. **B3.** Hamkorni tanlashning o'zi ruxsat talab qilmaydi — faqat "Hisobiga" summa yozilganda. Mijoz va hamkor bir chekda birga bo'lmaydi (bazada ham cheklov). Qaytarishda tartib: avval mijoz qarzi, keyin hamkor hisobi, keyin pul. Hamkor chekidan almashtirishdagi yangi tovar hamkorga avtomatik yozilmaydi (oddiy sotuv). Qaytarishda kurs farqining ulushi proporsional qaytadi, oxirgi qaytarish qoldiqni oladi.
6. **B4.** Hamkorga faqat kassa narx turlari (ulgurji, boshqa) beriladi — mijoz guruhlaridagidek; minimal narx emas.
7. **B5.** Qaytarish bitta kirimga bog'lanadi; yetkazib beruvchi — kirimning (qatorda alohida yetkazib beruvchi bo'lsa, o'shaniki). Kirim tanlash ro'yxati — oxirgi 200 ta o'tkazilgan kirim (`receipts.view` kerak). Yangi ruxsat guruhi: boshqaruvchida hammasi, sklad mudirida ko'rish va qoralama, buxgalterda ko'rish (migratsiya mavjud rollarga qo'shadi).
8. Ishlatilmay qolgan `partners.currencyUzs/Usd` tarjimalari olib tashlandi.

### Lokal tekshiruvga

Migratsiyalar (lokal bazaga qo'llab ko'rish): `1790000030000-money-exchange` (mavjud o'tkazmalar: `to_currency = currency`, `to_amount = amount`, `to_base = base`, `fx = 0`; CHECK `fx = to_base − base`), `…31000-partners-in-any-currency`, `…32000-partner-sales` (sotuv to'lovlari va qaytarish to'lovlarining usul/valyuta cheklovlari), `…33000-partner-price-type`, `…34000-supplier-returns` (sklad hujjati turi, harakat turlari, rollarga ruxsat). Har biri `down` bilan qaytariladimi — ham tekshirilsin.

Ekranda:
1. **Pul → O'tkazmalar → Pul o'tkazish**: so'm seyfidan dollar seyfiga — "Chiqadi (So'm)" 1 000 000 → "Kiradi (Dollar)" 77,82 va "Kun kursi: 1 $ = …"; "Kiradi"ni 78 qilib — "Chiqadi" o'zgarmasin, yashil izoh; 80 (2% dan ortiq) — kurs ruxsatisiz xodimda qizil izoh va server xatosi "Kiradi" ostida; bir xil valyutada bitta "Summa".
2. O'tkazmalar ro'yxati va "Pul holati"dagi "yo'lda" qatori: "1 000 000 so'm → 77,82 $".
3. **Kassa → Inkassatsiya**: seyf tanlovida boshqa valyutadagi seyf "(…$)" belgisi bilan; tanlansa juft maydon. Smena yopilishida faqat o'z valyutasidagi seyflar.
4. **Hamkor formasi**: valyuta ro'yxati yoqilgan valyutalar; "Narx" maydoni.
5. **Kassa, hamkor bilan**: "Mijoz" maydoniga hamkor nomi — "hamkor · USD" qatori; tanlangach karta; narx turi bo'lsa narx tanlagichi o'zi o'zgaradi. F9 → "Hisobiga · …" bloki, «=» bilan qolgani; dollar hamkorda "Hisobiga (USD)" va izoh; kassirda PIN oynasi ("… hisobiga sotish"). Chek oynasi va qog'oz chekda "Hamkor: …", "Hamkor hisobiga: … so'm (… $)". Smena hisobotida "Hamkor hisobiga · …" qatori.
6. **Qaytarish (F4)** hamkor chekidan: "Hamkor hisobidan ayiriladi" qatori, pul so'ralmasligi.
7. **Hamkorlar → hisob-kitob**: "Kassadan sotuv", "Tovar qaytarildi", "Chek bekor qilindi", "Tovar qaytarildi (yetkazib beruvchiga)" qatorlari.
8. **Sklad → Yetkazib beruvchiga qaytarish**: ro'yxat (yetkazib beruvchi va kirim ustunlari), yangi hujjat (kirim tanlovi, ostida yetkazib beruvchi), tasdiqlash, "… hisobidan qarzimiz kamaydi", bekor qilish. Menyuda yangi band.
9. Haqiqiy bazada: yuan kirimi + yuan hamkor + qaytarish; dollar kursi o'zgargandan keyin hamkor chekini qaytarish.

### Lokal tekshiruv natijasi (2026-10-07 — 08)

- Branch lokalda: typecheck, lint toza; core 199, agent 17, server 354, web 204 — bulut sonlari bilan bir xil. Beshta migratsiya test bazasida `down` bilan qaytarildi va qayta qo'llandi (deyarli bo'sh bazada).
- Ekranda (test bazasida namunaviy biznes, alohida server 3101/5191; lokal baza toza qoldi): 1–8 bandlar ko'rildi. O'tkazma 1 000 000 so'm → 79,05 $, 80 $ kelishilganda "… 12 000 so'm foydamizga"; inkassatsiya 500 000 so'm → "Seyf $" 39,53 $; kassada hamkorga sotuv va uning chekidan qaytarish (hisob-kitobda +100 $ / −100 $); yuan kirimidan 5 dona qaytarish YQ-000001 — Yiwu qarzi 600 → 450 ¥, qiymati 261 724 so'm.
- 9-band (haqiqiy ma'lumotda) qilinmadi: lokal bazada pul harakati yo'q.
- Ko'rish paytida foydalanuvchi so'rovlari bilan tuzatildi (commit qilinmagan): o'tkazma, inkassatsiya va kassa to'lov paneli juft ustunli ko'rinishga o'tdi (Ctrl+K oynasidagidek); kassada to'lov paytida chek tor, pul qismi keng; modallar ekran o'rtasida; tablar alohida "yo'lak"da, ostidagi chiziq olib tashlandi; Tab bilan kelinganda hisoblangan summa belgilanadi; "yo'lda" turgan o'tkazmada bitta tugma ("Qabul qildim"), qolgani "…" menyusida — jadval va kassa ustuni endi yonga chiqmaydi; tanlov ro'yxati uzun nomlar uchun kengayadi; menyudagi qirqilgan nom ustiga kelganda to'liq ko'rinadi.

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

Keyin, foydalanuvchi ko'rsatgan kamchiliklar (2026-10-05):

- "Ekranni bloklash" maydonida "10" bilan "daqiqa" ustma-ust tushardi — son maydonining birligi endi ramka ichida o'z joyini oladi (hamma joyda).
- Sozlamalar, Profil, Bosh sahifa, Dollar kursi: oxirigacha aylantirilganda karta oyna tubiga yopishardi — bunday sahifalar endi `Page flow` (ichidagisi bilan o'sadi, oxirida joy qoladi).
- Tovar sahifasida forma bo'ylab pastga yurilganda butun oyna yuqoriga surilib, pastida bo'sh joy ochilardi — ko'rinmas tanlov elementi sahifani aylantirayotgan edi; endi sahifa aylanmaydi (hamma uzun formada).
- Kirimdagi qator xarajati maydoni "Xarajat (1 donaga)" deb nomlandi va sozlamadagi izohi aniqlashtirildi: summa shu tovarning har donasiga qo'shiladi, boshqa tovarlarga taqsimlanmaydi.

9-bo'lak (kassa tanlovi, asosiy kassa) ekranda: "Pul → Kassalar"da ikkala kassa "Asosiy" belgisi bilan chiqdi; to'lov oynasi bitta kassa bilan avvalgidek ochildi. Ikki kassali holat (tanlov maydoni) faqat testlar bilan tekshirilgan — bazada tortmasi bor ikkinchi kassa yo'q.

Egasiga aytiladigan (ma'lumotga oid, kod emas):

- K-000001 kirimida "cargo" xarajati 43 000 $ deb yozilgan (tovar qiymati 32 472 $), shuning uchun tannarx chakana narxdan baland va ustama −39% chiqyapti. Xato bo'lsa, kirimning xarajatini tuzatish kerak.
- Bugungi dollar kursi kiritilmagan: kassada dollar qatori "kurs yo'q" deb turadi.
- Sodiqlik pog'onalari hali kiritilmagan (jadval bo'sh).

## V5 ekranda ko'rildi (2026-10-08, test bazasida, alohida server)

- **Tenge asosli biznes** ("Almaty Style", dollar yonida): kassada "Naqd tenge" va "Naqd dollar", ustun "Tengeda", yuqorida "1 $ = 480 ₸"; 12 000 ₸ lik tovar 30 $ bilan sotildi — "30,00 $ = 14 400 ₸", qaytim 2 400 ₸; chekda kurs "1 $ = 480 ₸". "Pul holati": "Tenge naqd", "Dollar naqd", "Tenge naqd (Seyf)", "Hammasi tengeda — kun kursi 480". Sozlamalarda "Qozog'iston tengesi (KZT) — Pul yozuvi bor: endi o'zgarmaydi", qaytim qadami 10 ₸.
- **Dollar asosli biznes**: kassada bitta "Naqd dollar" qatori, kurs ustuni yo'q; 37,60 $ ga 50 $ — qaytim 12,00 $; chekda "Naqd". Kirim formasida "1 $ = ? dollar" maydoni yo'q (ko'rib chiqishda topildi va tuzatildi; "Narxlar" sahifasidagi kurs maydoni ham).
- **Birinchi sozlash**: "Hisob valyutasi" maydoni (standart — dollar; dollar tanlansa "Dollar bilan ham ishlaymiz" savoli yashiriladi). Qirg'iz somi tanlab yakunlandi: "Kurslar"da KGS asosiy, dollar qatori kurssiz. Ko'rib chiqishda topildi va tuzatildi: yangi biznesda eski "so'm" kurssiz yoqilgan valyuta bo'lib qolardi — endi eski asosiy valyuta faqat kursi ma'lum bo'lsa yoki unda hisob/hamkor bo'lsa qoladi.
- **Almashtirish** (pul yozuvi yo'q biznesda): KGS → KZT → USD, tasdiq oynasi matni to'g'ri, qaytim qadami har safar yangi valyutaniki. Ko'rib chiqishda topildi va tuzatildi: almashtirgandan keyin pastdagi biznes formasi eski qadamni ushlab qolardi (saqlansa yangisini bosib ketardi) — endi forma asosiy valyuta bilan qayta ochiladi.

## Kichik o'zgarishlar (navbatdan tashqari, foydalanuvchi so'rovi bilan)

- 2026-10-05: PIN kod aynan 4 ta raqam, har raqamga alohida katak (`PinInput`): bloklangan ekranda 4-raqam terilishi bilan o'zi tekshiriladi, xato bo'lsa kataklar qizarib silkinadi (telefonda titraydi); kassadagi rahbar tasdig'i va profildagi "Yangi PIN" ham shu kataklarda. **Eski PIN 4 raqamdan uzun bo'lsa, endi terib bo'lmaydi** — parol bilan kirib, Profil → Xavfsizlikda yangisini o'rnatish kerak.
- 2026-10-05: menyuni yig'ish-ochish tugmasi menyuning pastidan yuqori panelning chap boshiga ko'chirildi.
- 2026-10-05: PIN kodni o'chirib qo'yish (Profil → Xavfsizlik, joriy parol bilan; `POST /auth/pin/remove`); parol maydonlarida "ko'z" tugmasi (`PasswordInput`: kirish, parolni almashtirish, PIN kartasi); ekranni bloklash — **Ctrl+L**, kassada mijoz maydoni — **Ctrl+M** (eski Alt+L va Alt+M ham ishlaydi). Qolgan Alt tugmalari o'zgarmadi: Ctrl+K qidiruvga, Ctrl+C va Ctrl+X nusxa olish va qirqishga, Ctrl+raqam brauzer tablariga band.

## Hali ekranda ko'rilmagan

Bular uchun bazada ma'lumot yaratish yoki sotuv qilish kerak edi; egasining bazasini ifloslamaslik uchun qilinmadi, testlar bilan tekshirilgan:

- Kassa: minimal narxdan past qatorning qizil yozuvi va rahbar tasdig'i (1b); dollar qatori ostidagi "So'mda hisoblanadi" (1c, bugun kurs yo'q); "Narx" tanlagichi (4c, hozir hech bir narx turi kassaga ochilmagan); mijoz chegirmasi va guruh eslatmasi (5b, 5c); aksiya yozuvi va "Promokod" (6a, 6b).
- Sotuvni oxirigacha yetkazish, chek oynasi, qaytarish va almashtirish; smena hisobotidagi xarajat qatorlari.
- Haqiqiy printerda chek chop etish (7a), logotip va shtrix-kod qog'ozda qanday chiqishi, shtrix-kodni skaner o'qishi (7b).
- Rasmli tovar haqiqiy bazada: ro'yxat va kassadagi kichik rasmlar, telefondan (kameradan) rasm qo'shish, sudrab tartiblash (8). Egasining bazasiga sinov rasmi qo'yilmadi.
- Haqiqiy printerda etiketka: shablon o'zgartirilgandagi joylashuv (7b). Ekrandagi ko'rinish printer harflarini emas, joylashuvni ko'rsatadi.
- PIN kataklari, bloklangan ekran (xato PIN: qizarish, silkinish, bo'shash; to'g'ri PIN: ochilish) va yuqori paneldagi menyu tugmasi vaqtinchalik sahifada, soxta sessiya bilan ko'rildi. Haqiqiy hisob bilan ko'rilmagan: kassadagi rahbar tasdig'i oynasi (4-raqamda o'zi yuboradi), telefonda titrash.
- Savdo hisoboti va bosh sahifa (10a): haqiqiy qobiq ichida, soxta sessiya va soxta raqamlar bilan ko'rildi — ko'rsatkichlar, grafik (kun, soat, oy; ustunga ko'rsatilganda raqamlar), kesimlar, tovarlar jadvali, bo'sh davr, foydasiz ko'rinish. Haqiqiy bazada ko'rilmagan (egasining bazasida hali sotuv yo'q); Excel faylining o'zi ochib ko'rilmagan.
- Kirim-chiqim (11): juft maydon hamkor to'lovi oynasida vaqtinchalik sahifada, soxta javoblar bilan ko'rildi (100 $ va 1 200 000 so'm ikkalasi joyida qoldi, izoh va "To'lovdan keyin" to'g'ri). "Pul holati" va menyu akkordeoni ham shunday ko'rildi. Haqiqiy bazada ko'rilmagan: kelishilgan summali to'lovni saqlash, karta raqamini kiritish, dollar kartasi.
- Chakana qarz (5d): kassadagi "Qarzga" qatori, mijoz yonidagi qarz yozuvi, "Mijozlar → Qarzlar" va "Qarz to'lovlari" ro'yxatlari vaqtinchalik sahifada, soxta ma'lumot bilan ko'rildi (1100 va 1280 kenglikda). Haqiqiy bazada ko'rilmagan: qarzga sotuvni oxirigacha yetkazish, "To'lov olish" oynasi (sessiyaga bog'liq, hamkor to'lovi oynasi bilan bir xil qatorlar), qarzli chekni qaytarish, "Sozlamalar → Biznes"dagi ikki yangi maydon, smena hisobotidagi "Mijozlar qarzidan to'landi".

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
   - [x] 5d. Chakana qarz ("Qarzga" to'lov qatori, muddat, qisman to'lash) — daftarga tegadi, foydalanuvchi bilan.
6. **Aksiyalar** — bo'laklarga bo'lingan:
   - [x] 6a. Foizli chegirma va belgilangan narx; muddat, do'konlar, tovar doirasi; mijoz chegirmasi bilan "eng foydalisi"; promokod.
   - [x] 6b. "1+1" (birini olsa ikkinchisi chegirmada), N dona olinsa chegirma.
7. **Chek va etiketka dizayni** — ikki bo'lak:
   - [x] 7a. Chek shabloni: "Sozlamalar → Chek" (jonli ko'rinish, kenglik, qaysi qismlar, pastki matn); chop etish shu shablon bo'yicha.
   - [x] 7b. Etiketka shabloni (o'lcham, maydonlar, narxli yoki narxsiz); chekda logotip va shtrix-kod.
8. **Tovar rasmlari** — ikki bo'lak:
   - [x] 8a. Rasm saqlash (server diskida), tovar kartasida galereya (qo'shish, tartib, rang), ro'yxat va kassada kichik rasm.
   - [x] 8b. Qoldiq ro'yxatida, kirim bloklarida va tovar tanlash oynasida rasm.
   - [—] 8c. Billz'dagi rasmlarni ko'chirish — **qilinmaydi** (foydalanuvchi qarori, 2026-10-05: imkon yo'q va kerak emas; kerak bo'lsa o'zi aytadi).

9. [x] Pul oynasida kassani tanlash, do'konning asosiy kassasi (KEYINGI-REJA, 7-bo'lim oxiri).

10. **Hisobotlar** (KEYINGI-REJA, 14a-bo'lim) — bo'laklarga bo'lingan:
   - [x] 10a. Savdo hisoboti (davr, do'kon, ko'rsatkichlar, grafik, kesimlar) va bosh sahifada bugungi kun.
   - [ ] 10b. Tovarlar bo'yicha sotuv (kesimlar, ABC).
   - [ ] 10c. Tovar harakati va aylanish, turib qolgan tovar, partiyaning sotilishi.
   - [ ] 10d. Foyda va zarar, pul harakati.
   - [ ] 10e. Balans va hisob tarixi.
   - [ ] 10f. Xodimlar, mijozlar, aksiyalar hisobotlari.
   - [ ] 10g. Rahbar nazorati: Telegram bot, bildirishnomalar sozlamasi — foydalanuvchi bilan.

   Hisobotlarning qolgani (10b–10g) foydalanuvchi so'zi bilan **keyinga qoldirilgan** (2026-10-06).

11. **Kirim-chiqimni to'g'rilash** (KEYINGI-REJA, 7-bo'lim oxiri; eski ERP tahlili — `docs/ERP-TAHLIL.md`):
   - [x] 11a. Juft maydon: pul langar, kelishilgan summa, kurs farqi har qatorda (hamkor to'lovi, xarajat va kirim, mijoz qarzi).
   - [x] 11b. Pul joylarining nomi ("So'm naqd", "So'm karta (raqami)"), karta raqami, dollar kartasi, kassa maydoni doim.
   - [x] 11c. "Pul → Pul holati": valyuta → naqd / naqdsiz → har joy; yo'ldagi pul; butun biznes yoki bitta do'kon.
   - [x] Menyu akkordeoni (bitta bo'lim ochiq).
   - [x] Kirim: yangi xarajat standart holatda dona bo'yicha, xarajat nomida takliflar yo'q; har tovarning o'z yetkazib beruvchisi maydoni yashirin ("Sozlamalar → Biznes"dan yoqiladi).
   - [x] O‘ va g‘ harflari: ekrandagi hamma o'zbekcha matn `‘` va `’` bilan (1107 ta matn, 112 fayl); etiketka printerga oddiy apostrof bilan ketadi; tizim yozgan nomlar migratsiya bilan o'tkazildi.
   - [x] Qidiruv Ctrl+Q ga ko'chdi, yuqori paneldagi qutisi olib tashlandi; Ctrl+K — hamkordan to'lov olish.

12. **Valyuta va hamkor** (KEYINGI-REJA, 8-bo'lim: "Yakuniy qarorlar" va "Valyuta va hamkor ishining bosqichlari") — reja 2026-10-06 da kelishib olindi; **kod foydalanuvchi "boshla" deganda boshlanadi**:
   - [x] V1. Valyutalar va kurslar (katalog, yoqish, kurs va yozilish shakli, zanjirli hisob, "Kurslar" ekrani).
   - [x] V2. Pul joylari istalgan valyutada.
   - [x] V4. Ayirboshlash: o'tkazmada va kassadan pul olishda juft maydon (foydalanuvchi so'rovi, 2026-10-06); talabi `docs/BULUT-SESSIYA.md`, 4-bo'lim, A. Komissiya keyin.
   - [x] V3. Hamkor istalgan valyutada; kassadan hamkorga sotuv; hamkorga narx turi; yetkazib beruvchiga qaytarish; talabi o'sha yerda, B (B1–B5).
   - [x] V5. Asosiy valyutani tanlash ("so'm va dollar" → "asosiy valyuta va dollar"); reja, qarorlar va qanday qurilgani — KEYINGI-REJA, 8-bo'lim, "5-bosqich rejasi" va "5-bosqich qanday qurildi". 2026-10-08 da tugadi, commit qilindi va push qilindi (`a1928d9`, `454cfe0`).
     - [x] 5a. Asos: bazadagi uchta cheklov, core'dagi kassa, kirim va juft hisob funksiyalari asosiy valyuta bilan.
     - [x] 5b. Server: har `'UZS'` → biznesning asosiy valyutasi; dollar asosli biznesda dollar roli yo'q; `base-currency.spec.ts`.
     - [x] 5c. Veb: asosiy valyuta sessiyadan, "so'm" so'zlari valyuta nomi bilan.
     - [x] 5d. Tanlash: API, qulf, narxlarni o'tkazish, sozlamalar va yangi biznes formasi.
     - [x] 5e. Tekshiruv: to'liq testlar, ekranda tenge va dollar asosli biznes, hujjatlar.
   - [ ] V9. Hamma valyuta teng: dollarning alohida o'rni yo'q (egasi, 2026-10-08); reja — KEYINGI-REJA, 8-bo'lim, "9-bosqich rejasi".
     - [x] 9a. Valyutalar va kurslar: dollar oddiy valyuta, `usd` moduli va `exchange_rates` yo'q, kurs istalgan valyutaga nisbatan, yangi biznes so'm bilan.
     - [x] 9b. Narx istalgan yoqilgan valyutada.
     - [ ] 9c. Tannarx valyutasi va kirim; partiyaning kelgan valyutasi.
     - [ ] 9d. Kassa: kassa valyutalari, tortmalar, to'lov, qaytim, qaytarish, chek.
     - [ ] 9e. Smena va inkassatsiya: har tortma sanog'i.
     - [ ] 9f. Tekshiruv: to'liq testlar, ekranda, hujjatlar.
   - [ ] T1. To'rt til: o'zbek lotin va kirill, rus, ingliz (egasi, 2026-10-08; YOL-XARITA, 3-bo'lim). V9 dan keyin.
   - [ ] V6. Terminal → bank tushumi.
   - [ ] V7. Kurs farqi hisoboti.

0. **Qolgan hamma ishning tartibi va talabi — `docs/YOL-XARITA.md`** (uyda ishlash yo'riqnomasi ham shu yerda). Navbatdagi paket: V9 (egasi so'radi, 2026-10-08), keyin M1.

13. **Mijozlar: yagona ro'yxat, narx formulalari, kassa** (KEYINGI-REJA, 16-bo'lim; texnik — `docs/MIJOZLAR-TEXNIK.md`). Taklif 2026-10-06 da yozildi; **kod foydalanuvchi tasdiqlagach va 16.9 dagi savollarga javob bergach boshlanadi**:
   - [ ] M1. Narx formulalari: narx turining "Qanday hisoblanadi", narx qoidalari (foiz, summa, belgilangan narx), kirimda "Narxlar" qatori, ommaviy o'zgartirish, kassada formula (~9 kun).
   - [ ] M2. Yagona mijoz: baza, ko'chirish, bitta hisob, muddat va chegara, to'lovlar, qaytarish (~7 kun).
   - [ ] M3. Yagona mijoz: ekranlar (~5 kun).
   - [ ] M4. Qo'shimcha holatlar: almashtirish, birlashtirish, akt-sverka, boshlang'ich qoldiq Excel'dan (~7 kun).
   - [ ] M5. Hujjat va ko'chirishni bazaning nusxasida sinash (~1 kun).

14. **Platforma** (YOL-XARITA, 3-bo'lim):
   - [x] P1. Xodimga rolidan tashqari qo'shimcha ruxsat (KEYINGI-REJA, 13b oxiri — qanday qurilgani).

Qolgani (donalar ro'yxati, Humo bot, superadmin) — foydalanuvchi bilan.

## Hozir ishlanayotgan bo'lak

V9 / 9c: tannarx valyutasi (cost_currency), kirim shu valyuta orqali, partiyaning kelgan valyutasi.

## Ish daraxti nusxalari

Tiklash: `git read-tree <id>` emas — faqat qarash uchun `git diff <id>` yoki `git archive <id>`.

| Nusxa | Nimadan keyin |
| --- | --- |
| `e508a146dabbd64efa63ae164f6fa133037d949f` | 5d: chakana qarz (kassada "Qarzga", to'lov olish, Qarzlar va Qarz to'lovlari ro'yxati) + UI tuzatishlar (oyna surilishi, `soft` tugma, demo sahifa) |
| `a9681de59d59c43412fd70e51a0ce544f0286114` | PIN 4 ta katak (bloklash ekrani, tasdiq, profil), menyu tugmasi yuqori panelda, 8c qilinmaydi |
| `8b9d9a57111518124605318d43e6bd1c119bf083` | PIN'ni o'chirish, parol maydonida ko'z, Alt+L menyuda, hisobotlar rejasi |
| `ab3af58f2131bed57313c824df8865d61db2e5a0` | 10a: savdo hisoboti (Hisobotlar → Savdo) va bosh sahifada bugungi savdo; Ctrl+L, Ctrl+M |
| `3ffd62a21e0048fd893d051b495729f694f642bf` | 11: juft maydon va kurs farqi, pul joylarining nomi va karta raqami, "Pul holati", menyu akkordeoni; kirimda dona bo'yicha va yashirin yetkazib beruvchi maydoni; valyuta taklifi va rejasi |
| `c043d1b528b33d4f3c70b1d124080811260355d2` | O‘ va g‘ imlosi (1107 ta matn, migratsiya bilan), qidiruv Ctrl+Q da va yuqori panelda qutisiz, Ctrl+K — to'lov olish |
| `96fac49b6f29fd9f0c447d2671a2e0717e1d01d2` | V1: valyuta katalogi (16 ta), yoqish va o'chirib qo'yish, har valyutaga kurs va yozilish shakli, zanjirli hisob, "Pul → Kurslar" sahifasi; reja hujjatda |
| `be4867c78de6ebbb896d2d917dd1b2b5d9e04354` | V2: hisob istalgan yoqilgan valyutada (naqd, karta, bank); to'lov, xarajat va qarz oynalarida boshqa valyutadagi qator; zanjirli kurs bilan baholash; "Pul holati"da har valyuta; kurs tarixi ekrandan olib turildi; hisob turi "Naqd" |
| `71a6070098fa2009c7795775a94ecc3cd6916fc9` | V4: ayirboshlash — o'tkazmada va inkassatsiyada juft maydon, kurs yuborilganda qotadi |
| `a3386593c172ac0a2253f16d7f3551a9446656c4` | V3 (B1–B5): hamkor istalgan valyutada, kirim qarzi o'z valyutasida, kassadan hamkorga sotuv, hamkorga narx turi, yetkazib beruvchiga qaytarish |
| `213c32050b2a27b5e065a92282c55c6917cadfc3` | V5 5a–5c: asosiy valyuta core, server va vebda (kassa, kirim, narx, smena, hisobot, so'zlar); tenge va dollar asosli biznes testlari |
| `af876161ed0b702d6f73d1d2a352d1cd68ff03a4` | V5 5d: asosiy valyutani tanlash — /currencies/base (qulf, narx va sozlamalarni o'tkazish, rebase), Sozlamalar → Biznes kartasi, birinchi sozlashda tanlov |
| `f8a7080312893e871922f90c32be17741da9ea42` | V5 5e: ekranda tenge, dollar va qirg'iz somi asosli biznes, almashtirish; topilgan uchta kamchilik tuzatildi; hujjatlar |
| `61468d60cf6df40df75852b17e5297edda5448f8` | P1: xodimga rolidan tashqari qo'shimcha ruxsat (users.extra_permissions, USER_PERMISSIONS, ESCALATION; formada yig'iladigan bo'lim, ro'yxatda "+N ruxsat") |
| `c1015db1b48825e679f0f8aa912d72d92ba144ea` | V9 / 9a: dollar oddiy valyuta (org_currencies, currency_rates; usd moduli va exchange_rates yo'q), Actor.currencies, kurs asosiyda va istalgan valyutaga nisbatan, CURRENCY_PRICED, yangi biznes so'm bilan |
| `2eecf33b22b93901d96712db1381f4479280ec4e` | V9 / 9b: narx turi va narx istalgan yoqilgan valyutada (pricedIn), kassa narxni kurslar kitobi bilan o'giradi, ustama boshqa valyutada, MoneyInput valyutalar bo'ylab; T1 (to'rt til) rejasi |
