#!/usr/bin/env bash
# Route Brave through Burp (listener on 127.0.0.1:39607 on this machine).
# Install Burp CA: Proxy → Options → Import / export CA certificate → DER,
# then Settings → Privacy → Security → Manage certificates → Authorities → Import.
set -euo pipefail

BURP_PROXY="${BURP_PROXY:-127.0.0.1:39607}"
PROFILE_DIR="${BRAVE_BURP_PROFILE:-/tmp/brave-burp-telegram}"
CDP_PORT="${CDP_PORT:-9222}"

mkdir -p "$PROFILE_DIR"

exec brave-browser \
  --remote-debugging-port="$CDP_PORT" \
  --proxy-server="http://${BURP_PROXY}" \
  --ignore-certificate-errors \
  --user-data-dir="$PROFILE_DIR" \
  "https://web.telegram.org/k/"
