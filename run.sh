#!/bin/sh
set -eu
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then exec node tools/serve.mjs; fi
printf '\nOpen http://127.0.0.1:8080 in your browser.\n'
exec python3 -m http.server 8080 --bind 127.0.0.1
