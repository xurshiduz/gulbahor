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
| Ma'muriyat: tashkilotlar (rekvizitlar), filiallar, omborxonalar | `backend/src/modules/administration`, `frontend/src/pages/Administration` |
| Buhgalteriya: valyuta turlari, valyuta kursi, to'lov turlari, harajat turlari | `backend/src/modules/accounting`, `frontend/src/pages/Accounting` |
| Kontragentlar: mijozlar, yetkazib beruvchilar (mahalliy / import) | `backend/src/modules/contractors`, `frontend/src/pages/Contractors` |
| Kirim hujjatlari: xarid (skaner + qidiruv), qaytarish va almashinuv (chek raqami yoki mijozning sotuvlaridan tanlash). Chiqim (sotuv) hujjatlari uchun hozircha faqat jadval va qidiruv bor — yaratish formasi hali yo'q | `backend/src/modules/inbound-documents`, `outbound-documents`, `frontend/src/pages/Inbounds`, `frontend/src/components/documents` |
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
