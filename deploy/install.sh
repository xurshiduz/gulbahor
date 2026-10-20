#!/usr/bin/env bash
#
# Birinchi o'rnatish. Ubuntu 24.04 serverda, kod /opt/erp/src da turganda, root bo'lib:
#
#   sudo bash /opt/erp/src/deploy/install.sh savdo.example.uz
#
# Domen hali yo'q bo'lsa, o'rniga serverning IP manzili yoziladi (tizim HTTP da ochiladi; domen kelgach
# shu buyruq domen bilan qayta ishga tushiriladi).
#
# Serverda boshqa saytlar bo'lsa ham xalaqit bermaydi: o'z nomi bilan sayt, xizmat va baza qo'shadi.
#
# Qayta ishga tushirsa bo'ladi: bor narsaga (parollar, baza, nginx sozlamasi) tegmaydi, faqat yo'g'ini qo'shadi
# va kodni qaytadan yig'adi. Birinchi biznesni yaratmaslik uchun (baza nusxadan tiklanadigan bo'lsa):
#
#   sudo SKIP_SEED=1 bash /opt/erp/src/deploy/install.sh savdo.example.uz
#
# Sinov o'rnatishida birinchi egasi tasodifiy parol o'rniga namunadagi login va parol bilan ochiladi
# (server/.env.example dagi SEED_OWNER_LOGIN / SEED_OWNER_PASSWORD) — haqiqiy ma'lumot kiritilguncha almashtiring:
#
#   sudo SEED_OWNER=example bash /opt/erp/src/deploy/install.sh savdo.example.uz
#
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DOMAIN=${1:-}
[[ -n "$DOMAIN" ]] || fail "Domen (yoki IP manzil) kerak: sudo bash $0 savdo.example.uz"
need_root
[[ "$SRC" == "$BASE/src" ]] || fail "Kod $BASE/src da turishi kerak (hozir: $SRC). Yo'riqnoma: deploy/README.md"

# IP manzil bilan ochilganda sertifikat bo'lmaydi: tizim HTTP da ishlaydi.
if [[ "$DOMAIN" =~ ^[0-9.]+$ ]]; then
  ORIGIN="http://$DOMAIN"
else
  ORIGIN="https://$DOMAIN"
fi

say "Paketlar"
export DEBIAN_FRONTEND=noninteractive
# Faqat yo'g'i o'rnatiladi: serverda ishlab turgan boshqa dasturning nginx yoki PostgreSQL'i yangilanib,
# qayta ishga tushib ketmasin.
missing=()
need() { command -v "$1" >/dev/null 2>&1 || missing+=("${@:2}"); }
need curl curl ca-certificates
need git git
need rsync rsync
need openssl openssl
need gpg gnupg
need nginx nginx
need psql postgresql postgresql-contrib
if ((${#missing[@]})); then
  apt-get update -y
  apt-get install -y "${missing[@]}"
else
  echo "Kerakli paketlar bor — apt'ga tegilmadi"
fi

node_ok() {
  command -v node >/dev/null &&
    node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)'
}
if ! node_ok; then
  # Serverda boshqa dastur eski Node.js bilan ishlayotgan bo'lishi mumkin: uni so'ramasdan yangilab qo'ymaymiz.
  if command -v node >/dev/null && [[ "${FORCE_NODE:-}" != "1" ]]; then
    fail "Serverda Node.js $(node -v) bor, kerakligi 22.12 yoki yangirog'i. Uni boshqa dastur ishlatmasa: sudo FORCE_NODE=1 bash $0 $DOMAIN"
  fi
  say "Node.js 22"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node_ok || fail "Node.js 22.12 yoki yangirog'i o'rnatilmadi (hozir: $(node -v 2>/dev/null || echo yo\'q))"

as_postgres psql -Atc 'select 1' >/dev/null 2>&1 || systemctl enable --now postgresql
PG_VERSION=$(as_postgres psql -Atc 'show server_version_num')
((PG_VERSION >= 160000)) || fail "PostgreSQL 16 yoki yangirog'i kerak (hozir: $PG_VERSION). Ubuntu 24.04 da o'zi 16 keladi."
as_postgres psql -Atc "select 1 from pg_available_extensions where name = 'pg_trgm'" | grep -q 1 ||
  fail "PostgreSQL'da pg_trgm kengaytmasi yo'q: postgresql-contrib paketini o'rnating"
if [[ ! -f "$ENV_FILE" ]] && ss -ltnH "sport = :$PORT" | grep -q .; then
  fail "$PORT-port band. Boshqa port bilan: sudo ERP_PORT=3200 bash $0 $DOMAIN"
fi

say "Foydalanuvchi va papkalar"
id -u "$APP_USER" >/dev/null 2>&1 ||
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$DATA_DIR" "$DATA_DIR/uploads"
install -d -o root -g root -m 0700 "$BACKUP_DIR"
install -d -o root -g "$APP_USER" -m 0750 "$(dirname "$ENV_FILE")"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$BASE/releases"

say "Baza va sozlamalar"
if [[ ! -f "$ENV_FILE" ]]; then
  # Parollar shu yerda yasaladi va faqat sozlama fayliga yoziladi: ekranga chiqmaydi.
  DB_PASSWORD=$(openssl rand -hex 24)
  OWNER_LOGIN=admin
  OWNER_PASSWORD=$(openssl rand -hex 8)
  if [[ "${SEED_OWNER:-}" == "example" ]]; then
    OWNER_LOGIN=$(sed -n 's/^SEED_OWNER_LOGIN=//p' "$SRC/server/.env.example" | tr -d '\r')
    OWNER_PASSWORD=$(sed -n 's/^SEED_OWNER_PASSWORD=//p' "$SRC/server/.env.example" | tr -d '\r')
    [[ -n "$OWNER_LOGIN" && -n "$OWNER_PASSWORD" ]] || fail "server/.env.example da SEED_OWNER_LOGIN / SEED_OWNER_PASSWORD topilmadi"
  fi
  as_postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    ALTER ROLE $DB_USER LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$DB_PASSWORD';
  ELSE
    CREATE ROLE $DB_USER LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;
SQL
  (
    umask 027
    cat >"$ENV_FILE" <<ENV
NODE_ENV=production
PORT=$PORT
# Tizim brauzerda ochiladigan manzil. Domen o'zgarsa shu qator o'zgartiriladi va: systemctl restart erp
WEB_ORIGIN=$ORIGIN

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

UPLOADS_DIR=$DATA_DIR/uploads

JWT_SECRET=$(openssl rand -hex 48)
# Telegram akkauntlarining sessiyalari shu kalit bilan shifrlanadi. O'zgartirilsa, akkauntlarga qayta kiriladi.
TELEGRAM_SESSION_KEY=$(openssl rand -hex 32)
# Karta nazorati uchun (my.telegram.org -> API development tools). Bo'sh bo'lsa, Telegram'ga ulanilmaydi.
TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Birinchi biznes egasi. Birinchi kirgandan keyin parolni profilda almashtiring va PASSWORD qatorini o'chiring.
SEED_OWNER_LOGIN=$OWNER_LOGIN
SEED_OWNER_PASSWORD=$OWNER_PASSWORD
ENV
  )
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  echo "Yozildi: $ENV_FILE"
else
  # Parollarga tegilmaydi; manzil esa shu safar aytilgani (avval IP bilan, keyin domen bilan o'rnatilganda).
  sed -i "s|^WEB_ORIGIN=.*|WEB_ORIGIN=$ORIGIN|" "$ENV_FILE"
  echo "$ENV_FILE bor — faqat WEB_ORIGIN yangilandi"
fi
if ! as_postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  as_postgres createdb --owner="$DB_USER" --encoding=UTF8 --template=template0 "$DB_NAME"
  echo "Baza yaratildi: $DB_NAME"
fi

say "Xizmat (systemd)"
sed -e "s|__BASE__|$BASE|g" -e "s|__APP_USER__|$APP_USER|g" -e "s|__DATA_DIR__|$DATA_DIR|g" \
  "$SRC/deploy/erp.service" >/etc/systemd/system/erp.service
systemctl daemon-reload
systemctl enable erp >/dev/null

build_release

if [[ "${SKIP_SEED:-}" != "1" ]]; then
  say "Birinchi biznes"
  (cd "$BASE/current/server" && as_app node dist/database/cli.js seed)
fi

say "nginx"
# Shu domen uchun yozilgan sozlama bor bo'lsa tegilmaydi: unga certbot HTTPS qismini qo'shgan bo'lishi mumkin.
if ! grep -qs "server_name $DOMAIN;" /etc/nginx/sites-available/erp; then
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__BASE__|$BASE|g" -e "s|__PORT__|$PORT|g" \
    "$SRC/deploy/nginx.conf" >/etc/nginx/sites-available/erp
  ln -sfn /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp
else
  echo "/etc/nginx/sites-available/erp shu domen uchun yozilgan — tegilmadi"
fi
if ! nginx -t; then
  # Xato sozlama yoqilgan holda qolmasin: keyingi qayta yuklashda boshqa saytlar ham ko'tarilmay qolardi.
  rm -f /etc/nginx/sites-enabled/erp
  fail "nginx sozlamasi xato — sayt yoqilmadi, boshqa saytlarga tegilmadi: /etc/nginx/sites-available/erp"
fi
systemctl is-enabled --quiet nginx || systemctl enable nginx >/dev/null
systemctl reload nginx

say "Kunlik zaxira"
cat >/etc/cron.d/erp-backup <<CRON
# Har kecha 03:15 da baza va rasmlar: $BACKUP_DIR
15 3 * * * root bash $SRC/deploy/backup.sh >>/var/log/erp-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/erp-backup

say "Tayyor"
cat <<DONE
Tizim ishlayapti: $ORIGIN

Keyingi qadamlar:
  1. HTTPS (domen bilan o'rnatilgan bo'lsa; shusiz kirib bo'lmaydi):
       sudo apt-get install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d $DOMAIN
  2. Birinchi kirish: login va parol $ENV_FILE dagi SEED_OWNER_LOGIN va SEED_OWNER_PASSWORD
       sudo grep SEED_OWNER $ENV_FILE
     Kirgach parolni profilda almashtiring va SEED_OWNER_PASSWORD qatorini o'chiring.
  3. Tarmoq devori (SSH porti standart bo'lsa):
       sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

Holat:    systemctl status erp       Yozuvlar: journalctl -u erp -f
Yangilash: sudo bash $SRC/deploy/update.sh
DONE
