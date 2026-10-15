/* ==========================================================================
   build-projects.cjs — regenerate docs/assets/data/projects.json

   Only the PINNED repositories go in. The curated block below is the source of
   truth for which two they are and for everything a machine cannot know
   (中文名, which screenshot belongs to which repo, what the highlights are).
   Stars / forks / topics / last push are pulled live, in this order:

     1. GitHub GraphQL   pinnedItems + user facts   (token from the local
                         credential store or $GH_TOKEN; api.github.com blocked
                         from some lines, GraphQL is the only pinned source)
     2. ungh.cc          https://ungh.cc/repos/CGG888/<name>
     3. api.github.com   /repos/CGG888/<name>

   If every live source is down the numbers fall back to the last published
   projects.json and then to tools/stars-cache.json, so a known star count can
   never be wiped by a 429 (that happened once — see commit history).
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "assets", "data", "projects.json");
const CACHE = path.join(ROOT, "tools", "stars-cache.json");
const USER = "CGG888";

/* ---------- curated: the pinned repos, and only those ---------- */
const PINNED = [
  {
    name: "SrcBox",
    cn: "源匣",
    kind: "original",
    homepage: "https://srcbox.top",
    cover: "assets/img/projects/srcbox-01.webp",
    gallery: [
      "assets/img/projects/srcbox-03.webp",
      "assets/img/projects/srcbox-02.webp",
      "assets/img/projects/srcbox-04.webp",
      "assets/img/projects/srcbox-05.webp",
    ],
    note: "我自己在用的那个播放器。Windows、libmpv 内核、WPF 界面，没有广告位。",
    points: [
      "FCC 极速切台 —— 毫秒级换台，不用等",
      "M3U + EPG —— 本地/远程播放列表与完整节目单",
      "时移与回看 —— 直播历史可以拖着看",
      "预约录制 —— 前台/后台双模式，WebDAV 云同步",
      "多屏播放 —— 4 / 6 / 9 路同时看",
      "硬件解码 —— D3D11VA · DXVA2 · NVDEC 自动切换",
      "Web 远程控制 —— 用浏览器操控播放器",
      "频道管理 —— 分组、搜索、收藏、历史",
    ],
  },
  {
    name: "channel-sentinel",
    cn: "频道哨兵",
    kind: "original",
    homepage: "",
    cover: "assets/img/projects/sentinel-01.webp",
    gallery: ["assets/img/projects/sentinel-02.webp"],
    note: "这个仓库以前叫 Iptv-Checker，旧链接会跳到这里。",
    points: [
      "批量检测 —— 在线/离线、分辨率、帧率、编码",
      "组播走 mpegts.js，单播与回看走 hls.js",
      "回放规则由后端规则中心统一执行",
      "台标模板统一到 /api/logo，内外网分开",
      "导出 M3U · TXT · JSON · TVBox · Xtream",
      "Docker 镜像 cgg888/channel-sentinel",
    ],
  },
];

/* ---------- live sources ---------- */

function tokens() {
  const out = [];
  if (process.env.GH_TOKEN) out.push(process.env.GH_TOKEN);
  const store = path.join(process.env.USERPROFILE || process.env.HOME || "", ".git-credentials");
  try {
    fs.readFileSync(store, "utf8")
      .split(/\r?\n/)
      .forEach(function (line) {
        const m = line.match(/^https:\/\/[^:]+:([^@]+)@github\.com\/?$/);
        if (m) out.push(m[1]);
      });
  } catch (e) {
    /* no credential store — fine, we fall through to the public sources */
  }
  return out.sort(function (a, b) {
    return a.length - b.length; /* classic PATs first: they support GraphQL */
  });
}

async function viaGraphQL() {
  /* NOTE: User has no `publicRepos` field and `followers` is a connection —
     both must be asked for as { totalCount }. Getting this wrong still returns
     HTTP 200 with an `errors` array and no `data`, which is why the errors are
     logged below instead of being swallowed. */
  const q = `query {
    user(login: "${USER}") {
      login createdAt bio
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
      followers { totalCount }
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes { ... on Repository {
          name description url homepageUrl stargazerCount forkCount isFork pushedAt
          primaryLanguage { name }
          repositoryTopics(first: 10) { nodes { topic { name } } }
          releases(first: 10) { nodes { tagName publishedAt isDraft isPrerelease } }
        } }
      }
    }
  }`;
  for (const token of tokens()) {
    try {
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: "bearer " + token,
          "content-type": "application/json",
          "user-agent": "mtoo.vip-build",
        },
        body: JSON.stringify({ query: q }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (r.ok && j.data && j.data.user) return j.data.user;
      const why = (j.errors || []).map(function (e) {
        return e.message;
      }).join(" | ");
      console.warn("  graphql HTTP " + r.status + " (token " + token.length + " chars)" + (why ? ": " + why : ""));
    } catch (e) {
      console.warn("  graphql failed: " + e.message);
    }
  }
  return null;
}

async function viaUngh(name) {
  try {
    const r = await fetch("https://ungh.cc/repos/" + USER + "/" + name, {
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "mtoo.vip-build" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.repo || {};
    return {
      stars: d.stars,
      forks: d.forks,
      description: d.description,
      pushedAt: d.pushedAt,
    };
  } catch (e) {
    return null;
  }
}

async function viaRest(name) {
  try {
    const r = await fetch("https://api.github.com/repos/" + USER + "/" + name, {
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "mtoo.vip-build", accept: "application/vnd.github+json" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      stars: d.stargazers_count,
      forks: d.forks_count,
      description: d.description,
      pushedAt: (d.pushed_at || "").slice(0, 10),
      lang: d.language,
      isFork: d.fork,
      topics: d.topics || [],
      homepage: d.homepage || "",
    };
  } catch (e) {
    return null;
  }
}

/* ---------- previous values, so a bad day can never zero the numbers ---------- */

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
}

(async function main() {
  const prev = readJson(OUT);
  const cache = readJson(CACHE) || {};
  const cacheStars = cache.stars || {};

  const prevByName = {};
  if (prev && Array.isArray(prev.pinned)) {
    prev.pinned.forEach(function (p) {
      prevByName[p.name] = p;
    });
  }

  console.log("live source 1/3 — GitHub GraphQL (pinnedItems)");
  const gh = await viaGraphQL();
  const byName = {};
  let account = null;
  if (gh) {
    account = {
      login: gh.login,
      publicRepos: gh.repositories.totalCount,
      followers: gh.followers.totalCount,
      createdAt: (gh.createdAt || "").slice(0, 10),
      bio: gh.bio || "",
    };
    (gh.pinnedItems.nodes || []).forEach(function (n) {
      if (!n || !n.name) return;
      byName[n.name] = {
        stars: n.stargazerCount,
        forks: n.forkCount,
        description: n.description || "",
        homepage: n.homepageUrl || "",
        isFork: n.isFork,
        lang: n.primaryLanguage ? n.primaryLanguage.name : "",
        topics: (n.repositoryTopics.nodes || []).map(function (t) {
          return t.topic.name;
        }),
        /* `last: 1` used to hand back the OLDEST release, because GitHub orders
           the connection newest-first and `last` takes the tail — the site spent
           months advertising SrcBox v1.0.1 while v1.1.18 was out. Ask for the
           newest page and drop drafts/prereleases (SrcBox ships prerelease
           `voice-pack-*` tags that must never become the headline version). */
        release: ((n.releases.nodes || []).filter(function (r) {
          return r && !r.isDraft && !r.isPrerelease;
        })[0] || {}).tagName || "",
        pushedAt: (n.pushedAt || "").slice(0, 10),
      };
    });
    console.log("  ok — " + Object.keys(byName).length + " pinned, " + account.publicRepos + " public repos");
  } else {
    console.log("  unavailable — falling back per repo");
  }

  const pinned = [];
  let live = gh != null;

  for (const item of PINNED) {
    let live1 = byName[item.name] || null;
    if (!live1) {
      console.log("live source 2/3 — ungh.cc for " + item.name);
      live1 = await viaUngh(item.name);
      if (live1) live = true;
    }
    if (!live1) {
      console.log("live source 3/3 — api.github.com for " + item.name);
      live1 = await viaRest(item.name);
      if (live1) live = true;
    }

    const old = prevByName[item.name] || {};
    const cached = cacheStars[item.name];

    /* number resolution: live > last published > cache > 0 */
    function num(liveVal, oldVal) {
      if (typeof liveVal === "number") return liveVal;
      if (typeof oldVal === "number") return oldVal;
      if (typeof cached === "number") return cached;
      return 0;
    }

    const stars = num(live1 && live1.stars, old.stars);
    const forks = num(live1 && live1.forks, old.forks);
    if (live1 && typeof live1.stars !== "number" && typeof old.stars === "number") {
      console.warn("  ! " + item.name + ": no live stars — reusing " + old.stars + " from the last snapshot");
    }

    pinned.push({
      name: item.name,
      cn: item.cn,
      kind: item.kind,
      url: "https://github.com/" + USER + "/" + item.name,
      homepage: item.homepage || (live1 && live1.homepage) || old.homepage || "",
      description: (live1 && live1.description) || old.description || "",
      note: item.note,
      stars,
      forks,
      isFork: live1 && typeof live1.isFork === "boolean" ? live1.isFork : old.isFork,
      lang: (live1 && live1.lang) || old.lang || "",
      topics: (live1 && live1.topics && live1.topics.length && live1.topics) || old.topics || [],
      release: (live1 && live1.release) || old.release || "",
      pushedAt: (live1 && live1.pushedAt) || old.pushedAt || "",
      cover: item.cover,
      gallery: item.gallery,
      points: item.points,
    });

    console.log(
      "  " + item.name.padEnd(18) +
      String(stars).padStart(5) + "★  " +
      String(forks).padStart(3) + " fork  " +
      ((live1 && live1.lang) || old.lang || "-").padEnd(11) +
      (item.cover ? "cover" : "no cover")
    );
  }

  if (!account) {
    const pa = (prev && prev.account) || {};
    account = {
      login: pa.login || USER,
      publicRepos: typeof pa.publicRepos === "number" ? pa.publicRepos : 0,
      followers: typeof pa.followers === "number" ? pa.followers : 0,
      createdAt: pa.createdAt || "",
      bio: pa.bio || "",
    };
    console.warn("  ! graphql down — account facts reused from the last snapshot");
  }

  /* every local asset referenced must exist */
  let missing = 0;
  pinned.forEach(function (p) {
    [p.cover].concat(p.gallery).filter(Boolean).forEach(function (rel) {
      const abs = path.join(ROOT, "docs", rel);
      if (!fs.existsSync(abs)) {
        console.error("  MISSING IMAGE " + rel);
        missing++;
      }
    });
  });
  if (missing) {
    console.error("\n" + missing + " missing image(s) — fix the curated block before shipping.");
    process.exit(1);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: gh ? "GitHub GraphQL pinnedItems" : "ungh.cc / api.github.com",
    starsLive: live,
    account,
    pinned,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log("\nwrote " + path.relative(ROOT, OUT) + "  (" + pinned.length + " pinned, starsLive=" + live + ")");

  /* refresh the fallback baseline only from real live data */
  if (live) {
    const stars = {};
    pinned.forEach(function (p) {
      stars[p.name] = p.stars;
    });
    fs.writeFileSync(
      CACHE,
      JSON.stringify(
        { updatedAt: out.generatedAt, note: "last verified star counts; fallback only", stars },
        null,
        2
      ) + "\n"
    );
    console.log("refreshed " + path.relative(ROOT, CACHE));
  }
})();
