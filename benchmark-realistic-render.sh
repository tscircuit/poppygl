#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec bun scripts/benchmark-realistic-render.ts "$@"
