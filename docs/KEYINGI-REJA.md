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

Qilingan (2026-10-05): 1-band — kirimda har faol narx turining o'z maydoni bor (Chakana, Ulgurji, Minimal, "Oila" va qo'shilgan har qanday tur); bo'sh maydonda tizim taklifi xira ko'rinadi (ustama qoidasidan), `=` uni oladi. Kirim o'tkazilganda yozilgan narxlar tovarga qo'yiladi; yozilmagan narx turi o'zgarmaydi. 3-band — minimal narx kassada ishlaydi. 4-band — "qo'shimcha xarajat" maydoni yashirin, Sozlamalar → Biznes da yoqiladi (eski kirimda yozilgan bo'lsa, o'sha kirimda ko'rinaveradi). 5-band — kassada kelishilgan summa. 2-band (kassada narx turini tanlash) — navbatda.

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

Kassada narx turini tanlash (qilingan, 2026-10-05):
- Narx turi formasida (Ma'lumotnomalar → Narx turlari) ikki sozlama: **"Kassada"** — tanlanmaydi / hamma kassir tanlaydi / faqat ruxsati bor xodimlar / rahbar tasdig'i bilan; va **"Minimal narxdan past sotilishi mumkin"** ("Oila" kabi tur uchun). Chakana — kassaning o'z narxi, minimal narxda esa sotilmaydi: ularda bu sozlama yo'q.
- Kassada summa ustida **"Narx"** tanlagichi chiqadi (faqat shu xodim sota oladigan turlar bo'lsa). Tanlansa, savatdagi hamma narx o'sha turga o'tadi; shu turda narxi qo'yilmagan tovar chakana narxda qoladi. Qidiruv va skaner ham o'sha narxni ko'rsatadi. Chek tugagach kassa yana chakanaga qaytadi — maxsus narx keyingi mijozga o'tib ketmaydi.
- "Rahbar tasdig'i bilan" turi hamma kassirga ko'rinadi, sotishda rahbar PIN'i so'raladi; "ruxsati borlar" turi boshqalarga umuman ko'rinmaydi va PIN bilan ham ochilmaydi.
- Chekda va cheklar ro'yxatida qaysi narxda sotilgani ("Narx: Oila") va kim tasdiqlagani yoziladi; tarixda ham.
- Yangi ruxsat: **"Maxsus narx turida sotish (ulgurji, oila)"** — do'kon menejeri va boshqaruvchida bor, kassirda yo'q.
- Minimal narx va chegirma chegarasi maxsus narxda ham ishlaydi (minimal narx — faqat tur "past sotilishi mumkin" deb belgilanmagan bo'lsa).
- Hali yo'q: narx turini mijoz guruhiga bog'lash (mijozlar bo'lagida), "Sovg'a" amali, oylik chegara.

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
   - Qilingan (2026-10-05): **"Mijozlar" sahifasi** (menyuda alohida bo'lim). Mijoz telefon raqami bilan taniladi — bitta biznesda bitta raqam bitta mijoz. Maydonlar: telefon, ism, tug'ilgan kun, jins, izoh; qaysi do'konda qo'shilgani o'zi yoziladi. Ro'yxatda xaridlar summasi (qaytarilgani ayirilgan), cheklar soni, oxirgi xarid — cheklardan hisoblanadi, qo'lda yozilmaydi. Ustida to'rt ko'rsatkich: jami, shu hafta qo'shilgani, qaytmay qo'yganlar (90 kun), 7 kun ichida tug'ilgan kuni borlar (bosilsa ro'yxat shularga torayadi). Qidiruv ism yoki raqamning bir qismi bilan; Excel'ga chiqarish; arxivlash.
   - **Kassada**: summa ustida "Mijoz" maydoni (**Alt+M**): telefonning bir necha raqami yoki ism yoziladi, topilgani Enter bilan tanlanadi. Topilmasa — "Yangi mijoz qo'shish": yozilgan raqam tayyor turadi, faqat ism so'raladi. Chekda mijoz yoziladi ("Mijoz: …"), cheklar mijoz nomi bilan ham qidiriladi. Chek tugagach mijoz keyingi chekka o'tmaydi.
   - Ruxsatlar: "Mijozlar bazasini ko'rish" va "Qo'shish, tahrirlash va arxivlash" — do'kon menejeri va boshqaruvchida; hisobchi ko'radi. Kassir bazani ko'rmaydi, lekin kassada mijozni topadi va qo'shadi.
   - Hali yo'q: Billz'dan Excel orqali ko'chirish, mijoz kartasida cheklar tarixi, qarz.
2. **Guruh va teglar.** Mijoz bir nechta guruh va tegda bo'ladi. Guruhga: chegirma foizi, biriktirilgan narx turi (masalan "Oila").
3. **Kassadagi eslatma — Billz'dan yaxshiroq.** Guruhda ikki narsa bo'ladi:
   - **Eslatma matni** — mijoz tanlanganda kassada sariq yozuv bo'lib chiqadi ("Chek berish kerak").
   - **Taqiqlar** — belgilab qo'yiladi va tizim o'zi bajaradi: "qarzga berilmaydi", "otlojka qilinmaydi", "almashtirib berilmaydi". Billz'da bu faqat matn, kassir unutsa bo'ldi; bizda tizim o'zi to'xtatadi.
   - Qilingan (2026-10-05), 2- va 3-bandlar: **"Mijozlar → Guruhlar"**. Guruhda: nomi, **narxi** (narx turi — masalan "Oila"), **kassadagi eslatma**, **taqiqlar** (qarzga berilmaydi, tovar olib qo'yilmaydi, almashtirib berilmaydi). Mijoz bir nechta guruhda bo'ladi; **teglar** mijoz kartasida erkin yoziladi (qidiruvda va filtrda ishlaydi, qoida bermaydi).
   - Kassada mijoz tanlanganda: ismi yonida guruhlari, ostida **sariq eslatma** (chek tugaguncha ko'rinib turadi); guruhning narxi bo'lsa **savat o'zi shu narxga o'tadi** — kassir hech narsa tanlamaydi, ruxsat ham, rahbar PIN'i ham kerak emas (narx mijoz bilan keladi). Mijoz olib tashlansa, narx ham chakanaga qaytadi. Guruhga biriktirilgan narx turi "kassada tanlanmaydi" bo'lsa ham ishlaydi — ya'ni "Oila" narxini mijozsiz hech kim qo'ya olmaydi.
   - "Almashtirib berilmaydi" taqiqi ishlaydi: shunday guruh a'zosining chekida almashtirish boshlansa, kassa rahbar tasdig'ini so'raydi (pulini qaytarish taqiqlanmagan). "Qarzga berilmaydi" va "olib qo'yilmaydi" belgilari saqlanadi va qarz hamda otlojka qurilganda ishlay boshlaydi.
   - Bir nechta guruhda bo'lsa: eslatmalarning hammasi chiqadi, narx — birinchi guruhniki, taqiq — birortasida bo'lsa ham amal qiladi. Arxivlangan guruh qoida bermaydi.
   - Hali yo'q: guruh chegirmasi foizi (5c da, sodiqlik pog'onalari bilan birga — ikkalasi bitta "mijoz chegirmasi" mexanizmi).
4. **Sodiqlik dasturi.** Ikki tur, biznes birini tanlaydi: pog'onali chegirma (akaning hozirgisi) yoki keshbek (ball). Pog'onalar Billz'dagidek ko'chiriladi.
   - Qilingan (2026-10-05), pog'onali chegirma: **"Mijozlar → Sodiqlik dasturi"** — pog'onalar jadvali ("xaridlari shu summadan" → foiz), istalgancha qator. Mijozning xaridlari cheklardan o'zi hisoblanadi (qaytarilgani ayirilgan); yetgan pog'onasi **kassada o'zi qo'llanadi**. Guruhda ham **chegirma foizi** bor ("Xodimlar 15%"). Ikkalasi qo'shilmaydi — kattasi olinadi, chekda sababi yoziladi ("Mijoz chegirmasi · Sodiqlik 7%").
   - Kassada: mijoz tanlanishi bilan har qatordan uning foizi ayriladi va summa ostida alohida qator bo'lib ko'rinadi. Kassirning qo'l chegirmasi **undan keyin qolgan summadan** hisoblanadi va chegirma chegarasi (10%) faqat qo'l chegirmasiga qo'llanadi — mijoz chegirmasi kassir chegarasini yemaydi. Minimal narx yakuniy summa bo'yicha tekshirilaveradi.
   - Mijoz chegirmasi faqat chakana narxga qo'llanadi: savat maxsus narxda (ulgurji, "Oila") sotilsa, ustiga yana chegirma tushmaydi.
   - Server chegirmani o'zi hisoblaydi — kassa uni "unutib" yoki o'zgartirib yubora olmaydi (summa mos kelmasa chek rad etiladi).
   - **Akaning pog'onalarini kiritish kerak** (Billz'dagi kabi): 10 mln → 5%, 15 mln → 6%, 20 mln → 7%, 25 mln → 8%, 40 mln → 10%. Hozir jadval bo'sh — "Mijozlar → Sodiqlik dasturi" da besh qator.
   - Hali yo'q: keshbek (ball) turi; aksiyalar bilan "eng foydalisi" solishtiruvi (aksiyalar bo'lagida).
5. **Chakana qarz.** Qarzga sotish, muddat, qisman to'lash, muddati o'tganlar ro'yxati. Bu hamkor hisobining soddaroq ko'rinishi — asosi tayyor.
   - Qilingan (2026-10-05): kassaning to'lov bo'limida **"Qarzga"** qatori — mijoz tanlangan bo'lsa chiqadi. Chekning bir qismi yoki hammasi qarzga yoziladi, qolgani odatdagidek to'lanadi (naqd, dollar, karta, terminal). Summa yozilishi bilan ostida **to'lash muddati** chiqadi: standart — sozlamadagi "Qarz muddati" (30 kun), kassir sanani o'zgartira oladi. «=» — pul bilan yopilmay qolgan summani qarzga oladi. Qarz doim so'mda; har chekning o'z qarzi bor.
   - **Kim qarzga bera oladi.** Mijoz tanlangan bo'lsa — har kassir. Tizim uch holatda to'xtatib, rahbar tasdig'ini (PIN) so'raydi: mijozning guruhida "qarzga berilmaydi" taqiqi bor; mijozning muddati o'tgan qarzi bor; jami qarzi "Bir mijozga qarz chegarasi"dan oshadi (sozlamada; 0 — chegara yo'q). Sababi kassirga "Qarzga" qatori ostida oldindan aytiladi. `pos.debt` ruxsati bor xodim tasdiqsiz o'tadi.
   - **Qarzni to'lash.** Kassada mijoz tanlanganda uning qarzi ko'rinib turadi (muddati o'tgani qizil) va yonida "To'lov olish" tugmasi; "Mijozlar → Qarzlar" dan ham olinadi. Oyna hamkor to'lovi bilan bir xil: tayyor qatorlar, dollar kurs bilan, kassani tanlash. Pul qaysi chekka ketishi so'ralmaydi — **muddati eng yaqin qarz birinchi yopiladi**; qisman to'lash mumkin, qarzidan ko'p olinmaydi. Kassir naqd va kartaga oladi; seyf va bankka — `customers.debts` ruxsati bilan.
   - **Qaytarish.** Qarzga sotilgan chekdan tovar qaytsa, qiymati avval **shu chekning qarzidan ayriladi**; pul faqat to'langan qismi uchun qaytariladi. Qarziga to'lov tushgan chek bekor qilinmaydi (avval to'lov bekor qilinadi); to'lov tushmagan chek bekor qilinsa, qarzi ham bekor bo'ladi.
   - **"Mijozlar → Qarzlar"**: har qarz alohida qator (mijoz, chek, muddat, qarz, to'langan, qoldi, holati: muddatida / muddati o'tgan / yopilgan); ustida jami qarz, qarzdorlar soni va muddati o'tgan summa; filtr — qarzdorlar, muddati o'tgan, yopilgan, hammasi. **"Qarz to'lovlari"** — qabul qilingan to'lovlar (qaysi cheklarni yopgani bilan), bekor qilish mumkin (smenasi yopilmagan bo'lsa). Mijozlar ro'yxatida "Qarzi" ustuni.
   - Daftarda yangi ichki hisob — **"Mijozlar qarzi"**: qarzga sotilganda sotuv to'liq yoziladi, pul o'rniga shu hisob oshadi; to'lovda pul hisobi oshadi, u kamayadi. Smena hisobotida "Mijozlar qarzidan to'landi" qatori (kassaga tushgan pul sanoqda hisobga olinadi). Chekda "Qarzga" qatori va to'lash muddati chiqadi.
   - Hali yo'q: almashtirish chekini qarzga yozish; muddat yaqinlashganda eslatma (Telegram tarqatma bilan birga); mijoz kartasida qarz tarixi; mijoz bilan akt-sverka.

---

## 6. Marketing

1. **Aksiyalar.** Birinchi navbatda aka ishlatgan uchtasi: foizli chegirma, belgilangan narx, "1+1" (birini olsa ikkinchisi chegirmada). Keyin: N dona olinsa chegirma, chek summasi yetganda chegirma. Har aksiyada: nomi (kassada ko'rinadi), do'konlar, boshlanish va tugash vaqti (o'zi boshlanadi, o'zi tugaydi), tovarlar (kategoriya, brend, sezon yoki ro'yxat), faqat chakana narxgami, boshqa chegirmalar bilan qo'shiladimi.
2. **Promokod.** Aksiyaga bog'lanadi: "faqat kod aytilsa ishlaydi". Qaysi kanal (Instagram, bloger) qancha savdo olib kelganini ko'rsatadi.
   - Qilingan (2026-10-05), 1- va 2-bandlar (foizli chegirma, belgilangan narx, promokod): **"Aksiyalar"** sahifasi (menyuda alohida bo'lim). Aksiyada: nomi, turi (foiz yoki "har dona narxi"), boshlanish va tugash kuni (tugash kuni bo'sh bo'lsa to'xtatilguncha), do'konlar (bo'sh — hammasi), tovarlar doirasi (kategoriya — ichidagilari bilan, brend, sezon; bir nechta shart tanlansa hammasiga mos tovarlar; alohida tovarlar ro'yxati), promokod, "mijoz chegirmasi bilan qo'shiladi" belgisi.
   - Aksiya belgilangan kunda **o'zi boshlanadi va o'zi tugaydi**; holati ko'rinib turadi (kutilmoqda / ketmoqda / tugagan / to'xtatilgan). To'xtatish va davom ettirish bir tugma. Chekda ishlatilgan aksiya o'chirilmaydi — faqat to'xtatiladi.
   - **Kassada o'zi qo'llanadi**: tovar savatga tushishi bilan qator ostida aksiya nomi va ayrilgan summa ko'rinadi. Bitta tovarga bir nechta aksiya to'g'ri kelsa — eng foydalisi. Mijoz chegirmasi bilan **qo'shilmaydi**: har qatorga kattasi qo'llanadi (50% aksiya va 20% mijoz chegirmasi → 50%). "Qo'shiladi" belgilangan aksiyada ketma-ket: 1 000 000 → 50% → 500 000 → 20% → 400 000.
   - **Promokod**: kodli aksiya faqat kod aytilganda ishlaydi. Kassada "Promokod" maydoni shunday aksiya bor kunlardagina chiqadi; kod yozilgach kassa darhol "qabul qilindi: aksiya nomi" yoki "bunday promokod yo'q" deydi. Chekda promokod yoziladi.
   - Aksiya faqat chakana narxga qo'llanadi (ulgurji yoki "Oila" narxidagi savatga emas). Kassir qo'l chegirmasi aksiyadan keyin qolgan summadan hisoblanadi; minimal narx tekshiruvi yakuniy summa bo'yicha.
   - Ro'yxatda har aksiya **qancha chegirma bergani va nechta chekda ishlagani** ko'rinadi (samaradorlik hisobotining boshlanishi).
   - Qilingan (2026-10-05): **"1+1: ikkinchisiga chegirma"** — aksiyadagi tovarlardan har ikki donaning arzonrog'iga foiz (100% — tekin); donalar qimmatidan boshlab juftlanadi, toq qolgani o'z narxida. **"Bir nechta olinsa chegirma"** — aksiyadagi tovarlardan N dona yoki ko'proq olinsa, hammasiga foiz. Ikkalasi butun savat bo'yicha hisoblanadi va boshqa aksiyalar hamda mijoz chegirmasi bilan o'sha "har qatorga eng foydalisi" qoidasida turadi.
   - Hali yo'q: chek summasi yetganda chegirma; o'tgan davr bilan solishtirish hisoboti.
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

### Pul oynasida kassani tanlash, asosiy kassa (2026-10-05, foydalanuvchi savoli)

Savol: do'kon va kassa ko'payganda "To'lov olish / berish" va "Xarajat" oynasida har kassa alohida qator bo'lib chiqaveradimi? Kassani (yoki do'konni) tanlaydigan qilsak, asosiy kassa standart turadigan bo'lsa-chi?

Qaror:
- Oynaning tepasida bitta **"Kassa"** tanlovi (do'koni bilan: "Gulbahor 1 · Kassa 1"). Tanlangan kassaning so'm va dollar tortmasi qator bo'lib turadi; boshqa kassalarning tortmalari ko'rinmaydi. Karta, terminal, seyf, bank avvalgidek "Yana hisob…" bilan qo'shiladi va shu kompyuterda eslab qolinadi.
- Xodim faqat o'zi ishlaydigan do'konlarning kassalarini ko'radi. Tanlaydigan kassa bitta bo'lsa, tanlov ko'rinmaydi.
- Standart tanlov, shu tartibda: shu kompyuter sotayotgan kassa → xodimning smenasi ochiq kassa → shu kompyuterda oxirgi tanlangani → do'konning asosiy kassasi (smenasi ochig'i oldin) → birinchisi.
- **Asosiy kassa** — har do'konda bitta. Do'konning birinchi kassasi o'zi asosiy bo'ladi; "Pul → Kassalar"da boshqasini asosiy qilish mumkin. Asosiy kassa arxivlansa, asosiylik do'konning boshqa faol kassasiga o'tadi.
- Smenasi yopiq kassaning naqdi avvalgidek o'chiq turadi (pul faqat ochiq smenada yuradi).

Qilingan (2026-10-05): yuqoridagi qarorning hammasi. "To'lov olish / berish" (Alt+K, Alt+C) va "Xarajat" (Alt+X) oynalarida "Kassa" tanlovi (ikki va undan ko'p kassa bo'lsa ko'rinadi; kassalar bir nechta do'konda bo'lsa do'kon nomi bilan; smenasi yopig'i yonida "smena yopiq"). "Pul → Kassalar"da asosiy kassa "Asosiy" belgisi bilan, qator menyusida "Asosiy kassa qilish". Eslatma: kassaning naqd hisoblari birinchi smena ochilganda paydo bo'ladi, shuning uchun hali bir marta ham ochilmagan kassa tanlovda chiqmaydi.

### Juft maydon, pul joylarining nomi, "Pul holati" (2026-10-06)

Foydalanuvchi shikoyati: "100 $ ni 11 800 lik kursda 1 200 000 so'm deb qabul qil" deganda oyna dollar maydonini ham, so'm maydonini ham qayta yozib yuborardi. Eski ERP dasturi (`docs/ERP-TAHLIL.md`) shu joyda to'g'ri ishlaydi; undan qoida olindi, kamchiligi (kurs farqi yozilmasligi) tuzatildi.

Qoida (hamkor to'lovi, xarajat va kirim, mijoz qarzi to'lovi — uchalasida bir xil):
- Har qatorda ikki summa: **pul** (kassaga kirgan yoki chiqqan, o'z valyutasida) va **yopiladigan summa** (hamkor hisobidan, uning valyutasida).
- **Pul — langar.** Pul yozilsa, yopiladigan summa kun kursidan taklif bo'lib chiqadi. Yopiladigan summa ustidan yozilsa — bu **kelishilgan summa**: pul maydoniga tegilmaydi, ikkalasi ham turadi. Pul bo'sh bo'lsa-yu yopiladigan summa yozilsa, pul kun kursidan chiqariladi.
- Kurs ustunida **doim kun kursi** turadi. Kelishilgan summadan chiqqan kurs qator ostida so'z bilan aytiladi: "Kelishilgan kurs 12 000, kun kursi 11 800 (1,7% farq): 20 000 so'm zararimizga".
- **Hisob aniq:** pul hisobi doim kun kursida baholanadi, hamkor hisobi kelishilgan summaga suriladi, farq "Kurs farqi" hisobiga tushadi va har qatorda saqlanadi (kim yutgani ko'rinadi: + biznes foydasi, − zarari).
- Kun kursidan sozlamadagi chegaradan (2%) ko'p uzoqlashgan summani faqat kurs qo'yish ruxsati bor xodim yoza oladi.

Pul joylarining nomi (hamma to'lov oynasida):
- Kassa tortmasi: **"So'm naqd"**, **"Dollar naqd"** — qaysi kassa ekani tepada tanlanadi; kassa maydoni bitta kassa bo'lsa ham ko'rinadi.
- Karta: **"So'm karta (9860 1234 5678 9012)"**, **"Dollar karta (4000 …)"** — to'liq raqami bilan. Karta raqami hisob formasida kiritiladi (biznesda takrorlanmaydi); karta dollarda ham bo'lishi mumkin (Visa). Kassada sotuvga faqat so'm kartasi chiqadi.
- "So'm naqd (seyf yoki qo'ldagi pul nomi)", "So'm bank (nomi)", "Terminal (nomi)".

**"Pul holati"** ("Pul → Pul holati", balans ko'radiganlarga): har valyuta alohida; ichida **naqd** (kassa tortmalari, seyf) va **naqdsiz** (har karta raqami bilan, terminal, bank); **yo'lda** — yuborilgan, hali qabul qilinmagan o'tkazmalar; tepada har valyutaning jami va hammasining kun kursidagi so'm qiymati. Butun biznes yoki bitta do'kon bo'yicha (bir nechta do'konga xizmat qiladigan joy "umumiy" belgisi bilan). Shu sahifadan "Pul o'tkazish" ochiladi — bir xil valyutadagi istalgan ikki joy orasida, kartadan kartaga ham.

Menyu: bo'limlar akkordeon — bir vaqtda bittasi ochiq turadi.

---

## 8. Valyuta

### Hozir

Biznesning o'z puli — so'm va dollar. Kirim hujjati istalgan xarid valyutasida (yuan, lira, som…) bo'ladi, lekin hisoblar va hamkor hisobi faqat so'm yoki dollarda.

### Taklif: dinamik valyuta, dollar orqali

(Dastlabki taklif, 2026-10-05. O'zgargan joylari — pastdagi "Yakuniy qarorlar"da: ko'prik sozlamasi yo'q, asosiy valyuta tanlanadi.)

1. **Valyutalar ro'yxati.** Rahbar kerakli valyutani yoqadi (yuan, yevro, rubl…). So'm va dollar doim bor.
2. **Hamma kurs dollarga nisbatan kiritiladi:** "1 $ = 12 100 so'm", "1 $ = 7,1 yuan", "1 $ = 0,92 yevro". Sabab:
   - bozorda ham shunday aytiladi (yuan ham, lira ham dollarga nisbatan);
   - kirim hujjatida hozir ham shunday;
   - har valyutani har biriga kiritish shart emas: 5 ta valyuta uchun 10 ta juftlik o'rniga 4 ta son.
3. **Qolgan juftliklarni tizim o'zi chiqaradi:** yuan → so'm = 12 100 / 7,1. Kerak bo'lsa bir martalik kurs to'lovning o'zida yoziladi.
4. **Daftar so'mda yuritiladi** (hozirgidek): har yozuvning so'mdagi qiymati o'sha kungi kurs bilan qotadi. Shuning uchun eski hujjatlar kurs o'zgarsa ham o'zgarmaydi.
5. **Hisob istalgan yoqilgan valyutada** bo'lishi mumkin: yuan seyfi, yuanda hisob yuritadigan yetkazib beruvchi.
6. **Sotuv valyutasi** — biznes sozlamasi: so'm yoki dollar. Dollarda ishlaydigan do'konda kassa narxni dollarda ko'rsatadi.

### Yakuniy qarorlar (2026-10-06, foydalanuvchi bilan kelishilgan)

Yuqoridagi dastlabki taklifdan farq qiladigan joylarda shu bo'lim ustun.

**Valyutalar ro'yxati.** Katalog kodda turadi (enum kabi): so'm, dollar, yevro, yuan, rubl, tenge, qirg'iz somi, somoni, Turkmaniston va Ozarbayjon manati, lari, Belarus rubli, grivna, lira, dirham, funt. Qo'lda valyuta yaratilmaydi; yangisi katalogga bitta qator bilan qo'shiladi. Biznes keraklisini yoqadi. Ishlatilmagan valyuta olib tashlanadi; ishlatilgani faqat **o'chirib qo'yiladi**, sharti — shu valyutadagi hamma joy bo'sh va hamkorlarda qarz yo'q.

**Asosiy valyuta.** Bitta va majburiy: daftar, foyda va hisobotlar shunda yuritiladi. Qoida: do'kon narxni qaysi valyutada qo'ysa va foydani qaysi valyutada sanasa, o'sha asosiy (O'zbekistonda so'm yoki dollar, Qozog'istonda tenge). Yangi biznes dollar bilan ochiladi; **birinchi pul yozuvigacha** (kirim, sotuv, to'lov, boshlang'ich qoldiq) o'zgartirsa bo'ladi; birinchi pul amali oldidan tizim bir marta so'raydi ("Hisob valyutasi: … To'g'rimi? Keyin o'zgartirib bo'lmaydi"); keyin qulflanadi. Pul yozuvlaridan keyin almashtirish hozir qurilmaydi; kerak bo'lsa "shu kundan boshlab" usulida alohida ish bo'ladi (hamma qoldiq o'sha kun kursida o'tadi, tarix eski valyutada qoladi). Valyuta nomini "tahrirlab" boshqa valyuta qilib ko'rsatish — yo'q: tizim o'zi haqida noto'g'ri ma'lumot saqlab qoladi.

**"Ko'prik" degan sozlama yo'q.** Har valyutaga bitta kurs — "Pul → Kurslar" sahifasida bitta qator. Dollar bor biznesda yangi valyuta standart holatda **dollar bilan nisbatda** ochiladi ("1 $ = 7,25 ¥"; yevro va funt — "1 € = 1,08 $"): dollar kursi yangilansa, u o'zi ergashadi. Dollar ishlatilmaydigan biznesda — to'g'ridan-to'g'ri asosiy valyutada ("1 ₽ = 135 so'm"). Yozilish shakli qatorning menyusidan almashtiriladi; bu valyutaning o'z tanlovi, biznes sozlamasi emas. Asosiy valyutada kiritish majburiy bo'lgan yagona kurs — boshqalar bog'langan valyutaniki (dollarniki). Kurs "1 X = N Y" bo'lib, ikkala valyutasi bilan saqlanadi; qiymat zanjir bo'ylab asosiygacha hisoblanadi; aylana rad etiladi.

**Hisob aniqligi.**
- Ikki kursdan chiqqan yaxlit kurs ("1 ¥ ≈ 1 745 so'm") faqat ko'rsatiladi; hisob kiritilgan sonlardan bitta amalda qilinadi va oxirida bir marta yaxlitlanadi. Qolgan tiyin yoki sent "Kurs farqi"ga yoziladi.
- Kurs kiritilmagan valyutada amal bajarilmaydi va qaysi kurs yetishmasligi aytiladi. Hech qachon 1:1 deb olinmaydi.
- Kurs oxirgi kiritilganidan keyingisi kiritilguncha ishlaydi; uzoq yangilanmasa ogohlantiradi, to'xtatmaydi.
- Oldingisidan keskin farq qiladigan kurs (xato terish: 12 650 o'rniga 1 265) tasdiq so'raydi.

**Hamkor va mijoz.** (2026-10-06 dagi 16-bo'lim bilan **bekor qilingan**: hammasi bitta "Mijozlar", bitta odam — bitta hisob.)
- Ular alohida qoladi: hamkor — hisob-kitob yuritiladigan (yetkazib beruvchi, ulgurji xaridor; bitta yuruvchi hisob), mijoz — chakana xaridor (chegirma, sodiqlik, chek bo'yicha qarz). To'liq birlashtirish xavfi yuqori, foydasi kichik.
- Bitta hamkor — bitta valyuta (istalgan yoqilgan valyuta). Ko'p valyutali hamkor qilinmaydi: kerak bo'lsa ikkinchi yozuv ochiladi ("Elaris ($)", "Elaris (so'm)"). Chakana mijoz qarzi faqat asosiy valyutada.
- **Kassada hamkor ham tanlanadi**: "Mijoz" maydoni hamkorni ham topadi, sotuv uning hisobiga yoziladi. Chek asosiy valyutada; hisobiga uning valyutasida tushadi (kun kursida yoki kelishilgan summa bilan, juft maydon qoidasi); chegirmadan keyingi summa yoziladi; qaytarishda o'sha sotuvda yozilgan summa ayriladi. Alohida ruxsat; kassirga hamkor qoldig'i ko'rsatilmaydi.
- Hamkor kassadan pul olsa — bu "Hamkorga to'lov berish" (tayyor): mijoz qilib ochish kerak emas.

**Terminal nima va bank hisobidan nimasi bilan farq qiladi.** Bank hisobi — pul bankda turadigan joy. Terminal — kassadagi karta apparati: pul bank hisobiga keyinroq va komissiyasi ushlangan holda tushadi. Shuning uchun terminal alohida yuritiladi: smena yopilishida o'z yakuniy cheki bilan solishtiriladi; qoldig'i — "bankka tushishi kutilayotgan pul". Hozirgi kamchilik: terminaldan bankka tushim yozilmaydi (6-bosqich).

### Valyuta va hamkor ishining bosqichlari

Har bosqich o'zi tugallangan, testlari bilan. Gulbahor uchun 1–4 yetarli; 5 — tizimni boshqa asosiy valyutali bizneslarga ochish.

| № | Bosqich | Nima qilinadi | Daftarga tegadimi |
| --- | --- | --- | --- |
| 1 | Valyutalar va kurslar | Katalog; yoqish va o'chirib qo'yish; har valyutaga kurs va uning yozilish shakli; kurs tarixi; zanjirli hisob; keskin farqda tasdiq (dollar kursida ham); "Pul → Kurslar" ekrani | Yo'q |
| 2 | Pul joylari istalgan valyutada | Naqd (seyf yoki qo'lda), karta, bank hisobi yoqilgan har valyutada; "Yuan naqd", "Yuan karta (raqami)"; "Pul holati" va o'tkazma yangi valyutalar bilan | Ha |
| 3 | Hamkor | Hisob istalgan yoqilgan valyutada; to'lovda juft maydon ixtiyoriy ikki valyuta orasida; kirim qarzi o'z valyutasida; **kassadan hamkorga sotuv**; hamkorga narx turi (ulgurji); **yetkazib beruvchiga tovar qaytarish** hujjati | Ha |
| 4 | Ayirboshlash va komissiya | so'm → dollar → yuan hujjati (ikkala summa yoziladi, kurs farqi qayd etiladi); o'tkazmada komissiya | Ha |
| 5 | Asosiy valyutani tanlash | Koddagi "so'm va dollar" → "asosiy va ikkinchi valyuta" (kassa, narx, daftar, hisobotlar); yangi biznes dollar bilan ochiladi, birinchi pul amaligacha o'zgaradi, keyin qulf; testlardagi ikkinchi biznes tenge asosli | Ha, eng kattasi |
| 6 | Terminal → bank tushumi | Terminal qaysi bank hisobiga tushishi; "Bankka tushdi" amali, komissiya xarajatga | Ha |
| 7 | Kurs farqi hisoboti | Kursdan yutilgan va yo'qotilgan (kelishilgan summalar, ayirboshlash); qo'ldagi valyutaning bugungi qiymati | Yo'q |

Faqat so'ralsa: kassada boshqa valyutani qabul qilish; Markaziy bank kursini maslahat sifatida ko'rsatish; hamkorga ikkinchi hisob; hamkor va mijozlarni bitta ekranda ko'rsatadigan umumiy ro'yxat; asosiy valyutani "shu kundan boshlab" almashtirish.

### 1-bosqich qanday qurildi (2026-10-06)

- **Katalog** — 16 ta valyuta (`core/money.ts` dagi `CURRENCIES`). Kirim hujjati ham shu ro'yxatdan oladi.
- **"Pul → Kurslar"**: asosiy valyuta tepada (kursi yo'q); dollar — kassalar ishlatadigan kurs, hozirgidek har kuni kiritiladi; pastida yoqilgan har valyuta bitta qator: "1 $ = [7,25] ¥" va yonida tizim hisoblagan "1 ¥ ≈ 1 744,83 so'm". Qator ostida kim va qachon kiritgani; kursi yo'q bo'lsa — "bu valyutada amal bajarilmaydi"; bog'langan valyutaning kursi yo'q bo'lsa — qaysi biri yetishmasligi; uzoq yangilanmagan bo'lsa — ogohlantirish.
- **Valyuta qo'shish** — sahifa pastidagi qidiruvli maydon ("lira" deb yozsa topadi). Qator menyusi: kurs qanday yozilishi (to'rt shakl), o'chirib qo'yish. Kurslar tarixi ekranda hozircha yo'q (foydalanuvchi qarori, 2026-10-06: keyin qo'shiladi; kurslar bazada kuni bilan saqlanib boradi). O'chirib qo'yilgan valyutaning kurslari saqlanadi; unga boshqa valyuta bog'langan yoki unda pul turgan bo'lsa, o'chirib qo'yilmaydi.
- **Keskin farq**: oldingisidan 15% dan ko'p farq qiladigan kurs (dollarniki ham) tasdiq so'raydi: "Kurs oldingisidan 90% farq qiladi: 12 650 → 1 265. Shu kurs qo'yilsinmi?".
- Ruxsatlar: valyutani yoqish va o'chirib qo'yish — "Kassa va hisoblarni boshqarish", kurs — "Kurs qo'yish".
- Hali hech bir hisob yoki hamkor bu valyutalarda ochilmaydi: bu 2- va 3-bosqich.

### 2-bosqich qanday qurildi (2026-10-06)

- **Hisob istalgan yoqilgan valyutada.** "Pul → Hisoblar → Hisob qo'shish"dagi valyuta ro'yxati — biznes yoqqan valyutalar (so'm, dollar, yuan…). Naqd (seyf yoki qo'ldagi pul), karta va bank hisobi istalgan valyutada ochiladi; terminal faqat asosiy valyutada; kassada sotuvga faqat asosiy valyutadagi karta chiqadi. Yoqilmagan valyutada hisob ochilmaydi.
- **Nomlari**: "Yuan naqd (Yuan seyfi)", "Yuan karta (6200 …)", "Yuan bank (…)". Hisob turi endi shunchaki "Naqd" deb nomlanadi (avval "Naqd (seyf yoki qo'lda)").
- **"Pul holati"**: har valyutaga o'z bloki; "Hammasi so'mda" — hamma valyuta kun kurslarida; biror valyutaning kursi yo'q bo'lsa jami ko'rsatilmaydi (teshigi bor yig'indi — yig'indi emas).
- **Pul kirishi va chiqishi.** Xarajat va boshqa kirim, hamkor to'lovi, mijoz qarzi to'lovi — uchala oynada yuan hisobi oddiy qator bo'lib chiqadi. Qiymat zanjirli kursdan, bitta amalda hisoblanadi (1 000 ¥ = 1 744 827,59 so'm). Kelishilgan summa qoidasi o'sha: pul — langar, farq "Kurs farqi"ga. Dollar hisobli hamkorga yuanda to'lash mumkin ("7 300 ¥ ni 1 000 $ deb": "Kelishilgan kurs 7,3, kun kursi 7,25 (0,7% farq): 87 241,38 so'm zararimizga"). Kurs ustunida shu juftlikning o'z kursi turadi ("7,25"; ustiga borilsa "1 $ = 7,25 ¥").
- **O'tkazma** — bir xil valyutadagi ikki joy orasida (yuan seyfidan yuan kartasiga). Boshqa valyutadagi joyga o'tkazma rad etiladi: bu ayirboshlash (4-bosqich).
- **Kurs yo'q bo'lsa** amal rad etiladi va qaysi kurs yetishmasligi aytiladi ("Xitoy yuani kursi qo'yilmagan" yoki "Dollar kursi qo'yilmagan").
- Pul turgan valyutani o'chirib qo'yib bo'lmaydi.
- Hamkor hisobi hali so'm yoki dollarda (3-bosqich).

### Ayirboshlash qanday qurildi (V4, 2026-10-06)

- **O'tkazma oynasi** ("Pul → O'tkazmalar → Pul o'tkazish"): "Qayerga" ro'yxatida endi boshqa valyutadagi joylar ham bor. Valyuta bir xil bo'lsa — avvalgidek bitta "Summa". Boshqa bo'lsa — ikkita: "Chiqadi (So'm)" va "Kiradi (Dollar)", ostida kun kursi ("Kun kursi: 1 $ = 12 850 so'm").
- **Juft qoida** to'lov oynasidagi bilan bir xil: "Chiqadi" yozilsa, "Kiradi" kun kursidan chiqadi; "Kiradi" ustidan yozilsa — kelishilgan summa, "Chiqadi"ga tegilmaydi va ostida "Kelishilgan kurs 12 820,51, kun kursi 12 850 (0,2% farq): 2 300 so'm foydamizga" (yoki "zararimizga") yoziladi; "Chiqadi" bo'sh turib "Kiradi" yozilsa, "Chiqadi" kursdan chiqadi.
- **Chegara**: kun kursidan sozlamadagi foizdan (2%) uzoq kelishuvni faqat kurs qo'yish ruxsati bor xodim saqlaydi; boshqalarga izoh qizil va "kurs qo'yish ruxsati kerak".
- **Kurs yuborilganda qotadi**: qabul qiluvchi kursni emas, aniq summani tasdiqlaydi. Qabul qilinganda kurs farqi "Kurs farqi" hisobiga yoziladi; rad etilsa yoki qaytarib olinsa pul joyiga aynan qaytadi, hech qanday farq yozilmaydi.
- **Kassada "Inkassatsiya"**: seyf tanlovida do'konning boshqa valyutadagi seyflari ham bor (masalan, so'm tortmasidan dollar seyfiga); tanlansa — xuddi shu juft maydon. Smena yopilishidagi topshirish o'z valyutasida qoladi.
- Ro'yxatda, kassadagi kutilayotgan pullarda va "Pul holati"dagi "yo'lda" qatorida ayirboshlash "1 000 $ → 7 250 ¥" deb ko'rinadi. Excel'ga kirgan summa va valyuta ham chiqadi.
- Komissiya keyin.

### 3-bosqich qanday qurildi (2026-10-06, bulut sessiyasi)

- **B1. Hamkor hisobi istalgan valyutada.** Hamkor formasidagi "Valyuta" ro'yxati — biznes yoqqan valyutalar (so'm, dollar, yuan…). Yoqilmagan valyutada hamkor ochilmaydi. Boshlang'ich qoldiq kun kurslari zanjiri bilan baholanadi; valyutaning kursi yo'q bo'lsa rad etiladi va qaysi kurs yetishmasligi aytiladi. To'lov oynasi o'zgarmadi: yuan hisobli hamkorga so'm, dollar yoki yuanda to'lanadi, har qator yuanni yopadi.
- **B2. Kirimdan qarz o'z valyutasida.** Yuan hisobli yetkazib beruvchiga yuanda yozilgan kirim aynan o'sha summani qarz qiladi (kurs nima bo'lishidan qat'i nazar). Dollar yoki so'm hisobli hamkorga — kirimning o'z kurslari bilan (avvalgidek). Kirim boshqa valyutada (masalan, lira) va hamkor yuanda bo'lsa — kirimdagi dollar summasi kirim kunining kursi bilan yuanga o'tadi; kurs yo'q bo'lsa kirim o'tkazilmaydi. Kirim bekor qilinsa, aynan yozilgan summa qaytadi.

- **B3. Kassadan hamkorga sotuv.** Kassadagi "Mijoz" maydoniga hamkor nomi yozilsa, u mijozlardan keyin "hamkor · USD" belgisi bilan chiqadi; tanlansa, mijoz qoidalari (sodiqlik, guruh chegirmasi) qo'llanmaydi. To'lov bo'limida "Hisobiga · Elaris" qatori (summalardan alohida, «=» qolganini oladi): chekning shu qismi hamkor hisobiga yoziladi. Hamkor boshqa valyutada bo'lsa, ostida ikkinchi maydon: "Hisobiga (USD)" — kun kursida chiqadi, ustidan yozilsa kelishilgan summa, izoh bilan. Ruxsat — "Hamkorga uning hisobiga sotish" (kassirda yo'q: rahbar PIN'i so'raladi; do'kon menejerida bor). Kelishilgan summa kun kursidan 2% dan uzoq bo'lsa, chegirma kabi tasdiq kerak. Chekda "Hamkor: Elaris" va "Hamkor hisobiga: 1 265 000 so'm (100,00 $)". Smena hisobotida alohida qator; naqd sanog'iga aralashmaydi. Qaytarishda hamkor hisobidan o'sha sotuvda yozilgan summaning ulushi ayiriladi (bugungi kurs emas). Hisob-kitobda "Kassadan sotuv CH-…" va "Tovar qaytarildi" qatorlari.

- **B4. Hamkorga narx turi.** Hamkor formasida "Narx" maydoni (chakana yoki biznesning kassa narx turlari: ulgurji va boshqalar; minimal narx emas). Kassada shu hamkor tanlansa, savat o'zi o'sha narxga o'tadi — kassirdan ruxsat ham, rahbar PIN'i ham so'ralmaydi (mijoz guruhining narxi kabi).

- **B5. Yetkazib beruvchiga tovar qaytarish.** "Sklad → Yetkazib beruvchiga qaytarish" (YQ-…): joy, sana va **kirim** tanlanadi (o'tkazilgan kirimlar, yonida yetkazib beruvchi), tovarlar odatdagidek qo'shiladi. Tasdiqlanganda tovar faqat shu kirim partiyalaridan chiqadi (boshqa kirimdan kelgan xuddi shu tovarga tegilmaydi); kirimda yo'q tovar yoki shu kirimdan qolganidan ko'p miqdor rad etiladi. Yetkazib beruvchiga qarzimiz kirim narxida, uning hisobi valyutasida kamayadi (yuan kirimi — aynan yuan summasi) va hujjatda "… hisobidan qarzimiz kamaydi: 90,00 $" ko'rinadi; hamkorning hisob-kitobida "Tovar qaytarildi" qatori. Bekor qilinsa tovar ham, qarz ham aynan qaytadi. Ruxsatlar: "Yetkazib beruvchiga qaytarish" guruhi (ko'rish, qoralama, tasdiqlash); sklad mudiri qoralama tuzadi, boshqaruvchi tasdiqlaydi.

### 5-bosqich rejasi: asosiy valyutani tanlash (2026-10-08, foydalanuvchi "boshla" dedi)

**Hozirgi holat (kodda o'lchandi).** Kod ikki rol bilan yozilgan: "so'm" amalda **asosiy valyuta** (daftar, narx, chek, hisobot), "dollar" — **tayanch valyuta** (tannarx dollarda ham yuritiladi, kirimdagi `usdRate`, kassadagi dollar tortmasi, kunlik `uzsPerUsd`). Qattiq yozilgan `'UZS'`: core ~25, server ~30, web ~95 joy; interfeysda ~15 ta "so'm" so'zi; `uzs`/`usd` nomli maydon va ustunlar ~1 500 ta. Bazada faqat uchta cheklov qolgan: `organizations.base_currency`, `price_types.currency`, `prices.currency` (`IN ('UZS','USD')`).

**Qarorlar (ish boshida qabul qilindi).**
1. **Ikki rol qoladi: asosiy valyuta (katalogdagi 16 tadan istalgani) va dollar.** Hozir "so'm" deb yozilgan hamma joy asosiy valyuta bo'ladi, "dollar" dollarligicha qoladi. Shuning uchun daftar, tannarx (`cost_uzs` — asosiyda, `cost_usd` — dollarda), kirim kurslari (`uzsRate` — 1 $ necha asosiy) va kassa mantig'i o'z joyida ishlayveradi.
2. **Asosiy valyuta dollar bo'lsa, ikkinchi rol yo'qoladi**: dollar tortmasi, dollar kursi va "Dollar bilan ishlash" moduli kerak emas (tannarxning ikki ustuni bir xil). Bunday biznes kassasida boshqa valyuta (masalan, so'm) qabul qilish — kelishilgandek, faqat so'ralsa.
3. **Kassa qabul qiladigan valyuta** — asosiy va (u dollar bo'lmasa va modul yoqilgan bo'lsa) dollar. Narx turi ham shu ikkisidan birida. Server boshqasini rad etadi.
4. **Qulf payti** — birinchi pul yozuvi (daftar) yoki qiymatli tovar harakati (o'tkazilgan kirim, inventarizatsiya ortig'i). Ungacha "Sozlamalar → Biznes"da almashtiriladi, keyin faqat ko'rsatiladi (nima uchun qulflangani bilan).
5. **"Bir marta so'rash"** — biznes ochilayotganda: yangi biznes formasida "Hisob valyutasi" maydoni (standart — dollar) va ostida "birinchi pul yozuvidan keyin o'zgarmaydi". Har pul amali oldidan alohida oyna chiqarilmaydi: qulf qoidasi va ochilishdagi tanlov shu vazifani bajaradi.
6. **Almashtirilganda** eski asosiy valyutadagi narx turlari va narxlar yangisiga o'tadi (ikki valyuta orasidagi kurs bilan; narx bo'lmasa kurs kerak emas, kurs yo'q bo'lsa almashtirish rad etiladi va qaysi kurs yetishmasligi aytiladi); summa ko'rinishidagi sozlamalar (qaytim qadami, qarz chegarasi, yaxlitlash qadami) yangi valyutaning odatiy qiymatiga qaytadi. Dollar kursi qatorlari: yangi asosiy dollar bo'lsa, ular eski valyutaning dollarga nisbatan kursiga aylanadi ("1 $ = 12 650 so'm" o'z holicha), eski valyuta yoqilgan valyutalar qatoriga o'tadi.
7. **Bazadagi ustun nomlari o'zgarmaydi** (`cost_uzs`, `change_uzs`, `uzs_per_usd` — "asosiy valyutada" degani; `CLAUDE.md` da yoziladi). Kod ichidagi nomlarni almashtirish — oxirgi, ixtiyoriy bo'lak, faqat qolgani yashil bo'lgandan keyin.

**Bo'laklar.**
- **5a. Asos (core va baza).** Uchta cheklov `~ '^[A-Z]{3}$'` ga; core'dagi kassa, kirim va juft hisob funksiyalari "UZS" o'rniga asosiy valyutani oladi (`toBase`, `settle`, `convert`, `costReceipt`, `ratesOf`, `accountInputSchema` va boshqalar); kiruvchi sxemalardagi `default('UZS')` olib tashlanadi — server asosiy valyutani o'zi qo'yadi. Core testlari tenge va dollar asosli misollar bilan.
- **5b. Server.** Har `'UZS'` → biznesning asosiy valyutasi: tizim hisoblari, kassa tortmalari va ularning nomi, kassa konteksti, sotuv va qaytarish, smena hisoboti, narxlar, kirim, hisobotlar, boshlang'ich narx turlari, mijoz qarzi. Dollar asosli biznesda dollar roli o'chadi. Yangi `base-currency.spec.ts`: tenge asosli biznes (dollar bilan) va dollar asosli biznes — kirim, sotuv (aralash to'lov, qaytim), qaytarish, hamkor to'lovi, o'tkazma, smena hisoboti, savdo hisoboti.
- **5c. Veb.** `'UZS'` → `me.org.baseCurrency`; "so'm" so'zlari valyuta nomi bilan ("Naqd {{valyuta}}", "{{valyuta}}da hisoblanadi"); kassadagi qatorlar, kirim, narxlar, hisobotlar, chek.
- **5d. Tanlash.** `PUT /org/base-currency` (biznes egasi), qulf qoidasi, narx va sozlamalarni o'tkazish; "Sozlamalar → Biznes"da maydon; yangi biznes formasida tanlov, standart — dollar.
- **5e. Tekshiruv.** To'liq testlar; ekranda tenge va dollar asosli biznes (alohida server, test bazasida); hujjatlar.
- **5f (ixtiyoriy).** Kod ichidagi `uzs`/`Uzs` nomlarini `base`ga almashtirish.

### 5-bosqich qanday qurildi (2026-10-08)

- **Ikki rol.** Biznesning asosiy valyutasi katalogdagi 16 tadan istalgani; "dollar" doim dollar. Kassa va narx faqat shu ikkisida; asosiy valyuta dollar bo'lsa, dollar roli yo'q (tortma, kurs, "Dollar bilan ishlash" moduli — hech biri). Bazadagi `…_uzs` ustunlar va kod ichidagi `uzs`/`Uzs` nomlari "asosiy valyutada" degani (o'zgartirilmadi, 5f).
- **Server** asosiy valyutani `Actor.base` dan oladi (`ActorService` sessiya bilan birga o'qiydi, valyuta almashtirilganda keshni tozalaydi). Kassa to'lovi, qaytarish, smena, narx, kirim, hisobot va tizim hisoblari shu bilan; `money/base.ts`: `takesDollars(actor)` va `tillCurrencyProblem` (boshqa valyuta — "Bu valyuta qabul qilinmaydi"). To'lov va hisob ochishda valyuta ko'rsatilmasa — asosiy valyuta. `formatMoney` endi valyutasiz chaqirilmaydi (avval standarti so'm edi va xabarlarda yashirin "so'm" qolardi).
- **Veb** asosiy valyutani sessiyadan oladi (`lib/base.ts`: `base()`, `dollarsBeside`, `baseWords(t)`); "Naqd so'm", "So'mda hisoblanadi", "Hammasi so'mda" kabi matnlar valyuta nomi bilan ("Naqd tenge", "Tengeda hisoblanadi"; lug'atda `currencies.in.*`).
- **Tanlash** — "Sozlamalar → Biznes → Asosiy valyuta" (faqat egasi) va yangi biznesning birinchi sozlashida ("Hisob valyutasi", standart — dollar). Qulf: birinchi pul yozuvi (`ledger_lines`), tovar harakati yoki kirim qoralamasi bo'lsa — `BASE_LOCKED`. Almashtirilganda: narx turlari va narxlar kun kursida o'tadi va yangi valyutaning odatiy qadamiga yaxlitlanadi (so'm — 1 000, tenge — 100, qolganlari — 1), sodiqlik pog'onalari, aksiya narxlari va qarz chegarasi ham; qaytim qadami yangi valyutaniki; bo'sh kassa tortmalari, terminallar va tizim hisoblari yangi valyutaga o'tadi. Kurslar: dollarning yangi asosiy valyutadagi kursi eski kitobdan hisoblanadi (`core/currencies.ts` dagi `rebase`), eski asosiy valyuta yoqilgan valyutalar qatoriga o'z kursi bilan o'tadi ("1 $ = 12 650 so'm"). O'tkaziladigan narsa bo'lsa-yu yangi valyutaning kursi yo'q bo'lsa — rad etiladi va qaysi kurs yetishmasligi aytiladi.
- **Testlar.** `server/src/base-currency.spec.ts`: tenge asosli biznes (yuan kirimi, tenge va dollar bilan sotuv, qaytim, qaytarish, smena, hisobot), dollar asosli biznes, so'm → dollar → so'm almashtirish, qulflar, egasi huquqi, birinchi sozlashda tanlov; core'da tenge va dollar asosli kassa va kirim hisobi, `rebase`; vebda `lib/base.test.tsx`.

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

Qilingan (2026-10-05), chek shabloni: **"Sozlamalar → Chek"**. Chapda chek qog'ozda qanday chiqishi jonli ko'rinadi (namunaviy chek bilan), o'ngda sozlamalar: qog'oz kengligi (80 yoki 58 mm), sarlavha (bo'sh bo'lsa biznes nomi), do'kon nomi, manzil va telefon, kassir, sotuvchi, mijoz, tovar artikuli, qator chegirmasi va aksiya nomi, "Siz … tejadingiz" qatori, pastki matn (bir necha qator), ijtimoiy tarmoqlar. Saqlanmaguncha hech narsa o'zgarmaydi. Chek oynasidagi "Chop etish" endi shu shablon bo'yicha chiqaradi; chekda mijoz chegirmasi va kassir chegirmasi alohida qatorlarda, do'kon manzili va telefoni joy kartasidan olinadi.
Hali yo'q: logotip (fayl saqlash bilan birga, rasmlar bo'lagida), chek shtrix-kodi, har kassaga o'z shabloni, yuk xati, etiketka dizayni.
- **Etiketka shabloni**: o'lchami, qaysi maydonlar (nom, o'lcham, rang, narx, artikul, kod, shtrix-kod), narxli yoki narxsiz, shrift kattaligi. Jonli ko'rinish bilan. Hozirgi ikki tayyor shablon standart bo'lib qoladi.

Qilingan (2026-10-05), etiketka shabloni va chekning qolgani:
- **"Sozlamalar → Etiketka"**. Chapda etiketka printerda qanday chiqishi ko'rinadi (printerga yuboriladigan joylashuvning o'zidan chiziladi), o'ngda: tovar nomi (bir qator yoki ikki qator), rang va o'lcham, shtrix-kod, artikul, RFID kodining oxiri, yozuv kattaligi (mayda / o'rta / yirik), "narx yirik". Olib tashlangan qatorning joyi shtrix-kodga beriladi. Hech narsa o'zgartirilmasa, etiketka avvalgidek chiqadi. Etiketka o'lchami (printerdagi rulon) va narxli-narxsiz chiqishi avvalgidek chop etish oynasida tanlanadi; sozlamalarda ular faqat ko'rish uchun almashtiriladi.
- Tor etiketkada narx bilan artikul bir-birining ustiga chiqib ketardi (40 mm) — endi sig'masa artikul narxning tepasiga o'tadi.
- **Chekda logotip**: "Sozlamalar → Chek"da rasm tanlanadi (PNG, JPG), o'zi 384 nuqta kenglikka kichraytiriladi va shablon bilan birga saqlanadi; kengligi qog'ozning 30 / 50 / 70 / 100 foizi.
- **Chekda shtrix-kod**: chek raqami (Code 128) chekning pastida. Kassada shu shtrix-kod skanerlansa (yoki raqam qidiruvga yozilsa), o'sha chekning qaytarish oynasi ochiladi. O'chirib qo'yish mumkin.
Hali yo'q: har kassaga o'z shabloni, yuk xati; etiketkada do'kon nomi yoki logotip; haqiqiy printerda sinov.

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

Qilingan (2026-10-05):
- Tovar kartasida **"Rasmlar"** bo'limi: 10 tagacha rasm, birinchisi asosiy; sudrab tartiblanadi yoki yulduzcha bilan "asosiy" qilinadi; har rasmga rang belgilanadi (tovar shu rangda bo'lsa); bosilsa kattalashib ochiladi. Rasm tovar saqlangandan keyin qo'shiladi va shu zahoti saqlanadi (forma saqlanishini kutmaydi).
- Qo'shish: fayl tanlash (bir nechtasi birdan), sudrab tashlash, Ctrl+V. Har rasm alohida ketadi: biri xato bo'lsa qolgani to'xtamaydi, xato bo'lganini qayta urinish mumkin.
- **Rasmni brauzer tayyorlaydi, server emas**: uch o'lcham (160, 640, 1600 nuqta, WebP; yoza olmaydigan brauzerda JPEG) va bir necha yuz baytli xira nusxa. Telefonning 5–8 MB rasmi ~200–300 KB bo'lib ketadi. Server kelgan faylni tekshiradi (haqiqatan rasmmi, o'lchami va og'irligi chegaradami) va saqlaydi — serverga rasm kutubxonasi (sharp) kerak bo'lmadi.
- Saqlash: serverning o'z diskida, `UPLOADS_DIR` (yozilmasa `server/uploads`) ichida `biznes/rasm/s|m|l.webp`; bazada faqat tartib, rang, o'lcham va xira nusxa. Manzil: `/api/files/<biznes>/<rasm>/<o'lcham>` — topib bo'lmaydigan ikki id, kirishsiz ochiladi (`<img>` shunday so'raydi), fayl hech qachon o'zgarmaydi, brauzer uni doimiy eslab qoladi. **Zaxira nusxaga shu papka ham kirishi kerak.**
- Ko'rinadi: tovarlar ro'yxati (sahifada kamida bitta tovarning rasmi bo'lsa), kassa qidiruvi va savati (o'z rangidagi rasm bilan). Rasm yuklanguncha o'rnida xira nusxasi turadi; rasmlar ekranga yaqinlashganda yuklanadi.
- Keyin qo'shildi: qoldiq ro'yxatida, kirimning tovar bloklarida va tovar tanlash oynasida (kirim, ko'chirish, etiketka — hamma hujjatda) tovarning asosiy rasmi.
Hali yo'q: telefonda narx tekshirish. Billz'dagi rasmlarni ko'chirish **qilinmaydi** (foydalanuvchi qarori, 2026-10-05): rasmlar tovar kartasida qo'lda qo'shiladi.

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

### Xodimga qo'shimcha ruxsat qanday qurildi (P1, 2026-10-08)

- Xodimda rollaridan tashqari ruxsatlar ro'yxati (`users.extra_permissions`). Kishining ruxsatlari — rollari va shu ro'yxat birga: sessiya ham, kassadagi rahbar tasdig'i ro'yxati ham bitta SQL bo'lagidan o'qiydi (`server/src/modules/auth/permissions-sql.ts`). Berilgani yoki olingani darhol ishlaydi (sessiya keshi tozalanadi).
- Faqat aniq ruxsat beriladi ("hammasi" — `*` va guruh — `pos.*` emas: ular faqat rolda). Kishi o'zida yo'q ruxsatni bera olmaydi (`ESCALATION`); xodimda oldindan bor ruxsat esa tahrirda qolishi mumkin. Tarixda ruxsat nomi bilan yoziladi.
- Ekran: xodim formasida yig'iladigan "Qo'shimcha ruxsatlar" bo'limi — rol bergan ruxsatlar belgilangan va o'chiq ("rolda bor"), qolganlari qo'shiladi, tahrirlovchida yo'q ruxsat o'chiq; ro'yxatda rol yonida "+2 ruxsat" (ustiga borilsa qaysilari). Rol tanlangach u bergan ruxsat qo'shimcha sifatida yuborilmaydi.
- "Rolga qo'shish" (qo'shimcha ruxsatdan rol yasash) qurilmadi: kerak bo'lsa alohida qilinadi.

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

## 14a. Hisobotlar: nima quriladi va qaysi tartibda

2026-10-05 da boshlandi. Billz'da 19 ta hisobot bor (`BILLZ-TAHLIL.md`, 7-bo'lim); ularning hammasi emas, akaga har kuni kerak bo'ladiganlari birinchi quriladi. Menyuda alohida bo'lim — **"Hisobotlar"**.

Umumiy qoidalar (hamma hisobotga tegishli):

- **Davr** tayyor tugmalar bilan tanlanadi: bugun, kecha, shu hafta, shu oy, o'tgan oy, shu yil yoki istalgan oraliq. "Bugun" — biznesning vaqt mintaqasida.
- **Do'kon** tanlanadi; xodim faqat o'ziga biriktirilgan do'konlarni ko'radi.
- Har ko'rsatkich yonida **o'tgan shunday davr bilan farqi** (shu hafta ↔ o'tgan hafta): raqamning o'zi emas, o'sdimi-tushdimi ko'rinadi.
- **Sof tushum** = sotilgan tovar − qaytarilgan tovar. Qaytarish qaytgan kunida ayiriladi (sotilgan kunida emas): kassadagi pul bilan shu mos keladi. Bekor qilingan chek hisobga kirmaydi.
- **Foyda** = sof tushum − sotilgan tovarning tannarxi (partiyadan, FIFO; qaytgan tovarning tannarxi qaytariladi). Foyda va tannarxni faqat "Tannarxni ko'rish" ruxsati borlar ko'radi — do'kon menejeri savdoni ko'radi, foydani emas.
- Har jadval Excel'ga chiqariladi.
- Ruxsat: "Hisobotlar" guruhi — savdo hisobotlari (`reports.sales`), keyin sklad va moliya hisobotlari alohida.

Bo'laklar:

| № | Bo'lak | Nima beradi |
| --- | --- | --- |
| 10a | **Savdo hisoboti va bosh sahifa** | Sof tushum, foyda, cheklar soni, o'rtacha chek, chegirma, qaytarish; kunlar (bir kunda — soatlar) bo'yicha grafik; do'konlar, to'lov turlari, kassirlar, eng ko'p sotilgan tovar va kategoriyalar. Bosh sahifada bugungi kun. |
| 10b | **Tovarlar bo'yicha sotuv** | Tovar, kategoriya, brend, rang, o'lcham, yetkazib beruvchi kesimida: soni, tushum, foyda, ustama, ulushi; ABC tahlil. |
| 10c | **Tovar harakati va aylanish** | Davr boshidagi qoldiq → kirim → sotuv va chiqim → oxirgi qoldiq; sotilish tezligi, qoldiq necha kunga yetishi; **turib qolgan tovar**; partiya (kirim) qanday sotilyapti. |
| 10d | **Foyda va zarar, pul harakati** | Tushum, tannarx, yalpi foyda, xarajatlar turlari bo'yicha, boshqa kirim, kurs farqi, kassa farqi, hisobdan chiqarish → sof foyda; oylar va do'konlar bo'yicha. |
| 10e | **Balans va hisob tarixi** | Istalgan sanada har hisob guruhining qoldig'i (jami nol ekani ko'rinadi); har hisobning yozuvlari va har yozuvdan keyingi qoldiq. |
| 10f | **Xodimlar, mijozlar, aksiyalar** | Kassir va sotuvchilar (tushum, o'rtacha chek, chegirma, qaytarish, kurs farqi); yangi va qaytgan mijozlar, eng yaxshi mijozlar; aksiya samaradorligi; maxsus narxda sotilganlar. |
| 10g | **Rahbar nazorati** | Telegram bot va bildirishnomalar sozlamasi (12-bo'lim) — bot kaliti kerak, foydalanuvchi bilan. |

**Qilingan (2026-10-05), 10a — savdo hisoboti va bosh sahifa:**

- Menyuda **"Hisobotlar"** bo'limi, ichida "Savdo". Tepada davr tugmalari (Bugun, Kecha, Hafta, Oy, O'tgan oy, Yil) va ikki sana (istalgan oraliq); bir nechta do'kon bo'lsa — do'kon tanlovi; Excel tugmasi (kunlar jadvali). Davr va do'kon manzilda turadi: sahifani saqlab qo'ysa, "shu oy" ertaga ham shu oy bo'lib ochiladi.
- **Olti ko'rsatkich**, har birida o'tgan shunday davrga nisbatan o'sish yoki tushish (yashil yoki qizil): sof tushum, foyda (ustamasi bilan), cheklar soni, o'rtacha chek, chegirma (narxning necha foizi), qaytarish. Chegirma va qaytarish ko'paysa — qizil.
- **Grafik**: bir kun tanlansa soatlar bo'yicha (biznes vaqt mintaqasida, 9:00–21:00 doim ko'rinadi), uch oygacha kunlar bo'yicha, undan uzog'i oylar bo'yicha. Ustunning och qismi — tushum, to'q qismi — foyda. Ustunga sichqoncha olib borilsa (telefonda bosilsa), o'sha kunning raqamlari grafik ustida chiqadi. Savdo bo'lmagan kun ham bo'sh ustun bo'lib turadi; qaytarish sotuvdan ko'p bo'lgan kun qizil chiziq bilan belgilanadi.
- **Kesimlar**: do'konlar (ulushi, cheklar soni, foydasi), to'lov turlari (naqd so'm, naqd dollar, karta, terminal, qarzga — qaytim va qaytarilgan pul ayirilgan holda, ya'ni kassada qolgani), kassirlar, eng ko'p sotilgan 10 ta tovar (rasmi, soni, tushumi, foydasi) va kategoriyalar.
- **Bosh sahifa**: bugungi savdo, foyda, cheklar va o'rtacha chek (kechagiga nisbatan), ostida so'nggi 14 kun grafigi va hisobotga o'tish. Har sotuv va qaytarishdan keyin raqamlar o'zi yangilanadi.
- Ruxsat: "Hisobotlar → Savdo hisobotlari" — boshqaruvchi, hisobchi va do'kon menejerida standart yoqilgan. Do'kon menejeri faqat o'z do'konini ko'radi va foydani ko'rmaydi (unda "Tannarxni ko'rish" ruxsati yo'q).
- Hali yo'q: hisobotni chop etish; do'konga maqsad (tarqet) qo'yish; ikki davrni yonma-yon solishtirish.

## 15. Savollar va javoblar

1. **Humo bot xabarlari namunasi** — javob (2026-10-05): cargo tizimida tayyor, o'sha yerdan olinadi (`cargo-server/src/card-feed/card-message.parser.ts` va uning testlari). Xabar ko'rinishi: sarlavha ("To'ldirish", "To'lov", "Naqd pul yechish"), ➕ yoki ➖ bilan summa ("375.000,00 UZS"), kimdan yoki qayerga, karta ("HUMOCARD *3073" — oxirgi 4 raqam), vaqt, kartadagi qoldiq. Yo'nalish belgidan (➕/➖) aniqlanadi.
2. **Tarqatma** — javob: hozircha Telegram botlar yetarli, SMS qurilmaydi.
3. **Narx turlarini kim qo'yadi va kim ishlatadi** — taklif (hammasi rolga bog'lanadi):
   - **Narx qo'yish** (chakana, ulgurji, oila — hammasi): `products.prices` ruxsati. Hozir ham shunday: kimda bu ruxsat bo'lsa, kirimda va "Narxlar"da narx qo'yadi. Standart rollarda: egasi, boshqaruvchi, do'kon menejeri.
   - **Narx turini yaratish va ustama qoidasi**: `pricing.manage` ruxsati — egasi va boshqaruvchi.
   - **Kassada qaysi narx turida sotish**: har narx turida "kassada kim tanlay oladi" belgisi bo'ladi: *hamma kassir* (chakana), *ruxsati borlar* (ulgurji — yangi `pos.wholesale` ruxsati), *faqat tasdiq bilan* (oila — kassir tanlaydi, rahbar PIN'i bilan tasdiqlaydi). Tasdiq mexanizmi tayyor (chegirmada ishlayapti).
   - Mijoz guruhiga narx turi biriktirilgan bo'lsa ("Oila" guruhi), o'sha mijoz tanlanganda narx o'zi shu turga o'tadi va chekda yoziladi.
4. **Dollarni kelishilgan qiymat bilan olishda chegara** — sozlamaga chiqarildi, boshlang'ich qiymati 2% (undan oshsa rahbar PIN'i). Odiljon aka boshqa foiz desa, Sozlamalar → Biznes bo'limida o'zgartiriladi.

---

## 16. Mijozlar: yagona ro'yxat, narx turlari va kassa (yakuniy taklif, 2026-10-06)

Akaning qarori (2026-10-06): "kontragent ham emas, hamkor ham emas — hammasi Mijozlar, bitta ro'yxat. Mijozda narxi bo'ladi. Narx turlari dinamik qo'shiladi. Kirimda har narx turiga narxni foiz bilan, belgilangan summa bilan yoki tannarxga summa qo'shib oson qo'yish kerak. Kassadagi oldi-berdi ham bog'liq: mijoz kassadan ulgurji narxda ko'p tovar yoki qarzga olib ketishi mumkin." Oldinroq kelishilgan: bitta odam — bitta hisob (bizga ham sotsa, bizdan ham olsa — bitta balans); telefon hammaga ixtiyoriy va faqat +998 (chet raqam izohga); ismdan boshqa hamma maydon ixtiyoriy; tovar almashuv bo'ladi; yetkazib berish usullari hozir kerak emas.

Bu bo'lim 8-bo'limdagi "Hamkor va mijoz alohida qoladi" qarorini **bekor qiladi**, 3-bo'limdagi "Qanday hisoblanadi" bandini va 5-bo'limdagi chakana qarz qoidasini yangilaydi. Uch qism (mijoz va hisob, narx, kassa holatlari) ikki marta tekshirildi; ular orasidagi qarama-qarshiliklar shu yerda bitta yechimga keltirilgan.

### 16.1. Qarorlar

**Mijoz**

1. **Bitta ro'yxat — "Mijozlar".** Hamkorlar ro'yxati yo'qoladi, hamkorlar mijozlarga o'z raqamlari bilan ko'chadi, "Hamkor" so'zi ekrandan olib tashlanadi. Sabab: akaning talabi; bitta odam ikki ro'yxatda turmasin.
2. **Majburiy faqat ism.** Ism takrorlanishi mumkin: forma "«Aziz» nomli 2 ta mijoz bor" deb ogohlantiradi, to'xtatmaydi. Sabab: chakanada bir xil ism ko'p.
3. **Telefon ixtiyoriy, faqat +998, bitta raqam — bitta mijoz.** Chet raqam yozilsa, telefon bo'sh qoladi, raqam o'zi izohga tushadi ("Tel: +86 …") va bu maydon ostida aytiladi; izoh qidiruvda ishlaydi. Sabab: akaning qarori; kassir qo'lidagi raqamni yo'qotmaydi.
4. **Bitta odam — bitta hisob, bitta valyutada** (standart so'm; kartada istalgan yoqilgan valyuta; birinchi yozuvdan keyin o'zgarmaydi). Musbat balans — **qarzi** (bizga qarzdor), manfiy — **haqi** (oldindan to'lagan yoki biz qarzdormiz). Hisob birinchi yozuvda o'zi ochiladi. Sabab: kirim, kassadan sotuv, to'lov va qaytarish bitta raqamga tushadi, tovar almashuv o'zi hisoblanadi.
5. **Chakana qarz ham shu hisobga.** "Mijozlar qarzi" umumiy ichki hisobi va QZ- to'lovlari tugaydi. Sabab: bir odamga ikki balans bo'lmasin.
6. **"Yetkazib beruvchi" — belgi.** U kirim tanlovidan yoki Excel importidan yaratilgan mijozga, kirimda nomi turgan mijozga kirim o'tkazilganda va qo'lda qo'yiladi (qoralamada nomi turishi belgi qo'ymaydi). Kirimda istalgan mijoz yetkazib beruvchi bo'la oladi. Belgi ikki joyda ishlaydi: kassir bunday mijozning summalarini ko'rmaydi va uning hisobiga kassadan tovar berish doim rahbar so'zi bilan. Sabab: ta'minotchiga qarzimiz kassirga ochilmaydi (hozirgi qoida); ta'minotchiga tovar berish — unga to'lov.
7. **Arxivlash faqat qoldiq nol bo'lsa.** Umidsiz qarz "Hisob tuzatish" bilan yopiladi. Arxivdagi mijoz to'lay oladi, unga to'lanadi, tovar qaytara oladi, lekin qarzga ololmaydi. Sabab: arxivda balans yashirinib qolmasin (hozir arxivdagi hamkorga umuman to'lab bo'lmaydi).

**Narx turi mijozda**

8. **Narx turi majburiy emas.** Bo'sh — Chakana; formada birinchi variant "Chakana (odatiy)" bo'lib turadi. Tartib: mijozning o'z narxi → birinchi guruhining narxi → chakana. Chakana va Minimal turlari tanlanmaydi (chakana bo'sh deb saqlanadi). Sabab: majburiy tanlov har yangi xaridorga ortiqcha qadam qo'shadi va hech narsa bermaydi; chakanani alohida tur qilib saqlash hozir sodiqlik va aksiyani o'chirib qo'yadi (xato).
9. **Mijozning narxi — "uniki".** Kassirga ruxsat ham, PIN ham kerak emas; narx turi "kassada tanlanmaydi" bo'lsa ham ishlaydi. Maxsus narxda aksiya, sodiqlik va guruh chegirmasi yo'q; qo'l chegirmasi chegarada (10%); minimal narx ishlaydi (narx turida "minimaldan past sotilishi mumkin" belgisi bo'lmasa). Sabab: narxning o'zi kelishuv.
10. **Narx turida narxi qo'yilmagan tovar** kassada shu turning formulasi bilan hisoblanadi (16.4); formula bo'lmasa chakanada sotiladi va qator sariq "Chakana narxida" bilan belgilanadi — chekda ham. Sabab: kassa to'xtamasin, ulgurji xaridor jim aldanmasin (hozir jim chakanaga o'tadi).
11. **Arxivlangan narx turi** mijozga ham, guruhga ham narx bermaydi — keyingisiga o'tiladi; arxivlashda "N ta mijoz va M ta guruh shu narxda" deb ogohlantiriladi. Sabab: hozir bunday mijozga kassa umuman sotmay qo'yadi.
12. **Sodiqlik faqat chakana narxdagi xaridlarni sanaydi.** Sabab: ulgurji hajm chakana chegirmani ko'tarmasin.

**Qarz va to'lov**

13. **Muddat har qarzli sotuvda.** Standart — kartadagi kun yoki biznesniki (30 kun); kassir sanani surishi mumkin, olib tashlay olmaydi. "Muddatsiz" mijozni faqat rahbar kartada belgilaydi. Muddat keyin uzaytiriladi va tarixga yoziladi. Sabab: ikkala tur kerak; muddatsiz qarz — rahbar qarori.
14. **Muddati o'tgan summa hisobdan hisoblanadi**, qo'lda taqsimlanmaydi: tushgan pul (kirim, umumiy qaytarish ham) avval muddati eng yaqin qarzni yopadi, qaytgan tovar avval o'z chekining qarzini. Faqat qarzli sotuv va muddatli boshlang'ich qoldiq "muddati o'tgan" bo'la oladi; ta'minotchiga oldindan to'lov, ta'minotchiga qaytarish, bekor qilingan kirim qarzni oshiradi, lekin hech qachon "muddati o'tgan" bo'lmaydi. Sabab: hisob va muddat hech qachon ajralib ketmaydi, ta'minotchi qizil bo'lib qolmaydi.
15. **Kassada qarzga kassir o'zi beradi**, agar: taqiq yo'q, telefoni bor (yoki kartada o'z chegarasi bor), muddati o'tgani yo'q, chegaradan oshmaydi va mijoz yetkazib beruvchi emas. Aks holda — "qarzga sotish" ruxsati bor xodim yoki uning PIN'i. Hozirgi "hamkorga uning hisobiga sotish" ruxsati shu ruxsatga qo'shiladi. Sabab: chakana tez qoladi, ulgurjini chegara nazorat qiladi.
16. **Chegara aniq so'z bilan, "0" ikki ma'no bermaydi.** Biznesda: "Kassir tasdiqsiz beradigan qarz (bir mijozga)"; 0 — kassir o'zi qarz bera olmaydi (har safar tasdiq). Kartada tanlov: biznes bo'yicha / qarzga berilmaydi / o'z chegarasi (summa) / cheklovsiz. Sabab: yangi tizim ishga tushganda kassir hech kimga cheksiz qarz yoza olmasin.
17. **Haqi bor mijoz kassada shu haqidan oladi — tekshiruvsiz** (yetkazib beruvchidan boshqa). Xarid haqidan oshsa, oshgan qismi qarz bo'ladi va 15-qoida faqat shu qismga. Chekda va Z-hisobotda "Hisobidan" va "Qarzga" alohida. Sabab: bu uning o'z puli.
18. **Bitta to'lov hujjati (TL-) hammaga**: olish, berish, boshlang'ich qoldiq, hisob tuzatish. Qarzidan ko'p to'lasa — avans ("Avans bo'ladi: 85 000" saqlashdan oldin aytiladi). Sabab: Billz'dagi "balans"; hamkor to'lovi buni hozir ham qiladi.
19. **Kassada pul olish — har kassir**: shu kassaning tortmalari, do'konning so'm kartasi va **terminali** (Humo, Uzcard). Pul berish — "pul berish" ruxsati bilan; tortmadan berilgan pul haqidan oshmaydi (avansni qaytarish yoki biz qarzdor summani berish), oldindan to'lov — seyf, bank yoki kartadan. Oddiy mijozga avansini kassa tortmasidan do'kon menejeri qaytaradi yoki kassir uning PIN'i bilan. Sabab: tortma puli qarzga aylanmasin; mijoz qarzini karta bilan ham to'lay olsin.
20. **Qaytarishda** qarzga (hisobga) sotilgan qism avval hisobga qaytadi — sotuvdagi qiymatda, bugungi kursda emas; keyin pul. Shundan keyin mijoz haqli bo'lib qolsa (so'mdagi hisob), kassir shu qaytarishning o'zida o'sha summagacha naqd bera oladi. "Pulni boshqa usulda qaytarish" ruxsati hisob qismini naqdga aylantira olmaydi. Sabab: to'lanmagan tovarga pul berilmaydi, to'lagan odam kutmaydi.
21. **Almashtirishda** mijoz, uning narxi va "Qarzga" bloki saqlanadi; almashtirib olingan tovar keyin qaytsa, qiymati asl chekning hisob qismiga boradi. Sabab: hozirgi teshik yopiladi (qarzga olingan tovarga naqd pul olish mumkin edi).
22. **Chekni bekor qilish**: chekka keyin to'lov tushgan bo'lsa ham, smena ochiq bo'lsa bekor qilinadi; tushgan pul hisobda avans bo'lib qoladi. Sabab: yuruvchi hisobda hech narsa yo'qolmaydi.
23. **Takrorlarni birlashtirish — daftar orqali**: qoldiq yangi yozuv bilan qolgan mijozga o'tadi, eski yozuvlar o'zgartirilmaydi; valyutalar har xil bo'lsa — kun kursida yoki kelishilgan summada ("Elaris ($)" va "Elaris (so'm)" bitta bo'ladi). Sabab: bitta odam — bitta hisob, "pul ham daftar" qoidasi buzilmaydi.

**Narx**

24. **Bitta formula: asos + foiz + summa.** Asos — tannarx, chakana narx yoki belgilangan narx. Akaning uchala usuli (tannarx + %, belgilangan summa, tannarx + summa), ularning aralashi (tannarx + % + summa) va hozirgi "chakanadan 15% arzon" — shu bitta qoida. Foiz — ustama (tannarxga), marja emas. Sabab: kirim, qoidalar, ommaviy o'zgartirish va kassa bitta hisobni ishlatadi.
25. **Formula to'rt joyda yoziladi, aniqrog'i yutadi:** tovarning o'z maydoni → shu kirim uchun → kategoriya, brend yoki sezon qoidasi → narx turining o'z formulasi. Sabab: eng oxirgi va eng aniq qaror ishlaydi.
26. **Kirimda yangi tovar narxsiz qolmaydi**: narxi yo'q tovarga o'tkazishda formula narxi o'zi qo'yiladi; narxi bor tovarning narxi so'ralmasa o'zgarmaydi (hozirgi narx ko'rinib turadi, «=» formulani oladi, "Ularga ham qo'llash" hammasiga). Sabab: ulgurji va minimal narxsiz tovar kassaga chiqmasin, javondagi etiketka jim o'zgarmasin.
27. **Formula natijasi doim yuqoriga yaxlitlanadi** (narx turining qadami va oxiri bilan); qo'lda yozilgan son va belgilangan narx yaxlitlanmaydi. Sabab: "tannarx + 0%" tannarxdan past chiqmasin.
28. **Kirim qo'ygan narxlar narx tarixiga bitta yozuv bo'lib tushadi** va qaytarilishi mumkin. Keyin xarajat o'zgarsa narx o'zi o'zgarmaydi — "Narxlarni yangilash" taklif qilinadi. Sabab: javondagi narxni aka o'zi hal qiladi.
29. **Kirimda narx qo'yish — alohida ruxsat** ("Kirimda narx qo'yish"; sklad mudirida standart). Ruxsatsiz kirimchi narxlarni faqat ko'radi; o'tkazishda narxi yo'q yangi tovarga qoida bilan narx qo'yiladi va bu oldindan aytiladi; "bu kirimda qo'yilmaydi" tanlovi doim hurmat qilinadi. Sabab: kirimni sklad qiladi; xato narx tarixdan qaytariladi.
30. **Narx — narx turining valyutasida.** Narxi bor narx turining valyutasi o'zgarmaydi; tovar kartasida narxning valyutasini almashtirish olib tashlanadi. Sabab: hozir dollarda yozilgan narxni ommaviy o'zgartirish so'm deb o'qiydi (xato).
31. **Minimal narx — formulali oddiy narx turi** (masalan tannarx + 5%); kassadagi chegara qoidasi o'zgarmaydi. Kirimdagi narx tannarxdan yoki minimaldan past bo'lsa ogohlantiradi, to'xtatmaydi. Sabab: aka ba'zan ataylab arzon sotadi.

**Ulgurji**

32. **Ulgurji kassadan, shu joyning qoldig'idan.** Skladdan katta ulgurji uchun hozirgi yo'l: skladni "Do'kon va sklad" turiga o'tkazib, u yerda kassa ochish (tizim bunga hozir ham ruxsat beradi); alohida "Ulgurji sotuv" hujjati — keyin. Miqdorga qarab ulgurji ("10 donadan ulgurji") qilinmaydi. Sabab: aka "kassadan" dedi; narx mijoz bilan keladi, chakana hajmga aksiyaning "miqdor" turi bor.

### 16.2. Mijoz kartasi va forma

| Maydon | Majburiymi | Qoidasi |
| --- | --- | --- |
| Ism | ha | takror bo'lsa ogohlantirish |
| Telefon | yo'q | +998; bitta raqam bitta mijozda; chet raqam izohga o'zi tushadi |
| Narx | yo'q | "Chakana (odatiy)" yoki faol ulgurji / boshqa narx turi |
| Guruhlar, teglar | yo'q | hozirgidek: eslatma, taqiqlar, guruh narxi, chegirma |
| Tug'ilgan kun, jins, izoh | yo'q | hozirgidek |
| Yetkazib beruvchi | belgi | 6-qaror; qo'lda olib tashlanadi |
| **Hisob-kitob** (yig'iq blok) | | |
| Valyuta | standart so'm | birinchi yozuvdan keyin o'zgarmaydi |
| Qarz | "biznes bo'yicha" | qarzga berilmaydi / o'z chegarasi: summa / cheklovsiz |
| Qarz muddati | "biznes bo'yicha" (30 kun) | N kun / muddatsiz |
| Qaytarish muddati | "biznes bo'yicha" (14 kun) | N kun — bir oydan keyin qaytaradigan ulgurji xaridor uchun |

Qarz va muddat sozlamalarini faqat "Hisob tuzatish" ruxsati bor xodim (rahbar) o'zgartiradi; qolganini — mijozlarni tahrirlash ruxsati bilan.

**Qayerda yaratiladi.**
- Idorada — to'liq forma.
- Kassada (Ctrl+M, topilmasa Enter) — "Yangi mijoz": ism va telefon. Yozilgan raqamlar telefonga, harflar ismga tushadi. Telefon band bo'lsa — o'sha mijoz taklif qilinadi. Shu ismli mijozlar bor bo'lsa, ular telefonlari bilan chiqadi: Enter borini tanlaydi, "Baribir yangi" faqat ↓ bilan.
- Kirimda — yetkazib beruvchi tanlovida "Yangi: «…»" (faqat ism).
- Excel kirim importida — yetkazib beruvchi faqat belgili mijozlar orasidan aniq ism bilan topiladi; topilmasa yangisi yaratiladi (shu ismli oddiy mijoz bo'lsa, oldindan ko'rishda aytiladi); belgili ikki mijoz bir ismda bo'lsa — xato: "«Ali» nomli yetkazib beruvchi 2 ta: kirimda tanlang".

**Qidirish va farqlash.** Ism, telefon, izoh, teg bo'yicha. Kassa ro'yxatida ism yonida telefon, teglar, valyuta va belgi — ikki Aziz farqlanadi. Kirimdagi tanlovda yetkazib beruvchilar birinchi; telefon yashirin (oxirgi 4 raqami), izoh boshi, oxirgi kirim sanasi ko'rinadi.

**"Mijozlar" sahifasi.** Varaqlar: Ro'yxat, Guruhlar, Sodiqlik, Qarzdorlar, To'lovlar. Ustunlar: ism, telefon, narx, guruhlar, teglar, xaridlar, oxirgi xarid, balans (qarzi / haqi, o'z valyutasida), muddati o'tgan, belgi. Filtrlar ustun ostida: narx, guruh, teg, balans (qarzdorlar / haqi borlar), muddati o'tgan, yetkazib beruvchi, holat. Ustidagi ko'rsatkichlar: jami, yangi, qaytmaganlar, tug'ilgan kun (sotuvi yo'q, faqat kirimi bor yetkazib beruvchilar sanalmaydi); qarz ruxsati bilan — jami qarz, muddati o'tgan, haqi (har valyuta alohida). Qatorga bosilsa: qarz ruxsati bor xodimga — hisob-kitob, boshqasiga — karta. "Hamkorlar" bo'limi menyudan olib tashlanadi, eski manzillar Mijozlarga yo'naltiriladi.

### 16.3. Hisob: balans, qarz, avans, muddat, chegara

**Balans.** Mijoz hisobiga tushadi: kassadan hisobga sotuv ("Qarzga" / "Hisobidan"), uning qaytarishi va bekor qilinishi; to'lov (olish, berish, boshlang'ich qoldiq, hisob tuzatish); kirim (biz qarzdor bo'lamiz) va uning bekor qilinishi; yetkazib beruvchiga qaytarish (YQ-); birlashtirish. Hammasi hisob-kitobda (akt-sverkada) ko'rinadi.

**Muddat va muddati o'tgan.** Har qarzli sotuvning (va muddatli boshlang'ich qoldiqning) o'z muddati bor; hisob-kitobda har sotuv yonida turadi. "Muddatni o'zgartirish" — hisob-kitobda va Qarzdorlar qatorida, tarixga "05.11 → 20.11" deb yoziladi. Hisob 14-qaror bo'yicha: tushgan pul avval muddati eng yaqin qarzni yopadi; yopilmay qolganlardan muddati o'tganlari — "Muddati o'tgan". Bekor qilingan hujjat (va uning bekor yozuvi) hisobga umuman kirmaydi. Haqi hisobiga olingan tovar qarz emas.

Misol (Aziz):

| Sana | Nima bo'ldi | Balans |
| --- | --- | --- |
| 1 oktyabr | Qarzga 2 000 000, muddati 31 oktyabr | 2 000 000 |
| 10 oktyabr | Qarzga 1 000 000, muddati 9 noyabr | 3 000 000 |
| 20 oktyabr | To'ladi 1 500 000 | 1 500 000 |

2 noyabrda: "Muddati o'tgan: 500 000 (31.10 dan)", "Keyingi muddat: 09.11 — 1 000 000". Shundan keyin 10-oktyabr chekidan 400 000 lik tovar qaytsa: balans 1 100 000, muddati o'tgan 500 000 bo'lib qoladi (qaytarish o'z chekidan ayirildi).

Yetkazib beruvchi: kirim 30 000 $ → balans −30 000 $ (haqi). Kassadan 2 000 $ lik tovar oladi → −28 000 $. Muddati o'tgan yo'q. Kirim keyin bekor qilinsa, balans musbatga o'tadi — qarzdorlar ro'yxatiga chiqadi, lekin muddati o'tgan bo'lmaydi.

**Haqidan olish.** Balans −500 000, xarid 800 000: 500 000 — "Hisobidan" (tekshiruvsiz), 300 000 — "Qarzga" (muddat bilan; to'siqlar faqat shu 300 000 ga).

**To'siqlar.** Kassada hisobga yozishda tekshiriladi (mijoz qulflanadi — ikki kassa yoki kassa va idora bir vaqtda chegaradan o'tib keta olmaydi):
1. Guruhida yoki kartada "qarzga berilmaydi".
2. Telefoni yo'q va kartada o'z chegarasi yo'q.
3. Muddati o'tgan qarzi bor.
4. Sotuvdan keyingi qarzi chegaradan oshadi (kartadagi o'z chegarasi; bo'lmasa biznesniki; biznesniki 0 bo'lsa — kassir o'zi bera olmaydi).
5. Mijoz yetkazib beruvchi — haqidan olsa ham.

To'siqda: "qarzga sotish" ruxsati bor xodim o'zi o'tadi, kassir shu ruxsatli xodimning PIN'ini so'raydi; chekka kim tasdiqlagani yoziladi. Sababi kassirga F9 dan oldin aytiladi ("Qarz chegarasi oshadi: rahbar tasdig'i kerak"). Dollar yoki yuandagi hisobda qarz bugungi kursda so'mga aylantirib solishtiriladi; kurs kiritilmagan bo'lsa "Qarzga" bloki o'chiq turadi va qaysi kurs yetishmasligi yoziladi (pulga sotish ishlayveradi).

**Hisob tuzatish** (TL-, rahbar ruxsati, sababi bilan, bekor qilinadi): umidsiz qarzni yopish (xarajat "Umidsiz qarzlar"), ta'minotchi bergan chegirma yoki bonus (boshqa kirim), qo'lda tuzatish. Kichik qoldiq — kassadagi qaytim yaxlitlash qadamigacha (1 000 so'm) — to'lov olishda "Qoldiqni kechish" bilan har kassir yopadi.

### 16.4. Narx turlari va narx formulalari

**Formula.**

| Usul | Misol | Tannarx 100 000 bo'lsa |
| --- | --- | --- |
| Tannarx + foiz | Chakana: tannarx + 45% | 145 000 |
| Tannarx + summa | Ulgurji: tannarx + 50 000 | 150 000 |
| Tannarx + foiz + summa | tannarx + 20% + 5 000 | 125 000 |
| Belgilangan narx | 180 000 | 180 000 |
| Chakanadan ± foiz (bor, qoladi) | Ulgurji: chakana − 15% | chakana 145 000 → 124 000 (yuqoriga yaxlitlanganda) |
| Qo'lda | formula yo'q | faqat yozilgani |

Chakana faqat tannarxdan yoki qo'lda hisoblanadi; boshqa turlar chakanadan ham (agar chakana bilan bir valyutada bo'lsa). Boshqa turdan hisoblash ("Oila = Ulgurji − 5%") formulada yo'q — faqat ommaviy o'zgartirishda bir martalik amal.

**Qayerda yoziladi** (aniqrog'i yutadi):
1. Tovar maydoni — kirimda.
2. "Shu kirim uchun" — kirim tepasidagi "Narxlar" qatori.
3. Kategoriya, brend yoki sezon qoidasi — "Narxlar → Narx qoidalari" (hozirgi "Ustama qoidalari"; endi har narx turiga usul, foiz va summa).
4. Narx turining o'zi — "Ma'lumotnomalar → Narx turlari" formasida yangi maydon **"Qanday hisoblanadi"**: Tannarxdan / Chakana narxdan / Qo'lda. Narx turining o'zida belgilangan narx bo'lmaydi (hamma tovarga bitta narx — xato).

**Kirimda nima ko'rinadi.**
- Bloklar ustida **"Narxlar"** qatori — har faol narx turiga bittadan: "Chakana: tannarx + 45% (odatiy)", "Ulgurji: chakana − 15% (qoida)", "Minimal: tannarx + 5%". Bosilsa "Ulgurji — shu kirim uchun": Qoidalar bo'yicha / Tannarxdan (+ %, + summa) / Chakana narxdan (arzon yoki qimmat, %, summa) / Belgilangan narx / Bu kirimda qo'yilmaydi. Ostida: "12 ta yangi tovarga narx qo'yiladi · 3 ta tovarda narx bor — o'zgarmaydi" va "Ularga ham qo'llash".
- Har blokda har narx turining maydoni. Maydonga yoziladi:

| Yozilgan | Ma'nosi |
| --- | --- |
| 30% | tannarx + 30% |
| +50 000 (+50k) | tannarx + 50 000 |
| 30% + 5 000 | tannarx + 30% + 5 000 |
| ch −15% / ch +5% | chakanadan 15% arzon / 5% qimmat |
| 250 000 (250k, 200000+10%) | narxning o'zi |
| = | taklifni olish |
| bo'sh | taklifga qaytish |

"−5%" (tannarxdan past) qabul qilinmaydi: "Tannarxdan past narx. Chakanadan demoqchimisiz? «ch −15%» deb yozing". Maydonga kursor kirganda shu yo'riqnoma qisqa ko'rinadi (F1 da ham).

- Maydon uch holatda bo'ladi:
  1. **O'zi yozilgan** — oddiy rangda; formula bo'lsa ichida belgi ("+30%", "ch −15%"). Doim qo'yiladi.
  2. **Yangi narx** — tovarda bu turdagi narx yo'q, formula topildi: qiymat oddiy rangda, yonida manbai ("odatiy", "qoida", "kirim"), izohi "Yangi narx: kirim o'tkazilganda qo'yiladi".
  3. **Narx turadi** — tovarda narx bor: hozirgi narx xira ko'rinadi; formula boshqacha chiqsa ostida "Qoida bo'yicha: 270 000 («=»)".
- Formula narxlari qoralama davomida tannarx bilan birga o'zgaradi (xarid narxi, xarajat, kurs); yozilgan son o'zgarmaydi.
- Ogohlantirish (sariq, to'xtatmaydi): "Tannarxdan past", "Minimal narxdan past". O'tkazishda: "Kirim o'tkazilsinmi? 4 ta narx tannarxdan past."
- O'tkazishda server formulalarni o'zi, o'sha tannarx va o'sha qoidalar bilan qayta hisoblaydi — ekranda ko'ringan narx qo'yiladi. Narx tarixiga bitta yozuv: "K-000123 kirimidan"; "Narxlar → Tarix" dan qaytariladi.
- Qoralamadan etiketka chop etilsa, o'tkazishda qo'yiladigan narx chiqadi.
- O'tkazilgan kirimning xarajati keyin o'zgarsa: "Tannarx o'zgardi: 5 ta narx qoida bo'yicha boshqacha chiqadi" va **"Narxlarni yangilash"** (oldindan ko'rish → tarixga yozuv). Faqat formula bilan qo'yilgan va o'shandan beri o'zgarmagan narxlarga tegadi.
- Kirim bekor qilinsa narxlar joyida qoladi ("kerak bo'lsa Narxlar → Tarix'dan qaytaring").

**Tannarx qaysi.** Kirimda — shu kirimning tannarxi (xarajat ulushi bilan, kirimning o'z kurslarida). Ommaviy o'zgartirishda va kassadagi formulada — qoldiqdagi o'rtacha tannarx (qoldiq bo'lmasa oxirgi partiya). Ekranda qaysi biri ekani yoziladi.

**Yaxlitlash.** Formula natijasi narx turining qadami va oxiri bilan **yuqoriga**: tannarx 10 450 + 0%, qadam 1 000 → 11 000. Qo'lda yozilgan son va belgilangan narx yaxlitlanmaydi. Ommaviy "eski narx ± %" amali hozirgidek eng yaqiniga yaxlitlaydi.

**Valyuta.** Narx va formuladagi summa — narx turining valyutasida; tannarx ham shu valyutada olinadi. Narxi bor narx turining valyutasi o'zgarmaydi ("Bu narx turida narxlar bor: valyutasi o'zgartirilmaydi. Boshqa valyutada yangi narx turi oching"). Narx turlari hozircha so'm yoki dollarda.

**Kassada.** Mijoz narxida (yoki kassir tanlagan narx turida) tovarning shu turdagi narxi bo'lmasa: shu turning formulasi tovarning chakana narxidan yoki tannarxidan hisoblanadi (kassir tannarxni ko'rmaydi) va qator "qoida bo'yicha" deb belgilanadi; formula bo'lmasa — chakana va sariq "Chakana narxida" ("Bu tovarga «Ulgurji» narxi qo'yilmagan"). Belgi chekda saqlanadi va qayta chop etishda ham chiqadi.

**Ommaviy o'zgartirish** ("Narxlar → Narxlarni o'zgartirish"): "Qoida yoki formula bo'yicha hisoblash" (qoidalar bo'yicha / tannarxdan / chakana narxdan / belgilangan narx); har narx turi ustuni ostida "Hammasi / Qo'yilgan / Qo'yilmagan" filtri. Billz'dan kelgan, ulgurji yoki minimal narxi yo'q tovarlar: filtr "Qo'yilmagan" → "Qoidalar bo'yicha" → oldindan ko'rish → bitta tarix yozuvi. Yangi narx turi yaratilganda: "1 240 ta tovarda bu narx yo'q — hozir to'ldirish".

### 16.5. Kassa va idora: hamma holatlar

Belgilar: **[bor]** — hozir ishlaydi; **[ko'chadi]** — hozir mijozda yoki hamkorda bor, birlashgach hammaga; **[yangi]** — quriladi.

| Holat | Nima qilinadi | Nima tekshiriladi | Natija |
| --- | --- | --- | --- |
| **Kassa — sotuv** | | | |
| 1. Mijozsiz chakana [bor] | skaner, RFID stol yoki qidiruv; F9; to'lov | narx serverda; chegirma chegarasi; minimal narx | hozirgidek |
| 2. Tanish mijoz, chakana [bor] | Ctrl+M, tanlanadi; guruhlar, eslatma, balans chiqadi | guruh yoki sodiqlik foizi (kattasi), aksiya | chekda "Mijoz: …"; xaridlariga qo'shiladi |
| 3. Kassada yangi mijoz [ko'chadi] | Ctrl+M → Enter → ism, telefon (ixtiyoriy) | telefon band bo'lsa o'sha mijoz; shu ismlilar ro'yxati | mijoz yaratiladi; hisob hali yo'q |
| 4. Telefonsiz mijoz [yangi] | ism, izoh yoki teg bilan topiladi | qarzga — to'siq (kartada o'z chegarasi bo'lmasa) | qolgani odatdagidek |
| 5. Ulgurji yoki "Oila" narxli mijoz ko'p tovar oladi, pul bilan [bor] | mijoz tanlanadi — savat o'zi uning narxiga o'tadi; tovarlar skaner yoki RFID stol bilan | ruxsat va PIN kerak emas; aksiya va sodiqlik yo'q; minimal narx | chekda "Narx: Ulgurji"; qaytarishda sotilgan narxda |
| 6. Shu narx turida narxi yo'q tovar [yangi] | — | shu turning formulasi, bo'lmasa chakana | qator "qoida bo'yicha" yoki sariq "Chakana narxida"; chekda ham |
| 7. Kassir o'zi narx turini tanlaydi [bor] | narx tanlovi | narx turining "Kassada" sozlamasi | tasdiq bilan bo'lsa chekka kim tasdiqlagani |
| 8. Ulgurji narxga yana chegirma [bor] | chegirma maydoni | qo'l chegirmasi 10% gacha; minimal narx | oshsa — PIN |
| 9. Qisman qarzga [ko'chadi] | naqd yoki karta + "Qarzga" bloki («=» qolganini oladi); muddat tayyor | 16.3 dagi to'siqlar | hisob oshadi, muddat yoziladi; chekda "Qarzga: 600 000 · muddati 05.11.2026", "Jami qarzi: 1 800 000", imzo qatori |
| 10. Hammasi qarzga, muddatsiz mijoz [yangi] | to'lov qatorlari bo'sh | chegara | muddat "muddatsiz" (kassir sana qo'ya oladi) |
| 11. Chegaradan oshadi yoki biznes chegarasi 0 [yangi] | ogohlantirish oldindan chiqadi | qarzga sotish ruxsati yoki PIN | yoki ko'proq pul olinadi, qarz kamayadi |
| 12. Muddati o'tgan qarzi bor [ko'chadi] | chipda qizil "Muddati o'tgan: 300 000 (05.10 dan)" | pulga sotish to'xtamaydi; qarzga — PIN | — |
| 13. Guruh yoki kartada "qarzga berilmaydi" [bor] | — | PIN | — |
| 14. Haqi bor mijoz xarid qiladi [yangi] | o'sha blok: "Hisobidan (haqi 500 000)" | haqi qismi tekshiruvsiz; oshgan qismi — to'siqlar | chekda "Hisobidan: 500 000 · Qarzga: 300 000", "Qoldiq: …" |
| 15. Yetkazib beruvchi kassadan tovar oladi (tovar almashuv) [ko'chadi] | mijoz tanlanadi, "Hisobiga" | har doim qarzga sotish ruxsati yoki PIN; kassir summani ko'rmaydi | hisob-kitobda "Kirim K-…" yonida "Kassadan sotuv CH-…"; chekda qoldiq chiqmaydi |
| 16. Hisob dollar yoki yuanda [ko'chadi] | blokda juft maydon: so'm va hisob valyutasi; ikkinchisi yozilsa — kelishilgan summa | kun kursi; kelishilgan summa kursdan 2% dan uzoq bo'lsa — PIN | chekda "Hisobiga: 1 265 000 so'm (100,00 $)" |
| 17. Hisob valyutasining kursi yo'q [yangi] | — | blok o'chiq: "Yuan kursi kiritilmagan" | pulga sotish ishlaydi |
| 18. Mijozsiz "Qarzga" [bor] | blok ko'rinmaydi | server ham rad etadi | — |
| 19. Arxivdagi mijoz [yangi] | tanlovda chiqmaydi | hisobga sotish rad etiladi | to'lov va qaytarish mumkin |
| 20. Boshqa do'konda xarid yoki to'lov [ko'chadi] | mijoz butun biznesniki | chegara bitta | tovar va pul shu do'kon va kassada |
| 21. Chekni qayta chop etish [yangi] | "Cheklar" | — | sotuv paytidagi qoldiq va "Chakana narxida" belgisi saqlangan |
| **Kassa — pul** | | | |
| 22. Qarzni to'laydi: naqd, dollar, karta, terminal [ko'chadi; terminal yangi] | chipdagi "To'lov olish" yoki Ctrl+K | ochiq smena; joy shu kassa yoki do'konniki; kurs; kelishilgan summa chegarada | TL-; hisob kamayadi; to'lov chekida "To'lovdan keyin: qarzi 200 000"; Z-hisobotda "Mijozlardan olindi"; terminal qismi terminal solishtiruviga kiradi |
| 23. Qarzidan ko'p to'laydi [ko'chadi] | o'sha oyna | ruxsat kerak emas | "Avans bo'ladi: 85 000"; balans haqiga o'tadi |
| 24. Qolgan 3 000 so'mni kechish [yangi] | "Qoldiqni kechish" | yaxlitlash qadamigacha | yaxlitlash hisobiga yoziladi |
| 25. Avansini naqd qaytarib so'raydi [yangi] | Alt+C "To'lov berish" | do'kon menejeri yoki uning PIN'i; avansdan oshmaydi; pul tortmada bo'lishi kerak | TL-; Z-hisobotda "Mijozlarga berildi" |
| 26. Yetkazib beruvchiga tortmadan pul (biz qarzdormiz) [ko'chadi] | Alt+C | "pul berish" ruxsati; ochiq smena; haqidan oshmaydi | oldindan to'lov — faqat seyf, bank, kartadan |
| **Kassa — qaytarish va bekor qilish** | | | |
| 27. Shu kuni bekor qilish [bor; o'zgaradi] | Cheklar → bekor | smena ochiq; qaytarilgan yoki almashtirilgan chek emas | hammasi orqaga; keyin tushgan to'lov avans bo'lib qoladi |
| 28. Qarzga olingan tovarni qaytaradi [ko'chadi] | F4 | qaytarish muddati (kartadagi yoki 14 kun) yoki PIN | qiymat avval hisob qismiga (sotuvdagi qiymatda), keyin pul; o'sha chekning qarzi kamayadi |
| 29. Qarzini to'lab bo'lgan, keyin qaytaradi [yangi] | F4 | — | qiymat hisobga; haqli bo'lib qolsa "Pulini berish: N" (so'm hisob, shu tortma, N haqidan oshmaydi) — kassir o'zi |
| 30. Almashtirish, farq qarzga [yangi] | F4 + yangi tovar | mijoz narxi "uniki"; farq — to'siqlar; guruh "almashtirilmaydi" — PIN | — |
| 31. Almashtirib olingan tovar qaytadi [yangi] | F4 | asl chek topiladi | qiymat asl chekning hisob qismiga; naqd faqat asl chek pul bilan to'langan bo'lsa |
| 32. Ulgurji xaridor bir oydan keyin qaytaradi [yangi] | F4 | kartadagi qaytarish muddati | — |
| 33. Noto'g'ri mijoz tanlangan, smena yopilgan [yangi] | Chek → "Mijozni almashtirish" | rahbar ruxsati; bir xil valyuta; qaytarishi yo'q chek | hisob yozuv bilan ko'chadi, tarixga yoziladi |
| **Idora** | | | |
| 34. Idorada to'lov: bank, seyf, karta, dollar, yuan [ko'chadi] | Ctrl+K / Alt+C, istalgan sahifadan | ruxsat; joy xodimniki; berishda joyda pul bor | TL- |
| 35. Yetkazib beruvchidan kirim [bor] | kirimda mijoz tanlanadi (yangisi — ism bilan) | — | hisob haqiga (tovar qiymati, xarajatsiz); belgi qo'yiladi |
| 36. Kirim paytida darhol to'lash [yangi] | o'tkazilgan kirimda "To'lov berish" | — | to'lov oynasi summa bilan ochiladi |
| 37. Tovar almashuv [ko'chadi] | kirim + 15-holat | — | bitta balans; farq pul bilan yoki keyinga |
| 38. Yetkazib beruvchiga qaytarish, YQ- [bor] | hozirgidek | — | haqi kamayadi (yoki qarzga o'tadi) |
| 39. Kirim bekor qilindi, yetkazib beruvchi tovar olib bo'lgan [yangi] | — | — | balans qarzga o'tadi, "muddati o'tgan" bo'lmaydi |
| 40. Ta'minotchiga oldindan to'lov [bor] | Alt+C | "pul berish" ruxsati | balans musbat, muddati o'tmaydi |
| 41. Ta'minotchi chegirma yoki bonus berdi [yangi] | Hisob tuzatish | rahbar | haqi oshadi ("boshqa kirim") |
| 42. Boshlang'ich qoldiq [bor; Excel yangi] | hisob-kitob ichida; Excel'dan (ism, telefon, valyuta, qoldiq, muddat, izoh) | rahbar; Excel oldindan ko'rish bilan | muddat ixtiyoriy |
| 43. Muddatni uzaytirish [yangi] | hisob-kitob yoki Qarzdorlar qatori | qarzni ko'rish ruxsati yoki kassadagi qarzga sotish ruxsati | tarixda "05.11 → 20.11" |
| 44. Ikki takror yozuv [yangi] | "Birlashtirish" | rahbar | qoldiq ko'chadi; valyuta har xil — kun kursida yoki kelishilgan summada |
| 45. Umidsiz qarz va arxiv [yangi] | Hisob tuzatish, keyin arxiv | qoldiq nol | — |
| 46. Akt-sverka [yangi: davr, Excel, chop] | davr tanlanadi | qarzni ko'rish ruxsati | boshlang'ich qoldiq, har hujjat (tovar soni bilan), oxirgi qoldiq, imzo joyi |
| 47. Kim qancha qarz [ko'chadi] | Qarzdorlar | — | balans, muddati o'tgan, eng yaqin muddat, oxirgi to'lov; filtrlar |
| 48. Smena yopish [ko'chadi] | — | — | Z-hisobot: "Qarzga", "Hisobidan", "Mijozlardan olindi", "Mijozlarga berildi", "Hisobga qaytdi" — har valyutaga bitta qator (mijoz nomi bilan emas) |
| 49. Skladdan katta ulgurji [bor imkoniyat] | sklad "Do'kon va sklad" + kassa | sklad sahifalari, darvoza va ko'chirishga ta'siri tekshiriladi | alohida "Ulgurji sotuv" hujjati — keyin |

Hozir qurilmaydi, lekin hisob bunga tayyor: otlojka (zaklad avans bo'lib hisobga tushadi; guruhdagi "olib qo'yilmaydi" taqiqi shunda ishlaydi), ikki mijoz orasida o'zaro hisob ("menga to'laysizmi — Y ga bering"), skladdan "Ulgurji sotuv" hujjati, muddat yaqinlashganda eslatma.

### 16.6. Ruxsatlar va kassir nimani ko'radi

| Ruxsat | Nima beradi | Standart |
| --- | --- | --- |
| Mijozlarni ko'rish | ro'yxat va karta (balanssiz) | boshqaruvchi, hisobchi, do'kon menejeri, ulgurji menejer |
| Qo'shish, tahrirlash, arxivlash | karta, guruh, sodiqlik | boshqaruvchi, do'kon menejeri, ulgurji menejer |
| Mijozlar qarzini ko'rish | yetkazib beruvchi bo'lmagan mijozlarning balansi, hisob-kitobi, Qarzdorlar, muddatni o'zgartirish | boshqaruvchi, hisobchi, do'kon menejeri, ulgurji menejer |
| Yetkazib beruvchilar hisobini ko'rish | yetkazib beruvchilarning balansi, hisob-kitobi, YQ- dagi summa | boshqaruvchi, hisobchi, ulgurji menejer |
| To'lov olish | istalgan ruxsat etilgan joyga to'lov olish va bekor qilish; kassa tortmasidan oddiy mijozga avansini qaytarish | boshqaruvchi, hisobchi, do'kon menejeri, ulgurji menejer |
| Pul berish | istalgan mijozga pul berish va bekor qilish | boshqaruvchi, ulgurji menejer |
| Hisob tuzatish | boshlang'ich qoldiq, umidsiz qarz, bonus, birlashtirish, chekning mijozini almashtirish, qarz sozlamalari (chegara, muddatsiz) | boshqaruvchi |
| Kassa: sotish | mijozni topish va qo'shish, oddiy mijozning holatini ko'rish, to'siqsiz qarzga sotish, kassaga to'lov olish, kichik qoldiqni kechish | kassir va yuqori |
| Kassa: qarzga sotish | to'siqdan o'tish, yetkazib beruvchi hisobiga sotish, kassirga PIN bilan tasdiq | do'kon menejeri, boshqaruvchi |
| Kirimda narx qo'yish | kirimdagi narx maydonlari va "Narxlar" qatori | sklad mudiri, boshqaruvchi |

"Hamkorlar menejeri" roli "Ulgurji menejer" deb ataladi va mijozlarning hamma ruxsatini oladi; kassada sotishi (sklad kassasida) 3-ochiq savolga bog'liq.

**Kassir nimani ko'radi.**
- Oddiy mijozda: qarzi, muddati o'tgani (qizil, qaysi kundan), eng yaqin muddat, haqi va tasdiqsiz qancha qarzga bera olishi.
- Yetkazib beruvchida: hech qanday summa (faqat "rahbar tasdig'i kerak"), agar unda "Yetkazib beruvchilar hisobini ko'rish" ruxsati bo'lmasa. Chekdagi qoldiq qatori ham faqat kassir ko'ra oladigan mijozda chiqadi.
- Hech qachon: tannarx, minimal narx (qator chegaradan o'tganda qizil yozuvdan boshqa), boshqa mijozlarning balansi.

### 16.7. Ko'chirish (mavjud ma'lumot)

1. **Oldin**: egasining bazasida tekshiruv so'rovlari (chakana qarz va QZ to'lovlari bormi; bir telefonda bir nechta hamkor; hamkor va mijoz bir telefonda; valyutasi narx turiga mos kelmagan narxlar; dollar kursi kiritilganmi) va bazaning to'liq nusxasi.
2. **To'xtash sharti**: chakana qarz yoki QZ to'lov bo'lsa, ko'chirish ishlamaydi va sababini aytadi. Egasining bazasida sotuv yo'q — o'tadi.
3. **Hamkorlar** mijozlarga o'z raqamlari bilan o'tadi: ismi, telefoni, izohi, valyutasi, narxi, yetkazib beruvchi belgisi. Hisoblari va kirim yozuvlari (K-000001 dagi qarz ham) o'zgarmaydi — faqat nomlanishi.
4. **Telefon to'qnashuvi**: bitta hamkor va bitta mijoz bir telefonda — bitta yozuv bo'ladi (mijozniki qoladi, hamkorning ismi farq qilsa izohga). Bir telefonda bir nechta hamkor — telefon bittasida qoladi (hisobida yozuvi borida, bo'lmasa eskisida), boshqalarida izohga o'tadi. Hisoblar ko'chirishda birlashtirilmaydi: "Ehtimoliy takrorlar" ro'yxati chiqadi, aka keyin "Birlashtirish" bilan qiladi.
5. **Hamkorga kassadan sotuvlar** muddatsiz qarz bo'lib qoladi; boshlang'ich qoldiqlar ham muddatsiz — hech kim birdan "muddati o'tgan" bo'lib qolmaydi. Muddatni keyin qo'yish mumkin.
6. **Chakana narx turi** biriktirilgan guruh va mijozlarda narx bo'sh (chakana) qilinadi — sodiqlik va aksiya qaytadi.
7. **Ruxsatlar**: "hamkorlarni ko'rish" → mijozlarni ko'rish; "tahrirlash" → tahrirlash; "hamkor qarzini ko'rish" → ikkala qarzni ko'rish; "hamkor to'lovi" → to'lov olish va pul berish; "boshlang'ich qoldiq" → hisob tuzatish; eski "mijozlar qarzi" → qarzni ko'rish va to'lov olish; "hamkorga sotish" → qarzga sotish. Do'kon menejerining "Mijozlar — hammasi" ruxsati aniq ro'yxatga ochiladi (yetkazib beruvchilar hisobi, pul berish va hisob tuzatish unga o'tib qolmaydi). Sklad mudiridan "hamkorlarni ko'rish" olinadi (kirimda yetkazib beruvchi tanlovi baribir ishlaydi).
8. **Biznes qarz chegarasi**: hozir 0 ("chegara yo'q") — endi "kassir o'zi qarz bermaydi" ma'nosida. Aka summasini kiritmaguncha har qarz rahbar tasdig'i bilan.
9. **Narxlar**: ustama qoidalari o'z holicha ("Tannarx + N%"); qoralama kirimlardagi narxlar yangi ko'rinishga o'tadi; valyutasi narx turiga mos kelmagan narxlar oxirgi dollar kursida o'tkaziladi va narx tarixiga "Valyuta tuzatildi" bo'lib yoziladi (kurs bo'lmasa — "narx yo'q" deb o'qiladi).
10. **K-000001** narxlari o'zgarmaydi. "Cargo" xarajati tuzatilgach, shu kirim tovarlari "Narxlar" filtrida tanlanib "Qoidalar bo'yicha" qayta hisoblanadi.
11. **Orqaga qaytarish** faqat mijoz hisoblarida pul yozuvi bo'lmagan bazada; bo'lsa — nusxadan tiklanadi.

### 16.8. Bosqichlar

| № | Bosqich | Kun | Nima tayyor bo'ladi |
| --- | --- | --- | --- |
| 1 | Narx formulalari | 9 | formula va maydon o'qish; narx turining "Qanday hisoblanadi"; "Narx qoidalari" (usul, foiz, summa); kirimda "Narxlar" qatori, uch holatli maydon, ogohlantirishlar; o'tkazishda narx va tarix; keyin xarajat o'zgarsa "Narxlarni yangilash"; ommaviy o'zgartirish va "Qo'yilmagan" filtri; valyuta qulfi; kassada formula yoki "Chakana narxida"; "Kirimda narx qo'yish" ruxsati; testlar |
| 2 | Yagona mijoz: baza va hisob | 7 | ko'chirish; bitta mijoz va bitta hisob; muddat va muddati o'tgan hisobi; to'siqlar va chegara; haqidan olish; TL- (avans, kassada terminal, tortmadan berish chegarasi, tuzatish, kechish); qaytarish, bekor qilish, Z-hisobot; kirim, import va YQ- ulanishi; ruxsatlar; testlar |
| 3 | Yagona mijoz: ekranlar | 5 | "Mijozlar" sahifasi, karta va Hisob-kitob bloki, hisob-kitob, Qarzdorlar, To'lovlar; to'lov oynasi; kassa tanlovi, chip va bitta "Qarzga / Hisobidan" bloki; chekdagi qoldiq va imzo; kirim va YQ- tanlovlari; menyu; o'zbek va rus matnlari; testlar |
| 4 | Qo'shimcha holatlar | 7 | almashtirish hisobga va almashtirilgan tovar qaytishi; qaytarishda naqd berish; muddatni uzaytirish; birlashtirish (valyuta bilan); arxiv qoidasi; chekning mijozini almashtirish; akt-sverka (davr, Excel, chop); boshlang'ich qoldiqlar Excel'dan; kirimdan "To'lov berish"; kartadagi qaytarish muddati |
| 5 | Hujjat va tekshiruv | 1 | CLAUDE.md, rejalar, ko'chirishni aka bazasining nusxasida oldinga va orqaga sinash |

Jami — taxminan **29 kun**. 1-bosqich mustaqil va birinchi chiqadi (kirimdagi narx akaga hozir kerak); 2 va 3 birga chiqadi (ko'chirish ekranlarsiz chiqmaydi); 4 — bo'lak-bo'lak. Har bosqich tekshiruvlar va testlar yashil bo'lib tugaydi.

### 16.9. Ochiq savollar

1. **Narx turlarining odatiy formulalari** — bir marta kiritiladi: Chakana = tannarx + ?%, Ulgurji = tannarx + ?% (yoki chakana − ?%), Oila = tannarx + ?%, Minimal = tannarx + 5%? Va K-000001 dagi "cargo" 43 000 $ (tovar 32 472 $) — xatomi? Tuzatilmaguncha shu tovarlarning formula narxlariga ishonib bo'lmaydi.
2. **Kassir tasdiqsiz beradigan qarz** — bitta mijozga necha so'm? 0 qolsa har qarz rahbar PIN'i bilan. Qaysi doimiy ulgurji xaridorlarga o'z chegarasi va qaysilariga "muddatsiz" berilsin (ro'yxat kerak)?
3. **Katta ulgurji skladdan chiqadimi?** Ha bo'lsa: Sklad GB1 / GB2 ni "Do'kon va sklad" qilib kassa ochamizmi (Ulgurji menejer o'sha yerda sotadi) yoki alohida "Ulgurji sotuv" hujjatini kutamizmi?

**Egasining javoblari (2026-10-06):**
- *1-savol.* Odatiy foizlar oldindan qo'yilmaydi: har narx turining formulasini aka o'zi "Narx turlari → Qanday hisoblanadi" da kiritadi; kiritilmaguncha tur "Qo'lda" bo'lib turadi (hech narsa o'zi hisoblanmaydi). K-000001 dagi "cargo" xato kiritilgan; lokal baza tozalangan — bu kirim haqida tashvishlanish shart emas.
- *2-savol.* Ruxsat **istalgan xodimga rolidan tashqari alohida** berilishi kerak (xohlasa rolga ham qo'shadi). Hozir ruxsat faqat rol orqali beriladi — bu yangi ish: "Xodimga qo'shimcha ruxsat" (`YOL-XARITA.md`, platforma bo'limi). Shu bilan ishonchli kassirga "Qarzga sotish" ruxsati alohida beriladi va u PIN'siz qarzga sota oladi. Biznesning "kassir tasdiqsiz beradigan qarz" chegarasi 0 bo'lib turadi (ruxsatsiz kassir har qarzda PIN so'raydi), aka xohlasa summa kiritadi.
- *3-savol.* Tushunarsiz bo'lgan — oddiyroq qilib qayta so'raldi (javob kutilmoqda).

Texnik tafsilotlar (jadvallar, migratsiyalar, fayllar, testlar) — `docs/MIJOZLAR-TEXNIK.md`.
