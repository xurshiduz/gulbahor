# Chainway ko'prigi

Chainway R3 (kassa stolidagi o'quvchi) va UR4 (darvoza) faqat ishlab chiqaruvchining kutubxonasi (SDK) orqali gapiradi. Do'kon agenti esa o'quvchini oddiy ko'rinishda eshitadi: TCP portda **har qatorda bitta kod**, shu aloqaga `ALARM` yozilsa darvoza chalinadi (`agent/README.md`, "RFID o'quvchilar"). Bu kichik dastur shu ikkisining orasida turadi: SDK bilan o'quvchini o'qiydi va o'qiganini agent kutgan ko'rinishda aytadi.

```
R3 (USB) ──┐
           ├── ko'prik ── 127.0.0.1:port ── agent ── internet ── server
UR4 (LAN) ─┘
```

> **Holat (2026-10-02): yig'iladi va ishga tushadi, lekin haqiqiy uskunada sinalmagan.** JDK 21 bilan xatosiz yig'ildi (Chainway kutubxonasiga qarshi), sozlamalarni o'qishi tekshirildi. O'quvchining o'zi bilan hech narsa sinalmagan: uskuna kelganda quyidagi "Tekshiriladiganlar" ro'yxati bo'yicha o'tiladi.

## Nima kerak

- Agent ishlaydigan o'sha kompyuter (ko'prik faqat shu kompyuterning o'zidan eshitiladi: `127.0.0.1`).
- Java: yig'ish uchun JDK (8 yoki yangiroq; 21 da yig'ilgan), ishlatish uchun JRE yetadi. Windows uchun 64-bit.
- Chainway SDK fayllari (`lib/` papkasida, pastga qarang).

## SDK fayllari

Ular ishlab chiqaruvchiniki, shuning uchun git'ga tushmaydi. Rasmiy saytdan olinadi:

- R3: <https://www.chainway.net/Support/Info/25> → **UHFAPP for JAVA (Windows/Linux)** (`Demo_Java_R3.rar`)
- UR4: <https://www.chainway.net/Support/Info/21> → **UHFAPP for JAVA (Windows/Linux)** (`Demo_Java_UR4_UR1A.rar`)

R3 arxividagi kutubxona yangiroq va UR4 ni ham biladi, shuning uchun bitta to'plam yetadi. `lib/` ga quyidagilar qo'yiladi:

| Fayl | Arxivdagi joyi |
| --- | --- |
| `ReaderAPI20250926.jar` | `Java/API/` |
| `jna-5.4.0.jar`, `jna-platform-5.4.0.jar`, `json-lib-2.4-jdk15.jar` | `Java/demo source code/UHFJavaDemo.rar` → `libs/` |
| `UHFAPI.dll`, `libusb-1.0.dll` (Windows) | `Java/app/v2.0_…/` |
| `libTagReader.so` (Linux) | `Java/app/v2.0_…/` |

## Yig'ish va ishga tushirish

```bat
build.cmd
run.cmd r3
run.cmd ur4 --reader 192.168.99.202:8888 --antennas 1,2
```

| Sozlama | Standart | Nima |
| --- | --- | --- |
| `--listen` | `8891` (r3), `8892` (ur4) | agent ulanadigan port |
| `--reader` | `192.168.99.202:8888` | UR4 ning tarmoqdagi manzili (zavod sozlamasi shu) |
| `--power` | `10` (r3), `30` (ur4) | antenna quvvati, dBm. Kassada past: stol yonidagi tovar o'qilib ketmasin |
| `--antennas` | `1,2` | UR4 da ulangan antennalar |
| `--alarm-ms` | `3000` | signal qancha vaqt chalinadi |

Keyin tizimda **Qurilmalar → RFID o'quvchilar → O'quvchi qo'shish**: manzil `127.0.0.1`, port — `--listen` dagi port. Bitta kompyuterda ikkala o'quvchi bo'lsa, ko'prik ikki marta ishga tushiriladi (har biri o'z porti bilan).

UR4 ning rele chiqishiga chiroq va ovozli signal ulanadi: `ALARM` kelganda ko'prik releni yoqadi va `--alarm-ms` dan keyin o'chiradi.

## Tekshiriladiganlar (uskuna kelganda)

1. Do'kon kompyuterida `build.cmd` yig'adimi va `run.cmd r3` Chainway kutubxonasini yuklay oladimi (`UHFAPI.dll`, `libusb-1.0.dll` `lib/` da).
2. R3: `run.cmd r3` dan keyin "O'quvchi ulandi" chiqadimi; dona qo'yilganda agent jurnalida va kassada ko'rinadimi.
3. R3 quvvati: 10 dBm da stoldagi dona o'qiladimi, 30–40 sm naridagi tovar o'qilmaydimi. Kerak bo'lsa `--power` o'zgartiriladi.
4. UR4: antennalar va quvvat o'rnatiladimi; eshikdan o'tgan dona o'qiladimi.
5. UR4 relesi: o'qish davom etayotgan paytda `setGPO` ishlaydimi. Ishlamasa, signal oldidan o'qishni to'xtatib, keyin qayta boshlash kerak bo'ladi (`GateReader.alarm`).
6. O'quvchi o'chirib-yoqilganda ko'prik o'zi qayta ulanadimi.
7. Kod ko'rinishi: `getEPC()` 24 ta o'n oltilik belgi beradimi (bizning etiketkalar shunday yozilgan).
