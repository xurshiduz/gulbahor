# Yo'l xaritasi: qolgan hamma ish (2026-10-06)

Bu fayl — qolgan ishlarning **tartibi va aniq talabi**. Qarorlar va sabablar — `docs/KEYINGI-REJA.md` (eng yangisi — 16-bo'lim), ish holati — `docs/ISH-HOLATI.md`, kod qoidalari — `CLAUDE.md`. Paket tugagach: `python tools/progress.py done …` bilan ISH-HOLATI'da belgilanadi va KEYINGI-REJA'ga "qanday qurildi" yoziladi.

## 1. Uyda ishlash (lokal sessiya)

1. **Kodni olish:**
   ```bash
   git fetch origin
   git checkout main && git pull             # eski tizim (backend/, frontend/) — v1 branchida
   npm install
   npm run build:core && npm run build:agent
   ```
2. **Bazaning nusxasi (migratsiyadan oldin, majburiy):**
   ```bash
   pg_dump -U postgres -d gulbahor -F c -f gulbahor-$(date +%F).dump
   ```
3. **Migratsiyalar:** `cd server && npm run migrate`. Orqaga bittasini qaytarish: `npm run migrate:revert`. Butunlay tiklash: `pg_restore -U postgres -d gulbahor --clean gulbahor-YYYY-MM-DD.dump`.
   PR #1 da yangi migratsiyalar: `1790000030000` … `1790000034000` (ayirboshlash, hamkor istalgan valyutada, hamkorga sotuv, hamkor narx turi, yetkazib beruvchiga qaytarish).
4. **Ishga tushirish:** `npm run dev:server` (3100) va `npm run dev:web` (5190).
5. **Commitdan oldin har safar:** `npm run typecheck`, `npm run lint`, `npm test`, `python tools/check_i18n.py` (only uz/ru bo'sh, missing 13).
6. **Lokal Claude sessiyasiga birinchi gap:** "CLAUDE.md, docs/ISH-HOLATI.md va docs/YOL-XARITA.md ni o'qi. Keyingi paket — <id>. Shu paketni qil, testlar yashil bo'lsin."
7. **Git'da yo'q (o'zingizda turadi):** `server/.env`, `server/.env.test-users`, `agent/bridge/lib/` (Chainway SDK), `local/` (Billz'dan seed skriptlari `local/billz-seed/`, eski dastur tahlili, namuna fayllar).
8. **PR #1 ni ekranda tekshirish ro'yxati** — `docs/ISH-HOLATI.md`, "Bulut sessiyasi hisoboti" → "Lokal tekshiruvga".

## 2. Umumiy ketma-ketlik

| № | Paket | Modul | ~kun | Bog'liq | Holat |
|---|---|---|---|---|---|
| 1 | P1. Xodimga qo'shimcha ruxsat | Platforma | 1,5 | — | tayyor (2026-10-08) |
| 2 | M1. Narx formulalari | Mijozlar va narx | 9 | — | boshlanmagan (spetsifikatsiya tayyor) |
| 3 | M2. Yagona mijoz: baza va hisob | Mijozlar va narx | 7 | M1 | boshlanmagan |
| 4 | M3. Yagona mijoz: ekranlar | Mijozlar va narx | 5 | M2 (birga chiqadi) | boshlanmagan |
| 5 | M4. Mijoz: qo'shimcha holatlar | Mijozlar va narx | 7 | M3 | boshlanmagan |
| 6 | M5. Ko'chirishni nusxada sinash | Mijozlar va narx | 1 | M4 | boshlanmagan |
| 7 | K1. Otlojka (tovarni olib qo'yish) | Kassa | 3 | M2 | boshlanmagan |
| 8 | V6. Terminal → bank tushumi | Pul | 2 | — | boshlanmagan |
| 9 | V8. O'tkazma va ayirboshlashda komissiya | Pul | 1 | — | boshlanmagan |
| 10 | S1. Narx o'zgargan tovarga yorliq | Sklad | 1,5 | M1 | boshlanmagan |
| 11 | S2. Hisobdan chiqarishga rasm | Sklad | 1 | — | boshlanmagan |
| 12 | S3. Skladdan ulgurji sotuv | Sklad | 3 | M2 | egasining javobi kutilmoqda (11-bo'lim, 1-savol) |
| 13 | K2. Chekni agent orqali chop etish | Kassa | 2 | — | boshlanmagan |
| 14 | K3. R3/UR4 o'quvchilarni ulash, CP30/C72 sinovi | Kassa | 2 | uskuna | uskunani kutmoqda |
| 15 | V7. Kurs farqi hisoboti | Pul | 1,5 | — | boshlanmagan |
| 16 | H1–H6. Hisobotlar 10b–10g | Hisobotlar | 12 | M2 | keyinga qoldirilgan |
| 17 | V5. Asosiy valyutani tanlash | Pul | 10 | M2 | tayyor (2026-10-08; foydalanuvchi so'rovi bilan M2 dan oldin) |
| 18 | P2–P5. Superadmin, loglar, Telegram, deploy | Platforma | 8 | — | foydalanuvchi bilan |

Sabab: avval akaga hozir kerakli narsa (ruxsat, kirimdagi narx), keyin mijoz birlashuvi (u kassa, otlojka va hisobotlarga asos), keyin pul va sklad mayda paketlari, eng oxirida katta va kam so'ralgan ishlar. Jami ~80 kun.

## 3. Platforma

**Hozir bor:** rollar va ruxsatlar (`packages/core/src/access.ts`), rahbar PIN tasdig'i, tarix (audit), ekranni bloklash.

#### P1. Xodimga qo'shimcha ruxsat — ~1,5 kun
- **Nima uchun:** egasining javobi (2026-10-06): istalgan xodimga rolidan tashqari ruxsat berish (masalan, ishonchli kassirga "Qarzga sotish").
- **Nima quriladi:** `users.extra_permissions text[]`; xodim formasida "Qo'shimcha ruxsatlar" — rol bergan ruxsatlar belgilangan va o'chiq, qolganlari qo'shiladi; xohlasa "Rolga qo'shish". Ruxsatlar rol + qo'shimcha birlashmasi; rahbar tasdig'i ro'yxati (`approvals.service.ts` dagi `PERMISSIONS`) ham shuni o'qiydi. O'zgarishdan keyin `ActorService.invalidate()`, tarixga yoziladi.
- **Qayerda:** `server/src/modules/auth/actor.service.ts`, `users` moduli, `approvals.service.ts`, `web/src/features/users`.
- **Tayyor degani:** spec: rolsiz ruxsat ishlaydi, olib tashlansa darhol yo'qoladi, tasdiqlovchilar ro'yxatida chiqadi; boshqa biznesga ta'sir yo'q.

#### P2–P5 — foydalanuvchi bilan (KEYINGI-REJA 13b, 12)
- P2. Superadmin va ko'p biznes (biznes yaratish, tarif) — ~3 kun.
- P3. Loglar: "nega bunday bo'ldi" (har hujjat bo'yicha zanjir) — ~2 kun.
- P4. Telegram bot va bildirishnomalar (rahbar nazorati, 10g bilan birga) — ~2 kun.
- P5. Serverga chiqarish: zaxira nusxa jadvali, HTTPS, yangilash tartibi — ~1 kun.

## 4. Mijozlar va narx (KEYINGI-REJA 16; texnik — `MIJOZLAR-TEXNIK.md`)

**Qarorlar:** hammasi bitta "Mijozlar"; bitta odam — bitta hisob; telefon ixtiyoriy, +998; narx turi mijozda ixtiyoriy (bo'sh — chakana); narx formulasi: asos + foiz + summa; formulalarni aka o'zi kiritadi (oldindan foiz qo'yilmaydi).

#### M1. Narx formulalari — ~9 kun
- **Nima quriladi:** narx turida "Qanday hisoblanadi" (tannarxdan / chakanadan / qo'lda); "Narx qoidalari" — har tur uchun usul, foiz, summa, belgilangan narx; kirimda "Narxlar" qatori va maydonda `30%`, `+50 000`, `30% + 5 000`, `ch −15%`, `250 000`, `=`; yangi tovar narxsiz qolmaydi, borini o'zgartirmaydi; yuqoriga yaxlitlash; narx tarixiga bitta yozuv; xarajat o'zgarsa "Narxlarni yangilash"; ommaviy o'zgartirishda formula va "Qo'yilmagan" filtri; kassada narxi yo'q tovar formula bilan yoki sariq "Chakana narxida"; ruxsat "Kirimda narx qo'yish".
- **Qayerda:** `MIJOZLAR-TEXNIK.md` §1 (core, migratsiya 35000, server, veb, testlar — ro'yxat bor).
- **Tayyor degani:** §1 "Tests" dagi hamma test; kirimda ko'rsatilgan narx o'tkazishda aynan qo'yiladi; kassada `PRICE_CHANGED` yolg'on chiqmaydi.

#### M2–M5 — ~20 kun
KEYINGI-REJA 16.8 jadvali va `MIJOZLAR-TEXNIK.md` §2 bo'yicha: M2 baza va bitta hisob (ko'chirish, muddat, chegara, to'lovlar, qaytarish), M3 ekranlar, M4 almashtirish, birlashtirish, akt-sverka, Excel'dan qoldiq, M5 ko'chirishni nusxada sinash. Har holatning kutilgan natijasi — 16.5 jadvali (49 holat).

## 5. Kassa va uskunalar

**Hozir bor:** sotuv, qaytarish, almashtirish, smena, inkassatsiya, rahbar tasdig'i, RFID stol va darvoza (soxta o'quvchi bilan), chekni brauzerdan chop etish.

- **K1. Otlojka — ~3 kun.** Tovar mijozga olib qo'yiladi (qoldiqdan "band" joyiga), zaklad mijoz hisobiga avans bo'lib tushadi; muddat; olib ketganda sotuvga aylanadi, qaytsa tovar joyiga. Guruhdagi "olib qo'yilmaydi" taqiqi ishlaydi. M2 dan keyin.
- **K2. Chekni agent orqali chop etish — ~2 kun.** Etiketka kabi `print_jobs` orqali termal printerga; brauzer oynasisiz.
- **K3. R3/UR4 va CP30/C72 — ~2 kun, uskuna kelganda.** `agent/bridge/README.md` ro'yxati bo'yicha.

## 6. Pul va valyuta

**Hozir bor:** hisoblar istalgan valyutada, kurslar zanjiri, ayirboshlash, hamkor to'lovi, xarajat, "Pul holati".

- **V6. Terminal → bank — ~2 kun.** Terminal qaysi bank hisobiga tushishi; "Bankka tushdi" amali; komissiya xarajatga.
- **V8. Komissiya — ~1 kun.** O'tkazma va ayirboshlashda summa yoki foiz; "Bank komissiyasi" xarajatiga o'zi yoziladi.
- **V7. Kurs farqi hisoboti — ~1,5 kun.** Kelishilgan summalar va ayirboshlashdan foyda/zarar, davr va xodim bo'yicha.
- **V5. Asosiy valyutani tanlash — ~10 kun.** "So'm va dollar" → "asosiy va ikkinchi valyuta" butun tizimda (KEYINGI-REJA 8). So'ralganda.

## 7. Sklad va katalog

**Hozir bor:** kirim, ko'chirish, hisobdan chiqarish, inventarizatsiya, yetkazib beruvchiga qaytarish, etiketka.

- **S1. Narx o'zgargan tovarga yorliq — ~1,5 kun.** Narx tarixidan "yorliq kerak" ro'yxati, bir tugma bilan chop etish.
- **S2. Hisobdan chiqarishga rasm — ~1 kun.** Tovar rasmlari mexanizmi bilan.
- **S3. Skladdan ulgurji sotuv — ~3 kun.** Egasining javobiga bog'liq (11-bo'lim, 1-savol).
- Xususiyat qiymatlarini birlashtirish ekrani — ~0,5 kun (API bor).

## 8. Hisobotlar (keyinga qoldirilgan)

KEYINGI-REJA 14a: H1 tovarlar bo'yicha sotuv va ABC (10b), H2 tovar harakati va aylanish (10c), H3 foyda-zarar va pul harakati (10d), H4 balans (10e), H5 xodimlar, mijozlar, aksiyalar (10f), H6 rahbar nazorati (10g, P4 bilan). Hammasi `features/reports/parts.tsx` qismlaridan, o'z jadvalisiz. ~12 kun.

## 9. Qilinmaydi

- Billz rasmlarini ko'chirish (8c) — egasining qarori.
- Yetkazib berish usullari — hozircha kerak emas (egasi, 2026-10-06).
- Miqdorga qarab avtomatik ulgurji ("10 donadan ulgurji") — narx mijoz bilan keladi (16.1, 32).

## 10. Egasidan kutilayotgan javob

1. **Katta ulgurji tovar qayerdan chiqadi?** Kassa faqat o'zi turgan joyning qoldig'idan sotadi. Agar ulgurji xaridor tovarni **do'kondan** olsa — hech narsa kerak emas, hozirgidek kassadan sotiladi. Agar tovar **skladdan** (GB1, GB2) yuklab ketilsa — ikki yo'l:
   - (a) skladga ham kassa ochamiz — yangi kod kerak emas, faqat sozlama;
   - (b) idoradan kassasiz "Ulgurji sotuv" hujjati quriladi (S3, ~3 kun).

   Tavsiya: hozircha (a), keyin kerak bo'lsa (b).
