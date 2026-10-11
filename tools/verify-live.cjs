#!/usr/bin/env node
/**
 * verify-live.cjs — compare the deployed site against the local docs/ folder.
 *
 * Fetches every published file over HTTP and diffs it byte-for-byte against the
 * local copy, then exercises the routes GitHub Pages resolves for us
 * (extension-less URLs, and the custom 404 with a real 404 status).
 *
 * USAGE
 *   node tools/verify-live.cjs                 # http://mtoo.vip
 *   node tools/verify-live.cjs https://mtoo.vip
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const BASE = (process.argv[2] || "http://mtoo.vip").replace(/\/$/, "");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 12);
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function walk(dir, prefix = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

async function get(p) {
  const res = await fetch(BASE + p, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type: res.headers.get("content-type") || "" };
}

(async () => {
  console.log(`live base : ${BASE}\n`);

  const files = walk(DOCS).sort();
  let ok = 0, bad = 0, total = 0;

  for (const rel of files) {
    const local = fs.readFileSync(path.join(DOCS, rel));
    total += local.length;
    let r;
    try {
      r = await get("/" + rel);
    } catch (e) {
      console.log(`  ERR   ${rel} — ${e.name}`);
      bad++;
      continue;
    }
    const same = r.status === 200 && r.buf.length === local.length && sha(r.buf) === sha(local);
    if (same) {
      ok++;
      console.log(`  ok    ${kb(local.length).padStart(9)}  ${rel}`);
    } else {
      bad++;
      console.log(`  DIFF  ${rel}`);
      console.log(`        local ${local.length}B ${sha(local)}  vs  live ${r.status} ${r.buf.length}B ${sha(r.buf)}`);
    }
  }

  console.log(`\nfiles     : ${ok}/${files.length} identical, ${bad} differing  (${kb(total)} compared)`);

  console.log("\nroute checks");
  const routes = [
    ["/", 200],
    ["/projects", 200],
    ["/about", 200],
    ["/sponsor", 200],
    ["/projects.html", 200],
    ["/robots.txt", 200],
    ["/sitemap.xml", 200],
    ["/CNAME", 200],
    ["/does-not-exist-9f3a", 404],
    ["/nope/deep/path", 404],
  ];
  let routeBad = 0;
  for (const [p, want] of routes) {
    try {
      const r = await get(p);
      const good = r.status === want;
      if (!good) routeBad++;
      let extra = "";
      if (p === "/") {
        const t = r.buf.toString("utf8");
        extra = "title=" + ((t.match(/<title>([^<]*)<\/title>/) || [])[1] || "?");
      }
      if (want === 404) {
        extra = "custom 404 page=" + /404|这个地址是空的/.test(r.buf.toString("utf8"));
      }
      console.log(`  ${good ? "ok  " : "BAD "} ${String(r.status).padEnd(4)} (want ${want})  ${p.padEnd(20)} ${extra}`);
    } catch (e) {
      routeBad++;
      console.log(`  ERR  ${p} — ${e.name}`);
    }
  }

  const fail = bad + routeBad;
  console.log(`\n${fail === 0 ? "LIVE OK — every file and route matches" : `LIVE MISMATCH — ${fail} problem(s)`}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
