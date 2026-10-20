#!/usr/bin/env bash
#
# Zaxira: bazaning to'liq nusxasi (har safar yangi fayl, 14 kun saqlanadi) va rasmlar (bitta papka, faqat
# yangilari qo'shiladi). install.sh buni har kecha ishga tushadigan qilib qo'yadi; qo'lda:
#
#   sudo bash /opt/erp/src/deploy/backup.sh
#
# Tiklash:
#   sudo systemctl stop erp
#   sudo -u postgres dropdb erp && sudo -u postgres createdb --owner=erp_app --encoding=UTF8 --template=template0 erp
#   sudo -u postgres pg_restore --no-owner --role=erp_app -d erp /var/backups/erp/erp-<sana>.dump
#   sudo rsync -a /var/backups/erp/uploads/ /var/lib/erp/uploads/ && sudo chown -R erp:erp /var/lib/erp/uploads
#   sudo systemctl start erp
#
# Bu nusxalar shu serverning o'zida turadi. Server yo'qolsa ular ham yo'qoladi: papkani boshqa joyga ham
# ko'chirib turing (deploy/README.md, "Zaxira").
#
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_root

KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d-%H%M)
TARGET="$BACKUP_DIR/$DB_NAME-$STAMP.dump"

install -d -o root -g root -m 0700 "$BACKUP_DIR"
# Yarim yozilgan fayl zaxira bo'lib ko'rinmasin: avval boshqa nom bilan, tugagach o'z nomiga.
as_postgres pg_dump --format=custom "$DB_NAME" >"$TARGET.part"
mv "$TARGET.part" "$TARGET"

if [[ -d "$DATA_DIR/uploads" ]]; then
  install -d -m 0700 "$BACKUP_DIR/uploads"
  rsync -a "$DATA_DIR/uploads/" "$BACKUP_DIR/uploads/"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name "$DB_NAME-*.dump" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.part' -mtime +1 -delete

echo "$(date '+%F %T') zaxira: $TARGET ($(du -h "$TARGET" | cut -f1))"
