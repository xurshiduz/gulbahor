# ERP

Kiyim savdosi uchun ERP: do'konlar va skladlar, RFID bilan donalab hisob, kassa, pul va hamkorlar bilan hisob-kitob. To'liq reja va qarorlar: [docs/REJA.md](docs/REJA.md).

Hozir 1-bosqich (asos) tayyor: bir-biridan ajratilgan bizneslar, kirish va sessiyalar, rollar va ruxsatlar, do'kon va skladlar, o'zgarishlar tarixi, realtime, klaviatura bilan ishlaydigan interfeys va aqlli inputlar. Tovar, kassa va pul keyingi bosqichlarda qo'shiladi.

## Tuzilishi

```
packages/core   pul (tiyinda), kiritishni o'qish, qidiruv, API shartnomalari — server va web uchun umumiy
server          NestJS 11, TypeORM, PostgreSQL, Socket.IO
web             React 19, Vite, TanStack Router/Query/Table, Tailwind 4, Radix
agent           do'kon kompyuterida ishlaydigan kichik dastur: printerlarni serverga bog'laydi (agent/README.md)
docs            reja va qarorlar
tools, scripts  tekshiruv va ish holati skriptlari, bulut muhitini tayyorlash
local           faqat shu kompyuterda (git'ga tushmaydi): Billz'dan seed skriptlari, eski dastur tahlili, namunalar
```

## Talablar

- Node.js 22.12 yoki yangiroq
- PostgreSQL 16 yoki yangiroq

## Birinchi marta ishga tushirish

1. Bog'liqliklar:

   ```bash
   npm install
   ```

2. Baza. Ilova **superuser bo'lmagan** rol bilan ulanadi: superuser qator darajasidagi himoyani (RLS) chetlab o'tadi. `psql` da superuser sifatida:

   ```sql
   CREATE ROLE erp_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<parol>';
   CREATE DATABASE erp OWNER erp_app ENCODING 'UTF8' TEMPLATE template0;
   CREATE DATABASE erp_test OWNER erp_app ENCODING 'UTF8' TEMPLATE template0;
   ```

3. Sozlamalar: `server/.env.example` dan `server/.env` yarating, `DB_PASSWORD` va `JWT_SECRET` (kamida 32 belgi) ni to'ldiring.

4. Jadvallar va namunaviy biznes:

   ```bash
   npm run seed -w server
   ```

   Egasining logini va paroli `server/.env` dagi `SEED_OWNER_LOGIN` va `SEED_OWNER_PASSWORD`. Birinchi kirganda sozlash ustasi ochiladi.

5. Ishga tushirish (ikki terminalda):

   ```bash
   npm run dev:server    # http://localhost:3100/api
   npm run dev:web       # http://localhost:5190
   ```

   Web `/api` va `/socket.io` so'rovlarini serverga o'zi uzatadi. U hamma tarmoq interfeysida tinglaydi, shuning uchun shu Wi-Fi'dagi telefon yoki qo'l terminalidan ham ochiladi: `http://<kompyuterning IP manzili>:5190` (Windows birinchi marta tarmoqqa ruxsat so'raydi).

## Tekshiruvlar

```bash
npm test          # core (pul, kiritish), server (API, test bazasida), web (inputlar)
npm run typecheck
npm run lint
npm run build
```

Server testlari `gulbahor_test` bazasida ishlaydi va uni har safar tozalaydi; ish bazasiga tegmaydi.

## Migratsiyalar

Sxema faqat migratsiya bilan o'zgaradi (`server/src/database/migrations`, `index.ts` ga qo'lda qo'shiladi). Server ishga tushganda kutilayotgan migratsiyalar o'zi bajariladi.

```bash
npm run migrate -w server          # bajarish
npm run migrate:revert -w server   # oxirgisini qaytarish
```

## Asosiy qoidalar

- **Har biznes alohida.** Har jadvalda `org_id` bor va PostgreSQL RLS bilan yopilgan. Ma'lumotga faqat `Db.tenant(orgId, ...)` ichida kiriladi; undan tashqaridagi so'rov hech narsa ko'rmaydi.
- **Pul butun sonda.** Summalar tiyin va sentda saqlanadi (`packages/core/src/money.ts`), float ishlatilmaydi.
- **Tarix o'zgarmaydi.** `audit_log` ga faqat yoziladi; o'zgartirish va o'chirishni baza rad etadi.
- **Shartnoma bitta.** So'rov va javob shakllari `packages/core/src/schemas.ts` da; server ham, formalar ham shu sxemalar bilan tekshiradi.
- **Klaviatura.** Har amal sichqonchasiz bajariladi; tugmalar ro'yxati tizimda F1 bilan ochiladi.
