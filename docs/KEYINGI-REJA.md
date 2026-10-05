# Keyingi reja: Billz tahlili va yangi talablar

2026-10-05. Billz (`gulbahorboutique.billz.io`) bo'limma-bo'lim ko'rib chiqildi (to'liq ro'yxati — `docs/BILLZ-TAHLIL.md`), akaning ikki uzun xabari (narx, valyuta, kassa, kartalar, mijozlar, chegirmalar) shu rejaga yig'ildi. Asosiy reja — `docs/REJA.md`; bu hujjat uning davomi. Billz'dan nusxa olinmaydi: faqat aka haqiqatan ishlatayotgan narsalar va yaxshi g'oyalar olinadi.

Belgilar: **bor** — tizimda tayyor; **qisman** — asosi bor, to'ldirish kerak; **yo'q** — quriladi.

---

## 1. Billz'da nima bor va aka nimani ishlatadi

| Bo'lim | Billz'da | Aka ishlatadimi | Bizda |
| --- | --- | --- | --- |
| Tovarlar | Katalog, import, yetkazib beruvchiga buyurtma, inventarizatsiya, transfer, qayta baholash, hisobdan chiqarish, yetkazib beruvchilar | ha, hammasini | bor (buyurtmadan tashqari) |
| Sotuv | Yangi sotuv, hamma sotuvlar, kassa smenalari, kassa amallari | ha | bor; kassa amallari (xarajat, kirim) yo'q |
| Mijozlar | Ro'yxat (8 mingdan ortiq), guruh va teglar, sodiqlik dasturi, qarzlar | ha, faol | yo'q |
| Marketing | Aksiyalar, promokodlar, SMS tarqatma, sovg'a kartalari | aksiya va SMS — ha; promokod va sovg'a kartasi — yo'q | yo'q |
| Hisobotlar | 17 ta: do'kon, tovar, sotuvchi, mijoz, marketing, moliya | ha | yo'q (7-bosqich) |
| Moliya | Xarajat va daromad turlari, moliyaviy amallar, hisoblar holati | ha (10 ta xarajat turi) | hisoblar va o'tkazma bor; xarajat yo'q |
| Boshqaruv | Xodimlar, rollar (11 ta) | ha | bor |
| Sozlamalar | Chek dizayni, valyuta va to'lov turlari, yaxlitlash, tovar sozlamalari, Telegram bildirishnomasi, ilovalar | ha | qisman |

Billz'da ko'ringan muhim tafsilotlar:

- **Mijoz guruhlari kassirga ogohlantirish sifatida ishlatiladi.** Guruh nomlari: "bu mijozga qarz mumkin emas", "otlojka mumkin emas", "almashtirib berish mumkin emas deb ogohlantiring", "chek berish kerak". Ya'ni akaga guruh emas, **kassada ko'rinadigan eslatma** kerak.
- **Sodiqlik dasturi — chegirma tizimi**, xarid summasiga qarab pog'onali: 10 mln so'mdan — 5%, 15 mln — 6%, 20 mln — 7%, 25 mln — 8%, 40 mln — 10%.
- **Aksiya turlari** (aka uchtasini ishlatgan): foizli chegirma, belgilangan narx, "1+1". Billz'da yana: ketma-ket ortib boruvchi chegirma, N dona olinsa chegirma, chek summasi yetganda chegirma, promokod bilan ishlaydigan aksiya. Aksiya yaratishning uchinchi qadami — **"o'zaro istisno"**: bu aksiya boshqalari bilan birga ishlaydimi.
- **SMS tarqatma**: guruh va teg bo'yicha, har SMS pullik, moderatsiyadan o'tadi.
- **Chek dizayni**: har kassaga alohida shablon; chapda jonli ko'rinish, o'ngda belgilab tanlanadigan qismlar (logotip, do'kon nomi, sotuvchi, kassir, mijoz, chegirmalar, mijoz qarzi va balansi, pastki matn, ijtimoiy tarmoqlar).
- **Valyuta**: kirim valyutalari (bir nechta) va bitta sotuv valyutasi; har kirim valyutasining kursi sotuv valyutasiga nisbatan kiritiladi.
- **To'lov turlari**: naqd, karta, Payme, har do'konning Click kartasi, QR to'lovlar — ro'yxat, o'zi qo'shadi.
- **Tovar sozlamalari**: ixtiyoriy narx bilan sotish, minusga sotish, tez chegirma tugmalari (3, 5, 7, 10%), qo'l chegirmasining chegarasi, kam qoldiq ogohlantirishi.
- **Kassa ekrani**: chapda savat, o'ngda mijoz, chegirma (foiz yoki summa, tez tugmalar), izoh; "To'lash" bosilganda to'lov alohida qadam; "Kechiktirish" (otlojka); har amalning klaviatura tugmasi bor.
- **Menyu**: chapda tor ustun (belgilar), bosilganda ichki menyu ochiladi.

### Billz'dan olinmaydi

Billz hamma turdagi do'kon uchun qilingan, shuning uchun unda kiyim do'koniga keraksiz narsa ko'p. Bular olinmaydi:

- **Xizmatlar va to'plamlar** (sotuvda "услуги", "комплекты") — kiyim do'konida yo'q.
- **O'lchov birliklari va aniqligi**, tarozi bilan ishlash — kiyim donalab sotiladi.
- **Ixtiyoriy tovar maydonlari.** Akaning Billz'ida 15 ga yaqin qo'lda qo'shilgan maydon bor ("цена закупки YUAN", "КОД ФАБРИКЕ", "ДОП РАСХОД", "Сезон", "Пол"…) — chunki Billz'da ular uchun tayyor joy yo'q. Bizda bularning har biri o'z joyida: xarid narxi va valyutasi kirimda, xarajat partiyada, fabrika kodi, sezon, jins, kolleksiya, rang va o'lcham — tovar kartasida.
- **Minusga sotish** (qoldiq yo'q tovarni sotish) — bizda qoldiq daftar, minus bo'lmaydi.
- **Marketpleyslar, tashqi ilovalar do'koni, moliyalashtirish (kredit), tarif** — kerak emas.
- **Aksiyaning murakkab turlari** (ketma-ket ortib boruvchi chegirma, kross-sotuv) — aka ishlatmagan; kerak bo'lsa keyin.
- **Sovg'a kartasi va promokod** — aka ishlatmagan; promokod aksiya bilan birga arzon chiqadi, sovg'a kartasi keyinga qoldi.

---

## 2. Qarorlar (qisqacha)

| Savol | Qaror |
| --- | --- |
| Narx turlari dinamikmi? | Ha, hozir ham shunday. "Oila" narxi — ustamasi 0% bo'lgan yana bir narx turi. Kirimda har narx turi uchun ustun chiqadi. |
| Ustama qayerda belgilanadi? | "Narxlar → Ustama qoidalari"da, foizda (chakana 30%, ulgurji 20%, oila 0%). Kirimda tizim narxni o'zi taklif qiladi, xodim tuzatishi mumkin. |
| Minimal narx nima? | Bundan pastga sotib bo'lmaydigan chegara. Savdolashish va chegirma shu narxgacha; undan past — faqat rahbar tasdig'i bilan. |
| Kirimdagi har tovarning "qo'shimcha xarajat" ustuni | Yashiriladi (standart 0). Xarajat partiyaga pastdan kiritiladi va donalarga o'zi taqsimlanadi. Ustun sozlamadan yoqiladi. |
| Valyuta dinamikmi? | Ha, quriladi. Hamma kurs **dollarga nisbatan** kiritiladi; qolgan juftliklarni tizim o'zi hisoblaydi. |
| Etiketkada narx | Standart: narx so'mda, etiketkada yoziladi va **o'zi o'zgarmaydi** — kurs oshsa tizim ogohlantiradi, rahbar qayta baholaydi, etiketkasi eski donani kassa taniydi. Xohlagan narx turi uchun ikkinchi rejim: narx dollarda, etiketka narxsiz, skanerlaganda bugungi kurs bilan so'mda chiqadi (3-bo'lim). |
| Aksiya ustiga kupon | Standart holatda qo'shilmaydi: mijozga **kattasi** beriladi. Rahbar aksiyani "qo'shiladi" deb belgilasa, ketma-ket hisoblanadi (50% dan keyin qolganiga 20%), hech qachon 70% emas. |
| "1 620 000 ni 1 600 000 qilib bering" | Kassir yakuniy summani yozadi, tizim chegirmani o'zi hisoblaydi (chegara va minimal narx doirasida). |
| "50 dollarni 600 000 deb oling" | To'lov qatorida "hisoblangan qiymat" yoziladi; farq "kurs farqi" hisobiga foyda yoki zarar bo'lib tushadi. |
| Kartalar | Cheksiz qo'shiladi, har karta bir nechta do'konga biriktiriladi; kassada shu do'konning kartalari chiqadi. Pul tushgani Humo bot xabaridan avtomatik tasdiqlanadi. |
| Kassada narx dollarda ko'rinadigan biznes | Biznes sozlamasiga "sotuv valyutasi" qo'shiladi (so'm yoki dollar). Gulbahor uchun so'm. |
| Menyu | Billz'dagidek: bo'limlar va ichki menyu. |

---

## 3. Narx

### Hozir bor

- Narx turlari ro'yxat: chakana, ulgurji, minimal va boshqa; har biri so'mda yoki dollarda; yaxlitlash qadami bilan.
- Ustama qoidalari: kategoriya, brend, sezon bo'yicha; har narx turi uchun foiz; asosi — tannarx yoki chakana narx ("chakanadan 15% arzon").
- Kirimda xarajat qiymat, dona yoki vazn bo'yicha taqsimlanadi; tannarx tiyinigacha chiqadi.
- Narxlarni ommaviy o'zgartirish, tarix, qaytarish.
- Etiketkani narxli yoki narxsiz chop etish.

### Qo'shiladi

1. **Kirimda har narx turiga ustun.** Hozir faqat chakana va ulgurji bor. Yangi narx turi ("Oila") qo'shilsa, kirimda uning ustuni ham chiqadi. Har katakda tizimning taklifi turadi: tannarx + shu narx turining ustamasi. Xodim «=» bilan oladi yoki o'zi yozadi.
2. **"Oila / qarindosh" narxi.** Ustamasi 0% bo'lgan narx turi. Kassada uni faqat ruxsati bor xodim tanlaydi va chekda kim tanlagani yoziladi — suiiste'mol bo'lmasligi uchun. Mijoz guruhiga ham biriktirilishi mumkin (5-bo'lim).
3. **Minimal narx.** Narx turi sifatida bor, endi kassada ishlaydi: qator yoki chek chegirmadan keyin minimal narxdan pastga tushsa, kassa to'xtatadi va rahbar PIN'ini so'raydi. Minimal narx ham ustama bilan hisoblanadi (masalan tannarx + 5%).
4. **Kirimdagi "qo'shimcha xarajat" ustuni yashiriladi.** Standart 0. Kerak bo'lgan biznes sozlamadan yoqadi.
5. **Savdolashish.** Kassada qator narxini yoki chek summasini to'g'ridan-to'g'ri yozish: "1 600 000". Tizim farqni chegirma qilib yozadi, chekda "kelishilgan narx" deb ko'rinadi.

### Narx turlari: to'liq qoida

**Narx turi istalgancha yaratiladi.** Chakana, ulgurji, oila, xodimlar uchun, doimiy mijoz uchun — rahbar o'zi nom beradi. Har narx turida:

| Sozlama | Ma'nosi |
| --- | --- |
| Qanday hisoblanadi | tannarxdan ustama (chakana +30%, oila +0%), boshqa narx turidan ("chakanadan 15% arzon") yoki qo'lda |
| Valyutasi va yaxlitlash | so'm yoki dollar; "49 000, 59 000" kabi oxiri |
| Kassada kim tanlaydi | hamma kassir / ruxsati borlar / faqat rahbar tasdig'i bilan |
| Mijoz guruhi | qaysi guruh a'zolariga o'zi qo'llanadi |
| Minimal narxdan past bo'la oladimi | odatda yo'q; "Oila" kabi maxsus tur uchun — ha |

**Minimal narx — sotiladigan narx emas, chegara ("pol").** Texnik jihatdan u `min` turidagi narx turi, biznesda bitta bo'ladi va boshqa narxlar kabi qo'yiladi: ustama qoidasi bilan (tannarx + N%, masalan 5%) yoki qo'lda. Vazifasi — himoya: chegirma, savdolashish yoki aksiya narxni undan pastga tushirsa, kassa to'xtaydi va rahbar tasdig'ini so'raydi.

Qanday ishlaydi (qilingan, 2026-10-05):
- Chegara har qator bo'yicha tekshiriladi: qatorning o'z chegirmasi va chek chegirmasidan unga tushgan ulush ayirilgandan keyin qolgan summa `minimal narx × son` dan kam bo'lmasligi kerak. Sababi — chekda aynan shu summa yoziladi va qaytarishda shu summa qaytariladi.
- Kassir minimal narxni oldindan ko'rmaydi (mijoz ekranga qarab turgan bo'lishi mumkin). Qator chegaradan o'tganda qator ostida qizil yozuv chiqadi: "Minimal narx 380 000".
- "Chegaradan oshiq chegirma berish" huquqi bor xodim (rahbar) o'zi sota oladi; kassirda rahbar PIN'i so'raladi va chekka kim tasdiqlagani yoziladi.
- Minimal narx qo'yilmagan tovarda chegara yo'q. Minimal narx chakana narxdan baland qo'yilgan bo'lsa (narxlashdagi xato), u hech narsani to'smaydi.
- Kassir tannarxni ko'rmaydi: chegara tayyor narx sifatida keladi, "tannarx + N%" hisobi faqat narxlash bo'limida.

**Guruhga bog'lash.** Mijoz guruhida "narx turi" tanlanadi. "Oila" guruhidagi 10 kishidan biri kassada tanlansa — savatdagi hamma narx "Oila" narxiga o'tadi, chekda "Oila narxi" deb yoziladi. Kassir hech narsa tanlamaydi, adashmaydi.

**Guruh va teg farqi.** Guruh — qoida beradi (narx turi, chegirma, taqiqlar, kassadagi eslatma). Teg — shunchaki belgi, filtr va tarqatma uchun; qoida bermaydi.

**Tekinga berish.** Bu savdo emas, sovg'a: kassada "Sovg'a" amali, sababi yoziladi, rahbar tasdiqlaydi. Tovar qoldiqdan chiqadi, tannarxi "Sovg'a va o'z ehtiyoji" xarajatiga yoziladi — foyda hisobotini buzmaydi va alohida ko'rinadi.

**Suiiste'moldan himoya.**
- Maxsus narx faqat guruh a'zosi tanlanganda ishlaydi; mijozsiz chekda kassir uni qo'ya olmaydi (yoki tasdiq bilan).
- Guruhga oylik chegara qo'yish mumkin (summa yoki dona) — oshsa rahbar tasdig'i.
- Hisobot: "Maxsus narxda sotilganlar" — kim, kimga, qaysi narxda, chakanadan qancha arzon (yo'qotilgan ustama).
- Aksiyalar faqat chakana narxga qo'llanadi (aksiyada alohida belgilanmasa) — "Oila" narxi ustiga yana 50% bo'lmaydi.

**Narxni kim qo'yadi** — 15-bo'lim, 3-band.

### Kurs o'zgarsa narx nima bo'ladi

**Avval ikki narsani ajratamiz.**

- **Tannarx o'zgarmaydi.** Kirim o'tkazilganda har donaning tannarxi ikki valyutada qotadi: dollarda va so'mda (o'sha kungi kurs bilan). Xarid yuanda, xarajat dollarda yoki so'mda bo'lsa ham — hammasi kirim kursi bilan shu ikkisiga keltiriladi. Kurs keyin o'zgarsa, bu sonlar o'zgarmaydi. (Faqat kechikkan xarajat qo'shilsa yangilanadi.)
- **O'zgarishi mumkin bo'lgan narsa — sotuv narxi**, va faqat rahbar shuni tanlagan bo'lsa.

**Sotuv narxining ikki rejimi** (narx turi bo'yicha tanlanadi):

| | A. So'mda qotgan narx | B. Dollarga bog'langan narx |
| --- | --- | --- |
| Narx qayerda | so'mda saqlanadi | dollarda saqlanadi (dollar tannarx + ustama) |
| Etiketka | narx yozilgan | narxsiz (kod) yoki dollar narxi |
| Kassada va skanerda | o'sha so'm narx | dollar narx × bugungi do'kon kursi, yaxlitlangan |
| Kurs oshsa | narx o'zgarmaydi; rahbar qaror qiladi | narx o'zi oshadi |
| Kimga mos | peshtaxtadagi chakana savdo | ulgurji, ombordan savdo, narxi tez o'zgaradigan tovar |

**Tavsiya: standart — A rejim.** Peshtaxtaga chiqqan va etiketkasida narxi bor tovarning narxi **o'zi o'zgarmasligi kerak**:

- mijoz etiketkada bir narxni ko'rib, kassada boshqasini eshitsa — janjal va ishonch yo'qoladi;
- sotuvchi qaysi narx to'g'riligini bilmay qoladi;
- chakana savdoda narx so'mda ko'rsatilishi kerak (qonun talabini hisobchi bilan aniqlashtirish kerak).

A rejimda kursdan himoya — avtomatik o'zgarish emas, **ogohlantirish va tez qayta baholash**:

1. Kurs belgilangan foizdan (masalan 3%) oshsa, rahbarga xabar: "Kurs 12 000 → 12 400. Dollar tannarxga nisbatan ustamangiz o'rtacha 30% dan 26% ga tushdi. Qayta baholaysizmi?"
2. Bir tugma bilan qayta baholash (hamma tovar, kategoriya yoki partiya bo'yicha; yaxlitlash bilan). Avval natija ko'rsatiladi: nechta tovar, o'rtacha qanchaga.
3. Tizim **etiketkasini almashtirish kerak bo'lgan donalar ro'yxatini** beradi va chop etishga yuboradi.
4. **Etiketkasi eski donani tizim taniydi.** RFID'da har dona qaysi narx bilan chop etilganini biladi. Kassada bunday dona o'qilsa: "Etiketkada 740 000, yangi narx 780 000" deb ko'rsatadi. Qaysi narxda sotish — sozlama: *etiketkadagi narxda* (standart — mijoz ko'rgan narx) yoki *yangi narxda*. Shunda narx oshgan kuni ham chalkashlik bo'lmaydi.

**B rejim — xohlagan biznes yoki narx turi uchun.** "Skanerlagan kundagi kurs bilan hisoblab bersin" degani shu, va tizim buni qila oladi. Xavflari va himoyasi:

| Xavf | Himoya |
| --- | --- |
| Ertalab bir narx aytildi, kechqurun kurs yangilanib boshqa narx chiqdi | Do'kon kursini rahbar qo'yadi (bankdan o'zi olinmaydi); yangi kurs **keyingi kundan** kuchga kiradi, "hozirdan" — faqat rahbar ataylab tanlasa |
| Ikki sotuvchi ikki xil narx aytadi | Narxni hech kim boshida hisoblamaydi — hamma skanerlaydi, tizim bitta narx beradi |
| Yaxlitlash har xil | Yaxlitlash qoidasi narx turida (masalan 5 000 so'mgacha) |
| Kurs xato kiritildi (12 000 o'rniga 1 200) — hamma narx buziladi | Kurs oldingisidan ko'p farq qilsa (masalan 5%) ikkinchi tasdiq; saqlashdan oldin "o'rtacha narx qanchaga o'zgaradi" ko'rsatiladi |
| Qaytarish va almashtirish | Chekda sotilgan paytdagi narx saqlanadi, qaytarish shu narxda |
| Mijoz narxni ko'rmaydi, ishonmaydi | Sotuvchi telefonida skanerlab ko'rsatadi; xohlasa etiketkada dollar narxi yoziladi |

Ikkala rejimda ham chekda sotilgan paytdagi narx va kurs saqlanadi; foyda hisobotini so'mda (kirim kursi bilan) va dollarda ko'rish mumkin — kurs o'sgan davrda haqiqiy foyda dollardagisida ko'rinadi.

6. **Telefonda narx tekshirish.** Xodim telefonda tizimni ochib, tovar kodini kamera bilan o'qiydi: narxi (hamma narx turlari, ruxsatiga qarab), qoldig'i, minimal narxi. Alohida mobil ilova shart emas — brauzerda ishlaydigan sahifa.

---

## 4. Chegirmalar tartibi

Kassada bir chekka bir nechta chegirma to'g'ri kelishi mumkin. Tartib qat'iy va har doim bir xil:

1. **Aksiya** — tovarning narxini o'zgartiradi (foiz, belgilangan narx, 1+1).
2. **Mijoz chegirmasi** — sodiqlik pog'onasi yoki guruh chegirmasi.
3. **Promokod / kupon.**
4. **Qo'l chegirmasi** — kassir yozgani yoki kelishilgan summa.

Qoidalar:

- Standart holatda 1–3 **qo'shilmaydi**: tizim har qatorga eng foydalisini qo'llaydi va chekda qaysi biri ishlaganini yozadi. Misol: tovar 50% aksiyada, mijozda 20% kupon bor — 50% qoladi.
- Rahbar aksiya yoki promokodni yaratayotganda **"boshqa chegirmalar bilan qo'shiladi"** deb belgilashi mumkin. Shunda ketma-ket hisoblanadi: 1 000 000 → 50% → 500 000 → 20% → 400 000 (jami 60%, 70% emas).
- Qo'l chegirmasi doim oxirida va **chegarasi bor** (sozlamadagi foiz). Chegaradan oshsa — rahbar PIN'i.
- Hech bir chegirma narxni **minimal narxdan** pastga tushira olmaydi (rahbar tasdig'isiz).
- Chekda har chegirma alohida qator bo'lib ko'rinadi: nima uchun arzonlashgani keyin ham ma'lum bo'ladi.

---

## 5. Mijozlar

1. **Mijozlar bazasi.** Telefon (shu bilan taniladi), ism, tug'ilgan kun, jins, ro'yxatdan o'tgan do'kon, xaridlar summasi, oxirgi xarid, qarzi. Ro'yxat ustida ko'rsatkichlar: jami, shu hafta qo'shilgani, qaytmay qo'yganlar, yaqin kunlarda tug'ilgan kuni borlar. Billz'dagi mijozlar Excel orqali ko'chiriladi.
2. **Guruh va teglar.** Mijoz bir nechta guruh va tegda bo'ladi. Guruhga: chegirma foizi, biriktirilgan narx turi (masalan "Oila").
3. **Kassadagi eslatma — Billz'dan yaxshiroq.** Guruhda ikki narsa bo'ladi:
   - **Eslatma matni** — mijoz tanlanganda kassada sariq yozuv bo'lib chiqadi ("Chek berish kerak").
   - **Taqiqlar** — belgilab qo'yiladi va tizim o'zi bajaradi: "qarzga berilmaydi", "otlojka qilinmaydi", "almashtirib berilmaydi". Billz'da bu faqat matn, kassir unutsa bo'ldi; bizda tizim o'zi to'xtatadi.
4. **Sodiqlik dasturi.** Ikki tur, biznes birini tanlaydi: pog'onali chegirma (akaning hozirgisi) yoki keshbek (ball). Pog'onalar Billz'dagidek ko'chiriladi.
5. **Chakana qarz.** Qarzga sotish, muddat, qisman to'lash, muddati o'tganlar ro'yxati. Bu hamkor hisobining soddaroq ko'rinishi — asosi tayyor.

---

## 6. Marketing

1. **Aksiyalar.** Birinchi navbatda aka ishlatgan uchtasi: foizli chegirma, belgilangan narx, "1+1" (birini olsa ikkinchisi chegirmada). Keyin: N dona olinsa chegirma, chek summasi yetganda chegirma. Har aksiyada: nomi (kassada ko'rinadi), do'konlar, boshlanish va tugash vaqti (o'zi boshlanadi, o'zi tugaydi), tovarlar (kategoriya, brend, sezon yoki ro'yxat), faqat chakana narxgami, boshqa chegirmalar bilan qo'shiladimi.
2. **Promokod.** Aksiyaga bog'lanadi: "faqat kod aytilsa ishlaydi". Qaysi kanal (Instagram, bloger) qancha savdo olib kelganini ko'rsatadi.
3. **Tarqatma.** Guruh, teg yoki filtr bo'yicha, **Telegram** orqali (mijoz boti, bepul). SMS hozircha qurilmaydi (aka: Telegram yetarli).
4. **Sovg'a kartasi.** Aka ishlatmagan — keyinga.
5. **Hisobot:** aksiya samaradorligi (aksiya davridagi savdo, o'tgan davr bilan solishtirish).

---

## 7. Kassa va to'lov

### To'lov alohida bo'limda

Hozir to'lov maydonlari savat ostida turadi. Yangi ko'rinish:

- **Chapda savat**, o'ngda mijoz (guruh eslatmasi bilan), chegirma (foiz, summa, tez tugmalar), izoh, jami.
- **Yaxlit summa takliflari** (Billz'dan): chek 1 770 000 bo'lsa, chegirma maydoni ostida "1 700 000", "1 600 000" tugmalari — bitta bosish bilan chek shu summaga tushadi. Kassir summani o'zi ham yozadi.
- **Qator sotuvchisi**: chekka yoki alohida qatorga sotuvchi biriktiriladi — sotuvchilar hisoboti va keyin maoshdagi foiz uchun.
- **Kod kiritish**: promokod yoki rahbar bergan bir martalik kassa kodi.
- **"To'lash" (F9)** bosilganda to'lov bo'limi ochiladi: chapda **chek ko'rinishi** (tovarlar, chegirmalar, jami), o'ngda to'lov qatorlari. Qatorlar tayyor turadi — hamkor to'lovi oynasidagi kabi:
  - Naqd so'm
  - Naqd dollar — yonida "hisoblangan qiymat"
  - Shu do'konga biriktirilgan har karta — alohida qator
  - Terminal
  - Qarzga — faqat mijoz tanlangan va guruhida taqiq yo'q bo'lsa; muddati so'raladi
- Har to'lov qatorining o'z tugmasi bor (F5, F6…), Billz'dagi kabi; hozirgi tugmalar saqlanadi.
- Pastda: to'landi, qoldi, qaytim. «=» qolgan summani shu qatorga to'ldiradi.
- Tez sotuv saqlanadi: hech narsa yozilmasa Enter — naqd so'mda, qaytimsiz.

Qanday ishlaydi (qilingan, 2026-10-05):
- Kassa ikki bosqichli. **Savat**: chapda qidiruv va savat, o'ngda summa, chegirma, kelishilgan summa, jami va "To'lash" (F9) tugmasi. **To'lov**: chapda chek ko'rinishi (tovarlar, qator chegirmalari, chekka chegirma, qaytarilgan tovar, jami, sotuvchi), o'ngda to'lov qatorlari.
- To'lov qatorlari tayyor turadi: naqd so'm (F5), naqd dollar (F6, ostida "So'mda hisoblanadi"), do'konning **har kartasi alohida qator** (F7 — birinchisi), **har terminal alohida qator** (F8 — birinchisi, ostida chek raqami). Ro'yxatdan karta tanlash yo'q. Qatorlar orasida ↑ ↓.
- Klaviatura: **F9** — to'lovga o'tish, to'lovda yana F9 — sotish. **Enter** — hech narsa yozilmagan bo'lsa naqd so'mda qaytimsiz sotadi; summa yozilgan bo'lsa keyingi qatorga o'tadi; summa to'liq bo'lsa qaytimni ko'rsatib turadi va keyingi Enter sotadi. **=** qolgan summani to'ldiradi (shundan keyingi Enter sotadi). **Tab** — summa yonidagi maydonga (dollarning so'mdagi qiymati, terminal chek raqami). **Esc** — savatga qaytish (yozilgan summalar saqlanadi). **Ctrl+Enter** savatning o'zidan — naqd so'mda, to'lov bo'limini ochmasdan.
- F5–F8 savatdan bosilsa ham to'lov bo'limini ochib, o'sha qatorga tushadi. F2 va F3 to'lovdan savatga qaytaradi (qidiruvga yoki kelishilgan summaga).
- To'lov paytida tovar o'zgarsa (skaner, RFID o'quvchi, narx yangilanishi) — kassa savatga qaytadi: to'lanayotgan narsa endi boshqa.
- Qaytarish va almashtirish ham shu bo'limdan o'tadi: qatorlar pul qaytarish uchun, chek ko'rinishida qaytarilgan tovar alohida ko'rinadi.
- Hali yo'q (keyingi bo'laklarda): "Qarzga" qatori (mijozlar bilan), qator sotuvchisi, promokod, kartada "tushdi" belgisi (Humo bot bilan).

### Dollar "kelishilgan qiymat" bilan

Misol: chek 1 600 000. Mijoz 500 000 naqd, 500 000 kartaga, qolgan 600 000 o'rniga 50 dollar beradi.

- Kurs 12 100 bo'lsa: 50 $ = 605 000. Mijoz "600 000 deb oling" desa — kassir dollar qatorining "hisoblangan qiymat"iga 600 000 yozadi. Kassaga 50 $ kiradi (daftarda 605 000 so'm qiymatida), chek 600 000 ga yopiladi, **5 000 so'm "kurs farqi" hisobiga foyda** bo'lib yoziladi.
- Kurs 11 800 bo'lsa: 50 $ = 590 000. "600 000 deb oling" — **10 000 so'm kurs farqiga zarar** yoziladi.
- Farq sozlamadagi chegaradan (masalan 2%) oshsa — rahbar PIN'i.
- Rahbar hisobotda kurs farqidan qancha foyda va zarar bo'lganini kassir va kun bo'yicha ko'radi.

Qanday ishlaydi (qilingan, 2026-10-05):
- Kassada dollar summasi yozilgach, ostida **"So'mda hisoblanadi"** maydoni chiqadi. Bo'sh tursa — kun kursi bo'yicha (maydonda xira ko'rinadi). Summa yozilsa — dollar shu qiymatda olinadi; `=` tugmasi chekning qolgan qismini to'ldiradi ("qolgan 600 000 o'rniga 50 dollar").
- Maydon ostida darhol ko'rinadi: "1 $ = 12 000 · kurs farqidan foyda 5 000" yoki "…zarar 10 000".
- Daftarda: kassaga dollar kun kursidagi qiymatda kiradi, chek kelishilgan qiymatga yopiladi, farq **"Kurs farqi"** hisobiga tushadi — yozuv har doim nolga teng. Chek bekor qilinsa, farq ham qaytadi.
- **Chegara** — sozlamada: "Dollarni kursdan qimmat olish chegarasi", boshlang'ich qiymati 2%. Faqat zarar tomoni cheklanadi (dollar kursdan qimmat olinsa — bu boshqa nomdagi chegirma). Chegaradan oshsa, "Chegaradan oshiq chegirma berish" huquqi bor xodimning PIN'i so'raladi va chekka kim tasdiqlagani yoziladi. Foyda tomoni cheklanmaydi.
- Dollar miqdori o'zgartirilsa, kelishilgan qiymat o'chadi: u aynan o'sha miqdor uchun kelishilgan edi.
- Qaytarishda kelishilgan qiymat yo'q: pul kun kursi bo'yicha qaytadi. Chekning o'zida kurs farqi ko'rinadi, lekin qog'ozga chiqmaydi.
- Hisobot (kassir va kun bo'yicha kurs farqi) — hisobotlar bosqichida.

### Kartalar

- Kartalar cheksiz qo'shiladi (hozir ham). Yangilik: **bitta karta bir nechta do'konga** biriktiriladi.
  - Qilingan (2026-10-05): "Pul → Hisoblar" da karta (va bank hisobi) formasida "Do'konlar" maydoni — bir nechta do'kon tanlanadi; bo'sh qolsa hamma do'kon. Karta faqat o'sha do'konlar kassasida chiqadi, boshqa do'kon kassasi unga pul ololmaydi (server ham rad etadi). Xarajat va hamkor to'lovida ham xodim faqat o'zi ishlaydigan do'konlarning kartalarini ko'radi. Terminal va seyf bitta do'konda turadi.
- Kassada "kartaga" qatorida shu do'konning kartalari chiqadi; kassir tanlaydi, ekranda karta raqami katta ko'rinadi (mijozga aytish uchun).
- To'lov **"kutilmoqda"** holatida yoziladi. Humo bot xabari kelganda (karta, summa, vaqt mos kelsa) to'lov o'zi **"tushdi"** bo'ladi va kassir ekranida yashil belgi chiqadi. Belgilangan vaqtda tushmasa — kassirga va rahbarga xabar.
- Kartaga hech bir chekka bog'lanmagan pul tushsa yoki chiqim bo'lsa — rahbarning "aniqlanmagan" ro'yxatiga tushadi; u turini belgilaydi (boshqa daromad, xarajat turi, hamkor to'lovi).
- Bu `REJA.md` dagi 6-bosqich ("Kartalar nazorati"); cargo tizimidagi Humo bot ulanishi namuna bo'ladi. **Buning uchun bot xabarlari namunasi kerak.**

### Telegram akkauntlarni ulash (Humo bot uchun)

Kartalar bir nechta odam nomida bo'lishi mumkin, Humo bot esa har kimga o'z Telegram'ida yozadi. Bot xabarini boshqa bot o'qiy olmaydi, shuning uchun server o'sha odamning akkaunti nomidan faqat **bitta suhbatni** — Humo botni — o'qiydi. Cargo tizimida shu usul ishlab turibdi (`cargo-server/src/card-feed`); farqi — bizda akkauntlar bir nechta va kirish veb orqali.

1. **Bir nechta akkaunt.** "Pul → Kartalar → Telegram akkauntlar" sahifasi. Har akkaunt o'z sessiyasi bilan ishlaydi: biri chiqib ketsa, boshqalariga tegmaydi.
2. **Kirish veb orqali, uch qadam:** telefon raqami → Telegram yuborgan kod → (yoqilgan bo'lsa) ikki bosqichli parol. Kod va parolni **akkaunt egasining o'zi** kiritadi. Tizim parolni saqlamaydi — faqat sessiya kalitini, shifrlangan holda.
3. **Kartani tanish.** Xabardagi kartaning oxirgi 4 raqami bo'yicha qaysi karta ekani aniqlanadi. Tizimda yo'q karta ko'rinsa — rahbarga "yangi karta ko'rindi, qo'shasizmi?" degan taklif chiqadi.
4. **Uzilishdan keyin o'zi tiklanadi.**
   - Aloqa har daqiqada tekshiriladi, uzilgan bo'lsa qayta ulanadi.
   - Har 5 daqiqada suhbat qayta o'qiladi — jonli xabar o'tkazib yuborilgan bo'lsa ham ushlanadi.
   - Server 1–2 kun o'chib tursa ham: yonganda oxirgi o'qilgan xabardan boshlab hammasini o'qib chiqadi. Har xabar o'z raqami bilan saqlanadi — ikki marta yozilmaydi.
5. **Rahbar uchun holat sahifasi.** Har akkaunt: holati (ulangan / uzilgan / qayta kirish kerak), oxirgi xabar vaqti, ko'rgan kartalari. Tugmalar: **"Qayta ulash"** va **"Hozir o'qib chiqish"**.
6. **Telegram akkauntdan chiqarib yuborsa** — holat "qayta kirish kerak" bo'ladi, rahbarga xabar boradi; o'sha uch qadam bilan qayta kiriladi. Ungacha tushgan pullar qayta kirgandan keyin o'qib olinadi.
7. **Xavfsizlik.** Server faqat Humo bot suhbatini o'qiydi, hech narsa yubormaydi va boshqa suhbatlarga tegmaydi. Akkauntni tizimdan uzish — bitta tugma, sessiya o'chadi.

### Xarajat va boshqa kirim-chiqim

- **Xarajat turlari** — ro'yxat, rahbar o'zi yaratadi. Akaning Billz'dagi turlari ko'chiriladi (oshxona, yuk haqi, ish haqi, tozalik va boshqalar).
- Xarajat, boshqa daromad va pul yechib olish — o'sha tayyor qatorli oyna orqali ("Kirim-chiqim" tugmasi ostida, Alt+K / Alt+C yonida).
- Smena hisobotida xarajatlar alohida ko'rinadi.

Qanday ishlaydi (qilingan, 2026-10-05):
- **Xarajat turlari**: "Pul → Xarajat turlari". Har biznes tayyor ro'yxat bilan boshlaydi (Ijara, Ish haqi, Oshxona, Yuk haqi, Kommunal to'lovlar, Tozalik, Reklama, Soliq va yig'imlar, Bank komissiyasi, Boshqa xarajat; kirim uchun — Boshqa daromad). Qo'shiladi, nomi o'zgartiriladi, arxivlanadi. Billz'dagi aniq nomlar bilan solishtirib, kerak bo'lsa nomlar o'zgartiriladi.
- **"Egasi oldi" / "Egasi qo'shdi"** — alohida belgi bilan ("foydaga kirmaydi"). Egasi kassadan pul olsa, bu xarajat emas: foyda hisobotini buzmaydi, "Egasi bilan hisob" hisobida alohida yig'iladi.
- **Yozish**: yuqoridagi "Kirim-chiqim" tugmasi → "Xarajat" (**Alt+X**) yoki "Boshqa kirim"; Ctrl+K qidiruvida ham bor. Oyna hamkor to'lovi oynasi bilan bir xil: turi tanlanadi (oxirgi tanlangan tur eslab qolinadi), pul qaysi hisobdan chiqqani tayyor qatorlarga yoziladi — naqd, seyf, karta, bank; bir nechta joydan birga ham bo'ladi. Dollar kun kursida so'mga keltiriladi (kurs qo'yish huquqi bor xodim o'z kursini yozadi). "Saqlash va yana" — ketma-ket yozish uchun.
- **Qoidalar**: hisobda yo'q pul chiqmaydi; kassadan faqat smena ochiq bo'lganda; ikki marta yuborilsa bitta yoziladi.
- **Bekor qilish**: sababi bilan; pul joyiga qaytadi, ikkala yozuv ham daftarda qoladi. Smena yopilgan bo'lsa bekor qilinmaydi — teskari yozuv bilan tuzatiladi.
- **Ro'yxat**: "Pul → Xarajat va kirim": sana, tur, summa, hisob, kim yozgan, izoh; filtrlar va Excel; tepada ko'rinib turganlarning jami. Hisoblarni ko'rmaydigan xodim faqat o'zi yozganini ko'radi.
- **Smena hisoboti**: kassadan chiqqan xarajatlar va kassaga tushgan boshqa kirim alohida qatorlarda.
- **Ruxsatlar**: "Xarajat va boshqa kirimni yozish" (do'kon menejeri, hisobchi, boshqaruvchi) va "Xarajat va kirim turlarini boshqarish" (hisobchi, boshqaruvchi). Kassirda yo'q — kerak bo'lsa rolga qo'shiladi.
- Daftarda: xarajat — pul hisobidan chiqadi, "Xarajatlar" hisobiga tushadi; boshqa kirim — "Boshqa daromad"; egasi bilan — "Egasi bilan hisob". Har yozuv nolga teng.

---

## 8. Valyuta

### Hozir

Biznesning o'z puli — so'm va dollar. Kirim hujjati istalgan xarid valyutasida (yuan, lira, som…) bo'ladi, lekin hisoblar va hamkor hisobi faqat so'm yoki dollarda.

### Taklif: dinamik valyuta, dollar orqali

1. **Valyutalar ro'yxati.** Rahbar kerakli valyutani yoqadi (yuan, yevro, rubl…). So'm va dollar doim bor.
2. **Hamma kurs dollarga nisbatan kiritiladi:** "1 $ = 12 100 so'm", "1 $ = 7,1 yuan", "1 $ = 0,92 yevro". Sabab:
   - bozorda ham shunday aytiladi (yuan ham, lira ham dollarga nisbatan);
   - kirim hujjatida hozir ham shunday;
   - har valyutani har biriga kiritish shart emas: 5 ta valyuta uchun 10 ta juftlik o'rniga 4 ta son.
3. **Qolgan juftliklarni tizim o'zi chiqaradi:** yuan → so'm = 12 100 / 7,1. Kerak bo'lsa bir martalik kurs to'lovning o'zida yoziladi.
4. **Daftar so'mda yuritiladi** (hozirgidek): har yozuvning so'mdagi qiymati o'sha kungi kurs bilan qotadi. Shuning uchun eski hujjatlar kurs o'zgarsa ham o'zgarmaydi.
5. **Hisob istalgan yoqilgan valyutada** bo'lishi mumkin: yuan seyfi, yuanda hisob yuritadigan yetkazib beruvchi.
6. **Sotuv valyutasi** — biznes sozlamasi: so'm yoki dollar. Dollarda ishlaydigan do'konda kassa narxni dollarda ko'rsatadi.

### Kurs sozlamasi (alohida sahifa)

- Bugungi kurslar jadvali: har yoqilgan valyuta uchun bitta son; yonida kechagi va o'zgarish foizi.
- Markaziy bank kursi yonida **maslahat** sifatida ko'rinadi (o'zi qo'yilmaydi — bozor kursi boshqa).
- Tarix: kim, qachon, qanchaga o'zgartirdi.
- Ruxsat: `money.rates`. Kurs kiritilmagan kuni ertalab rahbarga xabar boradi; kurs yo'q valyutada amal bajarilmaydi (1:1 deb olinmaydi).
- Kurs kun davomida o'zgarsa — yangi kurs shu paytdan keyingi amallarga ishlaydi, oldingilar o'z kursida qoladi.

Bu ish daftarga tegadi, shuning uchun alohida bosqich va to'liq testlar bilan qilinadi.

### Do'kon kursi va bir martalik kurs

- **Do'kon kursi** — kunlik kurs. Uni rahbar o'zi qo'yadi va u bank kursidan farq qilishi mumkin (bankda 11 800, do'konda mijozlar uchun 12 000). Kassa, narx va hisob-kitob shu kurs bilan ishlaydi.
- **Bir martalik kurs** — istalgan amalning o'zida yoziladi: kassada to'lov olishda, hamkorga to'lovda, pul chiqarishda, ayirboshlashda. Faqat shu amalga tegishli, kunlik kurs o'zgarmaydi.
- Bir martalik kurs do'kon kursidan farq qilsa, farq **kurs farqi** hisobiga foyda yoki zarar bo'lib yoziladi. Misol: do'kon kursi 12 000, bankdan dollar 11 800 dan olindi — har dollardan 200 so'm foyda ko'rinadi.
- Kim bir martalik kurs yoza oladi — ruxsat (`money.rates`); kassir uchun sozlamadagi chegara ichida, undan oshsa rahbar PIN'i.
- "50 dollar berdim, qolganiga qancha?" — kassada dollar qatoriga 50 yozilishi bilan qolgan summa so'mda ko'rinadi; mijoz uni naqd yoki kartaga to'laydi (boshqa qatorda «=»).

### Pul joylari, o'tkazma va ayirboshlash

1. **Pul joylari istalgancha va istalgan valyutada.** Kassa (har birida har valyuta uchun tortma), seyf, bank hisobi, karta: Humo so'mda, Visa yoki Mastercard dollarda, yuan kartasi. Har biri o'z valyutasida yuritiladi — dollar dollar bo'lib, yuan yuan bo'lib turadi.
2. **"Hisoblar holati" sahifasi.** Bir qarashda: har kassada, har kartada, seyfda qancha bor; valyutalar bo'yicha jami (so'm, dollar, yuan alohida) va hammasining bugungi kursdagi umumiy qiymati. Billz'da ham shunga o'xshash sahifa bor (do'kon bo'yicha naqd va naqdsiz, so'm va dollar) — bizda har hisob alohida ko'rinadi.
3. **O'tkazma** — bir xil valyutadagi ikki joy orasida: kassadan seyfga, kassadan kassaga, kartadan kartaga. Ikki kishi tasdig'i (tayyor).
4. **Ayirboshlash** — valyuta o'zgaradigan o'tkazma. Bitta hujjat:
   - **qayerdan**: bir yoki bir nechta qator (masalan, 3 000 dollar olish uchun bir qismi naqd so'mdan, bir qismi kartadan);
   - **qayerga**: dollar seyfi, Visa kartasi, yuan kartasi;
   - **kurs**: do'kon kursi turadi, bir martalik kurs yozsa bo'ladi; ikki summadan biri yozilsa, ikkinchisi o'zi chiqadi (juft maydon);
   - farq kurs farqiga yoziladi.
   Misollar: kartadagi 10 mln so'm → dollar (bank kursi 11 800 bilan); naqd dollar → yuan kartasi; dollar kartasi → yuan kartasi.
5. **Komissiya.** O'tkazma va ayirboshlashda "komissiya" maydoni (summa yoki foiz). Bankomat kartadan naqd qilganda 1% olsa: kartadan 101 000 chiqadi, kassaga 100 000 kiradi, 1 000 so'm "bank komissiyasi" xarajatiga o'zi yoziladi.
6. **Chiqim istalgan joydan**: naqddan, istalgan kartadan, bankdan — xarajat turi bilan.
7. **Inson omili.**
   - Hisobda yetmasa amal bajarilmaydi (minus bo'lmaydi).
   - Valyutasi boshqa joyga oddiy o'tkazma qilib bo'lmaydi — tizim o'zi "ayirboshlash" oynasini ochadi.
   - Saqlashdan oldin qisqa xulosa ko'rinadi: "Humo *3073 dan 10 000 000 so'm chiqadi → Dollar seyfiga 847,46 $ kiradi, kurs 11 800".
   - Katta summa yoki kursi do'kon kursidan ko'p farq qiladigan amal rahbarga bildiriladi.
   - Xato amal tahrirlanmaydi — bekor qilinadi, ikkalasi ham tarixda qoladi.

---

## 9. Har donani aniq tanish

Masala: 40-o'lcham qora shimdan ikkita bor edi, inventarizatsiyada bittasi yo'q. Xodim o'rniga boshqa shimni qo'yib qo'ymasligi kerak.

Yechim — RFID donalari, asosi tayyor:

- Har donaning **o'z kodi** bor (RFID chipida), u bir marta beriladi va o'zgarmaydi. Kodning oxirgi raqamlari etiketkada ham yozilgan — ko'z bilan solishtirish uchun.
- **"Donalar" ro'yxati** (yangi): Qoldiq → tovar → variant ichida har dona alohida qator: kodi, qayerda, holati (omborda, sotilgan, yo'lda, yo'qolgan), qaysi kirimdan kelgan, oxirgi marta qachon va kim o'qigan.
- **Inventarizatsiya RFID bilan:** terminal donalarni o'qiydi, tizim aynan **qaysi kodlar yo'qligini** aytadi. Boshqa shimning kodi boshqa — o'rniga qo'yib bo'lmaydi; chipsiz shim esa umuman o'qilmaydi.
- **Ko'chirish** ham donalar bilan: jo'natilgan kodlar va qabul qilingan kodlar solishtiriladi.
- **Dona tarixi:** kirim → etiketka → ko'chirish → sotuv → qaytarish, har qadamda kim va qachon.

RFID'siz (faqat shtrix-kodli) tovarda bu imkon yo'q: shtrix-kod hamma bir xil shimda bir xil.

---

## 10. Chek va etiketka dizayni

- **Chek shabloni**: chapda jonli ko'rinish, o'ngda belgilab tanlanadigan qismlar: logotip (yuklash, o'lchami), do'kon nomi va manzili, sana, sotuvchi, kassir, mijoz, mijoz qarzi va chegirmasi, tovar qatorida nimalar chiqishi (nom, brend, artikul, o'lcham), chegirmalar, jami, pastki matn, ijtimoiy tarmoqlar, chek shtrix-kodi.
- Har kassaga o'z shabloni; ikki tur: chek va yuk xati.
- **Etiketka shabloni**: o'lchami, qaysi maydonlar (nom, o'lcham, rang, narx, artikul, kod, shtrix-kod), narxli yoki narxsiz, shrift kattaligi. Jonli ko'rinish bilan. Hozirgi ikki tayyor shablon standart bo'lib qoladi.

---

## 11. Menyu

Billz'dagidek ikki qavatli: bo'lim va uning ichki menyusi. Yig'ilgan holatda tor ustun (belgilar), bo'lim bosilganda ichki menyu yonidan ochiladi; yoyilgan holatda bo'limlar ostida ochilib-yopiladi.

| Bo'lim | Ichida |
| --- | --- |
| Savdo | Kassa, Cheklar, Smenalar, Kassa amallari |
| Tovar | Tovarlar, Narxlar, Etiketkalar, Ma'lumotnomalar |
| Sklad | Qoldiq, Kirim, Ko'chirish, Inventarizatsiya, Hisobdan chiqarish |
| Mijozlar | Mijozlar, Guruh va teglar, Sodiqlik dasturi, Qarzlar |
| Marketing | Aksiyalar, Promokodlar, Tarqatma |
| Pul | Hisoblar holati, Kirim-chiqim, O'tkazmalar, Kartalar, Kurslar, Xarajat turlari |
| Hamkorlar | Hamkorlar, To'lovlar |
| Hisobotlar | Do'kon, Tovar, Sotuvchi, Mijoz, Marketing, Moliya |
| Boshqaruv | Xodimlar, Rollar, Do'kon va skladlar, Qurilmalar, Darvoza jurnali, Tarix |
| Sozlamalar | Biznes, Chek va etiketka, Valyuta va to'lov turlari, Bildirishnomalar |

Ruxsati yo'q bo'lim va band ko'rinmaydi. Alt+raqam va Ctrl+K qidiruvi saqlanadi.

Qanday ishlaydi (qilingan, 2026-10-05):
- Hozir bor ekranlar sakkiz bo'limga joylandi: **Bosh sahifa · Savdo** (Kassa, Cheklar, Smenalar) **· Tovar** (Tovarlar, Narxlar, Etiketkalar, Ma'lumotnomalar) **· Sklad** (Qoldiq, Kirim, Ko'chirish, Inventarizatsiya, Hisobdan chiqarish) **· Pul** (Kassalar, Hisoblar, O'tkazmalar, Xarajat va kirim, Xarajat turlari, Kurslar) **· Hamkorlar** (Hamkorlar, To'lovlar) **· Boshqaruv** (Xodimlar, Rollar, Do'kon va skladlar, Qurilmalar, Darvoza jurnali, Tarix) **· Sozlamalar**. Mijozlar, Marketing va Hisobotlar bo'limlari ular qurilganda qo'shiladi.
- **Yoyilgan holat**: bo'lim nomi bosilsa ostida bandlari ochiladi; qaysilari ochiq turgani shu kompyuterda eslab qolinadi; qayerga o'tilsa (tugma, qidiruv, havola), o'sha bo'lim o'zi ochiladi.
- **Tor holat** (belgilar ustuni): bo'lim belgisi bosilsa, bandlari yonidan chiqadi (Billz'dagi kabi); turgan bo'lim belgisi ajralib turadi.
- "Pul" bandlari bitta sahifaning varaqlari: menyu to'g'ri kerakli varaqni ochadi.
- Bitta ekranli bo'lim (Bosh sahifa, Sozlamalar) — to'g'ridan-to'g'ri havola.
- Alt+1…9 birinchi to'qqiz ekranga (bo'lim yopiq bo'lsa ham ishlaydi); Ctrl+K qidiruvida hamma band, shu jumladan "Pul" varaqlari.

---

## 12. Bildirishnomalar va rahbar nazorati

Uch joy: ekrandagi xabar, Chrome bildirishnomasi (tayyor), Telegram (rahbar boti — `REJA.md`, 7-bosqich).

| Hodisa | Kimga |
| --- | --- |
| Darvoza signali | o'sha do'kon xodimlari, rahbar (**tayyor**) |
| Pul yoki tovar yo'lda, qabul qilish kerak | qabul qiluvchi (**tayyor**) |
| Chegaradan oshiq chegirma, minimal narxdan past sotuv | rahbar |
| Chek bekor qilindi, qaytarish | do'kon menejeri, rahbar |
| Smena kamomad yoki ortiqcha bilan yopildi | rahbar |
| Dollar kelishilgan qiymat bilan olindi, zarar chegaradan oshdi | rahbar |
| Bugungi kurs kiritilmagan | kurs qo'yadigan xodim, rahbar |
| Kartaga to'lov belgilangan vaqtda tushmadi | kassir, rahbar |
| Kartaga aniqlanmagan pul tushdi yoki chiqdi | rahbar |
| Inventarizatsiyada kamomad | sklad mudiri, rahbar |
| Mijoz qarzining muddati o'tdi | do'kon menejeri |
| Tovar kam qoldi | sklad mudiri |
| Yangi qurilmadan kirildi | o'sha xodim, rahbar |

Har xodim "Bildirishnomalar" sozlamasida qaysilarini olishini tanlaydi; rahbar uchun hammasi standart yoqilgan. Har hodisaning o'z ruxsati bor — rolga bog'lanadi.

---

## 13. Hisob doim teng turadi

Daftarning asosiy qoidasi (hozir ham ishlaydi): **har yozuvning so'mdagi yig'indisi nol**. Pul bir joydan chiqsa, boshqa joyga kiradi:

- Pul joylari: kassalar, seyf, kartalar, bank.
- Hamkorlar va mijozlar qarzi (ular bizga, biz ularga).
- Tovar xaridi (yetkazib beruvchidan olingan tovar qiymati).
- Savdo tushumi, xarajatlar, kurs farqi, yaxlitlash farqi, kassa farqi (kamomad va ortiqcha).
- Boshlang'ich qoldiq.

Shularning hammasi qo'shilsa — nol. Nol chiqmasa, bazaning o'zi yozuvni qabul qilmaydi. Ustiga **"Balans" hisoboti** quriladi: har guruh bo'yicha qoldiq va jami nol ekani, istalgan sana uchun. Har yozuvda o'sha paytdagi kurs saqlanadi — "pul qayerga ketdi, kurs qanday edi" degan savolga javob shu yerda.

---

## 13a. Tovar rasmlari

Hozir tovarda rasm yo'q. Taklif:

1. **Bir nechta rasm, modelga.** Har modelga 10 tagacha rasm; birinchisi — asosiy (ro'yxat va kassada shu ko'rinadi). Tartibi sudrab o'zgartiriladi.
2. **Rangga bog'lash.** Rasmga rang belgilansa (qora, bej), o'sha rangdagi variant tanlanganda aynan shu rasm chiqadi — kiyimda eng kerakli narsa. Belgilanmasa, rasm hamma rangga tegishli.
3. **Yuklash qulay:**
   - sudrab tashlash, bir nechtasini birdan tanlash, buferdan qo'yish (Ctrl+V);
   - telefonda — kameradan to'g'ridan-to'g'ri;
   - har rasmning yuklanish chizig'i ko'rinadi, biri xato bo'lsa qolganlari to'xtamaydi;
   - yuklashdan oldin brauzerning o'zi rasmni kichraytiradi (telefon rasmi 5–8 MB → ~300 KB), internet sekin bo'lsa ham tez ketadi.
4. **Tez ochilishi:**
   - server har rasmdan uch o'lcham yasaydi: kichik (ro'yxat, kassa), o'rta (karta), katta (kattalashtirib ko'rish), zamonaviy siqilgan formatda (WebP);
   - har rasm bilan **juda kichik xira nusxa** (bir necha yuz bayt) saqlanadi va ro'yxat bilan birga keladi: rasm yuklanguncha o'rnida xira ko'rinish turadi, keyin silliq almashadi — sahifa "sakramaydi";
   - rasmlar faqat ekranga yaqinlashganda yuklanadi, brauzer ularni uzoq muddat eslab qoladi.
5. **Qayerda ko'rinadi:** tovarlar ro'yxati, tovar kartasi, kassa savati, kirim, qoldiq, telefonda narx tekshirish, keyinchalik mijoz boti.
6. **Saqlash.** Fayllar serverda alohida joyda (keyin bulutga ko'chirsa bo'ladigan qilib), bazada faqat manzili va xira nusxasi. Billz'dagi rasmlar Excel importi bilan birga ko'chiriladi (havolasi bo'lsa).

Billz'da tovarga rasm qo'yiladi, lekin etiketka va katalogdan boshqa joyda deyarli ishlatilmaydi; rangga bog'lash yo'q.

---

## 13b. Loglar, superadmin va ko'p biznes

### Loglar: "nega bunday bo'lib qoldi?" degan savolga javob

Uch qavat, ikkitasi tayyor:

1. **Pul daftari** (tayyor) — har hisobning har o'zgarishi: qachon, qaysi hujjat, qancha, kim, o'sha paytdagi kurs. Yozuv o'zgarmaydi va o'chmaydi; xato bo'lsa teskari yozuv bilan tuzatiladi. Tovar daftari ham xuddi shunday.
2. **O'zgarishlar tarixi** (tayyor, "Tarix" sahifasi) — kim, qachon, nimani o'zgartirdi: eski va yangi qiymat, qaysi qurilmadan.
3. **Qo'shiladi:**
   - **Hisob tarixi sahifasi**: istalgan hisob (kassa, karta, hamkor) uchun har yozuv va undan keyingi qoldiq, hujjatiga o'tish bilan. "Balans nega bunday?" — shu sahifada yuqoridan pastga o'qiladi.
   - **Hujjat tarixi**: har hujjat ichida kim yaratdi, kim o'tkazdi, kim bekor qildi, kim tasdiqladi.
   - **Kirishlar tarixi**: kim, qachon, qaysi qurilma va manzildan kirdi; muvaffaqiyatsiz urinishlar.
   - **Tizim xatolari jurnali**: serverda chiqqan xato, qaysi so'rov, qaysi biznes — superadmin uchun.
   - **Tungi tekshiruv**: daftar yig'indisi nolga tengligi, hisob qoldig'i yozuvlar yig'indisiga tengligi, tovar qoldig'i harakatlar yig'indisiga tengligi. Farq chiqsa — superadminga xabar.

### Superadmin

Tizim egasining (sizning) alohida roli — biznesning ichida emas, hamma biznesning ustida:

- bizneslar ro'yxati: yaratish, bloklash, modullarni yoqish, tarif va to'lov muddati;
- har biznes bo'yicha: xodimlar soni, oxirgi faollik, baza hajmi, xatolar;
- **yordam uchun kirish**: biznes ichiga uning egasi ruxsati bilan kirish; har kirish biznesning o'z tarixida ham yoziladi (yashirincha kirib bo'lmaydi);
- tizim xatolari jurnali, tungi tekshiruv natijalari;
- yangilanish haqida hamma biznesga e'lon.

### Ko'p biznesga sotish

Tizim boshidan ko'p biznesga mo'ljallangan: har biznesning ma'lumoti bazada qat'iy ajratilgan (bir biznes boshqasini ko'ra olmaydi — bu testlar bilan tekshiriladi). 100 ta biznes uchun hech narsa qayta qurilmaydi.

**Subdomenmi yoki bitta manzilmi?** Tavsiya — **bitta manzil, login bilan ajratish** (`app.sizningdomen.uz`):

| | Bitta manzil | Har biznesga subdomen |
| --- | --- | --- |
| Yangi biznes ochish | bir zumda | DNS va sertifikat sozlash kerak (avtomatlashtirsa bo'ladi) |
| Xodim uchun | bitta manzilni eslaydi | o'z manzilini eslashi kerak |
| Do'kon agenti, botlar | bitta manzilga ulanadi | har biri o'ziga |
| Brend ko'rinishi | hamma uchun bir xil | `gulbahor.sizningdomen.uz` chiroyli ko'rinadi |

Subdomen — keyin qo'shsa bo'ladigan **bezak**: bitta manzil ishlab turaveradi, xohlagan biznesga `nomi.domen.uz` taxallus beriladi va u o'sha manzilga olib boradi. Shuning uchun hozir bitta manzil, subdomen — talab bo'lganda.

Sotish uchun kerak bo'ladiganlari (superadmin bilan birga): tarif va muddat, biznes o'zi ro'yxatdan o'tishi, sinov muddati, to'lov eslatmasi, zaxira nusxa va tiklash.

### Onlayn xodimlar va faol vaqt

- Tizim soketda ishlaydi (tayyor). Qo'shiladi: **kim hozir tizimda** — xodimlar ro'yxatida yashil nuqta, qaysi sahifada va qaysi do'konda.
- **Faol vaqt** faqat tab ochiq va **fokusda** bo'lganda sanaladi (boshqa tabga o'tsa yoki oynani yig'sa — to'xtaydi; shunchaki ochib qo'yish hisobga kirmaydi). Asosi tayyor: bildirishnoma uchun fokus kuzatuvi bor.
- Hisobot: har xodim kuniga necha soat faol bo'lgani, birinchi kirish va oxirgi faollik vaqti.
- Kim ko'radi: rahbar va ruxsati borlar (`users.activity`).

---

## 14. Ish tartibi

Birinchi do'konni Billz'dan o'tkazish uchun aka hozir ishlatayotgan narsalar birinchi turadi.

| № | Ish | Nima uchun shu o'rinda |
| --- | --- | --- |
| 1 | Kassa: to'lov alohida bo'limda, chek yonida; summani to'g'ridan-to'g'ri belgilash; minimal narx; dollar kelishilgan qiymat bilan | Kassa — har kun ishlatiladigan joy |
| 2 | Xarajat va kirim-chiqim, xarajat turlari; kartani do'konlarga biriktirish | Kunlik pul to'liq yuritilishi uchun |
| 3 | Menyu (ikki qavatli) | Yangi bo'limlar qo'shilishidan oldin |
| 4 | Kirimda har narx turiga ustun, "Oila" narxi, qo'shimcha xarajat ustunini yashirish | Kirim tayyor, kichik ish |
| 5 | Mijozlar: baza, guruh va teg, kassadagi eslatma va taqiqlar, sodiqlik pog'onalari, Billz'dan ko'chirish | Aka faol ishlatadi |
| 6 | Aksiyalar (uch turi), chegirmalar tartibi, promokod | Aka faol ishlatadi |
| 7 | Chek va etiketka dizayni | Logotipli chek kerak |
| 8 | Donalar ro'yxati, RFID inventarizatsiya, dona tarixi | Uskuna kelishi bilan |
| 9 | Dinamik valyuta va kurs sahifasi | Daftarga tegadi, alohida va ehtiyotkorlik bilan |
| 10 | Humo bot: karta to'lovini avtomatik tasdiqlash, aniqlanmagan pul | Bot xabarlari namunasi kerak |
| 11 | Hisobotlar, Balans, rahbarning Telegram boti, bildirishnomalar sozlamasi | Ma'lumot to'plangach |
| 12 | Tovar rasmlari | Katalog va kassa uchun; mustaqil ish, istalgan paytda |
| 13 | Ayirboshlash, komissiyali o'tkazma, hisoblar holati, hisob tarixi | 9-ish bilan birga yoki undan keyin |
| 14 | Superadmin, kirishlar tarixi, tungi tekshiruv, onlayn xodimlar va faol vaqt | Boshqa bizneslarga sotishdan oldin |
| 15 | Tarqatma (Telegram), telefonda narx tekshirish, chakana qarz, sovg'a kartasi | Keyinroq |

## 15. Savollar va javoblar

1. **Humo bot xabarlari namunasi** — javob (2026-10-05): cargo tizimida tayyor, o'sha yerdan olinadi (`cargo-server/src/card-feed/card-message.parser.ts` va uning testlari). Xabar ko'rinishi: sarlavha ("To'ldirish", "To'lov", "Naqd pul yechish"), ➕ yoki ➖ bilan summa ("375.000,00 UZS"), kimdan yoki qayerga, karta ("HUMOCARD *3073" — oxirgi 4 raqam), vaqt, kartadagi qoldiq. Yo'nalish belgidan (➕/➖) aniqlanadi.
2. **Tarqatma** — javob: hozircha Telegram botlar yetarli, SMS qurilmaydi.
3. **Narx turlarini kim qo'yadi va kim ishlatadi** — taklif (hammasi rolga bog'lanadi):
   - **Narx qo'yish** (chakana, ulgurji, oila — hammasi): `products.prices` ruxsati. Hozir ham shunday: kimda bu ruxsat bo'lsa, kirimda va "Narxlar"da narx qo'yadi. Standart rollarda: egasi, boshqaruvchi, do'kon menejeri.
   - **Narx turini yaratish va ustama qoidasi**: `pricing.manage` ruxsati — egasi va boshqaruvchi.
   - **Kassada qaysi narx turida sotish**: har narx turida "kassada kim tanlay oladi" belgisi bo'ladi: *hamma kassir* (chakana), *ruxsati borlar* (ulgurji — yangi `pos.wholesale` ruxsati), *faqat tasdiq bilan* (oila — kassir tanlaydi, rahbar PIN'i bilan tasdiqlaydi). Tasdiq mexanizmi tayyor (chegirmada ishlayapti).
   - Mijoz guruhiga narx turi biriktirilgan bo'lsa ("Oila" guruhi), o'sha mijoz tanlanganda narx o'zi shu turga o'tadi va chekda yoziladi.
4. **Dollarni kelishilgan qiymat bilan olishda chegara** — sozlamaga chiqarildi, boshlang'ich qiymati 2% (undan oshsa rahbar PIN'i). Odiljon aka boshqa foiz desa, Sozlamalar → Biznes bo'limida o'zgartiriladi.
