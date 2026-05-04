#!/usr/bin/env bash

set -euo pipefail

SESSION_NAME="${1:-ingeniometrix}"

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  tmux attach -t "${SESSION_NAME}"
else
  tmux new -s "${SESSION_NAME}"
fi
