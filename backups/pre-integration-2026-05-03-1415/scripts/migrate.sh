#!/usr/bin/env bash

set -euo pipefail

npm run db:push
npm run prisma:generate
