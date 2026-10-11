/* mtoo.vip — zero-dependency local preview server.
   usage: node tools/serve.cjs [port]   →  http://127.0.0.1:8788

   Serves ./docs only, no caching, so a refresh always shows the latest edit.

   Path resolution deliberately mirrors GitHub Pages (the real host for this
   site) rather than doing a plain file lookup, so what you see locally is what
   production serves:
     /projects         → projects.html       (extensionless, no redirect)
     /about            → about.html
     /                 → index.html
     /nope             → 404.html  with a real 404 status
*/
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "docs");
const PORT = Number(process.argv[2] || 8788);
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };

/* GitHub Pages candidate order: exact → .html → /index.html */
function resolve(urlPath) {
  const clean = urlPath.replace(/\/+$/, "");
  const candidates = clean === ""
    ? ["index.html"]
    : [clean, clean + ".html", clean + "/index.html"];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (!abs.startsWith(ROOT)) continue;          // traversal guard
    if (isFile(abs)) return abs;
  }
  return null;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  } catch (e) {
    res.writeHead(400).end("bad request");
    return;
  }

  const file = resolve(urlPath);
  const send = (status, abs, body) => {
    res.writeHead(status, {
      "content-type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store, must-revalidate",
      "content-length": Buffer.byteLength(body),
    });
    res.end(req.method === "HEAD" ? undefined : body);
    console.log(
      `${String(status)} ${req.method} ${urlPath || "/"} → ` +
      `${path.relative(ROOT, abs)} (${Buffer.byteLength(body)} B)`
    );
  };

  if (!file) {
    const nf = path.join(ROOT, "404.html");
    const body = isFile(nf) ? fs.readFileSync(nf) : Buffer.from("404");
    send(404, nf, body);
    return;
  }
  send(200, file, fs.readFileSync(file));
});

server.listen(PORT, HOST, () => {
  console.log(`mtoo.vip preview → http://${HOST}:${PORT}/`);
  console.log(`serving ${ROOT}`);
  console.log(`GitHub Pages resolution: /projects → projects.html, unknown → 404.html`);
});
