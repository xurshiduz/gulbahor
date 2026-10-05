# Eski ERP dasturi: nima ko'rildi va nima olinadi

2026-10-06. Akaning eski desktop dasturi (`Desktop/dastur/57.exe`) boshidan oxirigacha ishlatib ko'rildi: ikkita mijoz (xaridor va yetkazib beruvchi), ikkita tovar, kirim (10 dona × 20 $), qarzga sotuv (3 dona × 500 000 so'm), to'lov olish (300 000 so'm va "100 $ ni 1 200 000 so'm deb"), to'lov berish (1 180 000 so'mni 100 $ deb), keyin hisobotlar — Баланс, Касса, Фойда, mijozlar saldosi. Sinov yozuvlari dasturning bazasida qoldi (foydalanuvchi ruxsati bilan). Maqsad — nusxa olish emas: yaxshi ishlaydigan joyini olish, xatosini takrorlamaslik.

## Dastur qanday ishlaydi

- **Bitta "mijoz" ro'yxati**: xaridor ham, yetkazib beruvchi ham shu yerda. Har mijozning bitta valyutasi bor; saldo musbat bo'lsa biz qarzdormiz, manfiy bo'lsa u qarzdor.
- **To'lov oynasida juftlik**: har valyuta qatorida ikki maydon — kassa tomoni (кс) va mijoz tomoni (мж). Kassa tomoni yozilsa, mijoz tomoni standart kursdan taklif bo'lib chiqadi. Mijoz tomoni ustidan yozilsa, kassa tomoniga tegilmaydi. Kassa tomoni o'zgarsa, mijoz tomoni qayta hisoblanadi.
- **Naqdsiz pul** alohida "valyuta" sifatida yuritiladi ("сўм накдсиз"); kartalar yo'q — pul qaysi kartada turgani ko'rinmaydi.
- **Kurs** — bitta standart son, qo'lda o'zgartiriladi; tarixi yo'q.
- **Баланс** = kassadagi pul − mijozlar saldosi. **Фойда** = sotuv (standart kursda) − tannarx.
- Tugmalar: Ctrl+K — kirim, Ctrl+Q — chiqim, Ctrl+B — "kassada qancha" oynasi.

## Topilgan kamchiliklar

| ERP'da | Oqibati | Bizda |
| --- | --- | --- |
| Kelishilgan summa bilan kun kursi orasidagi farq hech qayerga yozilmaydi | Balansda tushuntirib bo'lmaydigan saldo paydo bo'ldi (sinovda −53,61 $) | Har qatorda kurs farqi saqlanadi va "Kurs farqi" hisobiga tushadi; kim yutgani ko'rinadi |
| Naqdsiz — bitta umumiy "valyuta" | Qaysi kartada qancha borligi noma'lum, kartadan kartaga o'tkazma yo'q | Har karta raqami bilan alohida joy; "Pul holati" sahifasi; o'tkazma |
| Bitta standart kurs, tarixsiz | Eski hujjat qaysi kursda yozilgani bilinmaydi | Kunlik kurs tarixi; har yozuv o'z kuni kursida qotadi |
| Brend yoki davlat tanlanmasa bazaning xom xatosi chiqadi | Foydalanuvchi nima qilishni bilmaydi | Xato maydon ostida, o'zbek tilida |
| Enter ba'zi maydonda keyingisiga o'tadi, ba'zisida yo'q | Qo'l sichqonchaga ketadi | Enter har formada bir xil yuradi |
| Foyda standart kursda hisoblanadi | Dollar kelishilgan qiymatda olinsa foyda noto'g'ri | Chekka hisoblangan qiymat va kurs farqi alohida |

## Olingani

- **Juftlik qoidasi** — pul langar, ikkinchi maydon taklif; ustidan yozilsa birinchisiga tegilmaydi (KEYINGI-REJA, 7-bo'lim oxiri).
- Bitta valyutali hamkor hisobi (bizda avvaldan shunday).

## Taklif (hali qilinmagan, so'raladi)

- "Kassada qancha" tezkor oynasi (ERP'dagi Ctrl+B kabi) — "Pul holati"ning qisqa ko'rinishi, istalgan sahifadan.
