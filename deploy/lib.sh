#!/usr/bin/env bash
# install.sh, update.sh va backup.sh uchun umumiy qism. O'zi ishga tushirilmaydi.

# Kod qayerda turadi: BASE/src — manba (git clone yoki yuklangan nusxa), BASE/releases/<vaqt> — yig'ilgan
# nusxalar, BASE/current — hozir ishlayotganiga havola.
BASE=${ERP_BASE:-/opt/erp}
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_USER=erp
DATA_DIR=/var/lib/erp
BACKUP_DIR=${BACKUP_DIR:-/var/backups/erp}
ENV_FILE=/etc/erp/server.env
DB_NAME=erp
DB_USER=erp_app
PORT=${ERP_PORT:-3100}
# O'rnatilgan tizimda port sozlama faylida turadi: yangilash ham shuni o'qiydi.
if [[ -z "${ERP_PORT:-}" && -r "$ENV_FILE" ]]; then
  PORT=$(sed -n 's/^PORT=//p' "$ENV_FILE" | head -n 1)
  PORT=${PORT:-3100}
fi
KEEP_RELEASES=3

say() { printf '\n== %s\n' "$*"; }
fail() {
  printf 'XATO: %s\n' "$*" >&2
  exit 1
}
need_root() { [[ $EUID -eq 0 ]] || fail "Root bo'lib ishga tushiring: sudo bash $0"; }
as_app() { runuser -u "$APP_USER" -- env HOME="$DATA_DIR" "$@"; }
as_postgres() { runuser -u postgres -- "$@"; }

# Server javob beryaptimi: kirilmagan so'rovga 401 qaytsa ham ishlayapti degani.
wait_for_api() {
  local code
  for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/auth/me" || true)
    if [[ "$code" != "000" ]]; then
      return 0
    fi
    sleep 1.5
  done
  return 1
}

# Manbadan yangi nusxa yig'adi va unga o'tadi. Yig'ish tugamaguncha ishlab turgan nusxaga tegilmaydi:
# xato chiqsa, tizim avvalgisida ishlayveradi.
build_release() {
  local stamp new previous
  stamp=$(date +%Y%m%d-%H%M%S)
  new="$BASE/releases/$stamp"
  previous=$(readlink -f "$BASE/current" 2>/dev/null || true)

  say "Yangi nusxa: $new"
  install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$BASE/releases" "$new"
  rsync -a --exclude node_modules --exclude dist --exclude '/.git' --exclude '.env' --exclude '.env.*' \
    --exclude '/server/uploads' --exclude '/local' --exclude agent.json "$SRC/" "$new/"
  ln -sfn "$ENV_FILE" "$new/server/.env"
  chown -R "$APP_USER:$APP_USER" "$new"

  say "Bog'liqliklar va yig'ish (bir necha daqiqa)"
  # Past ustuvorlikda: serverda ishlab turgan boshqa dasturlarga xalaqit bermasin.
  (cd "$new" && as_app nice -n 10 npm ci --no-audit --no-fund && as_app nice -n 10 npm run build)

  # Eski sahifa ochiq turgan brauzer keyin so'raydigan fayllar yo'qolib qolmasin: avvalgi nusxaning so'nggi
  # ikki haftada yig'ilgan fayllari yangisining yonida qoladi.
  if [[ -n "$previous" && -d "$previous/web/dist/assets" ]]; then
    (cd "$previous/web/dist/assets" && find . -type f -mtime -14 -print0 |
      rsync -a --ignore-existing --from0 --files-from=- . "$new/web/dist/assets/") || true
  fi
  # nginx o'qiy olishi uchun (serverda umask qattiq bo'lsa ham).
  chown -R "$APP_USER:$APP_USER" "$new/web/dist"
  chmod a+rx "$BASE" "$BASE/releases" "$new" "$new/web"
  chmod -R a+rX "$new/web/dist"

  say "O'tish"
  ln -sfn "$new" "$BASE/current"
  systemctl restart erp
  if ! wait_for_api; then
    journalctl -u erp -n 60 --no-pager || true
    if [[ -n "$previous" && -d "$previous" ]]; then
      ln -sfn "$previous" "$BASE/current"
      systemctl restart erp || true
      fail "Yangi nusxa ishga tushmadi — avvalgisiga qaytarildi ($previous). Yuqoridagi yozuvlarga qarang."
    fi
    fail "Server ishga tushmadi. Yuqoridagi yozuvlarga qarang."
  fi

  # Eng oxirgi bir nechtasi qoladi: orqaga qaytish uchun. Nomi — vaqti, shuning uchun nom bo'yicha saralanadi.
  find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((KEEP_RELEASES + 1)) |
    xargs -r rm -rf
  echo "Ishlayapti: $new"
}
