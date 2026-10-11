#!/usr/bin/env node
/* ============================================================================
   mtoo.vip — offline build & integrity check

   This site is dependency-free static HTML: there is nothing to transpile or
   bundle, so "building" means proving the published tree is self-consistent
   before it goes out. Node built-ins only.

     1. every local href / src in every page resolves to a real file
     2. no <img> ships without a src (a headless run once flagged one as a
        failed image request — it was a JS-created placeholder)
     3. every pinned repo is complete and its cover + gallery images exist
     3b. every image under assets/img is referenced by a page or by
        projects.json — unreferenced art is dead weight in the payload
     4. required <head> metadata is present, with 404.html held to the
        noindex standard instead of the OG/canonical one
     5. generated artefacts are not older than the script that generates them
     6. no dev leftovers inside the published tree
     7. the publishable payload size

   Run:  node tools/build.cjs
   Exit: 0 = shippable, 1 = at least one hard error.
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const PAGES = ["index.html", "projects.html", "about.html", "sponsor.html", "404.html"];

const errors = [];
const warnings = [];
const notes = [];

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const read = (p) => fs.readFileSync(p, "utf8");

/* ---------- 1 + 2 · references and images -------------------------------- */

const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|$)/i; // http:, mailto:, tel:, //cdn, #anchor, data:

function checkRefs(page) {
  const file = path.join(DOCS, page);
  const html = read(file);
  const dir = path.dirname(file);
  let checked = 0;

  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/gi)) {
    const raw = m[1].trim();
    if (SKIP.test(raw)) continue;
    const clean = raw.split("#")[0].split("?")[0];
    if (!clean) continue;
    // "/foo" is root-relative to docs/, "foo" is relative to the page
    const target = clean.startsWith("/")
      ? path.join(DOCS, clean.replace(/^\/+/, ""))
      : path.resolve(dir, clean);
    checked++;
    if (!exists(target)) errors.push(`${page}: ${raw}  →  missing (${rel(target)})`);
  }
  notes.push(`${page.padEnd(15)} ${String(checked).padStart(3)} local refs`);

  /* an <img> with no src is a failed request and a hole in the layout */
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bsrc\s*=\s*"[^"]+"/i.test(tag)) {
      errors.push(`${page}: <img> without src — ${tag.slice(0, 64)}`);
    } else if (!/\balt\s*=/i.test(tag)) {
      warnings.push(`${page}: <img> without alt — ${tag.slice(0, 64)}`);
    }
  }
}

/* ---------- 3 · projects.json imagery ------------------------------------ */

function checkProjectsData() {
  const p = path.join(DOCS, "assets", "data", "projects.json");
  if (!exists(p)) {
    errors.push("assets/data/projects.json is missing — run: node tools/build-projects.cjs");
    return;
  }
  const data = JSON.parse(read(p));
  const items = data.pinned || [];
  if (!items.length) errors.push("projects.json: no pinned repos — the work page would render empty");

  const names = new Set();
  const seen = new Set();
  let img = 0;

  for (const item of items) {
    if (names.has(item.name)) errors.push(`projects.json: ${item.name} is listed twice`);
    names.add(item.name);
    if (!item.kind) errors.push(`projects.json: ${item.name} has no kind (original / fork / data)`);
    if (!item.points || !item.points.length) warnings.push(`projects.json: ${item.name} has no highlights`);

    const shots = [item.cover].filter(Boolean).concat(item.gallery || []);
    for (const s of shots) {
      const key = item.name + " → " + s;
      if (seen.has(key)) continue;
      seen.add(key);
      img++;
      if (!exists(path.join(DOCS, s))) errors.push(`projects.json: ${key}  →  missing`);
    }
  }

  if (data.starsLive === false) {
    warnings.push("projects.json star counts came from cache (no live source) — numbers are last-verified, not current");
  }
  const acc = data.account || {};
  if (!acc.publicRepos) {
    warnings.push("projects.json account facts are empty — the homepage HUD and #repo-count would read 0 (run the generator with network)");
  }
  notes.push(
    `projects.json  ${String(items.length).padStart(3)} pinned · ${img} images · ` +
    `snapshot ${String(data.generatedAt || "?").slice(0, 10)} via ${data.source || "?"}`
  );
}

/* ---------- 3b · unreferenced images ------------------------------------- */

function checkOrphans() {
  const used = new Set([path.join(DOCS, "assets", "img", "og.png")]); // only cited as an absolute og:image URL

  for (const page of PAGES) {
    const file = path.join(DOCS, page);
    for (const m of read(file).matchAll(/(?:href|src)\s*=\s*"([^"]*)"/gi)) {
      const raw = m[1].trim().split("#")[0].split("?")[0];
      if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      used.add(raw.startsWith("/")
        ? path.join(DOCS, raw.replace(/^\/+/, ""))
        : path.resolve(path.dirname(file), raw));
    }
  }

  const data = JSON.parse(read(path.join(DOCS, "assets", "data", "projects.json")));
  for (const it of data.pinned || []) {
    [it.cover].concat(it.gallery || []).filter(Boolean).forEach((s) => used.add(path.join(DOCS, s)));
  }

  const dir = path.join(DOCS, "assets", "img");
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!used.has(p)) {
        warnings.push(`unreferenced image: ${rel(p)} (${(fs.statSync(p).size / 1024).toFixed(0)}KB)`);
      }
    }
  })(dir);
}

/* ---------- 4 · head metadata -------------------------------------------- */

function checkMeta(page) {
  const html = read(path.join(DOCS, page));
  const head = html.slice(0, html.indexOf("</head>"));
  const is404 = page === "404.html";

  const need = [
    [/<html[^>]+lang="zh-CN"/i, 'html lang="zh-CN"'],
    [/<meta\s+charset="utf-8"/i, "meta charset"],
    [/<meta\s+name="viewport"/i, "meta viewport"],
    [/<title>[^<]+<\/title>/i, "<title>"],
    [/<meta\s+name="description"\s+content="[^"]+"/i, "meta description"],
    [/<link\s+rel="icon"/i, "link icon"],
  ];
  if (is404) {
    need.push([/<meta\s+name="robots"\s+content="[^"]*noindex/i, "meta robots noindex"]);
  } else {
    need.push(
      [/<link\s+rel="canonical"/i, "link canonical"],
      [/<meta\s+property="og:title"/i, "og:title"],
      [/<meta\s+property="og:description"/i, "og:description"],
      [/<meta\s+property="og:image"/i, "og:image"]
    );
  }
  for (const [re, what] of need) {
    if (!re.test(head)) warnings.push(`${page}: missing ${what}`);
  }

  /* reveals hide content by default, so the `.js` gate is a correctness
     requirement, not a nicety: without it a JS failure ships a blank page. */
  if (/data-reveal/.test(html) && !html.includes('classList.add("js")')) {
    errors.push(`${page}: animates with data-reveal but has no <html class="js"> gate — content would hide without JS`);
  }
}

/* ---------- 5 · generated artefacts -------------------------------------- */

function checkStaleness() {
  const pairs = [
    ["tools/build-projects.cjs", "docs/assets/data/projects.json"],
    ["tools/prepare-assets.py", "docs/assets/img/og.png"],
  ];
  for (const [s, o] of pairs) {
    const src = path.join(ROOT, s);
    const out = path.join(ROOT, o);
    if (!exists(src) || !exists(out)) continue;
    if (fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs + 1000) {
      warnings.push(`${o} is older than ${s} — regenerate it`);
    }
  }
}

/* ---------- 6 · dev leftovers -------------------------------------------- */

function checkLeftovers() {
  const banned = /^_|\.orig$|\.bak$|~$/;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (banned.test(e.name)) errors.push(`dev artefact inside docs/: ${rel(p)}`);
    }
  })(DOCS);
}

/* ---------- 7 · payload -------------------------------------------------- */

function measure() {
  let bytes = 0;
  let files = 0;
  const byType = new Map();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const n = fs.statSync(p).size;
        bytes += n;
        files++;
        const ext = path.extname(e.name).toLowerCase() || "(none)";
        byType.set(ext, (byType.get(ext) || 0) + n);
      }
    }
  })(DOCS);
  notes.push(`payload        ${String(files).padStart(3)} files · ${(bytes / 1048576).toFixed(2)} MB total`);
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  notes.push("heaviest       " + top.map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}KB`).join(" · "));
  return bytes;
}

/* ---------- run ---------------------------------------------------------- */

console.log("mtoo.vip — offline build\n" + "=".repeat(58));

for (const p of PAGES) checkRefs(p);
checkProjectsData();
checkOrphans();
for (const p of PAGES) checkMeta(p);
checkStaleness();
checkLeftovers();
const bytes = measure();

console.log("\n" + notes.join("\n"));

if (warnings.length) {
  console.log("\nWARNINGS (" + warnings.length + ")");
  for (const w of warnings) console.log("  ! " + w);
}
if (errors.length) {
  console.log("\nERRORS (" + errors.length + ")");
  for (const e of errors) console.log("  x " + e);
  console.log("\nBUILD FAILED");
  process.exit(1);
}
console.log(
  "\nBUILD OK — " + PAGES.length + " pages, " + (bytes / 1048576).toFixed(2) +
  " MB, ready for GitHub Pages (/docs)\n"
);
