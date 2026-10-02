# Kiyim savdosi tizimi: tahlil, taklif va reja

Sana: 2026-10-01

Ko'rib chiqilganlar:
- `gulbahor`: GitHub'dan olindi, `store/gulbahor` papkasida. NestJS va React, ~28 600 qator.
- `erp` papkasi: `tradus-backend` (Django, ~52 000 qator, biznes qoidalari PRD hujjatlarida yozilgan) va `jr-technocorp` (React frontend, ~50 000 qator).
- Billz: faqat ochiq sayti, dasturning ichi ko'rilmagan.
- `academy`: UI va dizayn tizimi.
- `cargo` va `cargo-server`: biznes mantig'i bizga mos emas. Faqat jadval va karta xabarlarini o'qish texnikasi olinadi.
- `simma` va `techbox`: kichik g'oyalar.

Desktop'dagi boshqa loyihalar savdoga aloqasiz: davlat tizimlari, ta'lim, media, arab tili. `project` va `electron` papkalari — jr'ning eski nusxalari.

Aniqlangan javoblar:
- Kod `xurshiduz/gulbahor` repozitoriyasida davom etadi. Gulbahor hech qayerda ishlatilmayapti, uning kodi kerak emas.
- Server — virtual server (VPS).
- Hozir 3–4 ta do'kon bor, har xil joylarda. Keyin ko'payishi mumkin.
- Sklad alohida binoda bo'lishi ham, do'kon ichida (do'kon + sklad) bo'lishi ham mumkin.
- Tovar Xitoy, Turkiya va boshqa davlatlardan keladi, mahalliy xarid ham bo'lishi mumkin.
- Do'konda hamma narsa so'mda sotiladi. Hamkorlar bilan ham deyarli hammasi so'mda gaplashiladi.
- Hamkorlar qarzga oladi va istalgan payt, istalgan usulda to'laydi. Ba'zisining hisobi doim so'mda, ba'zisiniki doim dollarda. Dollarda hisob yuritadigan hamkor so'm bilan ham to'lashi mumkin.
- Hamma kartalar biznes egasi — Odiljon aka nomida. Bank xabarlari uning Telegram'iga ikki botdan keladi: Uzcard uchun CardXabarBot, HUMO uchun HumoBot. Shu kartalardan egasining shaxsiy xarajatlari ham o'tadi.
- RFID uskunalari bor, chiqish darvozasi ham kerak. Hozir tovarlarda oddiy shtrix-kod bor, RFID etiketkani tovar do'konga qo'yilganda yopishtirish rejalashtirilgan.
- Firma hozircha YaTT, aylanmadan soliq to'laydi (egasining aytishicha, taxminan 1%). Demak QQS to'lovchisi emas.
- Odatdagi to'lov usullari: naqd so'm, naqd dollar, kartaga o'tkazma (mijoz Click yoki boshqa ilova orqali akaning kartasiga pul o'tkazadi) va do'kondagi bank terminali. Perechisleniye deyarli ishlatilmaydi.
- Tizim keyinchalik boshqa biznes egalariga ham sotilishi mumkin. Shuning uchun akada bo'lmagan imkoniyatlar ham (masalan sotuvdan foiz, sheriklar) qo'shiladi.
- Chakana mijozlarga muddatli to'lov, katta ehtimol, berilmaydi.
- UI har tomonlama yengil va qulay bo'lishi kerak: imkoniyat ko'paysa ham foydalanuvchiga qiyin bo'lmasligi shart.
- Aka hozir Billz'da ishlaydi. Eski ma'lumotni jamoa o'zi ko'chiradi: Billz'ga maxsus import kerak emas.
- Billz'da akani ikki narsa qiynaydi: inputlar noqulay va kassa bitta valyutada ishlaydi (dollarni kassir qo'lda so'mga o'giradi).
- Bank botlaridan hozircha pul tushdimi yoki yo'qmi (➕/➖) — shu yetadi. Chiqimlarni turkumlarga ajratish shart emas.
- RFID uskunalari eng yangi modellar bo'yicha rejalanadi, aniq modellar keyinroq aytiladi.

---

## 1. Kod bo'yicha qaror

**`xurshiduz/gulbahor` repozitoriyasida toza, yangi loyiha yoziladi.** Eski kod git tarixida qoladi, asosga olinmaydi. Undan faqat tayyor va to'g'ri ishlaydigan bo'laklar tekshirib ko'chiriladi:
- RFID: EPC kodini normallashtirish va ZPL etiketka qolipi (`labels/epc.ts`, `labels/zpl.ts`);
- to'lov integratsiyalari: Payme, Click, UDS mijozlari (`integrations/clients`);
- kalitlarni bazada shifrlash (`secret-box.ts`);
- ma'lumotnoma ro'yxatlari: ranglar, o'lchamlar, davlatlar, viloyatlar;
- `amal:resurs` ko'rinishidagi huquqlar g'oyasi, PIN bilan ekran bloklash, kirish tarixi;
- tarjima matnlari.

Gulbahor'da tuzatib bo'lmaydigan xatolar bor edi (hammasi kodda tekshirildi). Ular yangi loyihada takrorlanmaydi:

| Muammo | Qayerda | Oqibati |
| --- | --- | --- |
| Tovarda faqat bitta rang va bitta o'lcham | `materials/entities/material.entity.ts` | 1 model × 5 rang × 6 o'lcham = 30 ta tovar alohida kiritiladi, o'lcham bo'yicha hisobot chiqmaydi |
| Sotuv tasdiqlanganda qoldiq tekshirilmaydi | `outbound-documents.service.ts`, `approve()` | omborda yo'q tovar ham sotiladi, qoldiq minusga ketadi |
| Kassada chek bitta tranzaksiyada yozilmaydi | `pos.service.ts`, `sell()` | hujjat tasdiqlangandan keyin to'lovni yozishda xato chiqsa, chek pulsiz qoladi |
| Pul JS float'da, README'ning o'zida "1-2 tiyin farq qolishi mumkin" deyilgan | `numeric.ts`, `pos.service.ts` | tiyinigacha aniqlik bajarilmaydi |
| Qoldiq jadvali yo'q, kassadagi har skanda butun katalog qayta hisoblanadi | `stock.service.ts`, `scan()` | tovar ko'paygani sari kassa sekinlashadi; ikki kassa bitta donani bir vaqtda sotishi mumkin |
| Tasdiqlangan hujjatni qoralamaga qaytarib tahrirlasa bo'ladi | `revert()` | tarix o'chadi, o'g'irlikni yashirish yo'li ochiq qoladi |
| Ko'chirish, hamkorlar hisobi, smena, o'zgarishlar tarixi, socket va testlar yo'q | — | asosiy talablarning yarmi yo'q |
| `synchronize: true`, migratsiyalar yo'q | `app.module.ts` | prod bazada ustun jimgina o'chib ketishi mumkin |

---

## 2. Qaysi loyihada nima bor va bizga nima yetarli

Belgilar: ✅ bor va yaxshi · ◐ bor, lekin chala yoki bizga noto'g'ri · — yo'q · ? Billz saytida aytilmagan

### Tovar va sklad

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Model → rang × o'lcham (razmer setka) | — | ◐ atributlar bor, matritsa yo'q | ✅ | model kartasi; kirimda rang × o'lcham jadvaliga son yoziladi |
| Bir tovarga bir nechta shtrix-kod | — | ✅ | ✅ | ✅ |
| Excel bilan ommaviy yuklash | — | ✅ | ✅ rasm bilan | ✅ shablonlar, matritsa shakli, yetkazib beruvchi Excel'ining ustunlarini eslab qolish (10-bo'lim) |
| Tannarx: qaysi partiyadan sotilgani | — o'rtacha narx | ✅ FIFO partiya | ? | RFID bilan har donaning o'z tannarxi; RFIDsiz tovarda FIFO |
| Yo'l va bojxona xarajatini tannarxga taqsimlash | — | — | ? | ✅ (9-bo'lim) |
| Omborlar orasida ko'chirish, "yo'lda" holati | — | ✅ qabul tasdig'i bilan | ✅ | ✅ jo'natish ham, qabul ham RFID bilan |
| Inventarizatsiya | ✅ RFID yoki shtrix-kod | — | ✅ savdo to'xtamaydi | ✅ natija tasdiq bilan qoldiqqa o'tadi |
| Hisobdan chiqarish (brak, yo'qotish) sababi bilan | — | — | ✅ | ✅ rasm va tasdiq bilan |
| Qayta baholash (kurs va ustama bo'yicha) | — | ◐ | ✅ | ✅ yorliqni qayta chop etish bilan |
| Narx turlari (chakana, ulgurji, hamkor) | — | ✅ | ? | ✅ |
| Narx yorlig'i dizayni | ◐ bitta qolip | ◐ | ✅ | ✅ |
| RFID etiketka (chipga EPC yozish) | ✅ | — | — | ✅ |

### Kassa

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Skaner va klaviatura bilan tez sotish | ◐ F2, F8, F9 | ✅ Ctrl+harf, Enter bilan oqim | ✅ | ✅ sichqonchasiz, to'liq |
| Bir nechta usul va valyutada to'lov, qaytim | ✅ | ✅ | ◐ kassada bitta valyuta, dollar qo'lda o'giriladi | ✅ dollar to'g'ridan-to'g'ri qabul qilinadi (4-bo'lim) |
| Qarzga sotish, qarzni FIFO bilan yopish | ◐ | ✅ | ✅ | ✅ |
| Qaytarish | ◐ alohida hujjat | ✅ | ✅ | ✅ faqat sotilgan dona (RFID) |
| O'lcham almashtirish, farqni hisoblash | — | — | ✅ bitta amalda | ✅ bitta amalda |
| Otlojka (bron) muddat bilan | ◐ faqat shu kompyuterda | ◐ qoralama | ✅ | ✅ serverda, dona band qilinadi |
| Chegirma, limitdan oshsa rahbar tasdig'i | ◐ tasdiqsiz | ◐ tasdiqsiz | ✅ | ✅ tasdiq bilan |
| Oflayn kassa | — | ✅ | ✅ | zaxira internet bilan (12-bo'lim) |
| Chek dizayni | ◐ 80 mm | — | ✅ | ✅ |
| Muddatli to'lov (nasiya shartnomasi, oylik jadval) | — | ✅ | — | keyinroq, alohida modul (10-bo'lim) |

### Pul

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Kassaga kirim va chiqim, kassa va valyuta bo'yicha qoldiq | ✅ oddiy | ✅ kuchli (4-bo'lim) | ✅ | ERP g'oyasi, ikki tomonlama yozuv bilan |
| Valyuta ayirboshlash | — | ✅ | ✅ | ✅ |
| Kassalar orasida pul o'tkazish, inkassatsiya | ◐ | ✅ | ✅ | ✅ ikki tomonlama tasdiq bilan |
| Harajatlar turi va do'kon bo'yicha | ✅ | ✅ | ✅ | ✅ |
| Smenani ochish va yopish, naqdni sanash | — | — | ✅ | ✅ (3-bo'lim) |
| Plastik kartalar nazorati (bank xabarlari bilan) | — | — | — | ✅ (6-bo'lim) |
| Bank terminali: tushumni bank hisobi bilan solishtirish, komissiya | ◐ RRN qo'lda kiritiladi | — | ? | ✅ (6-bo'lim) |
| Kartaga o'tkazma (Click va boshqa ilovalar orqali) | — | ◐ valyuta sifatida | ? | ✅ bank xabari bilan (6-bo'lim) |
| Perechisleniye (bank hisob raqami) | ◐ to'lov turi sifatida | ◐ valyuta sifatida | ? | hozir ishlatilmaydi; kerak bo'lsa yoqiladi |
| Click va Payme API (QR, to'lov havolasi) | ✅ | — | ? | keyinroq, kerak bo'lsa |

### Hamkorlar (boshqa sotuvchilar)

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Bitta kontragent ham oluvchi, ham beruvchi | — mijoz va yetkazib beruvchi alohida | ✅ | ? | ✅ |
| Qarzga berish, istalgan usul va valyutada to'lash | ◐ | ✅ | ◐ | ✅ (5-bo'lim) |
| Akt-sverka va sverkadan oldingi davrni muzlatish | — | ✅ | ? | ✅ |
| Konsignatsiya (sotgach to'lash), ikki tomonga | — | — | ? | ✅ (5-bo'lim) |
| Kredit limiti va to'lov muddati | — | — | ? | ✅ |
| Hamkor uchun Telegram kabinet (balans, akt) | — | ◐ faqat rejada | ◐ mijoz boti | ✅ |

### Mijozlar va marketing

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Xaridlar tarixi, teglar, segmentlar | ◐ | ◐ | ✅ | ✅ |
| Keshbek va ball, sovg'a sertifikati, aksiyalar | ◐ ta'riflanadi, sotuvda ishlamaydi | — | ✅ | ✅ |
| Mijoz boti (virtual karta), tug'ilgan kun va yangi kolleksiya haqida xabar | — | ◐ | ✅ | ✅ Telegram, SMS keyinroq |
| Yo'qotilgan savdo: "mijoz so'radi, bizda yo'q edi" | — | — | — | ✅ |
| Chakana mijozga qarzga berish ("daftarga yozish") | ◐ | ✅ | ✅ | modul, standart holatda o'chiq |

### Xodimlar va sheriklar

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Oylik, avans, bonus, jarima, oylik vedomost | — | ◐ avans va xodim balansi | ◐ | modul (10-bo'lim) |
| Sotuvdan foiz, reja va KPI | — | ◐ xodimda foiz maydoni | ✅ sotuvchi hisobotlari | modul |
| Sherikning foydadan ulushi | — | ✅ har sotuvdan | — | modul, davr foyda-zararidan |

### Nazorat va hisobot

| Imkoniyat | Gulbahor | ERP | Billz | Biz |
| --- | --- | --- | --- | --- |
| Har o'zgarish tarixi (kim, qachon, nima) | ◐ faqat kirish tarixi | ✅ | ◐ | ✅ |
| Orqa sana va o'chirish haqida rahbarga xabar | — | ✅ | — | ✅ |
| Balanslarni tungi avtomatik tekshirish | — | ✅ | — | ✅ |
| Realtime (socket) | — | — push xabar bor | ✅ | ✅ |
| Rahbar uchun Telegram bot | — | ◐ | ✅ | ✅ |
| Foyda: do'kon, sotuvchi, kategoriya, kun bo'yicha | ✅ | ✅ | ✅ | ✅ |
| Turib qolgan tovar, o'lcham va rang bo'yicha tahlil | ◐ | ◐ | ✅ | ✅ |
| Qarzdorlar va haqdorlar | — | ✅ | ✅ | ✅ |
| Excel eksport | ◐ CSV | ✅ | ✅ | ✅ |
| Mobil ilova | — | ✅ | ✅ | keyingi bosqichda |

**Xulosa:** biznes mantig'ida ERP eng kuchli (pul, partiya, hamkorlar, audit). Billz kiyim do'koni UX'ida eng to'liq (o'lcham va rang, almashtirish, otlojka, yorliq, smena, sodiqlik). Gulbahor'dan RFID chop etish va integratsiyalar olinadi. Uchalasida ham yo'q, lekin bizga kerak bo'lganlar: donalab RFID hisobi va darvoza, kartalar nazorati, kirim xarajatlarini tannarxga taqsimlash, tiyinigacha aniq ikki tomonlama yozuv.

---

## 3. "Kunni yopish" va foyda: bizga qanchalik kerak

ERP'da bu ikki narsa quyidagicha qilingan:

1. **Kunlik snapshot.** Har kecha kassa va mijoz balanslari suratga olinadi. Kechagi kunga o'zgartirish kiritilsa, `post_edit_amount` bilan belgilanadi. Bu hisobni yopmaydi: faqat "kecha kechqurun kassada qancha bor edi" degan savolga javob beradi va orqa sanadagi o'zgarishni ko'rsatadi.
2. **Foyda.** Har sotilgan donaning tannarxi o'z partiyasidan olinadi va foyda sotuv paytida yoziladi. Bundan tashqari, foyda avval do'kon harajatlarini "yopadi" (`StoreExpenseCoverage`), sherik xodimga esa foiz ajratiladi (`PartnerSaleProfit`).

Taklif:

- **Smenani yopish kerak va majburiy bo'ladi.** Kassir smenani ochadi. Kun oxirida naqd so'm va naqd dollarni o'zi sanab kiritadi. Tizim kutilgan summani oldindan ko'rsatmaydi (ko'r sanash). Farq yoziladi. Pul seyfga yoki rahbarga topshiriladi (inkassatsiya), qabul qiluvchi tasdiqlaydi. Z-hisobot: to'lov turlari bo'yicha tushum, qaytarishlar, chegirmalar va bekor qilingan cheklar.
- **Oyni yopish kerak.** Rahbar davrni yopadi. Yopilgan davrga hujjat kiritib ham, o'zgartirib ham bo'lmaydi. Xato topilsa, joriy sanada tuzatish hujjati yoziladi.
- **Kunlik snapshot tugma sifatida kerak emas.** Bizda har harakat sanasi bilan daftarga (ledger) yoziladi, shuning uchun istalgan sanadagi qoldiq aniq hisoblanadi. Tezlik uchun kunlik yig'indi jadvali ichkarida yuritiladi, foydalanuvchi uni ko'rmaydi.
- **Foyda har sotuvda aniq bo'ladi.** RFID bilan har donaning o'z tannarxi bor: kirim narxi va unga taqsimlangan yo'l va bojxona xarajatlari (9-bo'lim). Shuning uchun yalpi foyda taxminsiz chiqadi. Sof foyda = yalpi foyda − davr harajatlari (ijara, maosh, kommunal), do'kon kesimida. Kurs farqidan tushgan foyda yoki zarar alohida qatorda ko'rinadi (5-bo'lim).
- **ERP'dagi "foyda harajatni yopadi" usulini olmaymiz.** U sotuvlar tartibiga bog'liq va hisobotni chalkashtiradi. O'rniga oddiy foyda-zarar hisoboti (P&L) bo'ladi.
- **Sherik foizi** davr foyda-zarar hisobotidan hisoblanadi (10-bo'lim, sheriklar moduli).

---

## 4. Pul: kassaga kirim va chiqim

ERP'dagi kuchli g'oya: **bitta to'lov bir nechta yozuvdan iborat.** Har yozuvda ikki narsa kurs bilan saqlanadi: kassaga qaysi valyutada qancha tushgani va kontragent hisobidan uning valyutasida qancha yopilgani. Buni olamiz.

ERP'da tuzatiladigan narsalar:
- Click va perechisleniye u yerda **valyuta** sifatida kiritilgan (`CurrencyChoices`: USD, UZS, P2P, TRANSFER).
- Valyuta ayirboshlashning bir tomoni yozuvga tushmaydi, shuning uchun audit uni alohida hisoblashga majbur.
- Summalar 6 xonali kasrda saqlanadi, balanslar esa 0.01 farq bilan "to'g'ri" hisoblanadi.
- O'tkazilgan to'lovni tahrirlasa va o'chirsa bo'ladi (eski ta'sir qaytarilib, yangisi yoziladi). Bu tarixni o'zgartiradi.

Bizda qanday bo'ladi:
- **Hisob — pul turgan joy, valyuta — alohida narsa.** Hisoblar: har do'kon kassasi (naqd so'm, naqd dollar), seyf, har plastik karta, bank hisob raqami (terminal tushumi shu yerga tushadi) va har terminal uchun "yo'ldagi pul" hisobi. Har hisobning qoldig'i o'z valyutasida yuritiladi.
- **Ikki tomonlama yozuv.** Har amal kamida ikki qatordan iborat va qatorlar yig'indisi nolga teng. Pul bir joydan chiqib, boshqa joyga kiradi: kassadan harajatga, hamkordan kartaga, dollar kassasidan so'm kassasiga. Pul yo'qdan paydo bo'lmaydi va izsiz yo'qolmaydi. Tungi tekshiruv har balansni yozuvlardan qayta hisoblab, bir tiyin farqni ham xato deb biladi.
- **Tiyinigacha aniqlik.** Summalar bazada butun son sifatida saqlanadi (tiyin, sent), float ishlatilmaydi. Kursga o'girish bir marta yaxlitlanadi, natija yoziladi, yaxlitlashdan qolgan tiyinlar "kurs farqi" hisobiga tushadi. Chegirma qatorlarga "katta qoldiq" usulida taqsimlanadi, shuning uchun yig'indi doim aniq chiqadi.
- **Amallar:** sotuv to'lovi, qaytarish, hamkordan to'lov va hamkorga to'lov, yetkazib beruvchiga to'lov, harajat, boshqa kirim, kassadan kassaga o'tkazish, inkassatsiya, valyuta ayirboshlash, xodimga avans va maosh, kartadan naqd yechish.
- **Tahrir yo'q, faqat storno.** O'tkazilgan amal o'zgartirilmaydi va o'chirilmaydi. Bekor qilish — teskari yozuv: kim, qachon va nega bekor qilgani saqlanadi, rahbarga xabar boradi.
- **Kurs.** Kunlik kursni faqat rahbar qo'yadi. Dollar qabul qilinganda kurs o'zi qo'yiladi. Kassir kursni o'zgartira olmaydi. Rahbar ruxsat bergan rol (masalan hamkorlar menejeri) uni belgilangan chegarada (masalan ±0,5%) o'zgartira oladi. Chegaradan oshsa, rahbar tasdiqlaydi.

### Hisob valyutasi va narxlar

**ERP qanday qilgan:**
- Tashkilotda asosiy valyuta va sotuv valyutasi bor, ikkalasining ham standarti dollar.
- Narx turlarini foydalanuvchi o'zi yaratadi (chakana, ulgurji, tannarx va hokazo). Narx har tovar, har do'kon va har narx turi uchun alohida saqlanadi, har narxning o'z valyutasi bor.
- Mijozga narx turi biriktiriladi, lekin sotuvda bu ishlatilmaydi: savatga doim birinchi "sotuv" narxi tushadi, ulgurji narxni sotuvchi qo'lda o'zgartiradi.
- Ustama qoidalari yo'q. Narxlar qo'lda yoki Excel orqali kiritiladi.
- Sotuv valyutasi har sotuvda tanlanadi. Foyda xarid valyutasida hisoblanadi, hisobotlar asosiy valyutaga kurs bilan o'giriladi.
- Bu turli davlatlarda, turli valyutada ishlaydigan har xil bizneslar uchun qilingan universal yechim. Bizga undan narx turlari va do'kon bo'yicha narx g'oyasi kerak, qolgani biznesimizga moslab qilinadi.

**Billz qanday qilgan** (rasmiy API hujjati bo'yicha, `docs.billz.io`):
- Billz bitta valyutali emas: tashkilotda bir nechta valyuta va kurslar tarixi bor.
- Har tovarning har do'kondagi sotuv narxi o'z valyutasi bilan saqlanadi, kirim narxi ham o'z valyutasi bilan (masalan kirim narxi dollarda, sotuv narxi so'mda). Aksiya narxi alohida.
- "Kurs bo'yicha qayta baholash" bor.
- Tovar modeli: asosiy tovar va uning variantlari (o'lcham, rang), har variantning o'z artikuli va shtrix-kodi bor.
- **Akaning tajribasi:** kassa bitta valyutada ishlaydi. Mijoz dollar bersa, kassir uni qo'lda so'mga o'girib kiritadi. Bu xatoga ham, suiiste'molga ham yo'l ochadi: kassir kursni o'zicha oladi, dollar kassada alohida hisobga olinmaydi.

Bizning taklif Billz'ning narx modeliga yaqin, shuning uchun xodimlarga tanish bo'ladi.

### Kassada dollar va so'm

Kassir hech narsani qo'lda konvertatsiya qilmaydi:
- **Dollar to'g'ridan-to'g'ri kiritiladi.** To'lov qatorida valyuta bitta tugma bilan tanlanadi yoki summaning o'zida yoziladi: `100$` — dollar, `100` — so'm.
- **Kurs o'zi qo'yiladi.** Rahbar qo'ygan kunlik kurs ishlatiladi, yonida so'mdagi qiymati ko'rinadi. Kassir kursni o'zgartira olmaydi. Chegara ichida o'zgartirish faqat rahbar ruxsat bergan rolda bo'ladi.
- **Qolgan summa ikki valyutada ko'rinadi.** Masalan: "yana 150 000 so'm yoki 12,70 $".
- **Aralash to'lov.** Mijoz qisman dollar, qisman so'm, qisman karta bilan to'lashi mumkin — hammasi bitta chekda.
- **Qaytim.** Kassir qaytimni qaysi valyutada berishini tanlaydi, summani tizim hisoblaydi. Qaytim do'kon qoidasi bo'yicha yaxlitlanadi (masalan 1 000 so'mgacha). Yaxlitlashdan qolgan farq alohida hisobga yoziladi va yo'qolmaydi.
- **Dollar kassada alohida turadi.** Naqd dollar va naqd so'm — kassaning ikki alohida hisobi. Smena yopilganda ikkalasi alohida sanaladi, shuning uchun "dollarni kam kursda o'girib, farqini olib qolish" imkoni yo'q.
- **Chekda hammasi yoziladi:** qancha dollar olingani, qaysi kurs bo'yicha va qaytim.

**Taklif: hisob valyutasi**
- **Hisob valyutasi — so'm.** Do'konda ham, hamkorlar bilan ham asosan so'mda ishlanadi, shuning uchun hisobotlar, foyda-zarar va kassa so'mda yuritiladi. Kerak bo'lsa, istalgan hisobotni bitta tugma bilan dollarda ko'rish mumkin: har amal o'z sanasidagi kurs bilan o'giriladi.
- **Tannarx ikki valyutada saqlanadi.** Xitoy va Turkiyadan olingan donaning tannarxi dollarda (asl) va kirim kunidagi kurs bo'yicha so'mda saqlanadi. Shu tufayli dollar oshganda "tovar dollarda qancha turibdi" degan savolga ham aniq javob bor.

**Taklif: narx turlari va ustama — hammasi sozlama**

Akadan aniq javob kutish shart emas: hammasi sozlama bo'ladi. Akaning o'zi boshlang'ich qiymatlarni kiritadi va keyin istalgan payt o'zgartiradi.
- **Narx turlari.** Standart holatda uchta: chakana, ulgurji va minimal. Aka yangisini qo'sha oladi, masalan "doimiy hamkor".
- **Narx turi hamkorga biriktiriladi va sotuvda o'zi qo'yiladi** (ERP'dagi kamchilik tuzatiladi). Chakana xaridorga chakana narx, "ulgurji" hamkorga ulgurji narx chiqadi.
- **Ulgurji miqdor bo'yicha ham bo'lishi mumkin (ixtiyoriy).** Masalan, bitta modeldan 10 donadan ko'p yoki to'liq seriya olinsa, ulgurji narx o'zi qo'yiladi.
- **Narx modelga qo'yiladi,** hamma rang va o'lchamlarga bir xil. Kerak bo'lsa, alohida o'lchamga boshqa narx qo'yish mumkin (masalan XXL qimmatroq). Do'kon bo'yicha alohida narx ham mumkin, lekin odatda hamma do'konda bir xil.
- **Ustama qoidalari:**
  - kategoriya bo'yicha, xohlasa brend yoki sezon bo'yicha ham;
  - chakana ustamasi foizda (masalan tannarxdan +80%);
  - ulgurji ustamasi foizda (masalan +40%) yoki "chakanadan −X%";
  - minimal ustama — undan arzon sotish faqat rahbar tasdig'i bilan.
- **Yaxlitlash qoidasi.** Masalan 1 000 so'mgacha, yoki narx doim "…9 000" bilan tugashi.
- **Narx qo'yish.** Kirim paytida tizim tannarx va ustamadan narxni taklif qiladi. Xodim uni qabul qiladi yoki o'zgartiradi. Qo'lda o'zgartirilgan narx belgilanib, hisobotda ko'rinadi.
- **Dollar oshsa.** Kurs belgilangan chegaradan (masalan 3%) oshsa, tizim qaysi tovarlarning ustamasi tushib ketganini ko'rsatadi va yangi narxlarni taklif qiladi. Rahbar tasdiqlaydi, yangi yorliqlar chop etiladi (Billz'dagi "kurs bo'yicha qayta baholash").

---

## 5. Hamkorlar bilan hisob-kitob

### ERP qanday qilgan

- **Mijozda asosiy valyuta bor.** Balans esa har valyutada alohida saqlanadi (`CustomerBalance`: mijoz + valyuta). Dollarda sotilgan tovar dollar qarzini, so'mda sotilgani so'm qarzini oshiradi.
- **To'lov formasi.** Avval to'lov qaysi valyutadagi hisobni yopishi tanlanadi (masalan USD). Keyin kassaga nima tushgani yoziladi:
  - `first_amount` — shu valyutaning o'zida berilgan pul (masalan 100$ naqd);
  - boshqa valyutadagi har pul uchun alohida qator: kassaga tushgani (6 325 000 so'm) va hisobdan yopilgani (500$). Kurs shu ikkisidan kelib chiqadi, qatorni ikki marta bossa kurs bilan o'zi hisoblanadi.
- **Qarz FIFO bilan yopiladi.** Har to'lovdan keyin shu valyutadagi hamma sotuvlar qaytadan taqsimlanadi: eng eski sotuv birinchi yopiladi, har sotuvda "qolgan qarz" ko'rinadi.
- **Qo'shimcha amallar:** ikki mijoz orasida o'tkazma (A mijoz B uchun to'laydi); akt-sverka qilingandan keyin undan oldingi davr muzlatiladi; orqa sana yoki o'chirish haqida rahbarga xabar boradi.
- **Kamchiliklari:**
  - "Hisobdan yopilgan" summa qo'lda yozilsa hech narsa cheklamaydi — kassir kassaga tushgandan ko'prog'ini yopib qo'yishi mumkin;
  - o'tkazilgan to'lov tahrirlanadi va o'chiriladi;
  - bir mijozda ham dollar, ham so'm qarzi bo'lsa, umumiy qarz faqat taxminiy ko'rinadi, ikkalasini birlashtiradigan hujjat yo'q;
  - kredit limiti, to'lov muddati va konsignatsiya yo'q.

### Taklif

1. **Har hamkorning hisob valyutasi bo'ladi:** so'm (standart) yoki dollar. U hamkor qo'shilganda tanlanadi. Hamkorga beriladigan hamma tovar va qaytarishlar shu valyutada yoziladi, qarzi ham doim shu valyutada ko'rinadi: "qarzi 1 250,00 $" yoki "qarzi 18 400 000 so'm".
2. **To'lov istalgan usulda va istalgan valyutada bo'ladi.** Bitta to'lov bir nechta qatordan iborat bo'lishi mumkin. Har qatorda:
   - usul: naqd so'm, naqd dollar, karta, perechisleniye yoki Click;
   - kassaga tushgan summa, o'z valyutasida;
   - kurs (kunlik kurs o'zi qo'yiladi, chegara ichida o'zgartirish mumkin);
   - hamkor hisobidan yopilgan summa — kursdan tizim o'zi hisoblaydi, qo'lda yozilmaydi.
   Karta qatorida summa yozilmaydi, bank xabaridan tanlanadi (6-bo'lim).
3. **Kurs to'lov paytida qotadi.** Keyin kurs o'zgarsa ham, o'sha to'lov qancha yopgani o'zgarmaydi.
4. **Tiyinigacha aniq.** Masalan, dollarda hisob yuritadigan hamkor 1 000 000 so'm berdi, kurs 12 650:
   - hisobidan 79,05 $ yopiladi (1 000 000 ÷ 12 650 = 79,0513…);
   - 79,05 × 12 650 = 999 982,50 so'm;
   - qolgan 17,50 so'm "kurs farqi" hisobiga yoziladi.
   Kassada ham, hamkor hisobida ham, hisobotda ham bir tiyin yo'qolmaydi.
5. **Qarz FIFO bilan yopiladi** (ERP'dagi kabi). Har yuk xatida "qolgan qarz" ko'rinadi. Ortiqcha to'lov avansga aylanadi va keyingi tovarga o'zi hisoblanadi.
6. **Hamkor ham oladi, ham beradi.** Aka hamkordan tovar olsa, hamkorning haqi oshadi. Hisob bitta va o'zaro hisob-kitob o'zi bo'ladi: musbat balans — aka qarzdor, manfiy balans — hamkor qarzdor.
7. **Boshqa valyutadagi qarz faqat ochiq hujjat bilan paydo bo'ladi.** Masalan, dollarda hisob yuritadigan hamkorga naqd so'm qarz berildi: bu alohida so'm balansi bo'lib ko'rinadi. Uni asosiy valyutaga o'tkazish uchun "konvertatsiya" hujjati yoziladi, kurs bilan. Hamkorning umumiy qarzi hech qachon taxminiy bo'lmaydi.
8. **Kredit limiti va to'lov muddati — ikkalasi ham bo'ladi, lekin qattiq taqiq emas.**
   - Ular bir-birini to'ldiradi: limit "qancha" qarz berish mumkinligini, muddat "qancha vaqtga" berish mumkinligini cheklaydi. Faqat limit bo'lsa, hamkor eski qarzini yillab to'lamay, limit ichida tovar olaveradi. Faqat muddat bo'lsa, qarz cheksiz o'sishi mumkin.
   - Ikkalasi ham hamkor kartasida ixtiyoriy. Bo'sh qoldirilsa, cheklov yo'q. Rahbar sozlamada standart qiymat qo'yishi mumkin, masalan 30 kun.
   - Chegaradan oshsa, tovar berish to'xtamaydi: sotuvchi ogohlantirishni ko'radi va rahbar Telegram'da bitta tugma bilan tasdiqlaydi. Tasdiqlar tarixi saqlanadi.
   - Tizim hamkorning to'lov tarixidan limit taklif qiladi: oylik aylanmasi va o'rtacha necha kun kechikib to'lashi bo'yicha.
   - Eslatmalar: muddatdan 3 kun oldin, muddat kuni va keyin har hafta hamkorga Telegram'da, rahbarga esa muddati o'tganlar ro'yxati.
   - Qarzlar yoshi bo'yicha hisobot: 0–30, 31–60, 61–90 va 90 kundan ortiq.
9. **O'tkazma.** "A hamkor B uchun to'ladi" — ikki hamkor orasida o'tkazma hujjati (ERP'dan olinadi).
10. **Akt-sverka.** Boshlang'ich qoldiq, har yuk xati, qaytarish va to'lov ikkala valyutada ko'rsatiladi, oxirida yakuniy qoldiq. Akt PDF bo'lib hamkorga Telegram'da yuboriladi. Hamkor tasdiqlagach, o'sha sanagacha bo'lgan davr muzlatiladi.
11. **Tahrir yo'q, faqat storno.** Xato to'lov teskari yozuv bilan bekor qilinadi va qayta kiritiladi. Rahbar ogohlantiriladi.
12. **Kurs farqi hisobotda ko'rinadi.** Dollarda hisob yuritadigan hamkorga tovar bir kursda berilib, pul boshqa kursda olinsa, foyda-zarar hisobotida "kurs farqi" alohida qator bo'ladi.

Misol — "Anvar", hisobi dollarda:

| Sana | Amal | Hisobidan | Qarzi |
| --- | --- | --- | --- |
| 01.10 | 120 dona oldi | +1 850,00 $ | 1 850,00 $ |
| 05.10 | 500 $ naqd | −500,00 $ | 1 350,00 $ |
| 05.10 | 6 325 000 so'm naqd, kurs 12 650 | −500,00 $ | 850,00 $ |
| 05.10 | kartaga 1 265 000 so'm (bank xabaridan) | −100,00 $ | 750,00 $ |
| 10.10 | 10 dona qaytardi | −150,00 $ | 600,00 $ |

05.10 dagi uchta pul bitta to'lov hujjatining uchta qatori bo'ladi.

### Hamkor bilan ishlash turlari

Hamma turlar birinchi kundan quriladi. Qaysi biri qaysi hamkorga ochiqligi hamkor kartasida belgilanadi. Aka bilan aniqlashtirish shart emas: ishlatilmaydigan tur shunchaki yoqilmaydi.

| Tur | Tovar kimniki | Qarz qachon paydo bo'ladi |
| --- | --- | --- |
| Qarzga berish (asosiy) | tovar hamkorga o'tadi | yuk xati yozilganda |
| Konsignatsiyaga berish | tovar akaniki bo'lib qoladi, "hamkordagi tovar" joyida turadi | hamkor sotganda |
| Hamkordan qarzga olish | tovar akaga o'tadi | kirim yozilganda (aka qarzdor bo'ladi) |
| Hamkordan konsignatsiyaga olish | tovar hamkorniki, akaning do'konida turadi | aka sotganda (sotilgan donalar bo'yicha avtomatik) |
| Qaytarish (ikki tomonga) | — | qaytgan donalar narxida qarz kamayadi |

Konsignatsiyada nima sotilganini bilishning ikki yo'li bor:
- hamkor sotilganlarini Telegram kabinetida belgilaydi;
- yoki aka hamkorning do'koniga qo'l terminali bilan boradi va qolgan donalarni sanaydi. Sanalmagan donalar sotilgan deb hisoblanib, hujjat o'zi tuziladi.

---

## 6. Plastik kartalar

Kartalar soni cheklanmaydi va hammasi Odiljon aka nomida. Har karta uchun saqlanadi: oxirgi 4 raqami, banki, qaysi do'kon yoki kassaga biriktirilgani.

- **CardXabarBot va HumoBot ishlaydi.** Ular Odiljon akaning Telegram akkauntiga yozadi. Oddiy bot boshqa botning xabarini o'qiy olmaydi — Telegram buni taqiqlagan. Shuning uchun tizim Odiljon akaning akkauntiga bir marta ulanadi (Telegram kodini akaning o'zi kiritadi). Keyin faqat shu ikki bot chatini o'qiydi: hech narsa yubormaydi va boshqa suhbatlarga tegmaydi. Ulanish serverda shifrlangan holda saqlanadi. Aka Telegram'da "boshqa seanslarni yopish" ni bossa, o'qish to'xtaydi va rahbarga darhol ogohlantirish boradi.
- **Xabardan olinadigan maydonlar va ular nimaga kerak:**

  | Maydon | Namuna | Nimaga kerak |
  | --- | --- | --- |
  | Yo'nalish va summa (valyuta bilan) | ➖ 40 000.00 UZS | asosiy ma'lumot |
  | Sana va vaqt | 16.02.25 13:53 | xabarni sotuvga bog'lash: summa bir necha daqiqa ichida mos kelishi kerak |
  | Kartadagi qoldiq | 7 771 313.65 UZS | kartaning tizimdagi qoldig'i bilan solishtirish; xabar o'tkazib yuborilganini aniqlash (pastda) |
  | Karta | ***0887 | kartalar ko'p: pul qaysi kartaga, demak qaysi do'konga tushgani; har kartaning qoldig'i alohida yuritiladi |
  | Amal turi | E-Com oplata, Perevod na kartu, naqd yechish | ro'yxatda ko'rsatish uchun; keyinroq ajratishda ham kerak bo'ladi (masalan naqd yechish harajat emas, pul kartadan kassaga o'tadi) |
  | Joy yoki izoh | UZMOBILE GSM CLICK, UZ | ro'yxatda ko'rsatish uchun: aka chiqim nima ekanini eslashi oson bo'ladi; keyinroq avtomatik ajratish qoidalari ham shunga tayanadi |

  Bulardan tashqari Telegram xabarining raqami (bitta xabar ikki marta yozilmasligi uchun) va xabarning asl matni saqlanadi. Asl matn parser yaxshilanganda eski xabarlarni qayta o'qish uchun kerak.
- **Birorta xabar tushib qolmaganini qoldiq ko'rsatadi.** Har xabardagi qoldiq oldingi xabardagi qoldiq plyus yoki minus shu summaga teng bo'lishi kerak. Masalan: 7 771 313,65 − 32 000,00 = 7 739 313,65 (rasmdagi keyingi xabar). Zanjir uzilsa, demak xabar kelmagan, o'chirilgan yoki o'qilmagan: tizim qaysi karta va qaysi oraliqda uzilganini rahbarga ko'rsatadi.
- Server qayta ishga tushsa yoki aloqa uzilsa, o'tkazib yuborilgan xabarlar chat tarixidan qayta o'qiladi va takrorlanmaydi. Chat tarixini qayta o'qish va xabarni qatorlarga ajratish texnikasi cargo'dan olinadi.
- **Ikki bot — ikki xil format.** cargo parseri HumoBot uchun yozilgan. CardXabarBot namunasida sinab ko'rilganda noto'g'ri o'qidi:

  | | HumoBot | CardXabarBot |
  | --- | --- | --- |
  | Namuna | `➕ 375.000,00 UZS`, `🕓 17:46 15.09.2026`, `💳 HUMOCARD *3073` | `➖ 40 000.00 UZS`, `🕓 16.02.25 13:53`, `💳 ***0887` |
  | Summa | nuqta bilan guruhlanadi, tiyin vergul bilan | bo'sh joy bilan guruhlanadi, tiyin nuqta bilan |
  | Vaqt | avval soat, keyin sana, yil 4 xonali | avval sana, keyin soat, yil 2 xonali |
  | Sarlavha | 🎉 To'ldirish, 💸 To'lov | 🟢 Perevod na kartu, 🔴 E-Com oplata |
  | cargo parseri | to'g'ri o'qiydi | summani 100 barobar ko'p o'qiydi (40 000 → 4 000 000), vaqtni o'qimaydi, qoldiq belgisi 💵 bo'lsa qoldiqni topmaydi |

  Shuning uchun parser qayta yoziladi:
  - summa matndan to'g'ridan-to'g'ri tiyinga o'qiladi, float ishlatilmaydi. Oxirgi nuqta yoki verguldan keyin 2 ta raqam kelsa, u tiyin hisoblanadi, qolgan hamma belgi guruhlash deb olinadi. Bitta qoida ikkala formatni ham o'qiydi;
  - vaqt ikkala tartibda ham o'qiladi: "soat sana" va "sana soat", yil 2 yoki 4 xonali. Vaqt Toshkent vaqti bo'yicha olinadi;
  - yo'nalish avval ➕/➖ belgisidan olinadi, keyin 🟢/🔴 dan, oxirida sarlavhadagi so'zdan;
  - qoldiq belgisi sifatida 💰 ham, 💵 ham qabul qilinadi;
  - xabardagi "Check" tugmasining havolasi (bank cheki) ham saqlanadi;
  - xabarning asl matni doim saqlanadi. O'qib bo'lmagan xabar tashlab yuborilmaydi: "o'qilmadi" ro'yxatiga tushadi va rahbarga ogohlantirish boradi;
  - har bot uchun haqiqiy namunalardan avtomatik testlar yoziladi. Yangi turdagi xabar kelsa, u ham testga qo'shiladi.
- **Karta summasi qo'lda yozilmaydi.** Kassir "karta" bilan to'lov olganda kelgan bank xabarlari ro'yxatidan tanlaydi. Xabar hali kelmagan bo'lsa, chek "karta kutilmoqda" holatida saqlanadi va xabar kelganda summa, vaqt va karta bo'yicha o'zi bog'lanadi.
- **Asosiy vazifa — pul tushdimi yoki yo'qmi.** Kirim ➕ belgisidan, chiqim ➖ belgisidan aniqlanadi. Birinchi navbatda faqat kirimlar ishlatiladi: har kirim xabari "hal qilinmagan" bo'lib turadi, toki sotuvga, hamkor to'loviga yoki boshqa kirimga bog'lanmaguncha.
- **Chiqimlar turkumlarga ajratilmaydi.** Bank xabaridan chiqim biznes xarajatimi yoki akaning shaxsiy xarajatimi, aniq bilib bo'lmaydi. Shuning uchun hamma chiqimlar bitta umumiy "kartadan chiqim" hisobiga yoziladi. Bu kartaning qoldig'i tizimda to'g'ri turishi uchun yetadi. Aka xohlasa, alohida chiqimga turini belgilab qo'yishi mumkin (harajat, yetkazib beruvchiga to'lov, shaxsiy), lekin bu majburiy emas. Chiqimlar ro'yxatini faqat aka va u ruxsat bergan odam ko'radi.
- **Keyinroq, kerak bo'lsa:** chiqimlarni joy nomi bo'yicha qoidalar bilan avtomatik ajratish (masalan "Korzinka" — doim shaxsiy).
- **Chek skrinshoti bilan to'lov (ixtiyoriy).** Hamkor yoki mijoz uyidan kartaga pul o'tkazib, botga to'lov chekining skrinshotini yuborishi mumkin. Tizim skrinshotdagi summa, vaqt va karta raqamining oxirini kelgan bank xabari bilan solishtiradi. Mos kelsa, to'lov o'zi o'sha hamkor hisobiga yoziladi va unga "qabul qilindi" deb javob boradi. Mos kelmasa, xodim qo'lda hal qiladi. Bu texnika ham cargo'da ishlab turibdi.
- **Ogohlantirish.** 10 daqiqa ichida bog'lanmagan kirim bo'lsa, rahbarga xabar boradi: "kartaga pul tushdi, lekin sotuv yo'q". Bu sotuv kiritilmaganini bildirishi mumkin.
- **Qoldiq solishtiriladi.** Kartaning tizimdagi qoldig'i bank xabaridagi qoldiq bilan har kuni solishtiriladi.
- **Hisobot:** karta, do'kon, xodim va kun kesimida.
- **Xodim mijozga o'z kartasini berib yuborsa.** Chekda va xaridor ekranida faqat do'konga biriktirilgan karta ko'rsatiladi. Baribir shunday bo'lsa, RFID va darvoza pulsiz chiqib ketgan donani ko'rsatadi (8 va 11-bo'limlar).

### Bank terminali

Mijoz kartasini do'kondagi terminalga tekkizib to'lasa, pul akaning kartasiga emas, odatda YaTT'ning bank hisob raqamiga tushadi: bir-ikki kundan keyin, bank komissiyasi ushlab qolinib. Shuning uchun terminal kartalardan alohida nazorat qilinadi:
- **Kassada.** Kassir "terminal" usulini tanlaydi, summa chekdan o'zi qo'yiladi. Terminal chekidagi tranzaksiya raqamining (RRN) oxirgi 4 raqami kiritiladi. Pul avval shu terminalning "yo'ldagi pul" hisobiga yoziladi.
- **Kun oxirida.** Smena yopilganda terminalning kunlik yakuniy cheki (sverka) bilan tizimdagi terminal to'lovlari solishtiriladi. Farq bo'lsa, smena yopilmaydi.
- **Pul bankka tushganda.** Bank hisobiga kelgan summa kunlik terminal tushumi bilan solishtiriladi. Ushlab qolingan komissiya o'zi harajatga yoziladi, "yo'ldagi pul" hisobi nolga tushadi. Tushmagan yoki kam tushgan kun rahbarga ko'rinadi.
- **Keyinroq.** Terminal bankining API'si bo'lsa, summa va RRN kassaga o'zi tushadi va qo'lda kiritish kerak bo'lmaydi.

---

## 7. Joylar: do'kon va sklad

Do'konlar soni cheklanmaydi. Yangi do'kon ochish — bu sozlama, dasturchi kerak emas.

- **Har joyning turi belgilanadi:** do'kon (savdo zali va kassasi bor), sklad (kassasi yo'q) yoki ikkalasi birga. Do'kon ichidagi orqa xona alohida joy bo'lishi mumkin. Unda RFID "zalda tugadi, orqa xonada bor" deb ko'rsatadi.
- **Har joyning o'zi uchun:** qoldiq, kassalar, kartalar, xodimlar, harajatlar va foyda-zarar. Narx do'konga qarab farq qilishi mumkin.
- **Ko'rinmas joylar:** "yo'lda" (ko'chirilayotgan tovar), "hamkorda" (konsignatsiyadagi tovar), "jo'natma" (yetkazib beruvchidan hali kelmagan tovar).
- **Ruxsatlar joy bo'yicha:** sotuvchi faqat o'z do'konini ko'radi, sklad mudiri skladni, rahbar hammasini.
- **Yangi do'kon qo'shilganda:** nom, manzil, kassalar, kartalar, xodimlar, narx turi va do'kon agenti (12-bo'lim) sozlanadi.

### Xodimlar va rollar

Kiyim do'konlari tarmog'ida odatda quyidagi rollar bo'ladi. Tizimda ular tayyor shablon sifatida turadi. Kichik do'konda bitta odam bir nechta rolni bajarishi mumkin, masalan kassir ham, sotuvchi ham. Rahbar shablonni o'zgartirib, o'z rolini ham yarata oladi: har amal uchun alohida ruxsat belgilanadi.

| Rol | Nima qiladi | Tizimda nimani ko'radi |
| --- | --- | --- |
| Egasi | hamma narsani boshqaradi, katta chegirma va qaytarishlarni tasdiqlaydi | hammasini: foyda, tannarx, kartalar, o'zining shaxsiy xarajatlari, sheriklar |
| Boshqaruvchi (ixtiyoriy) | egasining o'rinbosari, bir nechta do'konga qaraydi | hamma do'konni; egasining shaxsiy xarajatlari va sheriklar ulushidan tashqari |
| Hisobchi (ixtiyoriy) | pul, kartalar, hamkorlar bilan hisob-kitob, akt-sverka | pul va hisobotlarni; sozlamalar va tovar kirimisiz |
| Do'kon menejeri | o'z do'koni: chegara ichida chegirma va qaytarishni tasdiqlaydi, smenadan pulni qabul qiladi, ko'chirish so'raydi, inventarizatsiya qiladi | faqat o'z do'konini; tannarxni ko'rish sozlamaga bog'liq |
| Kassir | sotadi, qaytaradi (chegara ichida), smenani ochadi va yopadi | faqat kassa ekranini |
| Sotuvchi (zalda) | mijozga tovar topadi, otlojka qiladi; chekda uning nomi turadi (foiz uchun) | tovar qidirish: qaysi o'lcham qayerda bor; o'z sotuvlari va foizi |
| Sklad mudiri | kirim, etiketka va RFID chop etish, ko'chirish, inventarizatsiya, hisobdan chiqarishni so'rash | sklad ekranlarini; pul yo'q |
| Hamkorlar menejeri (ixtiyoriy) | hamkorlarga tovar beradi, to'lov qabul qiladi, akt yuboradi | hamkorlar va ularning qarzini |

Hamma ruxsatlar joy bo'yicha ham cheklanadi: menejer va kassir faqat o'z do'konini ko'radi.

---

## 8. RFID har tomonlama

Asosiy qaror: **har dona alohida yozuv bo'ladi.** Dona etiketka chop etilganda yaratiladi va o'zida quyidagilarni saqlaydi: takrorlanmas EPC, model, rang, o'lcham, kirim hujjati va tannarx. Donaning holati va joyi doim ma'lum:

`tayyorlandi → omborda → yo'lda → do'konda → band → sotildi → qaytarildi → hamkorda → hisobdan chiqarildi / yo'qolgan`

Jarayonlar:
- **Kirim.** Kelgan tovar sanaladi. Printer etiketkani bosadi va bir yo'la chipga EPC yozadi, keyin etiketka tovarga yopishtiriladi. Brend tovari o'z RFID'i bilan kelsa, mavjud EPC skanerlanib ro'yxatga olinadi va qayta chop etilmaydi.
- **Ko'chirish.** Jo'natishda quti qo'l terminali bilan o'qiladi va hujjat o'zi to'ladi. Qabulda ham quti shu yo'l bilan o'qiladi. Farq chiqsa, kamomad akti avtomatik tuziladi.
- **Kassa.** Tovarlar stol o'quvchisi bilan birdaniga o'qiladi. Yonidagi tovar ham o'qilib ketmasligi uchun qisqa masofali o'quvchi ishlatiladi va kassir ro'yxatni tasdiqlaydi. Shtrix-kod ham ishlaydi. Arzon tovarning etiketkasini qimmat tovarga yopishtirib bo'lmaydi: EPC donaga bog'langan, narx tizimdan olinadi.
- **Qaytarish.** Faqat sotilgan dona qaytariladi. U qaysi chek bilan sotilgani avtomatik topiladi.
- **Inventarizatsiya.** Do'kon qo'l terminali bilan 15–30 daqiqada sanaladi, savdo to'xtamaydi. Natija kamomad va ortiqcha hujjati bo'lib, rahbar tasdiqlagach qoldiqqa o'tadi. Haftalik yoki kunlik qisman sanash ham bo'ladi.
- **Chiqish darvozasi.** Darvoza eshikdan o'tgan har EPC'ni o'qiydi. Do'kondagi agent (12-bo'lim) uni bir zumda tekshiradi. Dona sotilmagan bo'lsa, darvoza signal beradi va xodimlar hamda rahbarga realtime xabar boradi: qaysi tovar, qachon, qaysi smenada. Hamma signallar jurnalda saqlanadi.
- **Kamomad qayerda paydo bo'lgani.** Ikki sanash orasida yo'qolgan donalar qaysi smenalar oralig'ida yo'qolgani ko'rsatiladi.

### Etiketka qayerda yopishtiriladi

Tizim etiketkani istalgan joyda bosishga imkon beradi: skladda yoki do'konda. Taklif esa quyidagicha:
- **Sklad orqali keladigan tovar — skladda, kirim paytida.** Shunda skladdan do'konga ko'chirish ham RFID bilan tekshiriladi va yo'lda yo'qolgan dona darhol ko'rinadi.
- **To'g'ridan-to'g'ri do'konga keladigan tovar — do'konda,** tovar zalga qo'yilishidan oldin.
- **RFID etiketkasiz tovar zalga chiqmaydi.** Aks holda darvoza uni ushlay olmaydi.

### O'tish: hozirgi shtrix-kodli tovarlar

Hozir tovarlarda oddiy shtrix-kod bor. RFID'ga o'tish bir martalik ish sifatida har do'konda qilinadi:
1. Xodim donaning shtrix-kodini skanerlaydi. Tizim modelni, rangni va o'lchamni taniydi, printer shu donaga RFID etiketka bosadi va u yopishtiriladi.
2. Shu jarayonning o'zi boshlang'ich inventarizatsiya bo'ladi: har do'kon va skladdagi haqiqiy qoldiq shu yerda aniqlanadi.
3. Eski tovarning tannarxi ma'lum bo'lmasa, rahbar model bo'yicha taxminiy tannarx kiritadi. Yangi kirimlardan boshlab tannarx aniq hisoblanadi.
4. Do'kon to'liq o'tib bo'lgach, darvoza yoqiladi.

### Kerakli uskunalar

Reja eng yangi modellar bo'yicha tuzilgan (2026-yil oktabr holatiga).

**Tanlov (2026-10-02).** Printer — **Chainway CP30**: eski Gulbahor ham shu printer uchun yozilgan, u ZPL tilini tushunadi, tarmoqqa (LAN) ulanadi, 203 va 300 dpi kallagi bor. Qo'l terminali — **Chainway C72** ("klaviatura" rejimi bor, tizim uning brauzerida ochiladi). Kassa o'quvchisi va darvoza ham shu ishlab chiqaruvchidan olinsa (R3, UR4), hammasi bitta SDK va bitta sotuvchi bo'ladi. Kod ZPL'ga yozilgan, shuning uchun Zebra ZD621R ham ishlayveradi. Kassa o'quvchisi va darvoza modeli 3-bosqichdan oldin tasdiqlanadi (1-savol).

| Joy | Uskuna | Tavsiya etilgan model | Nimaga kerak | Talab |
| --- | --- | --- | --- | --- |
| Sklad | RFID printer | Zebra ZD621R (203 yoki 300 dpi) yoki Chainway CP30 (Impinj E510 kodlovchi). Kuniga minglab etiketka bo'lsa — sanoat printeri Zebra ZT411R | etiketka bosish va chipga EPC yozish | UHF RFID moduli; ZPL tili; tarmoq (LAN) orqali ulanishi |
| Sklad | UHF etiketkalar, osma yorliq | chip: Impinj M7xx/M8xx yoki NXP UCODE 9 | har donaga | 96-bit EPC, printerga mos rulon |
| Sklad va har do'kon | Qo'l terminali | Chainway C72 (to'pponcha shaklida, Impinj E710, sanashda eng qulay) yoki yangi Chainway MC80 (2026-yil iyul, Android 16). Zebra'dan muqobil — TC22R | kirim, ko'chirish, inventarizatsiya, tovar qidirish | Android; o'qish masofasi kamida 5 m |
| Har kassa | UHF stol o'quvchisi | Chainway R3S yoki R3 | sotishda donani o'qish | USB; o'qish masofasi 10–30 sm, quvvati sozlanadi |
| Har kassa | Shtrix-kod skaneri | istalgan USB 2D skaner | RFIDsiz tovar va zaxira | USB |
| Har kassa | Chek printeri, 80 mm | istalgan ESC/POS printer | chek | USB yoki LAN |
| Har kassa | Kompyuter, ixtiyoriy ikkinchi ekran | — | kassa; xaridorga summa va karta raqami | Windows yoki Linux, Chrome |
| Har do'kon eshigi | UHF RFID darvoza | qat'iy o'quvchi Chainway URA4 (Android'li, qaror mantig'ini o'zida ishlata oladi) yoki UR4/UR8, 2 ta antenna ustuni, signal chirog'i va ovoz. Tayyor chakana darvoza tizimlari ham bor (masalan Nedap), ularga ham quyidagi shart qo'yiladi | pulsiz chiqayotgan donani ushlash | tarmoq API'si (o'qilgan EPC'larni uzatish va signalni tashqaridan yoqish), SDK. Faqat o'zi signal beradigan "yopiq" darvoza bizga to'g'ri kelmaydi |
| Har do'kon | Zaxira internet va UPS | 4G router | server bulutda; tok o'chsa kassa va darvoza ishlashi | asosiy internet uzilsa o'zi 4G'ga o'tadi |

Qo'l terminali haqida: oddiy ishlarda (kirim, qidirish) tizim terminal brauzerida "klaviatura" rejimida ishlaydi. Katta inventarizatsiyada minglab kodni bu rejimda uzatish sekin bo'lishi mumkin. Unda terminal uchun kichik Android ilova qilinadi: ichida o'sha veb-tizim ochiladi, RFID o'quvchi esa ishlab chiqaruvchining SDK'si orqali to'g'ridan-to'g'ri ulanadi.

Darvoza bo'yicha muhim eslatma: sotib olishdan oldin sotuvchidan so'rash kerak — "darvoza o'qigan kodlarni tarmoq orqali bizning dasturga beradimi va signalni bizning dastur yoqa oladimi?" Javob "yo'q" bo'lsa, darvoza tizimga ulanmaydi.

---

## 9. Tannarx: yo'l, bojxona va boshqa xarajatlar

Katta tizimlarda (1C, Odoo, SAP) bu "keltirilgan tannarx" (landed cost) deyiladi. Qoidalar xalqaro buxgalteriya standartidan (IAS 2 "Zaxiralar") olingan, O'zbekistondagi milliy standartlar ham shunga asoslangan.

### Tannarxga nima kiradi va nima kirmaydi

| Kiradi | Kirmaydi |
| --- | --- |
| yetkazib beruvchiga to'langan xarid narxi | tovar skladga kelgandan keyingi saqlash (sklad ijarasi) |
| boj (import boji) | sotish xarajatlari: do'kon ijarasi, sotuvchi maoshi, reklama |
| qaytarib olinmaydigan soliqlar (quyida QQS haqida) | ma'muriy xarajatlar |
| yo'l, kargo, sug'urta | jarimalar va g'ayrioddiy yo'qotishlar (masalan yo'lda buzilgan yuk) |
| bojxona rasmiylashtiruvi, broker, sertifikat | kredit foizi |
| bojxonadan skladgacha yetkazish, yuklash va tushirish | yetkazib beruvchiga to'lovdagi kurs farqi |

Yetkazib beruvchi bergan chegirma va bonuslar tannarxni kamaytiradi.

**Import QQS.** Firma QQS to'lovchisi bo'lsa, import QQS keyin hisobga olinadi (qaytadi) va tannarxga kirmaydi. QQS to'lovchisi bo'lmasa, import QQS tannarxga kiradi. Aka YaTT va aylanmadan soliq to'laydi, shuning uchun bojxonada to'langan QQS tannarxga qo'shiladi. Firma keyinchalik QQS to'lovchisiga aylansa, bu sozlamada o'zgartiriladi.

### Xarajat donalarga qanday bo'linadi

Har xarajat qatori uchun bo'lish asosi tanlanadi. Standart qiymatlar sozlamada turadi:

| Xarajat | Odatiy asos | Nega |
| --- | --- | --- |
| Yo'l, kargo | vazn (kg) yoki hajm (m³) | kargo kg yoki kub uchun pul oladi |
| Boj | deklaratsiyada har tovar qatorining o'z boji bo'lsa — to'g'ridan-to'g'ri o'sha qatorga; bitta umumiy summa bo'lsa — bojxona qiymati bo'yicha | boj TN VED kodi va qiymatga bog'liq |
| Sug'urta, broker, sertifikat | qiymat bo'yicha | foizli xarajatlar |
| Yuklash-tushirish, ichki yetkazish | dona yoki vazn bo'yicha | |
| Faqat bitta modelga tegishli xarajat (masalan faqat kurtkalar sertifikati) | faqat o'sha modelga | |

### Jarayon

1. **Jo'natma (partiya).** Bitta konteyner yoki kargo — bitta jo'natma. Unda bir yoki bir nechta yetkazib beruvchining xaridi bo'lishi mumkin. Xarid narxi yetkazib beruvchi valyutasida kiritiladi: model × rang × o'lcham bo'yicha, qo'lda yoki upakovka ro'yxati Excel'idan.
2. **Xarajatlar jo'natmaga yoziladi**, har biri o'z valyutasida (kargo dollarda, bojxona va ichki yetkazish so'mda). Har biri to'langan kundagi kurs bilan hisob valyutasiga o'giriladi.
3. **Taxminiy va haqiqiy xarajat.** Tovar kelganda taxminiy xarajat kiritiladi (masalan kargo bilan kelishilgan narx). Shunda tovarni darhol sotsa bo'ladi va tannarxi ma'lum bo'ladi. Haqiqiy hisob kelganda farq qayta bo'linadi.
4. **Xarajat kechikib kelsa.** Donalarning bir qismi allaqachon sotilgan bo'lishi mumkin. Unda qolgan donalarning tannarxi yangilanadi. Sotilganlari uchun farq joriy davrda "tannarx tuzatishi" bo'lib yoziladi, yopilgan davr o'zgarmaydi.
5. **Ochiq jo'natmalar.** Rahbar hali yopilmagan jo'natmalar ro'yxatini ko'radi: qaysi xarajatlar hali kelmagan.
6. **Tiyinigacha aniq.** Xarajat har donaga "katta qoldiq" usulida bo'linadi. Jo'natmadagi hamma xarajatlar yig'indisi donalar tannarxlari yig'indisiga sentigacha teng bo'ladi. RFID bilan har donaning o'z tannarxi saqlanadi.

### Misol: Xitoydan bitta kargo

| Model | Soni | Narxi | Qiymati | Vazni |
| --- | --- | --- | --- | --- |
| A: futbolka | 500 | 3 $ | 1 500 $ | 100 kg |
| B: jinsi | 300 | 8 $ | 2 400 $ | 180 kg |
| C: kurtka | 100 | 25 $ | 2 500 $ | 220 kg |
| Jami | 900 | | 6 400 $ | 500 kg |

Xarajatlar:
- kargo 1 000 $, vazn bo'yicha (1 kg uchun 2 $): A 200 $, B 360 $, C 440 $;
- boj 640 $, bitta summa, qiymat bo'yicha: A 150 $, B 240 $, C 250 $;
- broker 64 $, qiymat bo'yicha: A 15 $, B 24 $, C 25 $.

| Model | Qiymati | Xarajatlar ulushi | Jami | 1 donaning tannarxi |
| --- | --- | --- | --- | --- |
| A | 1 500 $ | 365 $ | 1 865 $ | 3,73 $ |
| B | 2 400 $ | 624 $ | 3 024 $ | 10,08 $ |
| C | 2 500 $ | 715 $ | 3 215 $ | 32,15 $ |
| Jami | 6 400 $ | 1 704 $ | 8 104 $ | |

Tekshiruv: 6 400 + 1 000 + 640 + 64 = 8 104 $.

Xarajatlar tovar qiymatining 26,6% ini tashkil qildi. Bu raqam narx qo'yishda kerak bo'ladi: tizim tannarx va belgilangan ustamadan sotuv narxini taklif qiladi va uni qoidaga ko'ra yaxlitlaydi (masalan 1 000 so'mgacha).

---

## 10. Kiyim savdosidagi jarayonlar (aytilmaganlari ham)

- **Model kartasi.** Artikul, nom, kategoriya, jins, sezon (bahor-yoz, kuz-qish), kolleksiya yili, brend, material, ishlab chiqarilgan davlat, rasmlar, o'lcham qatori va ranglar. O'lcham qatori turlari: S–XXL, 42–56, bolalar yoshi, poyabzal 36–45.
- **Variatsiyalar (Billz'dagi variantli tovar).** Model — asosiy tovar, uning har rang va o'lcham kombinatsiyasi — variant. Har variantning o'z artikuli, shtrix-kodi, qoldig'i va kerak bo'lsa o'z narxi bor.
  - Variant o'qlari kategoriya bo'yicha sozlanadi, standart holatda rang × o'lcham. Jinsida bel × uzunlik × rang (W32 L34, qora) bo'lishi mumkin, poyabzalda o'lcham × rang, aksessuarda umuman variantsiz.
  - Hisobotlar ikkala darajada ham chiqadi: model bo'yicha (umumiy savdo) va variant bo'yicha (qaysi o'lcham tez tugayapti).
- **Ulgurji seriya (ростовка).** Bitta pachkada S, M, L va XL bittadan. Hamkorga pachka bilan sotiladi, tizim uni donalarga ochadi.
- **Narx.** Kirim narxi dollarda bo'lsa, sotuv narxi dollarda yoki so'mda qo'yiladi. Kurs o'zgarganda qayta baholanadi. Narx turlari bo'ladi. Minimal narxdan past sotish faqat rahbar tasdig'i bilan.
- **O'lcham almashtirish.** Eng ko'p uchraydigan amal. Bitta oynada qaytarish va yangi sotuv qilinadi, farq to'lanadi yoki qaytariladi.
- **Otlojka.** Muddat bilan qo'yiladi, oldindan to'lov bilan yoki to'lovsiz. Muddati o'tsa, dona o'zi bo'shaydi.
- **Qaytarish qoidalari.** N kun ichida va yorlig'i bilan. Pul to'langan usulda qaytariladi.
- **Konsignatsiya** ikki tomonga (5-bo'lim).
- **Import.** Yo'l, bojxona va boshqa xarajatlar tannarxga qo'shiladi (9-bo'lim).
- **Brak.** Yetkazib beruvchiga qaytariladi yoki chegirma bilan sotiladi. Hisobdan chiqarish rasm va tasdiq bilan qilinadi.
- **Do'konni to'ldirish.** Tizim do'konda tugagan, lekin omborda bor o'lchamlarni ko'rsatib, ko'chirishni taklif qiladi.
- **Sezon oxiri.** Turib qolgan tovar ro'yxati chiqadi va chegirma rejalashtiriladi.
- **Sotuvchilar.** Har sotuvda kim sotgani yoziladi. Sotuvdan foiz va KPI hisoblanadi. Xodimning o'zi uchun xaridi alohida, limit bilan.
- **Yo'qotilgan savdo.** Mijoz so'ragan, lekin bizda yo'q o'lcham yoki rang yoziladi. Mijoz "boshqa joyda arzonroq" desa, o'sha narx ham yoziladi (g'oya simma'dan).
- **Sodiqlik.** Mijoz telefon raqami bo'yicha taniladi: keshbek yoki ball, tug'ilgan kun sovg'asi, sovg'a sertifikati.
- **Soliq.** Soliq to'lovlari alohida harajat turi sifatida yoziladi va foyda-zarar hisobotida alohida qatorda ko'rinadi.
- **Fiskal chek.** Bu soliq idorasiga onlayn ulangan kassa (onlayn nazorat-kassa mashinasi yoki virtual kassa) chiqaradigan chek. Har sotuv shu zahoti soliqqa boradi, chekda soliqning QR kodi bo'ladi va mijoz uni tekshira oladi. Chakana savdoda ko'p hollarda majburiy. Bank terminali bu emas: terminal faqat kartadan pul yechadi va bank chekini chiqaradi. Lekin ba'zi zamonaviy terminallarda onlayn-kassa ham birga bo'ladi. Aka onlayn-kassa ishlatsa (3-savol), bizning kassa har sotuvni unga uzatadi va chekda soliq QR kodi chiqadi. Buning uchun har modelda MXIK (IKPU) kodi saqlanadi.
- **Markirovka (yorliq emas).** Bu davlatning majburiy raqamli markirovkasi ("Asl belgisi"): har donaga DataMatrix kod yopishtirilib, u davlat tizimida kuzatiladi. 2025-yilgi manbalarga ko'ra, bu hozircha tamaki, alkogol, pivo, dori, suv va ichimliklar hamda maishiy texnika uchun majburiy. Kiyim ro'yxatda yo'q, lekin keyinchalik kiritilishi rejalashtirilgan. Tizimda har dona uchun DataMatrix kodini saqlash joyi oldindan qoldiriladi: joriy etilsa, alohida qayta qurish kerak bo'lmaydi.

### Excel shablonlari

Ko'p ma'lumot Excel orqali kiritiladi va chiqariladi. Shuning uchun Excel alohida e'tibor bilan qilinadi.
- **Tayyor shablonlar.** Tizimdan yuklab olinadi:
  - tovarlar (model va variantlar);
  - kirim (yetkazib beruvchi hujjati);
  - narxlarni ommaviy o'zgartirish;
  - boshlang'ich qoldiq;
  - hamkorlar va mijozlar, qarzlari bilan.
  Shablon ichida tanlash ro'yxatlari (kategoriyalar, ranglar, o'lchamlar) va qisqa yo'riqnoma bo'ladi.
- **Ikki shakl qabul qilinadi:**
  - "bir qator — bir variant";
  - matritsa: qatorda model va rang, ustunlarda o'lchamlar. Kiyim yetkazib beruvchilarining upakovka ro'yxatlari ko'pincha shunday bo'ladi.
- **Ustunlarni moslashtirish.** Yetkazib beruvchining o'z Excel'i yuklansa, qaysi ustun nima ekanini bir marta ko'rsatiladi. Tizim buni o'sha yetkazib beruvchi uchun eslab qoladi, keyingi safar o'zi tushunadi.
- **Avval ko'rib chiqish.** Yuklangandan keyin tizim nima yaratilishini va qaysi qatorda qanday xato borligini ko'rsatadi. Xatoni shu yerning o'zida tuzatish yoki faylni tuzatib qayta yuklash mumkin. Fayl qayta yuklansa, takror yozuv yaratilmaydi.
- **Har jadval Excel'ga chiqariladi,** tanlangan filtr va ustunlar bilan.

**Akaning hozirgi shablonlari** (Billz import shakli; uchta fayl: Bishkek, Xitoy, Turkiya). Ustunlari bir xil, faqat xarid valyutasi boshqa: Bishkekda qirg'iz somi, Xitoyda yuan, Turkiyada dollar. Tizim shu fayllarni o'zgartirmasdan qabul qiladi:

| Shablondagi ustun | Tizimda |
| --- | --- |
| НАИМЕНОВАНИЕ, АРТИКУЛ | model nomi va artikuli; artikul bo'yicha mavjud model topiladi, bo'lmasa yaratiladi |
| V_Размер, V_Цвет | o'lcham va rang; yo'q qiymat ro'yxatga o'zi qo'shiladi |
| КОЛ-ВО | soni |
| цена закупки YUAN / KIRGIZ SOM / ЦЕНА ЗАКУПКИ (USD) | xarid narxi; valyuta sarlavhadan aniqlanadi |
| доп расход | bir donaga qo'shimcha xarajat (standart: dollarda) |
| РОЗНИЧНАЯ ЦЕНА (UZS), Оптовая цена | chakana va ulgurji narx; kirim o'tkazilganda modelga qo'yiladi |
| БАРКОД | variant shtrix-kodi |
| Бренд, КАТЕГОРИЯ, ПОСТАВЩИК | topiladi yoki yaratiladi |
| код фабрике, Производитель, Сезон, Коллекция, Пол | model kartasiga |
| ЦЕНА ПОСТАВКИ (USD), Variation_id, ikkinchi «цена закупки» | o'qilmaydi: tannarxni tizim o'zi hisoblaydi |

Ustun boshqacha nomlangan bo'lsa, import oynasida qo'lda ko'rsatiladi va shu shablon uchun eslab qolinadi.

### Xodimlar va sheriklar (modul)

Akada bor-yo'qligi noma'lum, lekin boshqa bizneslarda uchraydi. Shuning uchun modul sifatida quriladi va standart holatda o'chiq turadi.
- **Maosh turlari (xodimga bir nechtasi birga qo'yiladi):** oylik; sotuvdan foiz (umumiy, kategoriya bo'yicha yoki reja bajarilgandan keyin); bonus; jarima.
- **Hisoblash va to'lash.** Oy oxirida oylik vedomost o'zi hisoblanadi: kim nechta sotgan, qancha qaytarish bo'lgan, foizi qancha. Qaytarilgan tovar foizi keyingi hisobdan ayriladi. Avans va maosh kassadan to'lanadi va xodimning hisobiga yoziladi, shuning uchun xodim kimga qancha qarzdorligi ham ko'rinadi.
- **Kim sotdi.** Har chekda sotuvchi saqlanadi: kassirning o'zi yoki zaldagi sotuvchi tanlanadi.
- **Sheriklar.** Har sherikning foydadagi ulushi foizda qo'yiladi. Ulush davr foyda-zararidan, harajatlar ayirilgandan keyin hisoblanadi. Har sherikning biznesdan olgan pullari alohida hisobda yuritiladi va davr oxirida "ulush − olgani" qoldig'i ko'rinadi.

### Chakana mijozlar: qarz, muddatli to'lov va keshbek

- **Qarzga berish ("daftarga yozish").** Tanish mijozga qarzga berish do'konlarda ko'p uchraydi. Bu hamkorlar hisobining o'zi (5-bo'lim), faqat soddaroq ko'rinishda: mijoz, summa, limit. Yangi murakkablik qo'shmaydi. Modul standart holatda o'chiq, kerak bo'lsa yoqiladi.
- **Muddatli to'lov (oylik jadval, pasport, shartnoma) hozir qurilmaydi.** Aka ishlatmaydi, UI'ni esa sezilarli murakkablashtiradi. ERP'da bu tayyor qilingan, kerak bo'lsa keyinroq alohida modul sifatida qo'shiladi.
- **Keshbek — qurishni taklif qilaman, sodda ko'rinishda.**
  - Mijoz telefon raqami bo'yicha taniladi. Har xariddan foiz (masalan 3%) ball bo'lib tushadi va keyingi xaridda ishlatiladi. Tug'ilgan kun uchun sovg'a ham bo'ladi.
  - Mijoz ballari, xaridlari va chekini Telegram botda ko'radi.
  - Bu faqat savdoni ko'paytirmaydi. Mijoz chekini Telegram'da olgani uchun xodim sotuvni kiritmay pulni olib qololmaydi — mijoz buni sezadi. Qaytarishda ham chek tez topiladi.

---

## 11. Inson omili: xavf va yechim

| Xavf | Qanday yopiladi |
| --- | --- |
| Sotuvni kiritmay pulni olib qolish | darvoza pulsiz chiqayotgan donada signal beradi; RFID sanash sotuvsiz yo'qolgan donani ko'rsatib, smenaga bog'laydi; kartaga sotuvsiz pul tushsa ogohlantirish boradi; mijozga chek Telegram'da yuboriladi |
| Mijozga o'z kartasiga pul o'tkazdirish | faqat ro'yxatdagi kartalar ishlatiladi; karta to'lovi faqat bank xabari bilan qabul qilinadi; pulsiz chiqayotgan dona darvozada ushlanadi |
| Terminal orqali olingan to'lovni "naqd" deb yozib, kassadan naqd pulni olish | terminalning kunlik yakuniy cheki tizim bilan solishtiriladi, bank tushumi terminal to'lovlari bilan solishtiriladi; naqd ko'r sanaladi |
| Soxta qaytarish | faqat sotilgan dona va faqat chek bo'yicha qaytadi; pul to'langan usulda qaytariladi; limitdan yuqorisi rahbar tasdig'i bilan |
| Chegirmani suiiste'mol qilish | chegirma chegarasi rol bo'yicha; undan oshsa rahbar PIN kodi yoki Telegram'da tasdiq kerak; kassirlar bo'yicha hisobot |
| Etiketkani almashtirish | EPC donaga bog'langan, narx tizimdan olinadi |
| To'langan chekni bekor qilish | faqat sabab ko'rsatilib va rahbar tasdig'i bilan; storno qilinadi, rahbarga xabar boradi |
| Kassada pul kam chiqishi | ko'r sanash, farq yozib qo'yiladi, inkassatsiyani ikki tomon tasdiqlaydi |
| Eski hujjatni o'zgartirish | o'tkazilgan hujjat o'zgarmaydi, faqat storno qilinadi; yopilgan davr qulflanadi; orqa sana haqida rahbarga xabar boradi |
| Hamkor to'lovida kursni o'ynatish yoki hisobdan ko'p yopish | yopilgan summani tizim kursdan hisoblaydi; kurs chegaradan chiqsa rahbar tasdiqlaydi |
| Tannarxni sun'iy oshirish yoki tushirish | kirim xarajatlari hujjat va jo'natma bilan yoziladi; tuzatish faqat tasdiq bilan |
| Ko'chirishda tovar yo'qolishi | jo'natish ham, qabul ham RFID bilan; farq akti avtomatik |
| Yetkazib beruvchidan kam kelishi | kirimda sanaladi, farq akti tuziladi |
| Inventarizatsiyada kamomadni "topildi" deb yashirish | tuzatish faqat tasdiq bilan; kim sanagani yoziladi |
| Kursni o'zgartirib farqni olib qolish | kunlik kursni faqat rahbar qo'yadi; har o'zgarish haqida xabar boradi |
| Qarzni o'chirib yuborish | faqat "qarzni kechish" hujjati bilan, tasdiqlanadi |
| Hamkor qarzining o'sib ketishi | kredit limiti va to'lov muddati; limitdan oshsa tovar berish to'xtatiladi |
| Loginni boshqa xodimga berish | har xodimning o'z PIN kodi, ekran avtobloklanadi, qurilmalar xodimga biriktiriladi |
| Tannarxni ko'rib qolish | tannarx va foydani faqat ruxsati borlar ko'radi |

---

## 12. Texnik asos

- **Boshqa bizneslarga sotish uchun: bitta tizim, ko'p tashkilot.**
  - Har biznes — alohida tashkilot. Hamma jadvalda tashkilot belgisi bo'ladi va PostgreSQL'ning o'zi (qator darajasidagi xavfsizlik, RLS) bir tashkilotning boshqasining ma'lumotini ko'rishiga yo'l qo'ymaydi. Kodda xato bo'lsa ham shunday.
  - Har tashkilotning o'z sozlamalari, yoqilgan modullari, valyutasi, kartalari va Telegram ulanishlari bo'ladi.
  - Buni hozirdan qilish arzon, keyin qo'shish esa hamma jadval va so'rovni qayta ko'rib chiqish demakdir.
  - To'lov (obuna) va sotish bilan bog'liq qismlar keyinroq qo'shiladi.
- **Server — virtual server (VPS).** Hamma do'kon va sklad bitta serverga ulanadi, rahbar hamma narsani jonli ko'radi. Boshlanishiga Ubuntu 24.04, 4 vCPU, 8 GB RAM va 80 GB SSD yetadi. Baza har kuni avtomatik zaxiralanadi, zaxira boshqa joyda saqlanadi.
- **Internet uzilsa.** To'liq oflayn kassa qilinmaydi: u RFID holati, darvoza va karta nazoratini murakkablashtiradi. Buning o'rniga har do'konda zaxira 4G internet bo'ladi. Kerak bo'lsa keyinroq qisqa uzilishlar uchun kassada navbat qo'shiladi: chek noyob kalit bilan saqlanib, aloqa tiklanganda yuboriladi.
- **Do'kon agenti.** Har do'kon kompyuterida kichik dastur ishlaydi. U darvoza, stol o'quvchisi va printerlar bilan gaplashadi, chunki brauzer ularga to'g'ridan-to'g'ri ulana olmaydi, server esa domenda turadi va do'konning ichki tarmog'ini ko'rmaydi. Agent serverga o'zi ulanadi (do'konga statik IP va ochiq port kerak emas), server ishni shu aloqa orqali beradi. Etiketka chop etish qismi tayyor (`agent/`); darvoza va stol o'quvchisi 3-bosqichda qo'shiladi. Darvoza qarori tez chiqishi uchun agent do'kondagi donalarning holatini xotirada saqlaydi va serverdan realtime yangilab turadi.
- **Backend:** NestJS, TypeORM (migratsiyalar bilan), PostgreSQL, Socket.IO.
- **Frontend:** React 19, Vite, TanStack Router, Query, Table va Virtual, Tailwind 4, Radix, cmdk.
- **Telegram:** egasining akkauntidan bank xabarlarini o'qish (userbot); rahbar, hamkor va mijoz botlari.
- **Qoidalar (ERP'dan olingan):**
  - Biznes mantiq faqat servis qatlamida yoziladi.
  - Frontendga ishonilmaydi: har yozish serverda tekshiriladi.
  - Pul va qoldiqning har o'zgarishi bitta DB tranzaksiyasida bajariladi, kerakli qatorlar qulflanadi.
  - Takroriy yuborishdan himoya: kassa har chekka noyob kalit beradi.
  - Har o'zgarish tarixga yoziladi.
- **Testlar.** Pul, kurs bilan o'girish, xarajatlarni taqsimlash, qoldiq va storno uchun avtomatik testlar yoziladi. Ular o'tmasa, kod qo'shilmaydi.

---

## 13. UI va klaviatura

### Imkoniyat ko'p, lekin foydalanuvchiga oson

- **Modullar yoqiladi va o'chiriladi.** O'chirilgan modul menyuda ham, formada ham, hisobotda ham ko'rinmaydi. Kassir keshbek o'chiq do'konda keshbek maydonini umuman ko'rmaydi.
- **Har rol o'z ekranini ko'radi.** Kassir faqat kassani, sklad xodimi kirim, ko'chirish va sanashni, rahbar hammasini ko'radi. Menyuda ruxsat yo'q narsa chiqmaydi.
- **Sozlash ustasi.** Yangi biznes birinchi kirganda bir nechta oddiy savolga javob beradi: nechta do'kon, qaysi valyutalar, hamkorlar bormi, RFID bormi. Shunga qarab kerakli modullar yoqiladi va standart qiymatlar qo'yiladi.
- **Kam ishlatiladigan maydonlar yashirin.** Formada faqat asosiy maydonlar turadi, qolganlari "Qo'shimcha" ostida.
- **Har ekranda bitta asosiy amal.** U doim bir joyda turadi va bitta tugma bilan bajariladi.
- **Tanish shakl.** Aka hozir Billz'da ishlaydi. Billz'da yaxshi ishlagan joylar tanish shaklda qoldiriladi, shunda xodimlarni qayta o'qitish kam bo'ladi.
- **Haqiqiy kassirda sinov.** Har yangi ekran ishga tushirishdan oldin do'kondagi kassir bilan sinab ko'riladi.

### Inputlar

Aka Billz'dagi inputlardan norozi. Shuning uchun inputlar tizimning eng kuchli joyi bo'ladi. Kiritishni o'qiydigan har bir qoida (summa, sana, telefon, qidiruv) avtomatik testlar bilan yoziladi.

**Pul maydoni**
- Yozish paytida o'zi guruhlaydi (`1 250 000`), kursor joyidan sakramaydi.
- Qisqartmalarni tushunadi: `250k` yoki `250 ming` → 250 000, `1.5m` yoki `1,5 mln` → 1 500 000.
- Hisoblaydi: `120000*3`, `1 500 000 - 10%`. Natija maydon ostida oldindan ko'rinadi, Enter bilan qabul qilinadi.
- Nusxa joylanganda istalgan shaklni to'g'ri o'qiydi: `1 250 000,00 so'm`, `$1,250.50`, `1.250.000`. Bu bank xabarlaridagi qoida bilan bir xil.
- Valyuta maydon ichida yoziladi. Dollar kiritilsa, yonida so'mdagi qiymati kurs bilan ko'rinadi.
- So'mda tiyin kiritish shart emas, dollarda sent 2 xona.
- To'lov qatorida `=` bosilsa, qolgan summa o'zi qo'yiladi.

**Son (miqdor)**
- ↑↓ strelkalari bilan oshadi va kamayadi.
- `5*12` yozilsa 60 bo'ladi (5 pachka × 12 dona).
- Dona tovarda kasr kiritib bo'lmaydi.

**Tanlash maydoni (tovar, hamkor, mijoz, kategoriya)**
- **Qidiruv xatoni kechiradi:**
  - kirill va lotinni bir xil ko'radi: `Анвар` = `Anvar`;
  - o' va g' ning har xil yozilishini bir xil ko'radi: `o'`, `o‘`, `oʻ`, `o``;
  - klaviatura tili almashib qolsa ham topadi: rus tartibida `ащгтв` yozilsa ham `found` topiladi;
  - so'zlar tartibi muhim emas: `qora futbolka xl` → "Futbolka … qora, XL".
- Oxirgi va eng ko'p tanlanganlar ro'yxat boshida turadi.
- Topilmasa, shu joyning o'zida yaratish mumkin: "+ Yangi hamkor: Anvar". Alohida forma ochilmaydi.
- Katta ro'yxatlar serverda qidiriladi, shuning uchun qidiruv sekinlashmaydi.

**Skaner istalgan paytda ishlaydi**
- Kursor qayerda turganidan qat'i nazar, shtrix-kod yoki RFID skaner kodi tanib olinadi: tugmalar tezligidan qo'lda yozilgan matndan ajratiladi (jr, simma va gulbahor'dagi g'oya).
- Kod to'g'ri joyga tushadi va qo'lda yozilayotgan matnga aralashmaydi.

**Telefon**
- `+998` o'zi qo'yiladi. Istalgan shakl qabul qilinadi: `901234567`, `+998 90 123 45 67`, `8 90 123-45-67`.
- Raqam bazada bor bo'lsa, darhol ko'rsatiladi: "bu raqam Anvarniki". Takror mijoz yaratilmaydi.

**Sana**
- Yozib kiritiladi: `1510` → 15.10.2026. `b` — bugun, `k` — kecha. ↑↓ bilan kun o'zgaradi.
- Kalendar faqat kerak bo'lsa ochiladi.
- Orqa sana tanlansa, maydon rangi o'zgaradi va ogohlantirish chiqadi.

**Rang × o'lcham jadvali**
- Excel kabi ishlaydi: strelkalar va Tab bilan yuriladi, Enter pastga tushadi.
- Ustun yoki qator sarlavhasiga son yozilsa, butun ustun yoki qator to'ladi.
- Excel'dan nusxa olib joylash mumkin.
- Seriya (ростовка) shabloni bitta tugma bilan qo'yiladi.
- Qator va ustun yig'indilari jonli hisoblanadi.

**Kassadagi yagona qidiruv maydoni**
- Bitta maydon hammasini qabul qiladi: shtrix-kod, RFID, artikul, nom.
- `3*` yozib keyin skanerlansa, 3 dona qo'shiladi.
- Chegirma maydoniga `10%` yoki `50000` yozilsa, foizmi yoki summami — tizim o'zi tushunadi.

**Formalarning umumiy xulqi**
- Forma ochilganda birinchi maydon darhol faol bo'ladi.
- Enter keyingi maydonga o'tkazadi (ko'p qatorli matndan tashqari), Ctrl+Enter saqlaydi. Esc yopadi, saqlanmagan o'zgarish bo'lsa so'raydi.
- Yozilganlar qoralama bo'lib o'zi saqlanadi: sahifa yopilib qolsa yoki tok o'chsa ham yo'qolmaydi.
- Xato shu maydonning ostida, darhol va oddiy tilda chiqadi. Masalan: "Bu shtrix-kod 'Futbolka, qora, M' da bor". Saqlashda kursor birinchi xatoli maydonga o'tadi.
- Oxirgi tanlovlar eslab qolinadi: masalan kirimda oxirgi yetkazib beruvchi, valyuta va sklad oldindan tanlangan turadi.
- Saqlash tugmasini ikki marta bosib, ikki marta saqlab bo'lmaydi.
- Qo'l terminalida tugmalar katta bo'ladi, son maydonlarida raqam klaviaturasi ochiladi.

### Ko'rinish va boshqaruv

- **Dizayn** academy'dagiga o'xshaydi: zich (13 px), ranglar tokenlarda, qorong'i rejim bor. Raqamlar teng kenglikda chiqadi. Shrift Golos Text, kodlar uchun monospace.
- **Klaviatura:**
  - Ctrl+K — hamma narsani qidirish: sahifa, tovar, chek, hamkor.
  - Har hujjatning o'z tezkor tugmasi bor (jr'dagi Ctrl+harf kabi) va u ekranda yozib qo'yiladi.
  - Enter — keyingi maydon, Ctrl+Enter — saqlash, Esc — yopish.
  - Jadvalda qator strelkalar bilan tanlanadi, Enter bilan ochiladi.
  - Rang × o'lcham jadvali Excel kabi: strelkalar va Tab bilan yuriladi.
  - Son maydonida hisoblash mumkin, masalan `120*3`.
  - Kassada F-tugmalar ishlaydi.
- **Jadval (TanStack Table):**
  - Filtrlar sarlavha ostida turadi va manzilda (URL) saqlanadi. Sahifa yangilansa yoki havola yuborilsa, o'sha holat ochiladi (cargo'dagi kabi).
  - Ustunlarni yashirish va tartiblash har foydalanuvchi uchun saqlanadi.
  - Katta ro'yxatlar virtualizatsiya bilan tez ochiladi.
  - Pastda jami qatori chiqadi, Excel'ga eksport qilinadi.
- **Realtime.** Server "ma'lumot o'zgardi" deb xabar beradi va ekran o'zi yangilanadi. Rahbar paneli jonli ishlaydi.

---

## 14. Bosqichlar

1. **Asos — tayyor (2026-10-01).** `xurshiduz/gulbahor` ichida yangi loyiha tuzilmasi, migratsiyalar, ko'p tashkilot (RLS), modullarni yoqish va o'chirish, kirish va huquqlar, joylar (do'kon va sklad), frontend qobig'i, klaviatura qatlami, jadval va inputlar.
2. **Tovar va sklad — davom etmoqda.** Tayyor (2026-10-01): tovar katalogi (kategoriyalar, brendlar, rang va o'lcham shkalalari, narx turlari, model va variantlar, shtrix-kodlar, narxlar); yetkazib beruvchilar; kirim hujjati (istalgan xarid valyutasi, yo'l va bojxona xarajatlarini taqsimlash, kechikkan xarajat); qoldiq; Excel'dan kirim; ko'chirish (jo'natildi → "yo'lda" → qabul, kamomad yo'qotish bo'lib yoziladi, qabulgacha qaytarib olish mumkin); hisobdan chiqarish (sabab bilan, tasdiq alohida ruxsat, bekor qilinsa tovar qaytadi); inventarizatsiya (qisman yoki to'liq, natija tasdiq bilan qoldiqqa o'tadi, hisobdagi sonni ko'rish ruxsatga bog'liq). Tayyor (2026-10-02): etiketka va RFID donalar — har donaga takrorlanmas kod (EPC), kirimdan yoki qoldiqdan etiketka chop etish, do'kon agenti orqali printerga yuborish (navbat, qayta yuborish, sinov etiketkasi), RFID kodni skanerlab tovarni topish (bitta dona bir marta sanaladi). Narxlar: narx turining yaxlitlash qoidasi (qadam va "…9 000" kabi oxiri), kategoriya, brend va sezon bo'yicha ustama qoidalari, "Narxlar" sahifasi (tannarx yonida narx va ustama; filtr bo'yicha ommaviy o'zgartirish — foiz, summa, tannarxdan ustama bilan, boshqa narx turidan; avval ko'rib chiqish; tarix va qaytarish), bugungi kurs bilan qayta baholash, kirimda narx taklifi. Jadvallarni Excel'ga chiqarish: tovarlar, narxlar, qoldiq, kirim, ko'chirish, hisobdan chiqarish, inventarizatsiya, hamkorlar va o'zgarishlar tarixi — filtrga tushgan hamma qator, ekrandagi ustunlar bilan. Qolgani: hisobdan chiqarishga rasm biriktirish (fayl saqlash bilan birga), narx o'zgargan tovarga yorliqni qayta chop etish, kurs chegaradan oshganda ogohlantirish (kunlik kurs 4-bosqichda); donaning joyi va holatini hujjatlar bo'yicha yuritish (sotildi, ko'chirildi) va brendning o'z RFID belgisini ro'yxatga olish — 3-bosqichda, qo'l terminali bilan birga.
3. **Kassa.** RFID yoki shtrix-kod bilan sotish, to'lovlar, terminal, qaytarish va almashtirish, otlojka, smena va inkassatsiya; do'kon agenti va darvoza.
4. **Pul va hamkorlar.** Hisoblar, ikki tomonlama yozuv, valyuta va kurs farqi, harajatlar, hamkorlar (qarz va konsignatsiya ikki tomonga), akt-sverka, davrni yopish; mijozlar, hamkorlar va boshlang'ich qarzlarni Excel'dan import qilish.
5. **Birinchi do'konda ishga tushirish** (quyida).
6. **Kartalar nazorati.** Bank xabarlarini o'qish, hujjatlarga bog'lash, ogohlantirishlar.
7. **Hisobot va nazorat.** Hisobotlar, rahbar boti, audit ogohlantirishlari; xodimlar va sheriklar moduli.
8. **Mijozlar.** Keshbek, sertifikatlar, aksiyalar, mijoz boti.
9. **Keyinroq.** Mobil ilova, marketpleyslar, muddatli to'lov moduli, kerak bo'lsa kassada oflayn navbat.

### Ishga tushirish

1. **Boshlang'ich ma'lumot.** Eski ma'lumotni jamoa o'zi ko'chiradi. Tizimda buning uchun umumiy Excel import bo'ladi: tovarlar (model, rang, o'lcham, shtrix-kodlar, narxlar), boshlang'ich qoldiq, mijozlar va hamkorlar hamda ularning qarzi. Bu import har yangi biznes uchun ham kerak. Import avval sinov rejimida o'tadi: tizim nima yaratilishini va qayerda xato borligini ko'rsatadi.
2. **Avval bitta do'kon.** Tizim 1–4-bosqichlar tugagach bitta do'konda ishga tushadi, qolgan do'konlar esa Billz'da qolib turadi.
3. **O'tish kuni.** Kechqurun eski tizimdagi savdo to'xtatiladi, oxirgi qoldiq va qarzlar kiritiladi. Ertasi kuni do'kon yangi tizimda ishlaydi. Shu kunlarda RFID etiketkalash va boshlang'ich inventarizatsiya qilinadi (8-bo'lim).
4. **Qolgan do'konlar** bittadan, xuddi shu tartibda o'tkaziladi.

---

## 15. Savollar

### Sizga

1. **Eslatma — 3-bosqich (kassa, do'kon agenti, darvoza) boshlanishidan oldin so'raladi:** kassa o'quvchisi va darvozaning aniq modeli. Printer (Chainway CP30) va qo'l terminali (Chainway C72) tanlangan (8-bo'lim). Printer kelganda: haqiqiy etiketkada sinab ko'rish kerak (o'lcham, kirill harflari, chipga yozish) — hozircha buyruqlar faqat dasturiy testdan o'tgan.

### Akaga

0. **Excel shablonlari bo'yicha (shoshilinch emas):** Bishkek va Xitoy shablonida ikkita «цена закупки» ustuni bor (biri valyuta bilan, biri valyutasiz). Hozir valyutalisi xarid narxi deb olinadi, ikkinchisi o'qilmaydi. «доп расход» qaysi valyutada yoziladi (hozir dollar deb olingan, hujjatda o'zgartirsa bo'ladi)?

2. **Eslatma — 6-bosqich (kartalar nazorati) boshlanishidan oldin so'raladi.** Xabar namunalari. CardXabarBot'dan ikki turi olindi ("E-Com oplata" va "Perevod na kartu"). Qolganlari kerak:
   - CardXabarBot: do'konda terminal orqali to'lov, kartadan boshqa kartaga o'tkazma, naqd pul yechish, qaytarilgan to'lov;
   - HumoBot: akaning akkauntidan 3–5 ta turli xabar (cargo'dagi namunalar boshqa odamniki, format o'zgargan bo'lishi mumkin).
   Skrinshot bo'lsa ham bo'ladi. Qoldiq qatoridagi belgi 💰mi yoki 💵mi — skrinshotdan aniq ko'rinmadi, keyingi namunada shuni ham ko'ramiz. Bu ishni to'xtatmaydi: namunalar kartalar nazorati bosqichigacha (6-bosqich) kelsa yetadi.
3. Terminal va onlayn-kassa. Bitta xarid qilinib, mijozga beriladigan hamma cheklarning rasmini olib bering: terminal cheki va, agar bo'lsa, alohida chek. Rasmdan quyidagilar aniqlanadi:
   - chekda soliqning QR kodi bormi, ya'ni onlayn-kassa ishlatiladimi;
   - terminal qaysi bankniki va chekda qaysi raqamlar bor.
   Yana bir savol: terminal puli YaTT'ning bank hisob raqamiga tushadimi yoki kartaga?
4. Ixtiyoriy: Billz'da inputlardan tashqari yana nimasi noqulay yoki nima yetishmaydi? Inputlar haqida javob olindi (13-bo'lim).
5. Aka aytgan "variatsiya" va "Excel shablonlari":
   - "variatsiya" deganda Billz'dagi variantli tovarni (asosiy tovar va uning rang hamda o'lcham variantlari) nazarda tutganmi yoki boshqa narsani?
   - qaysi Excel shablonlari haqida gapirgan: Billz'dagi tovar yuklash shablonimi yoki yetkazib beruvchilar yuboradigan fayllarmi? Bittadan namuna kerak — eski ma'lumot sifatida emas, faqat shaklini ko'rish uchun. Import shu shaklni o'qiy oladigan qilib yoziladi.

Qolgan narsalar bo'yicha savol yo'q, ular sozlama yoki modul bo'ladi va boshlang'ich qiymatlarni akaning o'zi kiritadi: narx turlari, ustama, yaxlitlash, kredit limiti, to'lov muddati, xodimlar maoshi va foizi, sheriklar, chakana mijozga qarz, keshbek.
