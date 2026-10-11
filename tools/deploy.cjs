#!/usr/bin/env node
/**
 * deploy.cjs — publish this folder to github.com/CGG888/CGG888 over the REST API.
 *
 * WHY THIS EXISTS (and why it is not just `git push`):
 *   From this machine the plain git transport is dead. `github.com:443` accepts the
 *   TCP connection but the TLS exchange is reset, so `git clone` / `git push` fail with
 *   "Recv failure: Connection was reset" / "Could not connect to server".
 *   `api.github.com` and `codeload.github.com` are reachable, so this script builds a
 *   real commit through the Git Data API instead:
 *
 *     GET  /git/ref/heads/main           → parent commit
 *     GET  /git/commits/{sha}            → base tree
 *     POST /git/blobs                    → one blob per changed file
 *     POST /git/trees   (base_tree=…)    → new tree
 *     POST /git/commits                  → new commit
 *     PATCH /git/refs/heads/main         → move the branch
 *
 *   Because every request is a normal API call, `--pages` can also enable GitHub Pages
 *   in the same run — something `git push` alone could never do.
 *   The result is a genuine commit on main: history, blame and the web UI all behave
 *   exactly as if it had been pushed.
 *
 * USAGE
 *   node tools/deploy.cjs                # dry run: show what would change
 *   node tools/deploy.cjs --push         # create the commit and move main
 *   node tools/deploy.cjs --push --pages # …and enable Pages (main /docs)
 *   node tools/deploy.cjs --https        # turn on Enforce HTTPS (after the cert exists)
 *   node tools/deploy.cjs --status       # repo / branch / Pages / build / tree
 *
 *   node tools/verify-live.cjs           # diff the live site against docs/ byte-for-byte
 *
 * TOKEN
 *   $GH_TOKEN, else the github.com entry in ~/.git-credentials.
 *   Needs the `repo` scope (a classic/OAuth token). The value is never printed.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const OWNER = "CGG888";
const REPO = "CGG888";
const SLUG = `${OWNER}/${REPO}`;
const API = "https://api.github.com";
const ROOT = path.resolve(__dirname, "..");
const BRANCH = "main";
const PAGES_PATH = "/docs"; // GitHub Pages serves this directory

// ---------------------------------------------------------------- file set ---

/** Files published even though they sit in the repo root. README.md is the
 *  GitHub *profile* README — it must stay, and this script rewrites it on purpose. */
const ROOT_FILES = ["README.md", "DEPLOY.md", ".gitignore"];

/** tools/ is shipped so the build is reproducible; the capture artefacts are not. */
const TOOLS_RE = /^tools\/[^/]+\.(cjs|py|json)$/;

const SKIP = [
  /^tools\/_/, // _shots/ _probe/ _pull/ _probe-token.cjs _pull.cjs _contact-sheet.png
  /^tools\/gh-raw\.json$/, // scratch from the data pipeline
  /^docs\/_/, // _probe.html and friends
  /(^|\/)\.DS_Store$/,
  /(^|\/)__pycache__\//,
];

function collect() {
  const out = [];
  for (const f of ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) out.push(f);
  }
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(rel);
      } else if (!SKIP.some((re) => re.test(rel))) {
        // NOTE: test the full relative path, not `dir` — `dir` is the immediate
        // parent, so a test like `dir === "docs"` silently drops docs/assets/**.
        if (rel.startsWith("docs/") || TOOLS_RE.test(rel)) out.push(rel);
      }
    }
  };
  walk("docs");
  walk("tools");
  return [...new Set(out)].sort();
}

// ------------------------------------------------------------------ github ---

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const f = path.join(os.homedir(), ".git-credentials");
  if (!fs.existsSync(f)) throw new Error("no $GH_TOKEN and no ~/.git-credentials");
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^https:\/\/(?:([^:@/]*)(?::([^@/]*))?@)?github\.com\/?$/);
    const s = m && (m[2] || m[1] || "");
    if (s && s.startsWith("gh")) return s;
  }
  throw new Error("no github.com credential in ~/.git-credentials");
}

let TOKEN = null;
async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mtoo-vip-deploy",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = (json && json.message) || text.slice(0, 300);
    throw new Error(`${method} ${url} → ${res.status} ${msg}`);
  }
  return json;
}

/** Git's own blob hash: sha1("blob <len>\0" + content). Lets us skip unchanged files. */
function gitBlobSha(buf) {
  const h = crypto.createHash("sha1");
  h.update(Buffer.from(`blob ${buf.length}\0`, "utf8"));
  h.update(buf);
  return h.digest("hex");
}

const human = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

// -------------------------------------------------------------------- main ---

async function main() {
  const push = process.argv.includes("--push");
  const enablePages = process.argv.includes("--pages");
  const statusOnly = process.argv.includes("--status");
  TOKEN = token();

  if (statusOnly) {
    const repo = await api("GET", `/repos/${SLUG}`);
    const ref = await api("GET", `/repos/${SLUG}/git/ref/heads/${BRANCH}`);
    const commit = await api("GET", `/repos/${SLUG}/git/commits/${ref.object.sha}`);
    console.log(`repo    : ${repo.full_name}  private=${repo.private}`);
    console.log(`main    : ${ref.object.sha.slice(0, 10)}  "${commit.message.split("\n")[0]}"  ${commit.committer.date}`);
    try {
      const p = await api("GET", `/repos/${SLUG}/pages`);
      console.log(`pages   : ${p.html_url}  status=${p.status}  cname=${p.cname}`);
      console.log(`          https_enforced=${p.https_enforced}  source=${p.source && p.source.branch}${p.source && p.source.path}`);
      try {
        const b = await api("GET", `/repos/${SLUG}/pages/builds/latest`);
        console.log(`build   : ${b.status}${b.error ? ` — ${b.error.message}` : ""}  ${b.duration ? b.duration + "ms" : ""}`);
        console.log(`          ${b.commit}`);
      } catch { console.log("build   : (none yet)"); }
    } catch {
      console.log("pages   : NOT enabled");
    }
    const tree = await api("GET", `/repos/${SLUG}/git/trees/${ref.object.sha}?recursive=1`);
    const blobs = tree.tree.filter((t) => t.type === "blob");
    console.log(`tree    : ${blobs.length} files, ${human(blobs.reduce((a, t) => a + (t.size || 0), 0))}`);
    for (const t of blobs) console.log(`   ${String(t.size ?? "").padStart(9)}  ${t.path}`);
    return;
  }

  const who = await api("GET", "/user");
  const repo = await api("GET", `/repos/${SLUG}`);
  console.log(`token      : ${who.login}  (scopes: repo)`);
  console.log(`repo       : ${repo.full_name}  private=${repo.private}  default=${repo.default_branch}`);

  const ref = await api("GET", `/repos/${SLUG}/git/ref/heads/${BRANCH}`);
  const parent = ref.object.sha;
  const parentCommit = await api("GET", `/repos/${SLUG}/git/commits/${parent}`);
  const baseTree = parentCommit.tree.sha;
  console.log(`parent     : ${parent.slice(0, 10)}  "${parentCommit.message.split("\n")[0]}"`);

  const existing = new Map();
  for (const t of (await api("GET", `/repos/${SLUG}/git/trees/${baseTree}?recursive=1`)).tree) {
    if (t.type === "blob") existing.set(t.path, t.sha);
  }

  const files = collect();
  const changed = [];
  const same = [];
  let bytes = 0;
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const sha = gitBlobSha(buf);
    bytes += buf.length;
    if (existing.get(rel) === sha) same.push(rel);
    else changed.push({ rel, buf, sha, status: existing.has(rel) ? "M" : "A" });
  }

  console.log(`\nfiles      : ${files.length} total, ${bytes ? human(bytes) : "0 B"}`);
  console.log(`unchanged  : ${same.length}`);
  console.log(`to publish : ${changed.length}`);
  for (const c of changed) console.log(`   ${c.status}  ${human(c.buf.length).padStart(9)}  ${c.rel}`);

  if (!changed.length) {
    console.log("\nnothing to do — the repo already matches this folder.");
  } else if (!push) {
    console.log("\nDRY RUN — pass --push to create the commit.");
  } else {
    process.stdout.write(`\nuploading ${changed.length} blob(s)… `);
    const tree = [];
    for (const c of changed) {
      const blob = await api("POST", `/repos/${SLUG}/git/blobs`, {
        content: c.buf.toString("base64"),
        encoding: "base64",
      });
      if (blob.sha !== c.sha) throw new Error(`blob sha mismatch for ${c.rel}`);
      tree.push({ path: c.rel, mode: "100644", type: "blob", sha: blob.sha });
    }
    console.log("ok");

    const newTree = await api("POST", `/repos/${SLUG}/git/trees`, { base_tree: baseTree, tree });
    const message =
      changed.length === 1
        ? `Update ${changed[0].rel}`
        : `Publish mtoo.vip — ${changed.length} file(s)\n\n` +
          changed.map((c) => `${c.status} ${c.rel}`).join("\n");
    const commit = await api("POST", `/repos/${SLUG}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [parent],
    });
    await api("PATCH", `/repos/${SLUG}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
    console.log(`committed  : ${commit.sha}`);
    console.log(`           → https://github.com/${SLUG}/commit/${commit.sha}`);
  }

  if (enablePages) {
    let state = null;
    try { state = await api("GET", `/repos/${SLUG}/pages`); } catch { /* 404 = not enabled */ }
    if (state) {
      console.log(`\npages      : already enabled — ${state.html_url} (${state.status})`);
    } else {
      const pages = await api("POST", `/repos/${SLUG}/pages`, {
        source: { branch: BRANCH, path: PAGES_PATH },
      });
      console.log(`\npages      : enabled — ${pages.html_url}`);
      console.log(`             source ${BRANCH}${PAGES_PATH}`);
    }
  }

  if (process.argv.includes("--https")) {
    // GitHub only issues the Let's Encrypt cert once the apex A/AAAA records point
    // at it; until then :443 serves the fallback *.github.io cert and this returns
    // 404 "The certificate does not exist yet". Safe to re-run — it is a no-op once
    // https_enforced is already true.
    try {
      const p = await api("PUT", `/repos/${SLUG}/pages`, { https_enforced: true });
      console.log(`\nhttps      : enforced on ${p.html_url}  (https_enforced=${p.https_enforced})`);
    } catch (e) {
      console.log(`\nhttps      : not yet — ${e.message}`);
      console.log("             The cert appears once mtoo.vip's apex A/AAAA point at");
      console.log("             185.199.108-111.153 and 2606:50c0:800{0..3}::153.");
      process.exitCode = 2;
    }
  }
}

main().catch((e) => {
  console.error(`\nFAIL: ${e.message}`);
  process.exit(1);
});
