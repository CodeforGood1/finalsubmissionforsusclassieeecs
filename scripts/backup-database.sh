#!/usr/bin/env bash
set -euo pipefail

# Runs the same verified, encrypted backup path used by the backend service.
# Requires root .env values and pg_dump on PATH when running outside Docker.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR/backend"
npm run backup:db
