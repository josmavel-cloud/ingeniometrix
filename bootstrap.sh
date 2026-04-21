#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_PACKAGES=(
  git
  curl
  wget
  build-essential
  zip
  unzip
  jq
  ripgrep
  tree
  htop
  tmux
  python3
  python3-venv
  python3-pip
  ca-certificates
  gnupg
  lsb-release
)

DOCKER_PACKAGES=(
  docker-ce
  docker-ce-cli
  containerd.io
  docker-buildx-plugin
  docker-compose-plugin
)

NODESOURCE_MAJOR="${NODESOURCE_MAJOR:-20}"
INSTALL_TAILSCALE="${INSTALL_TAILSCALE:-1}"
INSTALL_DOCKER="${INSTALL_DOCKER:-1}"
INSTALL_NODE="${INSTALL_NODE:-1}"

log() {
  printf '\n[%s] %s\n' "bootstrap" "$1"
}

need_sudo() {
  if [[ "${EUID}" -ne 0 ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

ensure_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This bootstrap script currently supports Debian/Ubuntu environments only."
    exit 1
  fi
}

detect_wsl() {
  if grep -qi microsoft /proc/version 2>/dev/null; then
    return 0
  fi
  return 1
}

install_base_packages() {
  log "Installing base packages"
  need_sudo apt-get update
  need_sudo apt-get install -y "${BASE_PACKAGES[@]}"
}

install_docker() {
  if [[ "${INSTALL_DOCKER}" != "1" ]]; then
    log "Skipping Docker installation because INSTALL_DOCKER=${INSTALL_DOCKER}"
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker --version >/dev/null 2>&1; then
    log "Docker already installed"
    return
  fi

  log "Installing Docker Engine and Docker Compose plugin"
  need_sudo install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | need_sudo tee /etc/apt/keyrings/docker.asc >/dev/null
    need_sudo chmod a+r /etc/apt/keyrings/docker.asc
  fi

  local arch codename
  arch="$(dpkg --print-architecture)"
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"

  cat <<EOF | need_sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable
EOF

  need_sudo apt-get update
  need_sudo apt-get install -y "${DOCKER_PACKAGES[@]}"

  if id -nG "${USER}" | grep -qw docker; then
    log "User already belongs to docker group"
  else
    need_sudo usermod -aG docker "${USER}"
    log "Added ${USER} to docker group. Re-login may be required."
  fi
}

install_node() {
  if [[ "${INSTALL_NODE}" != "1" ]]; then
    log "Skipping Node.js installation because INSTALL_NODE=${INSTALL_NODE}"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    log "Node.js already installed: $(node --version)"
    return
  fi

  log "Installing Node.js from NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODESOURCE_MAJOR}.x" | need_sudo bash -
  need_sudo apt-get install -y nodejs
}

install_tailscale() {
  if [[ "${INSTALL_TAILSCALE}" != "1" ]]; then
    log "Skipping Tailscale installation because INSTALL_TAILSCALE=${INSTALL_TAILSCALE}"
    return
  fi

  if command -v tailscale >/dev/null 2>&1; then
    log "Tailscale already installed"
    return
  fi

  log "Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | need_sudo bash
}

print_notes() {
  log "Bootstrap completed"
  echo "Next step:"
  echo "  ./setup-dev.sh"
  echo
  echo "Notes:"
  echo "  - Ubuntu is the reference environment."
  echo "  - WSL is supported, but Ubuntu remains the source of truth."
  echo "  - If Docker group membership was just added, start a new shell session."
  if detect_wsl; then
    echo "  - WSL detected. Verify Docker and systemd behavior in your distribution."
  fi
}

main() {
  ensure_apt
  install_base_packages
  install_docker
  install_node
  install_tailscale
  print_notes
}

main "$@"
