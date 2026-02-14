# Run SquatSense with Cloudflare Tunnel

Expose your local (or server) **full app** at **app.squatsense.ai** using Cloudflare Tunnel. The main site **squatsense.ai** is the landing page (Vercel); the app (upload + live analysis) runs at **app.squatsense.ai** via this tunnel.

## 1. Prerequisites

- The **squatsense.ai** domain in [Cloudflare](https://dash.cloudflare.com) with Cloudflare nameservers.
- The machine where the full app will run (your Mac or a Linux server).

## 2. Run the app

From the project root:

```bash
cd coachless_squat_poc
pip install -r requirements.txt
uvicorn web_app:app --host 0.0.0.0 --port 8000
```

Keep this running. The app is now at `http://localhost:8000`.

## 3. Install Cloudflare Tunnel (cloudflared)

**macOS (Homebrew):**
```bash
brew install cloudflared
```

**Linux:**
```bash
# Debian/Ubuntu
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Or use the install script
curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

**Windows:** Download from [cloudflared releases](https://github.com/cloudflare/cloudflared/releases).

## 4. Log in and create a tunnel

One-time login (opens browser):

```bash
cloudflared tunnel login
```

Create a named tunnel:

```bash
cloudflared tunnel create squatsense
```

Note the tunnel **ID** from the output (e.g. `abc123-def456-...`). You’ll use it in the next step.

## 5. Route app.squatsense.ai to the app

Create a config file. Replace `YOUR_TUNNEL_ID` and `YOUR_USERNAME`:

```bash
mkdir -p ~/.cloudflared
```

**macOS/Linux:** `~/.cloudflared/config.yml`

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: app.squatsense.ai
    service: http://localhost:8000
  - service: http_status:404
```

(Only **app.squatsense.ai** goes through the tunnel. **squatsense.ai** stays on Vercel as the landing page.)

- Replace `YOUR_TUNNEL_ID` with the ID from step 4.
- Replace `YOUR_USERNAME` with your macOS username (path to the credentials file).
- The credentials file is written by `cloudflared tunnel create`; its path is usually `~/.cloudflared/<TUNNEL_ID>.json`.

## 6. Route DNS in Cloudflare

Tell Cloudflare to send **app.squatsense.ai** to this tunnel:

```bash
cloudflared tunnel route dns squatsense app.squatsense.ai
```

(Use your tunnel name if you chose something other than `squatsense`.)

Or in **Cloudflare Dashboard → DNS** for squatsense.ai, add:

- **Type:** CNAME  
- **Name:** `app`  
- **Target:** `YOUR_TUNNEL_ID.cfargotunnel.com`  
- **Proxy status:** Proxied (orange cloud)

## 7. Run the tunnel

```bash
cloudflared tunnel run squatsense
```

Leave this running. Visit **https://app.squatsense.ai** — it should show the full app (upload + live analysis). The landing page at **https://squatsense.ai** (Vercel) links to it.

## 8. Run both app and tunnel (two terminals)

- **Terminal 1:** `uvicorn web_app:app --host 0.0.0.0 --port 8000`
- **Terminal 2:** `cloudflared tunnel run squatsense`

Or run the app in the background:

```bash
uvicorn web_app:app --host 0.0.0.0 --port 8000 &
cloudflared tunnel run squatsense
```

## Optional: run tunnel as a service

**macOS (LaunchAgent)** or **Linux (systemd)** can run `cloudflared tunnel run squatsense` at boot so you don’t have to start it by hand. See [Cloudflare: Run a tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/#run-a-tunnel).

## Troubleshooting

- **502 / connection refused:** Ensure `uvicorn` is running on port 8000 before starting the tunnel.
- **Domain not found:** Confirm the domain is in Cloudflare and the CNAME points to `*.cfargotunnel.com` (or you ran `cloudflared tunnel route dns`).
- **Tunnel ID / config:** Use the same tunnel ID in `config.yml` and in the path to the `.json` credentials file.
