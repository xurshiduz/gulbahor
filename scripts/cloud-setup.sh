#!/bin/bash
# Makes a Claude cloud session able to run everything this repository asks for before a piece of work is
# called done: the packages, the database the server tests run against, and the settings file the server
# reads. On a developer's own computer it does nothing — there the database and `server/.env` are theirs.
#
# It runs by itself when a cloud session starts (`.claude/settings.json`), and can be run again by hand:
#   bash scripts/cloud-setup.sh
# Nothing in it is a secret: the password and the key it writes are made up on the spot, for a database
# that lives and dies with the session's own machine.

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

set -u
cd "$(dirname "$0")/.." || exit 0

log() { echo "[cloud-setup] $*"; }

as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo -n "$@"; fi
}

# Runs the SQL given on standard input as the database's own superuser, on the database named.
run_sql() {
  local database=$1 file status
  file=$(mktemp /tmp/cloud-setup-XXXXXX.sql)
  cat > "$file"
  chmod 644 "$file"
  if [ "$(id -u)" = "0" ]; then
    su postgres -c "psql -v ON_ERROR_STOP=1 -q -tA -d $database -f $file"
  else
    sudo -n -u postgres psql -v ON_ERROR_STOP=1 -q -tA -d "$database" -f "$file"
  fi
  status=$?
  rm -f "$file"
  return $status
}

# ── The settings the server reads ──
# Written once; a session that is resumed keeps the file it has, and the database is told the same password again.
if [ ! -f server/.env ]; then
  cat > server/.env <<EOF
NODE_ENV=development
PORT=3100
WEB_ORIGIN=http://localhost:5190
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=gulbahor_app
DB_PASSWORD=$(openssl rand -hex 16)
DB_NAME=gulbahor
DB_TEST_NAME=gulbahor_test
JWT_SECRET=$(openssl rand -hex 32)
SEED_OWNER_LOGIN=admin
SEED_OWNER_PASSWORD=$(openssl rand -hex 8)
EOF
  log "wrote server/.env"
fi
DB_PASSWORD=$(grep '^DB_PASSWORD=' server/.env | cut -d= -f2-)

# ── The database ──
# PostgreSQL is on the machine and not running. The application connects as a role that is no superuser:
# a superuser walks past row-level security, and the tests are there to see that nobody does.
as_root service postgresql start > /dev/null 2>&1
for _ in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done
if pg_isready -q; then
  run_sql postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gulbahor_app') THEN
    CREATE ROLE gulbahor_app LOGIN;
  END IF;
END \$\$;
ALTER ROLE gulbahor_app PASSWORD '$DB_PASSWORD';
SQL
  for database in gulbahor gulbahor_test; do
    run_sql postgres <<SQL
SELECT 'CREATE DATABASE $database OWNER gulbahor_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$database') \gexec
SQL
    # The first migration asks for this extension; made here so that it never depends on what the role may do.
    run_sql "$database" <<SQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
  done
  log "database ready: gulbahor, gulbahor_test"
else
  log "PostgreSQL did not start: the server tests will not run until it does (service postgresql start)"
fi

# ── The packages, and the two packages the others are built on ──
if [ ! -d node_modules ]; then
  log "installing packages"
  npm ci --no-audit --no-fund > /tmp/cloud-setup-npm.log 2>&1 || log "npm ci failed: see /tmp/cloud-setup-npm.log"
fi
npm run build:core > /dev/null 2>&1 || log "build:core failed"
npm run build:agent > /dev/null 2>&1 || log "build:agent failed"

log "done: npm run typecheck, npm run lint, npm test"
exit 0
