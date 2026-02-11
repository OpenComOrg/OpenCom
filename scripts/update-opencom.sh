#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DO_PULL=0
DO_BACKUP=0
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull) DO_PULL=1 ;;
    --backup) DO_BACKUP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--pull] [--backup] [--skip-build]"
      exit 1
      ;;
  esac
  shift
done

if [[ $DO_PULL -eq 1 ]]; then
  echo "Pulling latest code..."
  git -C "$ROOT_DIR" pull --rebase
fi

if [[ $DO_BACKUP -eq 1 ]]; then
  backup_path="$ROOT_DIR/backups/opencom-$(date +%Y%m%d-%H%M%S).tar.gz"
  echo "Creating backup at $backup_path"
  "$ROOT_DIR/scripts/migrate-portability.sh" export "$backup_path"
fi

echo "Installing backend dependencies..."
npm --prefix "$ROOT_DIR/backend" install

echo "Installing frontend dependencies..."
npm --prefix "$ROOT_DIR/frontend" install

echo "Running database migrations..."
npm --prefix "$ROOT_DIR/backend" run migrate:core
npm --prefix "$ROOT_DIR/backend" run migrate:node

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "Building backend packages..."
  npm --prefix "$ROOT_DIR/backend" run build

  echo "Building frontend..."
  npm --prefix "$ROOT_DIR/frontend" run build
fi

echo "Update complete."
