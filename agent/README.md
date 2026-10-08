# Do'kon agenti

Tizim internetda (domenda) ishlaydi, printer esa do'kon yoki skladning ichki tarmog'ida turadi. Server u yerga o'zi ulana olmaydi. Agent shu ikkisini bog'laydi: u do'kon kompyuterida ishlaydi, serverga **o'zi** ulanadi va aloqani ushlab turadi. Server tayyor etiketkani shu aloqa orqali yuboradi, agent uni printerga uzatadi.

Aloqa doim do'kon tomondan ochiladi. Shuning uchun do'konga doimiy (statik) IP ham, routerda port ochish ham kerak emas. Internet uzilsa, agent o'zi qayta ulanadi; shu orada chop etilgan etiketkalar serverda navbatda turadi va aloqa tiklanganda chiqadi.

## Nima kerak

- Printer bilan bitta tarmoqdagi kompyuter (kassa yoki sklad kompyuteri), Windows yoki Linux.
- Node.js 22.12 yoki yangiroq.
- Printer tarmoqqa (LAN) ulangan va o'zgarmas IP manzilga ega. Chainway CP30 da: sozlamalarda printer tili **ZPL**, port **9100**.

## O'rnatish

1. Tizimda **Qurilmalar → Do'kon agentlari → Agent qo'shish**. Saqlangandan keyin kalit ko'rsatiladi. U faqat bir marta ko'rinadi.
2. Do'kon kompyuterida shu papkada:

   ```bash
   npm install --omit=dev
   npm run build
   ```

   (Loyihaning o'zida ishlayotgan bo'lsangiz: ildiz papkada `npm install` va `npm run build:agent`.)
3. Shu papkada `agent.json` fayli yarating va kalit oynasidagi matnni yozing:

   ```json
   { "url": "https://sizning-domen.uz", "key": "…" }
   ```

   Bu fayl git'ga tushmaydi. O'rniga `ERP_URL` va `ERP_KEY` muhit o'zgaruvchilarini ham ishlatsa bo'ladi.
4. Ishga tushiring:

   ```bash
   npm start
   ```

   "Ulandi: …" yozuvi chiqadi, tizimdagi **Qurilmalar** sahifasida agent "Ulangan" bo'ladi.
5. **Qurilmalar → Printerlar → Printer qo'shish**: agentni tanlang, printerning IP manzilini yozing. Keyin printer qatoridagi menyudan **Sinov etiketkasi** ni bosing.

Kompyuter yonganda agent o'zi ishga tushishi uchun uni Windows'da Task Scheduler ("At log on") yoki Linux'da systemd xizmati sifatida qo'shing.

## RFID o'quvchilar

Agent kassa stolidagi o'quvchini (Chainway R3) va eshikdagi darvozani (Chainway UR4) ham eshitadi. Ular tizimda **Qurilmalar → RFID o'quvchilar** da qo'shiladi: turi, agent, kassa yoki do'kon, manzil va port. Agent ro'yxatni serverdan o'zi oladi, `agent.json` ga hech narsa yozilmaydi.

- **Kassa o'quvchisi.** Unga qo'yilgan dona o'sha kassaning ekranidagi chekka o'zi tushadi. Dona o'quvchida yotgan paytda ko'p marta o'qiladi, lekin bir marta aytiladi; ko'tarib, 3 soniyadan keyin qayta qo'yilsa, yana aytiladi.
- **Darvoza.** Agent sotilmagan donalar ro'yxatini xotirasida saqlaydi va har sotuvdan keyin yangilaydi. To'lanmagan dona o'tsa, serverni kutmasdan signalni o'zi chaladi, keyin serverga xabar beradi (tizimdagi **Darvoza jurnali**). Internet uzilsa ham darvoza oxirgi ro'yxat bilan ishlayveradi; shu paytdagi signallar aloqa tiklanganda yuboriladi. Ro'yxat hali kelmagan bo'lsa, darvoza jim turadi.

### O'quvchi agentga qanday gapiradi

Agent o'quvchiga TCP orqali ulanadi va **har qatorda bitta kod** kutadi:

```
47554C000000000000000001
47554C000000000000000002,1,-52
```

Kod — 24 ta o'n oltilik raqam (96 bitli EPC); vergul, nuqta-vergul yoki bo'shliqdan keyingi narsa (antenna, signal kuchi) e'tiborga olinmaydi. Darvozani chaldirish uchun agent shu aloqaga `ALARM` va yangi qator yozadi.

Chainway R3 va UR4 o'z SDK'si orqali ishlaydi. Shuning uchun ular bilan agent orasida kichik ko'prik dastur turadi: u SDK bilan o'quvchini o'qiydi, kodlarni shu ko'rinishda portga chiqaradi va `ALARM` kelganda darvozaning rele chiqishini yoqadi. Ko'prik `bridge/` papkasida (`bridge/README.md`): Java'da, Chainway'ning o'z kutubxonasi bilan yozilgan. U yig'iladi, lekin haqiqiy uskunada hali sinalmagan; tizimning qolgan qismi soxta o'quvchi bilan sinalgan.

## Xavfsizlik

- Agent faqat lokal tarmoq manzillariga (10.x, 172.16–31.x, 192.168.x, `printer.local` kabi) yuboradi. Server nima desa ham, internetdagi manzilga hech narsa jo'natmaydi.
- Kalit yo'qolsa yoki boshqa odam qo'liga tushsa: **Qurilmalar** sahifasida **Yangi kalit berish**. Eski kalit shu zahoti ishlamay qoladi.
- Bitta kalit bilan ikkita kompyuter ulansa, keyingisi qoladi, avvalgisi uziladi.

## Nimalar bo'lishi mumkin

| Yozuv | Sabab |
| --- | --- |
| `Server rad etdi: Kalit noto'g'ri…` | `agent.json` dagi kalit eskirgan. Yangi kalit oling. |
| `Ulanib bo'lmadi: …` | Internet yo'q yoki `url` noto'g'ri. Agent o'zi qayta urinadi. |
| `O'quvchi … uzildi` | O'quvchi o'chiq yoki ko'prik dastur ishlamayapti. Agent har 3 soniyada qayta ulanib ko'radi; tizimda o'quvchi "javob bermayapti" bo'lib ko'rinadi. |
| `Printerga yuborilmadi (…): ECONNREFUSED` | Printer o'chiq, IP manzili o'zgargan yoki porti 9100 emas. Tizimda bu ish "Xato" bo'lib ko'rinadi va qayta yuboriladi. |
