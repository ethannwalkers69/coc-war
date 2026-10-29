const http = require("http");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.COC_TOKEN;
const BASE = "https://cocproxy.royaleapi.dev/v1";
const PORT = process.env.PORT || 3000;
const cache = new Map();

const routes = {
  player: (t) => `/players/%23${t}`,
  clan: (t) => `/clans/%23${t}`,
  war: (t) => `/clans/%23${t}/currentwar`,
};

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/(player|clan|war)\/([0-9A-Za-z]{3,15})$/);

  if (!m) {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, fs.readFileSync(path.join(__dirname, "index.html")), "text/html; charset=utf-8");
    }
    return send(res, 404, "Not found", "text/plain");
  }
  if (!TOKEN) return send(res, 500, JSON.stringify({ reason: "noToken" }));

  const [, kind, tag] = m;
  const key = kind + tag.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 30000) return send(res, 200, hit.body);

  try {
    const r = await fetch(BASE + routes[kind](tag.toUpperCase()), {
      headers: { Authorization: "Bearer " + TOKEN },
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.text();
    if (r.status === 200) cache.set(key, { t: Date.now(), body });
    send(res, r.status, body);
  } catch (e) {
    send(res, 502, JSON.stringify({ reason: "upstream" }));
  }
}).listen(PORT, () => console.log("Running on " + PORT));
