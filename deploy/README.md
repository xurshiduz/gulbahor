# Serverga qo'yish

Tizim bitta virtual serverda (VPS) ishlaydi: brauzerdagi dastur va API bitta domenda, oldida nginx, baza — shu serverdagi PostgreSQL. Do'kon kompyuterlari va agentlar shu domenga ulanadi.

| Nima | Qayerda |
| --- | --- |
| Kod (manba) | `/opt/erp/src` |
| Yig'ilgan nusxalar | `/opt/erp/releases/<vaqt>`; ishlayotgani — `/opt/erp/current` |
| Sozlamalar va parollar | `/etc/erp/server.env` (faqat root va `erp` o'qiydi) |
| Rasmlar | `/var/lib/erp/uploads` |
| Zaxira nusxalar | `/var/backups/erp` |
| Xizmat | `erp` (systemd), 3100-portda, faqat serverning ichida |
| Sayt sozlamasi | `/etc/nginx/sites-available/erp` |

## Nima kerak

- **Server**: Ubuntu 24.04, kamida 2 vCPU va 4 GB xotira (yig'ish paytida xotira kerak; 2 GB bo'lsa swap qo'shiladi), 40 GB disk. Reja bo'yicha: 4 vCPU, 8 GB, 80 GB.
- **Domen** (yoki subdomen), A yozuvi serverning IP manziliga qaratilgan. Domensiz ham sinab ko'rsa bo'ladi (IP manzil bilan, HTTP da), lekin ishga tushirish uchun domen va HTTPS shart: brauzer bildirishnomalari, kamera va xavfsiz cookie HTTPS da ishlaydi.
- Serverga **SSH** orqali kirish (root yoki sudo huquqli foydalanuvchi).

## 1. Kodni serverga olib borish

Ikki yo'li bor; ikkalasida ham kod `/opt/erp/src` da turadi.

**A. Shu kompyuterdan yuborish** (serverga GitHub kerak emas). Loyiha papkasida, Git Bash'da — faqat commit qilingan kod ketadi:

```bash
git -c core.autocrlf=false archive --format=tar.gz HEAD | ssh root@SERVER 'rm -rf /opt/erp/src && mkdir -p /opt/erp/src && tar -xz -C /opt/erp/src'
```

**B. Serverda `git clone`** (keyin yangilash bitta buyruq). Repozitoriy yopiq bo'lgani uchun serverning kaliti GitHub'ga "Deploy key" (faqat o'qish) qilib qo'shiladi:

```bash
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub   # chiqqan qatorni GitHub → Settings → Deploy keys ga
git clone git@github.com:<egasi>/<repozitoriy>.git /opt/erp/src
```

## 2. O'rnatish

Serverda, root bo'lib:

```bash
bash /opt/erp/src/deploy/install.sh savdo.example.uz
```

Skript: paketlarni qo'yadi (Node.js 22, PostgreSQL, nginx), `erp` foydalanuvchisini, bazani va tasodifiy parollar bilan `/etc/erp/server.env` ni yaratadi, kodni yig'adi, xizmatni ishga tushiradi (jadvallar o'zi yaratiladi), birinchi biznesni egasi bilan ochadi, nginx'ni sozlaydi va kunlik zaxirani yoqadi. Parollar ekranga chiqmaydi.

Qayta ishga tushirsa bo'ladi: bor parol, baza va sozlamalarga tegmaydi.

**Serverda boshqa dastur ishlab turgan bo'lsa** ham xalaqit bermaydi: faqat yo'q paket o'rnatiladi (bor nginx va PostgreSQL yangilanmaydi va qayta ishga tushmaydi), o'z nomi bilan foydalanuvchi (`erp`), baza (`erp`), xizmat (`erp`) va nginx sayti qo'shiladi, yig'ish past ustuvorlikda ketadi. 3100-port band bo'lsa: `ERP_PORT=3200 bash …/install.sh <domen>`. nginx sozlamasi tekshiruvdan o'tmasa, sayt yoqilmaydi va boshqa saytlarga tegilmaydi.

**Vaqtinchalik domen.** O'z domeni bo'lmaguncha DNS'ga hech narsa yozmasdan ishlaydigan nom: `savdo.<IP o'n oltilikda>.sslip.io` (masalan, 84.247.140.203 → `savdo.54f78ccb.sslip.io`) — u shu IP manzilga o'zi ko'rsatadi va unga sertifikat olinadi. Keyin haqiqiy domen bilan `install.sh` qayta ishga tushiriladi (manzil va nginx sayti yangilanadi), so'ng `certbot`.

**Sinov o'rnatishi.** `SEED_OWNER=example bash …/install.sh <domen>` — birinchi egasi tasodifiy parol o'rniga `server/.env.example` dagi login va parol bilan ochiladi. Bu parol hammaga ma'lum: haqiqiy ma'lumot kiritishdan oldin profilda almashtiring.

Keyin:

1. **HTTPS** (shusiz kirib bo'lmaydi — cookie faqat HTTPS da saqlanadi):

   ```bash
   apt-get install -y certbot python3-certbot-nginx
   certbot --nginx -d savdo.example.uz
   ```

   Sertifikat o'zi yangilanib turadi.

2. **Birinchi kirish.** Login va bir martalik parol sozlama faylida:

   ```bash
   grep SEED_OWNER /etc/erp/server.env
   ```

   Kirgach sozlash ustasi ochiladi (biznes nomi, asosiy valyuta, do'konlar). Parolni profilda almashtiring va `SEED_OWNER_PASSWORD` qatorini fayldan o'chiring.

3. **Tarmoq devori** (SSH standart portda bo'lsa):

   ```bash
   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
   ```

4. **Telegram (karta nazorati)** kerak bo'lsa: `my.telegram.org → API development tools` dagi ikki qiymat `/etc/erp/server.env` ga (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`) yoziladi va `systemctl restart erp`.

### Shu kompyuterdagi bazani ko'chirish (toza boshlash o'rniga)

Lokal bazada kiritilgan katalog, do'konlar va xodimlar serverga o'tadi. **Sinov xodimlari ham o'tadi** — ularning paroli umumiy, shuning uchun ko'chirgandan keyin ularni o'chiring yoki parollarini almashtiring.

```bash
# Shu kompyuterda (baza nomi server/.env dagi DB_NAME):
pg_dump --format=custom --no-owner -d <baza> -f erp.dump
scp erp.dump root@SERVER:/root/

# Serverda — birinchi biznesni yaratmasdan o'rnatib, bazani nusxadan tiklash:
SKIP_SEED=1 bash /opt/erp/src/deploy/install.sh savdo.example.uz
systemctl stop erp
sudo -u postgres dropdb erp
sudo -u postgres createdb --owner=erp_app --encoding=UTF8 --template=template0 erp
sudo -u postgres pg_restore --no-owner --role=erp_app -d erp /root/erp.dump
systemctl start erp
```

Rasmlar bo'lsa, `server/uploads` papkasining ichi `/var/lib/erp/uploads` ga ko'chiriladi (`chown -R erp:erp /var/lib/erp/uploads`).

## 3. Yangilash

Do'konlar yopilgandan keyin qilgan ma'qul: o'tish paytida bir necha soniya uzilish bo'ladi.

```bash
# A usulida avval yangi kod yuboriladi (1-bo'limdagi buyruq), keyin:
ssh root@SERVER 'bash /opt/erp/src/deploy/update.sh'
```

Skript avval zaxira oladi, yangi nusxani eskisining yonida yig'adi va tayyor bo'lgandagina unga o'tadi. Yig'ishda xato chiqsa, tizim avvalgi nusxada ishlayveradi; yangi nusxa ishga tushmasa, o'zi avvalgisiga qaytadi. Jadval o'zgarishlari (migratsiyalar) server ishga tushganda o'zi bajariladi.

Orqaga qaytish: `bash /opt/erp/src/deploy/update.sh --back` (kodni qaytaradi; baza o'zgargan bo'lsa, zaxiradan tiklash kerak bo'lishi mumkin).

## 4. Zaxira

Har kecha 03:15 da `/var/backups/erp` ga: bazaning to'liq nusxasi (14 kun saqlanadi) va rasmlar. Qo'lda: `bash /opt/erp/src/deploy/backup.sh`. Tiklash tartibi — `backup.sh` ning boshida.

**Bu nusxalar shu serverning o'zida turadi.** Server yo'qolsa, ular ham yo'qoladi. Papkani boshqa joyga ham ko'chirib turish kerak — masalan, ofisdagi kompyuter har kuni tortib oladi:

```bash
scp -r root@SERVER:/var/backups/erp ./erp-zaxira
```

yoki bulut omboriga (`rclone`). Qayerga ko'chirilishi hal qilingach, cron'ga qo'shiladi.

## 5. Kundalik

```bash
systemctl status erp          # ishlayaptimi
journalctl -u erp -f          # server yozuvlari (jonli)
journalctl -u erp --since today | grep -i error
tail -n 20 /var/log/erp-backup.log
df -h /                       # diskda joy
```

Sozlama o'zgarsa (`/etc/erp/server.env`): `systemctl restart erp`.

## 6. Do'kon agenti

Agent do'kon kompyuterida ishlaydi va shu domenga o'zi ulanadi (`agent/README.md`): `agent.json` dagi `url` — `https://savdo.example.uz`. Serverda uning uchun hech narsa ochilmaydi.
