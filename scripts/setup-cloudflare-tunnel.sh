#!/usr/bin/env bash
# Run this AFTER completing cloudflared tunnel login in the browser.
# Usage: ./scripts/setup-cloudflare-tunnel.sh

set -e
CLOUDFLARED_CONFIG="$HOME/.cloudflared"
TUNNEL_NAME="squatsense"
HOSTNAME="app.squatsense.ai"

if [[ ! -f "$CLOUDFLARED_CONFIG/cert.pem" ]]; then
  echo "Missing $CLOUDFLARED_CONFIG/cert.pem — run 'cloudflared tunnel login' and complete the browser auth first."
  exit 1
fi

echo "Creating tunnel '$TUNNEL_NAME'..."
cloudflared tunnel create "$TUNNEL_NAME"

# Credentials file is written as <tunnel-id>.json (UUID format)
TUNNEL_ID=""
for f in "$CLOUDFLARED_CONFIG"/*.json; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f" .json)
  # UUID is 36 chars with hyphens
  if [[ "$base" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    TUNNEL_ID="$base"
    break
  fi
done
if [[ -z "$TUNNEL_ID" ]]; then
  echo "Could not find tunnel credentials in $CLOUDFLARED_CONFIG"
  exit 1
fi

echo "Tunnel ID: $TUNNEL_ID"
CREDENTIALS_FILE="$CLOUDFLARED_CONFIG/${TUNNEL_ID}.json"
if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "Credentials file not found: $CREDENTIALS_FILE"
  exit 1
fi

echo "Writing $CLOUDFLARED_CONFIG/config.yml..."
cat > "$CLOUDFLARED_CONFIG/config.yml" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDENTIALS_FILE

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:8000
  - service: http_status:404
EOF

echo "Routing DNS: $HOSTNAME -> tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

echo ""
echo "Done. To run the full app + tunnel:"
echo "  1) Terminal 1: cd $(dirname "$0")/.. && uvicorn web_app:app --host 0.0.0.0 --port 8000"
echo "  2) Terminal 2: cloudflared tunnel run $TUNNEL_NAME"
echo "Then open https://$HOSTNAME"
echo ""
