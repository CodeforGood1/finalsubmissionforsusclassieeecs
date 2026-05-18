#!/usr/bin/env sh
set -eu

STACK="local"
RESET="false"
START_APP="false"
SKIP_PORT_CHECK="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --stack)
      STACK="${2:-}"
      shift 2
      ;;
    --reset)
      RESET="true"
      shift
      ;;
    --start-app)
      START_APP="true"
      shift
      ;;
    --skip-port-check)
      SKIP_PORT_CHECK="true"
      shift
      ;;
    -h|--help)
      echo "Usage: ./setup.sh [--stack local|full|prod] [--reset] [--start-app] [--skip-port-check]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

case "$STACK" in
  local) COMPOSE_FILE="docker-compose.local.yml"; CONTAINER="lms-db"; DB_USER_DEFAULT="lms_user"; DB_NAME_DEFAULT="lms_db" ;;
  full) COMPOSE_FILE="docker-compose.yml"; CONTAINER="lms-database"; DB_USER_DEFAULT="lms_admin"; DB_NAME_DEFAULT="sustainable_classroom" ;;
  prod) COMPOSE_FILE="docker-compose.prod.yml"; CONTAINER="lms-database"; DB_USER_DEFAULT="lms_admin"; DB_NAME_DEFAULT="sustainable_classroom" ;;
  *) echo "Stack must be one of: local, full, prod" >&2; exit 1 ;;
esac

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed or not on PATH." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is not available." >&2; exit 1; }

new_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1" | tr -d '\n' | tr '+/' 'AB' | tr -d '='
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"
  fi
}

set_env_value() {
  name="$1"
  value="$2"
  if grep -q "^${name}=" .env; then
    tmp=".env.tmp.$$"
    sed "s|^${name}=.*|${name}=${value}|" .env > "$tmp"
    mv "$tmp" .env
  else
    printf '%s=%s\n' "$name" "$value" >> .env
  fi
}

get_env_value() {
  grep "^$1=" .env | head -n 1 | cut -d= -f2-
}

get_env_value_or_default() {
  value="$(get_env_value "$1" || true)"
  if [ -z "$value" ]; then
    echo "$2"
  else
    echo "$value"
  fi
}

port_in_use() {
  port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn | awk '{print $4}' | grep -Eq "[:.]${port}$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  else
    return 1
  fi
}

assert_ports_available() {
  [ "$SKIP_PORT_CHECK" = "true" ] && return 0
  busy=""
  for port in "$@"; do
    if port_in_use "$port"; then
      busy="$busy $port"
    fi
  done

  [ -z "$busy" ] && return 0

  echo ""
  echo "[setup] One or more required ports are already in use:"
  for port in $busy; do
    echo "  Port $port"
  done
  echo ""
  echo "Non-technical fix:"
  echo "  1. Close the app using the port, or restart Docker Desktop."
  echo "  2. If you cannot close it, edit .env and change the matching HOST_*_PORT value."
  echo "     Example: HOST_POSTGRES_PORT=15432"
  echo "  3. If HOST_POSTGRES_PORT changes, also update DATABASE_URL to use that port."
  echo "  4. Run setup again."
  exit 1
}

if [ ! -f .env ]; then
  [ -f .env.example ] || { echo ".env.example was not found." >&2; exit 1; }
  cp .env.example .env

  DB_PASSWORD="$(new_secret 24)"
  set_env_value "DB_USER" "$DB_USER_DEFAULT"
  set_env_value "DB_PASSWORD" "$DB_PASSWORD"
  set_env_value "DB_NAME" "$DB_NAME_DEFAULT"
  set_env_value "ADMIN_PASSWORD" "$(new_secret 18)"
  set_env_value "JWT_SECRET" "$(new_secret 48)"
  set_env_value "DB_BACKUP_ENCRYPTION_KEY" "$(new_secret 48)"
  set_env_value "JICOFO_AUTH_PASSWORD" "$(new_secret 24)"
  set_env_value "JICOFO_COMPONENT_SECRET" "$(new_secret 24)"
  set_env_value "JVB_AUTH_PASSWORD" "$(new_secret 24)"
  set_env_value "HOST_POSTGRES_PORT" "5432"
  set_env_value "DATABASE_URL" "postgresql://${DB_USER_DEFAULT}:${DB_PASSWORD}@localhost:5432/${DB_NAME_DEFAULT}"

  echo "[setup] Created .env with generated local secrets."
else
  echo "[setup] Using existing .env."
fi

if [ "$RESET" = "true" ]; then
  echo "[setup] Resetting database volume for $COMPOSE_FILE..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
fi

PORTS=""
if [ "$STACK" = "local" ]; then
  PORTS="$(get_env_value_or_default HOST_POSTGRES_PORT 5432)"
fi
if [ "$START_APP" = "true" ]; then
  if [ "$STACK" = "full" ] || [ "$STACK" = "prod" ]; then
    PORTS="$PORTS $(get_env_value_or_default HOST_HTTP_PORT 80) $(get_env_value_or_default HOST_BACKEND_PORT 5000)"
  else
    PORTS="$PORTS $(get_env_value_or_default HOST_SMTP_PORT 1025)"
  fi
  PORTS="$PORTS $(get_env_value_or_default HOST_MAILHOG_WEB_PORT 8025) $(get_env_value_or_default HOST_JITSI_HTTPS_PORT 8443) $(get_env_value_or_default HOST_JITSI_COLIBRI_PORT 4443)"
fi
assert_ports_available $PORTS

echo "[setup] Starting $STACK stack database..."
if [ "$START_APP" = "true" ]; then
  docker compose -f "$COMPOSE_FILE" up -d
else
  docker compose -f "$COMPOSE_FILE" up -d postgres
fi

if [ "$STACK" = "local" ]; then
  DB_USER="$(get_env_value DB_USER)"
  DB_NAME="$(get_env_value DB_NAME)"
else
  DB_USER="lms_admin"
  DB_NAME="sustainable_classroom"
fi

echo "[setup] Waiting for PostgreSQL to become ready..."
ready="false"
i=1
while [ "$i" -le 60 ]; do
  if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    ready="true"
    break
  fi
  sleep 2
  i=$((i + 1))
done

if [ "$ready" != "true" ]; then
  echo "PostgreSQL did not become ready. Run: docker compose -f $COMPOSE_FILE logs postgres" >&2
  exit 1
fi

echo "[setup] Database is ready. Docker automatically applied:"
echo "        backend/FRESH-COMPLETE-DATABASE.sql"
echo "        backend/notification-system.sql"
echo ""
echo "Connection:"
echo "  docker exec -it $CONTAINER psql -U $DB_USER -d $DB_NAME"
echo ""
echo "Admin login:"
echo "  Email:    $(get_env_value ADMIN_EMAIL)"
echo "  Password: $(get_env_value ADMIN_PASSWORD)"

if [ "$START_APP" != "true" ]; then
  echo ""
  echo "Start the app later with:"
  echo "  docker compose -f $COMPOSE_FILE up -d"
fi
