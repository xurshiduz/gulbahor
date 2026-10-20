#!/usr/bin/env bash
#
# Yangilash: avval zaxira, keyin yangi kod yonma-yon yig'iladi va tayyor bo'lgach unga o'tiladi (bir necha
# soniya uzilish). Yig'ishda xato chiqsa, tizim avvalgi nusxada ishlayveradi; yangi nusxa ishga tushmasa,
# avvalgisiga o'zi qaytadi. Migratsiyalar server ishga tushganda o'zi bajariladi.
#
#   sudo bash /opt/erp/src/deploy/update.sh
#
# Orqaga qaytish (bazaga tegmaydi — migratsiya bo'lgan bo'lsa, zaxiradan tiklash kerak bo'lishi mumkin):
#
#   sudo bash /opt/erp/src/deploy/update.sh --back
#
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_root

if [[ "${1:-}" == "--back" ]]; then
  current=$(readlink -f "$BASE/current")
  previous=$(ls -1dt "$BASE"/releases/*/ | sed 's|/$||' | grep -v -x "$current" | head -n 1 || true)
  [[ -n "$previous" ]] || fail "Avvalgi nusxa yo'q"
  ln -sfn "$previous" "$BASE/current"
  systemctl restart erp
  wait_for_api || fail "Avvalgi nusxa ham ishga tushmadi: journalctl -u erp -n 60"
  echo "Qaytildi: $previous"
  exit 0
fi

say "Zaxira"
bash "$SRC/deploy/backup.sh"

# Kod git bilan olingan bo'lsa, yangisi shu yerda tortiladi; yuklab qo'yilgan bo'lsa, u allaqachon joyida.
if [[ -d "$SRC/.git" ]]; then
  say "Kod"
  git -C "$SRC" pull --ff-only
  git -C "$SRC" log -1 --format='%h %s'
fi

build_release
