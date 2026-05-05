#!/usr/bin/env sh
set -eu

STACK="local"
RESET="false"
START_APP="false"

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
    -h|--help)
      echo "Usage: ./setup.sh [--stack local|full|prod] [--reset] [--start-app]"
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

if [ ! -f .env ]; then
  [ -f .env.example ] || { echo ".env.example was not found." >&2; exit 1; }
  cp .env.example .env

  DB_PASSWORD="$(new_secret 24)"
  set_env_value "DB_USER" "$DB_USER_DEFAULT"
  set_env_value "DB_PASSWORD" "$DB_PASSWORD"
  set_env_value "DB_NAME" "$DB_NAME_DEFAULT"
  set_env_value "ADMIN_PASSWORD" "$(new_secret 18)"
  set_env_value "JWT_SECRET" "$(new_secret 48)"
  set_env_value "JICOFO_AUTH_PASSWORD" "$(new_secret 24)"
  set_env_value "JICOFO_COMPONENT_SECRET" "$(new_secret 24)"
  set_env_value "JVB_AUTH_PASSWORD" "$(new_secret 24)"
  set_env_value "DATABASE_URL" "postgresql://${DB_USER_DEFAULT}:${DB_PASSWORD}@localhost:5432/${DB_NAME_DEFAULT}"

  echo "[setup] Created .env with generated local secrets."
else
  echo "[setup] Using existing .env."
fi

if [ "$RESET" = "true" ]; then
  echo "[setup] Resetting database volume for $COMPOSE_FILE..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
fi

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
