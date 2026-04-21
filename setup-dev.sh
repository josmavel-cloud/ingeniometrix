#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

log() {
  printf '\n[%s] %s\n' "setup-dev" "$1"
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
}

check_prerequisites() {
  log "Checking required commands"
  require_command git
  require_command python3
  require_command docker
  require_command npm
}

prepare_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    log "Creating .env from .env.example"
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  else
    log ".env already exists"
  fi
}

prepare_directories() {
  log "Ensuring local artifact directories exist"
  mkdir -p \
    "${ROOT_DIR}/artifacts" \
    "${ROOT_DIR}/app" \
    "${ROOT_DIR}/components" \
    "${ROOT_DIR}/lib" \
    "${ROOT_DIR}/server" \
    "${ROOT_DIR}/llm" \
    "${ROOT_DIR}/ai/schemas" \
    "${ROOT_DIR}/templates" \
    "${ROOT_DIR}/prisma" \
    "${ROOT_DIR}/scripts" \
    "${ROOT_DIR}/ops/systemd" \
    "${ROOT_DIR}/tests"
}

install_node_dependencies() {
  if [[ -f "${ROOT_DIR}/package.json" ]]; then
    log "Installing Node.js dependencies"
    npm install
  else
    log "Skipping npm install because package.json is not present"
  fi
}

start_database() {
  log "Starting PostgreSQL via Docker Compose"
  docker compose -f "${ROOT_DIR}/compose.yml" up -d
}

show_next_steps() {
  log "Repository setup completed"
  echo "Next suggested checks:"
  echo "  docker compose ps"
  echo "  tree -L 2 ."
  echo
  echo "Current stage notes:"
  echo "  - package.json is not created yet, so Node dependency install is skipped."
  echo "  - app logic is not implemented yet."
  echo "  - fill in .env values before wiring Prisma or provider credentials."
}

main() {
  check_prerequisites
  prepare_env_file
  prepare_directories
  install_node_dependencies
  start_database
  show_next_steps
}

main "$@"
