# Gulbahor

`simma_wms` namunasida qurilgan tizim asosi: kirish (auth), rollar va huquqlar,
foydalanuvchilar, profil, PIN kod bilan avtobloklash, kirish tarixi va tillar.

- `backend/` — NestJS 10 + TypeORM + PostgreSQL, API: `http://localhost:3002/api` (Swagger: `/api/docs`)
- `frontend/` — React 19 + Vite + Tailwind 4, `http://localhost:5175`

## Ishga tushirish

```bash
cd backend
npm install
# .env.example dan .env yarating: baza, JWT_SECRET, ADMIN_PASSWORD
npm run start:dev
```

```bash
cd frontend
npm install
npm run dev
```

Baza bo'sh bo'lsa birinchi ishga tushishda jadvallar, huquqlar, doimiy rollar
(Super admin, Admin, Foydalanuvchi) va `admin` foydalanuvchisi yaratiladi.
Paroli `.env` dagi `ADMIN_PASSWORD`, berilmasa `admin123` — birinchi kirishdan
keyin profildan o'zgartiring.

## Nimalar bor

| Bo'lim | Qayerda |
| --- | --- |
| Kirish: login/parol, Google, FaceID, QR beydjik | `backend/src/modules/auth`, `frontend/src/components/auth/SignInForm.tsx` |
| Rollar va huquqlar (`amal:resurs`) | `backend/src/modules/roles`, `permissions`, `frontend/src/pages/Users/Roles.tsx` |
| Foydalanuvchilar: qo'shish, tahrirlash, yopish/ochish, parolni yangilash, qo'shimcha huquqlar, xodim nomidan kirish | `backend/src/modules/users`, `frontend/src/pages/Users` |
| Profil: ma'lumotlar, parol, til, QR, FaceID, Google | `frontend/src/pages/AuthPages/Profile.tsx` |
| Avtobloklash PIN kod | `frontend/src/components/auth/ScreenLock.tsx`, `context/AuthContext.tsx` |
| Kirish tarixi va bildirishnomalar | `login_history` jadvali, `frontend/src/pages/AuthPages/Sessions.tsx` |
| Tillar: o'zbek, rus, ingliz | `frontend/src/i18n.ts`, `frontend/src/locales/*/translation.json` |
| Ma'muriyat: tashkilotlar (rekvizitlar), filiallar, omborxonalar, kassalar (kassirlari va sotuv ombori bilan) | `backend/src/modules/administration`, `cash`, `frontend/src/pages/Administration`, `pages/Cash/CashRegisters.tsx` |
| Buhgalteriya: harajatlar, pul tushumlari, kassadagi qoldiq (sanadan-sanagacha), kassadan olingan pul, valyuta turlari va kursi, to'lov turlari, harajat turlari (bog'lanishi bilan) | `backend/src/modules/accounting`, `cash`, `frontend/src/pages/Accounting`, `pages/Cash` |
| Kontragentlar: mijozlar, yetkazib beruvchilar (mahalliy / import) | `backend/src/modules/contractors`, `frontend/src/pages/Contractors` |
| Kirim hujjatlari: xarid (skaner + qidiruv), qaytarish va almashinuv (chek raqami yoki mijozning sotuvlaridan tanlash) | `backend/src/modules/inbound-documents`, `frontend/src/pages/Inbounds`, `frontend/src/components/documents` |
| Chiqim hujjatlari — barcha sotuvlar: mijoz, omborxona, izoh, tovarlar (skaner + qidiruv, soni, sotuv narxi); tasdiqlangach kirimda undan qaytarish qilinadi | `backend/src/modules/outbound-documents`, `frontend/src/pages/Outbounds` |
| Ombor qoldig'i: filial / omborxona / umumiy; SKU, dona, kirim va sotuv summasi, kutilayotgan foyda, omborlar kesimi | `backend/src/modules/stock`, `frontend/src/pages/Stock` |
| Inventarizatsiya: filial, ombor, sanalar, mas'ul; RFID skaner (brauzer) yoki shtrix-kod bilan sanash; kamomad / ortiqcha hisoboti | `backend/src/modules/inventory`, `frontend/src/pages/Inventory` |
| Kassa (POS): alohida to'liq ekranli oyna — skaner, kategoriya va o'lcham filtri, chegirmalar, kechiktirilgan cheklar, bir necha usul va valyutada to'lov, qaytim, qarzga sotish, 80 mm chek | `backend/src/modules/pos`, `frontend/src/pages/Pos` |
| Integratsiyalar: to'lov (Payme, Click Pass, UDS, Arca, Uzum) va marketpleyslarga qoldiq (Uzum Market, Wildberries, Ozon); kalitlar bazada shifrlangan | `backend/src/modules/integrations`, `frontend/src/pages/Integrations` |
| Etiketka va RFID: kirim hujjatidagi har bir dona uchun alohida etiketka va takrorlanmas RFID kodi (EPC); ZPL ko'rinishida RFID printerga (Chainway CP30) yuboriladi yoki fayl qilib yuklab olinadi | `backend/src/modules/inbound-documents/labels`, `entities/rfid-tag.entity.ts`, `frontend/src/pages/Inbounds/LabelsModal.tsx` |
| Marketing vositalari: sovg'a sertifikatlari (yaratish, sotish, bekor qilish), aksiyalar — chegirma, N+M sovg'a, karusel, chek bo'yicha. Aksiyalar hozircha faqat ta'riflanadi; sotuvda qo'llash sotuv moduli bilan qo'shiladi | `backend/src/modules/marketing`, `frontend/src/pages/Marketing` |
| Materiallar: xususiyatlar ma'lumotnomalardan, rasmlar (asosiysi belgilanadi), MXIK, TN VED, QQS | `backend/src/modules/materials`, `frontend/src/pages/Materials`; rasmlar `backend/uploads/materials` da |
| Material ma'lumotlari: kategoriyalar, brendlar, o'lchov birliklari, ranglar, o'lchamlar, davlatlar, viloyatlar | `backend/src/modules/references`, `frontend/src/pages/References` |

Ma'lumotnoma sahifalarining hammasi bitta umumiy asosda ishlaydi: backendda
`references/common/reference.service.ts` (CRUD), frontendda
`components/reference/ReferenceCrud.tsx` (jadval + forma). Yangi ma'lumotnoma
uchun entity, DTO, `prepare()` yozilgan xizmat va ustun/maydonlar ro'yxati
berilgan sahifa yetarli.

## Yangi bo'lim qo'shish

1. Backend: `permissions.service.ts` dagi `PERMISSION_GROUPS` ga resurs qo'shing,
   controllerda `@UseGuards(JwtAuthGuard, PermissionsGuard)` va `@RequirePermission('read:<resurs>')`.
2. Frontend: `config/modules.tsx` (modul), `layout/AppSidebar.tsx` (menyu), `App.tsx` (yo'l).
3. Tarjima: uchala `locales/*/translation.json` ga `modules.<key>` va
   `permissions.resources.<resurs>` yozing.

## Harajatlar va pul tushumlari

Ikkalasi bitta `payments` jadvalida, `direction` (EXPENSE / INCOME) bilan. Har bir
yozuv **kassaga** bog'lanadi - kassadagi qoldiq shundan hisoblanadi.

- Harajat: harajat turida **bog'lanish** tanlanadi - umumiy, kirim hujjatiga,
  yetkazib beruvchiga yoki mijozga; kiritilganda shunga qarab hujjat yoki kontragent
  so'raladi (kirim hujjatida kontragent hujjatdan olinadi).
- Pul tushumi: chiqim (sotuv) hujjati bo'yicha yoki to'g'ridan-to'g'ri kontragentdan.
- Summa o'z valyutasida yoziladi. So'mda kurs kerak emas.
- Boshqa valyutada kurs to'lov sanasidagi amaldagi kursdan (shu sanagacha kiritilgan
  oxirgisi) o'zi to'ldiriladi va o'zgartirilishi mumkin; so'mdagi summa (summa x kurs,
  qo'lda tuzatsa bo'ladi) to'lov bilan birga saqlanadi - kurs keyin o'zgarsa ham
  to'lov qancha so'm bo'lgani o'zgarmaydi.
- Pul yozilgan kirim / chiqim hujjati, harajat turi, kassa va kontragent o'chirilmaydi.

## Kassalar va kassadagi qoldiq

- **Kassalar** (Ma'muriyat): filialga tegishli, kassirlari va sotuv ombori bilan.
  Kassiri belgilanmagan kassa hammaga ochiq; administratorlar hamma kassani ko'radi.
- **Kassadagi qoldiq**: kassa x valyuta x to'lov turi bo'yicha, har biri o'z valyutasida.
  Sana oralig'ida: boshidagi qoldiq, tushum, harajat, olingan pul va oxiridagi qoldiq.
- **Kassadan olingan pul**: kim, qaysi kassirdan, qancha olgani; olingan paytdagi va
  kassada qolgan summa saqlanadi. Qoldiqdan ko'p olib bo'lmaydi.

## Ombor qoldig'i

Alohida qoldiq jadvali yo'q: qoldiq **tasdiqlangan** kirim (+) va chiqim (-)
hujjatlaridan hisoblanadi. Kirim summasi - o'rtacha kirim narxida (valyutadagi xarid
hujjat sanasidagi kurs bilan so'mga o'giriladi), sotuv summasi - tovar kartochkasidagi
sotuv narxida (kiritilmagan bo'lsa oxirgi sotilgan narxda).

## Inventarizatsiya

1. Yaratiladi: filial, ombor, rejadagi boshlash / tugash sanasi, mas'ul. Bitta omborda bir vaqtda
   bitta ochiq inventarizatsiya bo'ladi.
2. "Boshlash" dan keyin RFID skaner qurilmasining brauzerida  ochiladi
   (tafsilot sahifasida manzil va nusxalash tugmasi bor). Skaner "klaviatura" rejimida ishlaydi:
   o'qilgan har bir kod + Enter. Kodlar to'planib har 0.4 soniyada yuboriladi, tarmoq uzilsa
   qurilmada saqlanib qayta yuboriladi.
   - RFID metka (EPC) - har dona bir marta sanaladi, takror o'qishlar jim o'tkaziladi. EPC kichik
     harfda, bo'shliq bilan yoki oldida PC so'zi bilan (28 / 32 hex) kelsa ham tanadi.
   - Metka etiketka chop etishda yaratilgan  bo'yicha tovarga bog'lanadi; bizda
     yo'q metka "noma'lum" deb alohida ko'rsatiladi.
   - Shtrix-kod yoki artikul - har skanerlash +1 dona. "Oxirgisini bekor qilish" tugmasi bor.
3. "Tugatish" - omborning tizimdagi qoldig'i bilan solishtirilib natija qotiriladi: bo'lishi
   kerak, sanaldi, kamomad va ortiqcha (dona, tannarx va sotuv narxida), aniqlik %. CSV va chop
   etish bor. "Qayta ochish" - natija o'chadi, sanalganlar qoladi.
- Hisobot qoldiqni o'zgartirmaydi (hisobdan chiqarish / kirim hujjati hali yo'q).

## Kassa (POS)

Menyudagi yoki yuqori paneldagi "Kassa" tugmasi `/pos` ni alohida oynada ochadi,
birinchi bosishda to'liq ekranga o'tadi. Chek yopilganda tasdiqlangan chiqim hujjati
(`CH..`) va har bir to'lov usuli bo'yicha pul tushumi kassaga yoziladi.

- Narx - material kartochkasidagi **sotuv narxi**; chekda o'zgartirsa bo'ladi.
- "To'lov" bosilganda avval **usul** tanlanadi (1..9 tugmalari ham ishlaydi): Naqd - so'm, Naqd - valyuta
  (kurs bilan), yoqilgan integratsiyalar (Click Pass, Payme, UDS, Arca, Uzum) va boshqa to'lov turlari.
  Naqd usullar "Naqd pul" belgili to'lov turiga yoziladi; integratsiya yoqilganda to'lov turi
  tanlanmagan bo'lsa shu nomdagi tur ulanadi yoki yaratiladi.
- Qator chegirmasi (%) va chek chegirmasi (% yoki so'm); chek chegirmasi qatorlarga
  tiyinigacha taqsimlanadi - qaytarishda tovar to'langan narxida qaytadi.
- To'lov bir necha usulda va valyutada; qaytim so'mda. To'liq to'lanmasa - faqat
  mijoz tanlanganda (qarzga).
- Yangi mijoz kassaning o'zida qo'shiladi: F.I.O, telefon, tug'ilgan kun. Shu raqamli mijoz bor bo'lsa
  yangisi yaratilmaydi - o'sha tanlanadi.
- Kechiktirilgan cheklar shu kompyuterda saqlanadi. Tugmalar: F2 qidiruv, F8 kechiktirish, F9 to'lov.
- Kassaga omborxona biriktirilmagan bo'lsa sotib bo'lmaydi.

## Integratsiyalar

Kalitlar **.env da emas, bazada** (`integration_settings`) saqlanadi va sozlamalar
sahifasidan kiritiladi. Maxfiy kalitlar AES-256-GCM bilan shifrlanadi (shifr kaliti
`INTEGRATIONS_SECRET`, berilmasa `JWT_SECRET` dan) va qayta ko'rsatilmaydi - faqat
oxirgi 4 belgisi. Server kaliti almashtirilsa integratsiya kalitlarini qayta kiritish kerak.

| Tizim | Qanday ishlaydi |
| --- | --- |
| Click Pass | Kassir xaridor ilovasidagi kodni skanerlaydi -> `click_pass/payment`, pul darhol yechiladi |
| Payme | Subscribe API: chek yaratiladi va xaridor telefoniga yuboriladi, kassa holatni so'rab turadi; fiskal chek uchun MXIK, o'ram kodi va QQS yuboriladi |
| UDS | Xaridor kodi bo'yicha balans, chekdan yechish mumkin bo'lgan ball; operatsiya yaratiladi (1 ball = 1 so'm) |
| Arca, Uzum | Ochiq API hujjati yo'q - kassir terminaldagi to'lovdan keyin RRN / tranzaksiya raqamini kiritadi |
| Uzum Market | FBS qoldiqlari; tovar shtrix-kod bo'yicha Uzum skuId siga moslanadi |
| Wildberries | Marketplace API, sotuvchi omboridagi qoldiq, shtrix-kod bo'yicha |
| Ozon | Seller API, offer_id = artikul (yoki shtrix-kod) |

- To'lov integratsiyasi **to'lov turiga** ulanadi: kassada shu tur tanlansa integratsiya ishlaydi.
  Tranzaksiya (`integration_transactions`) chek yopilganda sotuv va pul tushumiga bog'lanadi;
  bitta tranzaksiya ikki chekda ishlatilmaydi, summasi chekdagiga mos bo'lishi shart.
  Oyna yopilsa o'tgan to'lovlar bekor qilinadi (Click - reversal, Payme - cancel, UDS - refund).
- Marketpleysga yuboriladigan qoldiq: tanlangan omborlarimiz yig'indisi, butun dona, zaxira
  ayirilgan. "Qoldiqni hozir yuborish" yoki avtomatik (har 15 daqiqa ... 1 kun). Natija jurnalda.
- Soxta kalitlar bilan tekshirilgan: barcha manzillar mavjud va "kalit noto'g'ri" deb javob
  beradi. Haqiqiy kalit bilan hali sinalmagan - birinchi ishga tushirishda "Ulanishni tekshirish"
  va kichik summa bilan sinab ko'ring (Payme uchun test rejimi bor).

## Etiketka va RFID

Kirim hujjatida har bir tovarning soni kiritiladi; "Etiketka" tugmasi (butun hujjat
yoki bitta qator uchun) har bir **dona** uchun alohida etiketka chiqaradi: 10 ta
ko'ylak - 10 ta etiketka va 10 ta har xil RFID kodi. Kasrli son (metr, kg) uchun
bitta etiketka.

- Kodlar `rfid_tags` jadvalida saqlanadi (hujjat + tovar + dona raqami). Qayta chop
  etilganda o'sha donaning kodi o'zgarmaydi; "Faqat chop etilmaganlari" belgilansa,
  faqat qolgan donalar chiqadi.
- EPC - 96 bit (24 hex belgi): `RFID_EPC_PREFIX` (sukut bo'yicha `47554C`) + ketma-ket raqam.
- Etiketka ZPL buyrug'i sifatida tayyorlanadi: nom, o'lcham/rang/brend, shtrix-kod
  (Code 128), dona raqami va chipga yozish buyrug'i (`^RFW,H`). Qolip -
  `labels/zpl.ts`, printer aniqligi 203 dpi deb olingan.
- Printerga backend tarmoq orqali ulanadi: `.env` da `LABEL_PRINTER_HOST` va
  `LABEL_PRINTER_PORT` (9100). Backend printer bilan bitta tarmoqda bo'lmasa -
  "ZPL faylni yuklab olish" va printer dasturi orqali yuborish.
- `GET /api/inbound-documents/rfid/:epc` - o'qilgan RFID kodi qaysi tovarniki ekanini qaytaradi.
- Huquq: `print:inbound-documents`.

## Eslatmalar

- Google orqali kirish faqat `GOOGLE_CLIENT_ID` (backend) va `VITE_GOOGLE_CLIENT_ID` (frontend) berilganda ko'rinadi.
- Tarmoq cheklovi sukut bo'yicha o'chiq (`NETWORK_RESTRICTION=on` bilan yoqiladi).
- Server xato xabarlari o'zbek tilida; interfeys matnlari tanlangan tilda.
