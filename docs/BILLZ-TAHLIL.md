# Billz: to'liq tahlil

2026-10-05. `gulbahorboutique.billz.io` — akaning ishlab turgan tizimi — bo'limma-bo'lim, sahifama-sahifa ko'rib chiqildi: menyu, ro'yxatlar, ustunlar, filtrlar, shakllar, hisobotlar, sozlamalar. Bir qismi akaning skrinshotlaridan olindi (to'lov sahifasi, aksiya qadamlari, promokod oynasi). Faqat ko'rildi, hech narsa o'zgartirilmadi; Billz o'zi ikkita bo'sh qoralama yaratdi (bo'sh sotuv va nomsiz aksiya). Mijoz va xodimlarning ismi, telefoni, karta raqamlari va pul summalari bu hujjatga yozilmadi.

Bu yerda **Billz'da nima borligi** yozilgan. Undan nimani olishimiz va qanday tartibda qilishimiz — `docs/KEYINGI-REJA.md` da.

Belgilar: ✅ bizda bor · ◐ qisman · ❌ yo'q · ➖ olinmaydi.

---

## 1. Umumiy tuzilish

**Menyu** — chapda tor ustun (belgilar), bosilganda ichki menyu yonidan ochiladi; yoyilganda nomlari bilan. To'qqiz bo'lim va bosh sahifa:

| Bo'lim | Ichki menyu |
| --- | --- |
| Bosh sahifa | — |
| Товары | Каталог, Импорт, Заказы, Инвентаризация, Трансфер, Переоценка, Списание, Поставщики |
| Продажи | Новая продажа, Все продажи, Кассовые смены, Кассовые операции |
| Клиенты | (ro'yxat), Группы и теги, Программа лояльности, Долги клиентов |
| Маркетинг | Акции, Промокоды, SMS рассылка, Подарочные карты |
| Отчеты | Избранные, Магазин, Товары, Продавцы, Клиенты, Маркетинг, Финансы |
| Финансы | Финансовые категории, Финансовые транзакции, Состояние счетов |
| Финансирование | (bank kreditlari reklamasi) |
| Управление | Сотрудники, Роли |
| Настройки | Профиль, Компания, Тариф, Чеки, Валюты и оплаты, Товары, Уведомления, Приложения |

**Hamma ro'yxatda takrorlanadigan narsalar:**

- tepada ko'rsatkichlar qatori ("Показать / Скрыть статистику");
- holat bo'yicha tablar, har birida soni ("Все (7.1 K)", "Активные", "Малый остаток");
- qidiruv, "Фильтры" paneli (o'ngdan ochiladi, "Сбросить" va "Применить"), "Действия";
- pastda sahifalash, "Показать по 10", "Скачать" (Excel);
- qatorga bosilsa — o'ngdan karta (drawer) ochiladi.

Pastda xodim nomi va joriy do'kon; yordam chati (Telegram, WhatsApp, onlayn).

---

## 2. Bosh sahifa

- Do'kon tanlash ("Все магазины"), davr: kecha, bugun, hafta, oy, yil yoki sana oralig'i.
- **Sotuvlar grafigi** soat, kun yoki oy bo'yicha; do'konlar alohida chiziq yoki umumiy.
- Har do'kon summasi va jami.
- **Tarqetlar** — do'konga sof tushum bo'yicha maqsad va bajarilishi foizda.
- To'lovlar summasi, tranzaksiyalar soni; sotilgan tovar, xizmat, qaytarish, almashtirish soni.
- Eng yaxshi sotuvchilar, eng ko'p sotilgan tovarlar.

Bizda: ❌ (bosh sahifa bo'sh; hisobotlar bilan birga quriladi). Tarqet — yaxshi g'oya, olinadi.

---

## 3. Tovarlar

### Katalog

- Tablar: hammasi, faol, nofaol, kam qoldiq, nol qoldiq.
- Ustunlar: har do'kon bo'yicha qoldiq (va dollardagi qiymati), rasm, jami soni, nomi, artikul, shtrix-kod, kategoriya, yetkazib beruvchi, kirim narxi (so'm va dollar), sotuv narxi (so'm va dollar), chegirma narxi, brend, markirovka va qo'lda qo'shilgan o'nga yaqin maydon.
- Nom "model / o'lcham / rang" ko'rinishida yoziladi — variant alohida tovar bo'lib turadi (model × rang × o'lcham jadvali yo'q).
- **"Действия"** — ommaviy amallar: tovarlarni belgilash yoki fayl yuklash.
- **Tovar kartasi** (o'ngdan ochiladi):
  - *Tovar tarixi*: har harakat (import, transfer, sotuv…) sanasi, hujjat raqami (bosilsa hujjat ochiladi), soni, do'koni; davr, amal turi va do'kon bo'yicha filtr.
  - *Narxlar*: har do'kon uchun kirim narxi, ustama foizi, sotuv narxi, ulgurji narx, chegirma narxi.
  - *Qoldiqlar*: har do'konda faol, nofaol, kam qoldiq.
  - *Xususiyatlar*: artikul, shtrix-kod, o'lchov birligi, brend, yetkazib beruvchi, kategoriya, tavsif va qo'shimcha maydonlar.
  - Tugmalar: qoldiq qo'shish, etiketka chop etish, o'zgartirish.

Bizda: ✅ katalog model × variant bilan (Billz'dan kuchliroq); ◐ tovar tarixi (harakatlar bor, kartada alohida ro'yxat yo'q); ❌ rasm; ❌ kam qoldiq chegarasi.

### Import (kirim)

- Ro'yxat: nomi (yetkazib beruvchi va sana), do'kon, soni, summa (dollar va so'm), holat, kim yaratdi va yakunladi, import turi, **sotilish jarayoni** (shu partiyadan qanchasi sotilgani — foizli chiziq).
- Ichida: nomlar soni, dona soni, kirim narxidagi va sotuv narxidagi summa; qatorlar: nom, artikul, o'lcham, rang, soni, xarid narxi (yuanda), kirim narxi, sotuv narxi, fabrika kodi, sezon, kolleksiya, qo'shimcha xarajat, jins, kategoriya, shtrix-kod. "Etiketka chop etish".

Bizda: ✅ kirim (xarajat taqsimoti va tannarx bilan — Billz'da yo'q); ❌ partiyaning sotilish jarayoni (olinadi — hisobotlarda).

### Buyurtmalar (yetkazib beruvchiga)

- Tablar: buyurtmalar, buyurtma qaytarishlari; to'lov holati: to'lanmagan, qisman, to'langan.
- Ustunlar: yetkazib beruvchi, do'kon, holat, to'lov, soni, summa, yaratilgan, olingan va **to'lash muddati** sanasi, kim yaratdi va qabul qildi, sotilish jarayoni.
- Ichida: tovarlar (buyurtma qilingan va kelgan soni), tafsilotlar, **to'lovlar tarixi**; "Buyurtmani qaytarish", "To'lov qo'shish".

Bizda: ❌ buyurtma hujjati (kirim darhol qilinadi); ✅ yetkazib beruvchi qarzi kirimdan; ❌ yetkazib beruvchiga tovar qaytarish.

### Inventarizatsiya

Ustunlar: nomi, do'kon, soni, farq, farq summasi, turi, holat, sanalar, kim.
Bizda: ✅ (qisman va to'liq, ko'r-ko'rona sanash bilan).

### Transfer (ko'chirish)

Ustunlar: qayerdan, qayerga, soni, holat, kim yubordi va qabul qildi, summa, jo'natilgan va qabul qilingan sana. Ichida: tovarlar, etiketka chop etish, **yuk xati**, izoh.
Bizda: ✅ (yo'ldagi tovar va kam kelganini yozish bilan); ❌ yuk xatini chop etish.

### Qayta baholash

Ustunlar: nomi, do'kon, turi ("sotuv narxini o'zgartirish"), soni, holat, kim, sana.
Bizda: ✅ (ustama qoidalari, tarix va qaytarish bilan).

### Hisobdan chiqarish

Ustunlar: do'kon, soni, summa, turi (sababi), kim, holat, sanalar.
Bizda: ✅.

### Yetkazib beruvchilar

- Ro'yxat: qarz summasi, buyurtmalar summasi, to'lovlar summasi, tovarlar soni, telefon. "To'lov qo'shish".
- Karta tablari: ko'rsatkichlar (balans, to'langan va to'lanmagan buyurtmalar, qarz, buyurtma qilingan va olingan tovar, oyiga nechta buyurtma), buyurtmalar, to'lovlar, ma'lumot, tovarlar.

Bizda: ✅ hamkor hisobi, to'lov, hisob-kitob; ◐ kartadagi ko'rsatkichlar.

---

## 4. Sotuv

### Yangi sotuv (kassa)

- **Qidiruv** («/» tugmasi): artikul, shtrix-kod, nom. Yonida: kechiktirilgan cheklar, qaytarish/almashtirish, tarix, kassa amallari.
- **Savat**: har qatorda soni (oshirish-kamaytirish), rasm, nom, artikul, shtrix-kod, brend; chegirma foizi belgisi, chegirmali narx va ustiga chizilgan asl narx; **qator sotuvchisi**; qalam (narxni o'zgartirish), o'chirish.
- "Ulgurji narxlar" kaliti — butun chek ulgurji narxga o'tadi.
- **Sotuvchilar**: chekka bir yoki bir nechta sotuvchi biriktiriladi (har qatorga alohida ham).
- **O'ng panel**:
  - Mijoz (J): qidirish yoki yaratish; tanlanganda ismi va balansi ko'rinadi.
  - Chegirma (K): foiz yoki so'm; tez tugmalar (3, 5, 7, 10%); **so'm rejimida yaxlit summa takliflari** ("1.6 mln", "1.7 mln" — chek shu summaga tushiriladi).
  - "Kod kiritish": promokod yoki kassa kodi.
  - Izoh.
  - Oraliq jami, chegirma, **"To'lash" (L)**, "Kechiktirish" (O).
- Pastda klaviatura yordami (savatda yurish, sonini o'zgartirish).

### To'lov sahifasi

- Chapda **chek ko'rinishi** (logotip, do'kon, sana, ish vaqti, sotuvchi, kassir, mijoz, tovarlar, jami, to'lov turi, shtrix-kod).
- O'ngda: "Jami", "To'lash kerak"; **to'lov turlari tugmalari, har birida tugma** (F1 naqd, F2 karta, F3–F5 QR to'lovlar, F6 **qarzga**, F7 sovg'a kartasi); qo'shilgan to'lovlar kataklarda (har birida summa va o'chirish).
- "Orqaga" (B), "To'lash" (L).

Bizda: ✅ kassa (shtrix-kod, RFID, qidiruv, aralash to'lov, dollar, qaytim, otlojkasiz); ❌ to'lov alohida sahifada, mijoz, promokod, qator sotuvchisi, qarzga sotish, yaxlit summa takliflari.

### Hamma sotuvlar

- Davr va filtrlar; sotuvlar kartochka ko'rinishida (soni, raqami, vaqti, summasi, do'koni, mijozi).
- **Yakun paneli**: tranzaksiyalar, tovarlar, xizmatlar, to'plamlar, sertifikatlar, qaytarish va almashtirishlar soni va summasi, to'lov turlari bo'yicha summa, mijoz balansiga yozilgan va sarflangan. "Hisobotni chop etish".
- **Sotuv ichida**: to'lov, savat (har qatorda sotuvchi, chegirma turi va foizi, narx), sana, do'kon, kassa, smena, mijoz, keshbek. Tugmalar: chek chop etish, **o'zgartirish, o'chirish**.

Bizda: ✅ cheklar ro'yxati va chek ichi. Billz'da o'tgan sotuvni o'zgartirish va o'chirish mumkin — **bizda ataylab yo'q** (faqat bekor qilish, izi qoladi).

### Kassa smenalari

Joriy smenalar (kassa, do'kon, qachondan ochiq, ochilish summasi, hozirgi kassa — naqd va naqdsiz, so'm va dollar) va smenalar tarixi.
Bizda: ✅ (ko'r-ko'rona yopish, Z-hisobot, terminal solishtiruvi bilan).

### Kassa amallari

Ko'rsatkichlar: hisobga tushdi, hisobdan ketdi, ochilish summasi, hozirgi kassa (naqd va naqdsiz). Ustunlar: sana, amal sanasi, amal, turi, summa, kategoriya, xodim, hisob, izoh. "Qo'shish", "Hisobot".
Bizda: ❌ (xarajat va boshqa kirim-chiqim — rejada 2-ish).

---

## 5. Mijozlar

### Ro'yxat

- Ko'rsatkichlar: jami, oxirgi haftada qo'shilgan, **qaytmayotganlar**, tug'ilgan kunlar.
- Ustunlar: ism, telefon, guruhlar, teglar, jins, xaridlar summasi, oxirgi xarid, tug'ilgan kun, ro'yxatdan o'tgan sana va do'kon, balans, joriy qarz.
- Filtrlar: guruh, teg, tug'ilgan kun, xaridlar summasi oralig'i, oxirgi xarid sanasi, **N oydan beri xarid qilmagan**, ro'yxatdan o'tgan sana va do'kon, jins.

### Yangi mijoz shakli

Bo'limlar: asosiy (ism, familiya, otasining ismi, tug'ilgan kun, jins, telefonlar, oilaviy holat, muloqot tili), manzil, ijtimoiy tarmoqlar (email, Telegram, Facebook, Instagram), qarindoshlar, guruh va teglar, bildirishnoma kanallari (SMS, telefon, ijtimoiy tarmoq, email), kartalar.

### Mijoz kartasi

Tablar: ko'rsatkichlar (balans, xaridlar summasi, eng katta chek, o'rtacha chek, o'rtacha tovar soni, o'rtacha chegirma, tashriflar soni), ma'lumot, eslatmalar, tarix, afzalliklar, qarzlar, kartalar, guruhlar, teglar. Tugmalar: qarzni boshqarish, tahrirlash, o'chirish.

### Guruh va teglar

- Guruh: nomi, bonus (chegirma foizi), mijozlar soni, holat (ochiq), sana.
- **Aka guruh va teglarni kassirga eslatma sifatida ishlatadi**: "almashtirib berish mumkin emas", "chek berish kerak", "qarz mumkin emas", "otlojka mumkin emas", "aksiyalar mumkin emas"; yana SMS uchun eski baza guruhi va sodiqlik pog'onalari.

### Sodiqlik dasturi

Turi — chegirma tizimi; pog'onalar: xaridlar summasi → chegirma foizi (5 pog'ona, 5% dan 10% gacha).

### Mijozlar qarzi

- Tablar: qarzlar, to'lovlar; filtr: hammasi, muddati o'tgan, to'lanmagan, to'langan, qisman to'langan.
- Har qarz: muddati ("... gacha"), mijoz, do'kon, holat; "To'lash".
- **Ommaviy to'lash**, **qarzdorlarga SMS tarqatma**.
- Ko'rsatkichlar: qarzlar summasi, to'lovlar, qoldiq, qarzdorlar soni, to'langan, to'lanmagan va muddati o'tgan qarzlar soni.

Bizda: ❌ butun bo'lim (rejada 5-ish). Mijoz shaklidan olinadigani: ism, telefon, tug'ilgan kun, jins, guruh, teg, eslatma; manzil, qarindoshlar, oilaviy holat — ➖.

---

## 6. Marketing

### Aksiyalar

- Tablar: hammasi, faol, nofaol, rejalashtirilgan. Ustunlar: do'konlar, nomi, boshlanish, tugash, holat (qoralama, faol, to'xtatilgan, yakunlangan), tavsif, turi.
- **Turlari**, besh guruhda:
  - *Tovarga*: X% chegirma; belgilangan narx; "birini ol, ikkinchisi chegirmada" (1+1); ketma-ket ortuvchi chegirma (1-tovarga 10%, 2-siga 20%…); N dona olinsa X%.
  - *Chekka*: chek summasi yetganda chegirma (foiz yoki summa); N dona olinsa chekka X%.
  - *Mijozga*; *kuponga* (yuqoridagi uch asosiy tur, faqat promokod aytilsa ishlaydi); *kross-sotuv*.
- **Yaratish — uch qadam:**
  1. *Tafsilotlar*: nomi (kassada ko'rinadi), do'konlar, foiz, qaysi narxga (faqat chakana yoki chakana va ulgurji), tavsif (kassirlar uchun), muddat (boshlanish va tugash, soati bilan; o'zi boshlanadi va tugaydi), "faqat promokod bilan ishlaydi".
  2. *Tovarlar*: hamma tovar yoki tanlanganlari.
  3. *O'zaro istisnolar*: boshqa aksiya va chegirmalar bilan birga ishlashi.
- **Aksiya ichida — ko'rsatkichlar**, o'tgan davr bilan solishtirib: sotilgan dona, sotuv summasi, ustama, o'rtacha chek, tranzaksiyalar; qoldiq: sotilish tezligi, aylanish kunlari; mijozlar: yangi va qaytganlar.

### Promokodlar

Kanal samaradorligini o'lchash uchun (bloger, Instagram). Aka ishlatmagan.

### SMS tarqatma

Ro'yxat: matn, yuboruvchi nomi, soni, narxi, holat (yangi, moderatsiyada, jarayonda, yakunlangan, bekor, yetkazilmagan, rad etilgan), guruh va teglar, sanalar. "Narxlar", "Yuboruvchi nomlari". Aka aksiya haqida xabar yuborishda ishlatgan.

### Sovg'a kartalari

Aka ishlatmagan.

Bizda: ❌ butun bo'lim (rejada 6-ish: uch asosiy tur + promokod; tarqatma Telegram orqali).

---

## 7. Hisobotlar (19 ta)

Har hisobotda: davr, valyuta (so'm yoki dollar), ikki ko'rinish — **Dashboard** (grafik va eng yaxshilar) va **Jadval**; guruhlash, "do'konlarni birlashtirmaslik"; sevimlilarga qo'shish.

| Guruh | Hisobot | Nimani ko'rsatadi |
| --- | --- | --- |
| Do'kon | Umumiy | sof tushum, yalpi foyda, o'rtacha chek, o'rtacha tovar soni, o'rtacha chegirma va ustama, sotilgan va qaytgan tovar; kunlar bo'yicha; do'konlar kesimida; top-10 tovar va kategoriya; yangi va qaytgan mijozlar; top mijoz va top chek; sotuvchilar |
| | Tranzaksiyalar | hamma cheklar bo'yicha statistika |
| Tovar | Tovarlar bo'yicha sotuv | nima yaxshi sotilyapti: kategoriya, rang, o'lcham va boshqa xususiyat kesimida |
| | Tovar samaradorligi | davr boshidagi qoldiq → import, buyurtma, kiruvchi transfer, sotuvdan qaytarish → sotuv, hisobdan chiqarish, chiquvchi transfer, qayta baholash → oxirgi qoldiq; **sotilish tezligi, qoldiqning aylanish kunlari** |
| | Importlar | ma'lum davrdagi partiyalar qanday sotilyapti |
| | Yetkazib beruvchilar bo'yicha sotuv | |
| | Qoldiqlar | tanlangan sanadagi qoldiq, soni va narxlari |
| | Inventarizatsiya natijalari | |
| | Buyurtma qaytarishlari | |
| | Hisobdan chiqarishlar | sabablar bo'yicha |
| | ABC tahlil | tovarlar savdo, tushum yoki foydadagi ulushi bo'yicha A, B, C |
| | Transferlar | |
| Sotuvchi | Sotuvchilar | tushum, o'rtacha chek, chekdagi o'rtacha tovar |
| | Sotuvchilar bo'yicha sotuv | tovar va kategoriya kesimida |
| Mijoz | Mijozlar | yangi va qaytganlar, o'rtacha chek |
| | Mijozlar xaridi | |
| Marketing | Aksiya samaradorligi | |
| Moliya | Foyda va zarar | do'kon va tur bo'yicha |
| | Pul harakati | |

Bizda: ❌ (rejada 11-ish). Eng qimmatlilari: tovar samaradorligi (aylanish), partiyaning sotilishi, ABC, sotuvchilar, foyda va zarar.

---

## 8. Moliya

- **Kategoriyalar**: daromad va xarajat turlari; aka o'ntacha xarajat turi ochgan (oshxona, yuk haqi, ish haqi, tozalik, ichimlik, suv, shaxsiy, umumiy va operatsion xarajatlar).
- **Moliyaviy amallar**: tablar — daromad/xarajat, smena yopilishi, o'tkazmalar, **konvertatsiyalar**. Ko'rsatkichlar: daromad, xarajat, o'tkazma va konvertatsiya summalari — naqd va naqdsiz, so'm va dollar alohida. Ustunlar: sana, amal sanasi, amal, turi, summa, yaratilgan hisob, amal hisobi, kategoriya, xodim, izoh.
- **Hisoblar holati**: har do'kon bo'yicha balans — naqd va naqdsiz, so'm va dollar; "muzlatilgan" summa.

Bizda: ✅ hisoblar, o'tkazma (ikki kishi tasdig'i bilan), kurs, ikki tomonlama daftar (Billz'da yo'q); ❌ xarajat turlari, konvertatsiya, hisoblar holati sahifasi.

## 9. Moliyalashtirish

Banklarning kredit takliflari (limit, stavka, muddat). ➖

---

## 10. Boshqaruv

- **Xodimlar**: joriy, o'chirilgan, bloklangan; ustunlar: ism, do'kon, telefon, rol, holat.
- **Rollar**: o'n bitta (tayyorlari va aka ochganlari: kassirlar uchun, sotuvchilar uchun, transfer uchun, call-markaz operatori…). Ruxsatlar daraxti menyuni takrorlaydi: har bo'lim → har sahifa, yoqiladi yoki o'chiriladi; alohida ruxsatlar: sotuv hisobotini yuklab olish, integratsiya kalitlarini boshqarish, tarqetlarni boshqarish, o'z do'koni yoki hamma do'kon dashboardi.

Bizda: ✅ (ruxsatlar amal darajasida — ko'rish, o'zgartirish, o'tkazish alohida; Billz'da faqat sahifa darajasida).

---

## 11. Sozlamalar

- **Profil**, **Tarif**.
- **Kompaniya**: kompaniya ma'lumoti, do'konlar, kassalar, integratsiya kalitlari.
- **Cheklar**: har kassaga shablon. Tahrirchi — chapda jonli ko'rinish, o'ngda:
  - nomi, turi (chek yoki yuk xati);
  - logotip: almashtirish, o'chirish, joyi va o'lchami, maydon balandligi;
  - ma'lumot bloki (belgilab tanlanadi): do'kon nomi, sana, ish vaqti, sotuvchi, kassir, mijoz, do'kon aloqalari, INN, mijoz raqami, izoh, yuridik nom, manzil;
  - tovarlar: qatordagi va chekdagi chegirmalarni ko'rsatish, jami soni, summalarni ko'rsatish; tovar xususiyatlari (nom, brend, artikul, shtrix-kod, tanlangan xususiyat);
  - mijoz balansi va qarzi; qo'shimcha rasm;
  - pastki blok: Instagram, Telegram, Facebook, sayt, chek shtrix-kodi, erkin matn.
- **Valyuta va to'lovlar**:
  - valyutalar: kirim valyutalari (bir nechta) va bitta sotuv valyutasi; kirim valyutasining kursi sotuv valyutasiga nisbatan;
  - to'lov turlari: naqd va karta (tizimniki), Payme, har do'konning Click kartasi, QR to'lovlar, o'zi qo'shganlari; kassada ko'rinish-ko'rinmasligi;
  - yaxlitlash qoidalari.
- **Tovarlar**:
  - o'lchov birliklari (nomi, qisqartmasi, aniqligi);
  - katalog kalitlari: ulgurji narx, **erkin narx** (sotuvda ixtiyoriy narx qo'yish), kam qoldiq, minusga sotish, bir nechta shtrix-kod, skanerlab tez qo'shish, manfiy ustama (tannarxdan past narx qo'yish);
  - tovar kartasida ko'rinadigan xususiyatlar;
  - **qo'l chegirmasi**: tez tugmalar qiymati va eng katta chegirma chegarasi;
  - qo'shimcha maydonlar ro'yxati.
- **Bildirishnomalar**: Telegram bot — tizimga kirish, tranzaksiyalar, sotuv statistikasi, faol sessiyalar.
- **Ilovalar**: QR to'lov xizmati, bank, termoprinterga to'g'ridan-to'g'ri chop etish, **sodiqlik boti** (Telegram'da mijoz kartasi, keshbek, aksiyalar, fikr-mulohaza), fiskal virtual kassa, marketpleyslar, tarozi.

## 12. Etiketka chop etish

Tovar kartasi, import, transfer va boshqa hujjatlar ichidan. Oynada: shablon tanlash (o'lcham bo'yicha, yangisini qo'shish), do'kon, soni — qo'lda yoki **qoldiq bo'yicha**, maxsus chegirmani ko'rsatish, A4 ga chop etish; o'ngda etiketkaning jonli ko'rinishi (logotip, artikul, nom, brend, o'lcham, sezon, ishlab chiqaruvchi, rang, narx, shtrix-kod), bittadan varaqlash. "Sinov chop etish", "Hammasini chop etish".

Bizda: ✅ etiketka (ZPL, RFID bilan, narxli va narxsiz); ❌ shablon tahrirchisi, qoldiq bo'yicha soni.

---

## 13. Billz'ning zaif joylari — bizda boshqacha qilinadi

| Billz'da | Bizda |
| --- | --- |
| O'tgan sotuvni o'zgartirish va o'chirish mumkin | Hujjat o'zgarmaydi; faqat bekor qilinadi, izi qoladi |
| Minusga sotish mumkin | Qoldiq — daftar, minus bo'lmaydi |
| Narx va tannarx kasrli chiqadi (332 335,332 so'm), yig'indi bir-biriga mos kelmasligi mumkin | Pul butun tiyinda yuritiladi; taqsimlashda yig'indi doim aynan teng chiqadi |
| Tannarx — kirim narxi; yo'l va boj xarajati qo'lda maydonga yoziladi | Xarajat partiyaga kiritiladi va donalarga o'zi taqsimlanadi |
| Variant alohida tovar ("nom / 44 / rang") | Model × rang × o'lcham jadvali |
| Mijoz guruhi — faqat matn, kassir unutishi mumkin | Guruh taqiqlarini tizim o'zi bajaradi |
| Pul hisobi bir tomonlama (kirim-chiqim ro'yxati) | Ikki tomonlama daftar: har yozuv nolga teng |
| Bitta sotuv valyutasi, hamkor bilan valyutali hisob-kitob yo'q | Hamkor hisobi o'z valyutasida, juft maydon, kurs farqi |
| Donani tanish yo'q (faqat shtrix-kod) | RFID: har dona o'z kodi bilan |
| Ruxsat sahifa darajasida | Ruxsat amal darajasida, rahbar tasdig'i (PIN) bilan |
| Karta to'lovi tushganini kassir o'zi tekshiradi | Humo bot xabari bilan avtomatik tasdiq (rejada) |

## 14. Billz'da bor, bizga kerak emas

Xizmatlar va to'plamlar, o'lchov birliklari va tarozi, markirovka, marketpleyslar, ilovalar do'koni, moliyalashtirish, tarif, qo'lda qo'shiladigan tovar maydonlari, mijozning manzili, qarindoshlari va oilaviy holati, kross-sotuv aksiyalari, SMS (Telegram yetarli).
