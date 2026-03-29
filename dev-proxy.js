/**
 * Reverse proxy that combines frontend (3000) and backend (8000) on port 4000.
 * Routes /api/* and /ws/* to backend, everything else to frontend.
 * Use with: ngrok http 4000
 */
const http = require("http");
const httpProxy = require("http-proxy");

const FRONTEND = "http://localhost:3000";
const BACKEND = "http://localhost:8000";
const PORT = 4000;

const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on("error", (err, req, res) => {
  console.error(`[proxy] Error: ${err.message}`);
  if (res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad Gateway");
  }
});

const server = http.createServer((req, res) => {
  const target = req.url.startsWith("/api/") ? BACKEND : FRONTEND;
  proxy.web(req, res, { target });
});

// WebSocket upgrade — route /api/ (including /api/v1/live/ws) to backend
server.on("upgrade", (req, socket, head) => {
  const target = req.url.startsWith("/api/") ? BACKEND : FRONTEND;
  proxy.ws(req, socket, head, { target });
});

server.listen(PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PORT}`);
  console.log(`[proxy] Frontend → ${FRONTEND}`);
  console.log(`[proxy] Backend  → ${BACKEND} (HTTP + WebSocket)`);
  console.log(`[proxy] Run: ngrok http ${PORT}`);
});
