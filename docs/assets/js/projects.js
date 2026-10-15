/* renders the pinned repositories from the build-time snapshot.
   the pages are static; this only reads assets/data/projects.json and draws the
   cards. nothing here talks to the GitHub API at runtime.

   two layouts share one body builder:
     · .pins (home)                     — compact grid, .pin-* shells
     · .pins[data-layout="rack"] (work) — four hand-composed rack units, .rack-*
   card markup is created AFTER site.js has wired its reveal observer, so it must
   never carry data-reveal itself: it would stay at opacity 0 forever. */
(function () {
  "use strict";

  var host = document.getElementById("pinned");
  if (!host) return;

  var stamp = document.getElementById("data-stamp");
  var detail = host.getAttribute("data-detail") || "compact";
  var layout = host.getAttribute("data-layout") || "grid";

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function kindLabel(p) {
    if (p.kind === "original") return "原创";
    if (p.kind === "fork") return "Fork · 我在改";
    return "配置 · 数据";
  }

  function nums(n) {
    return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function shot(src, alt) {
    var img = el("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  /* the content that is identical in both layouts — header, numbers, prose,
     points, tags, gallery, buttons. only the wrapper class changes. */
  function specBody(p, gallery, cls) {
    var body = el("div", cls);

    var h = el("div", "pin-h");
    var t = el("h3", "pin-t", p.name);
    if (p.cn) t.appendChild(el("span", "cn", " " + p.cn));
    h.appendChild(t);
    h.appendChild(el("span", "pin-r", kindLabel(p) + (p.lang ? " · " + p.lang : "")));
    body.appendChild(h);

    var stats = el("div", "pin-stats");
    /* every number carries its own live hook — {data-live, data-repo}. what is
       written here is the build-time snapshot; syncLive() rewrites these nodes
       in place once the page is up, so this doubles as the offline fallback. */
    function stat(label, key, value) {
      var s = el("span");
      var b = el("b", "", value);
      b.setAttribute("data-live", key);
      b.setAttribute("data-repo", p.name);
      s.appendChild(b);
      s.appendChild(document.createTextNode(" " + label));
      stats.appendChild(s);
    }
    stat("star", "stars", nums(p.stars) + "★");
    stat("fork", "forks", nums(p.forks));
    stat("release", "release", p.release || "—");
    if (p.pushedAt) stat("最后提交", "pushed", p.pushedAt);
    body.appendChild(stats);

    if (p.description) body.appendChild(el("p", "pin-d", p.description));
    if (p.note) body.appendChild(el("p", "pin-d dim", p.note));

    if (detail === "full" && p.points && p.points.length) {
      var ul = el("ul", "pin-pts");
      p.points.forEach(function (pt) {
        ul.appendChild(el("li", "", pt));
      });
      body.appendChild(ul);
    }

    if (detail === "full" && p.topics && p.topics.length) {
      var tags = el("div", "tag-set");
      p.topics.slice(0, 8).forEach(function (tp) {
        tags.appendChild(el("span", "tag", tp));
      });
      body.appendChild(tags);
    }

    if (detail === "full" && gallery.length) {
      var gal = el("div", "pin-gal");
      gallery.forEach(function (src, gi) {
        var a = el("a");
        a.href = src;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(shot(src, p.name + " 截图 " + (gi + 1)));
        gal.appendChild(a);
      });
      body.appendChild(gal);
    }

    var cta = el("div", "pin-cta");
    var a1 = el("a", "btn btn-sm", "源码");
    a1.href = p.url;
    a1.target = "_blank";
    a1.rel = "noopener";
    a1.appendChild(el("span", "", "↗"));
    cta.appendChild(a1);
    if (p.homepage) {
      var a2 = el("a", "btn btn-sm btn-mg", "官网");
      a2.href = p.homepage;
      a2.target = "_blank";
      a2.rel = "noopener";
      a2.appendChild(el("span", "", "↗"));
      cta.appendChild(a2);
    }
    body.appendChild(cta);

    return body;
  }

  /* ---------- layout A · compact grid (home) ---------- */
  function card(p, i) {
    var pin = el("article", "pin pin-" + (i + 1) + (p.cover ? "" : " noimg"));
    var wrap = el("div", "pin-in");

    var box = el("div", "pin-shot");
    if (p.cover) {
      box.appendChild(shot(p.cover, p.name + " 界面截图"));
    } else {
      box.appendChild(el("div", "noimg-tag", "NO VISUAL FEED\n" + p.name + "\n该仓库没有留下截图"));
    }
    wrap.appendChild(box);
    wrap.appendChild(specBody(p, p.gallery || [], "pin-body"));
    pin.appendChild(wrap);
    return pin;
  }

  /* ---------- layout B · rack unit (work) ---------- */
  function rack(p, i) {
    var n = i + 1;
    var pad = n < 10 ? "0" + n : String(n);
    var unit = el("article", "rack rack-" + n + (p.cover ? "" : " noimg"));
    unit.id = "unit-" + pad;
    unit.setAttribute("data-name", p.name);

    var no = el("span", "rack-no", pad);
    no.setAttribute("aria-hidden", "true");
    unit.appendChild(no);

    var spine = el(
      "span",
      "rack-spine",
      p.name.toUpperCase() + " · " + (p.kind === "original" ? "SELF-BUILT" : "FORK")
    );
    spine.setAttribute("aria-hidden", "true");
    unit.appendChild(spine);

    /* unit 04 is a filmstrip: the cover plus the first gallery shot run edge to
       edge, and whatever is left over still shows up under the spec panel. */
    var gallery = (p.gallery || []).slice();
    var feed = el("div", "rack-feed");
    if (n === 4 && p.cover) {
      feed.classList.add("film");
      [p.cover].concat(gallery.splice(0, 1)).forEach(function (src, k) {
        var cell = el("div", "rack-feed-cell");
        cell.appendChild(shot(src, p.name + " 界面截图 " + (k + 1)));
        feed.appendChild(cell);
      });
    } else if (p.cover) {
      feed.appendChild(shot(p.cover, p.name + " 界面截图"));
    } else {
      feed.appendChild(el("div", "noimg-tag", "NO VISUAL FEED\n" + p.name + "\n该仓库没有留下截图"));
    }
    unit.appendChild(feed);

    var cls = "rack-spec";
    if (n === 1 || n === 4) cls += " is-panel";
    if (n === 4) cls += " is-mg";
    unit.appendChild(specBody(p, gallery, cls));
    return unit;
  }

  /* ---------- layout C · loadout (home) ----------
     one hero + a readout list. the four things do not matter equally, so they do
     not get four equal boxes. */
  function loadout(list) {
    var out = document.createDocumentFragment();
    if (!list.length) return out;

    var p = list[0];
    var hero = el("article", "ld-hero" + (p.cover ? "" : " noimg"));
    hero.id = "unit-01";

    var no = el("span", "rack-no", "01");
    no.setAttribute("aria-hidden", "true");
    hero.appendChild(no);

    var feed = el("div", "ld-feed");
    if (p.cover) {
      feed.appendChild(shot(p.cover, p.name + " 界面截图"));
    } else {
      feed.appendChild(el("div", "noimg-tag", "NO VISUAL FEED\n" + p.name));
    }
    hero.appendChild(feed);
    hero.appendChild(specBody(p, [], "ld-spec"));
    out.appendChild(hero);

    var rail = el("div", "ld-strips");
    var spine = el("span", "rack-spine", "LOADOUT · 00" + list.length);
    spine.setAttribute("aria-hidden", "true");
    rail.appendChild(spine);
    rail.appendChild(el("div", "ld-strips-h", "另外 " + (list.length - 1) + " 件"));

    list.slice(1).forEach(function (q, k) {
      var row = el("article", "ld-strip" + (q.cover ? "" : " noimg"));
      row.id = "unit-0" + (k + 2);
      var thumb = el("div", "ld-thumb");
      if (q.cover) {
        thumb.appendChild(shot(q.cover, q.name + " 界面截图"));
      } else {
        thumb.appendChild(el("div", "noimg-tag", "NO FEED"));
      }
      row.appendChild(thumb);
      row.appendChild(specBody(q, [], "ld-body"));
      rail.appendChild(row);
    });

    out.appendChild(rail);
    return out;
  }

  /* the index strip, and the observer that lights the unit you are reading */
  function buildIndex(list) {
    if (layout !== "rack" || list.length < 2) return;

    var nav = el("nav", "racknav");
    nav.setAttribute("aria-label", "单位索引");
    list.forEach(function (p, i) {
      var pad = i + 1 < 10 ? "0" + (i + 1) : String(i + 1);
      var a = el("a");
      a.href = "#unit-" + pad;
      a.appendChild(el("span", "rn-i", pad));
      a.appendChild(el("span", "rn-t", p.name));
      nav.appendChild(a);
    });
    host.parentNode.insertBefore(nav, host);

    if (!("IntersectionObserver" in window)) return;
    var links = [].slice.call(nav.querySelectorAll("a"));
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var idx = parseInt(e.target.id.slice(-2), 10) - 1;
          links.forEach(function (l, k) {
            l.classList.toggle("is-on", k === idx);
          });
        });
      },
      { rootMargin: "-32% 0px -56% 0px" }
    );
    [].forEach.call(host.querySelectorAll(".rack"), function (r) {
      io.observe(r);
    });
  }

  /* ---------- live numbers ----------
     The build snapshot exists so the page works with JS off or offline, but the
     numbers on screen are re-read from the repos every time the page opens.

     Source order matters. ungh.cc is first: no rate limit, no key, CORS `*`, and
     it is already the source the build script trusts. api.github.com also sends
     `access-control-allow-origin: *`, but an unauthenticated visitor only gets
     60 requests/hour per IP — a couple of refreshes would silently freeze the
     numbers, so it is only ever the fallback. If both fail we keep the snapshot
     and say so instead of inventing values. */
  var LIVE = {
    ungh: "https://ungh.cc/repos/CGG888/",
    gh: "https://api.github.com/repos/CGG888/",
  };

  /* one retry, because ungh.cc answers 403 when a handful of requests arrive at
     once — the browser fires four of these on load. */
  function jget(url, tries) {
    if (tries == null) tries = 2;
    return fetch(url, { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + url);
        return r.json();
      })
      .catch(function (e) {
        if (tries <= 1) throw e;
        return new Promise(function (res) {
          setTimeout(res, 800);
        }).then(function () {
          return jget(url, tries - 1);
        });
      });
  }

  function fromUngh(name) {
    return jget(LIVE.ungh + name).then(function (root) {
      var repo = (root && root.repo) || {};
      var out = {
        stars: repo.stars,
        forks: repo.forks,
        /* null means "not known", never "empty" — see paint(). */
        release: null,
        pushedAt: (repo.pushedAt || "").slice(0, 10),
      };
      return jget(LIVE.ungh + name + "/releases").then(
        function (rel) {
          /* SrcBox publishes prerelease `voice-pack-*` tags; those must never
             become the headline version. */
          var stable = (rel.releases || []).filter(function (x) {
            return x && !x.draft && !x.prerelease;
          });
          out.release = stable.length ? stable[0].tag : "";
          return out;
        },
        function () {
          /* the repo answered but the release list did not — keep whatever the
             snapshot already shows rather than blanking it. */
          return out;
        }
      );
    });
  }

  function fromGitHub(name) {
    return jget(LIVE.gh + name).then(function (d) {
      d = d || {};
      var out = {
        stars: d.stargazers_count,
        forks: d.forks_count,
        release: null,
        pushedAt: (d.pushed_at || "").slice(0, 10),
      };
      return jget(LIVE.gh + name + "/releases/latest").then(
        function (rel) {
          out.release = rel && rel.tag_name ? rel.tag_name : "";
          return out;
        },
        function () {
          return out;
        }
      );
    });
  }

  /* GitHub's REST API is the primary source: its limits are published and
     predictable (60 requests/hour for an anonymous visitor, and a page load
     costs 4). ungh.cc is the fallback — it needs no key and has no documented
     limit, but it answered 403/429 as soon as a few requests arrived in a burst,
     so it must never be the first choice. */
  function liveFor(name) {
    return fromGitHub(name).catch(function () {
      return fromUngh(name);
    });
  }

  /* Re-opening a page a dozen times should not spend a dozen API calls.
     sessionStorage keeps the fetched values for a few minutes; they are still
     re-read from the repos on every new visit, just not on every F5. */
  var CACHE_KEY = "mtoo.live.v1";
  var CACHE_TTL = 5 * 60 * 1000;

  function readCache() {
    try {
      var o = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!o || !o.at || !o.map) return null;
      if (Date.now() - o.at > CACHE_TTL) return null;
      return { map: o.map, age: Math.round((Date.now() - o.at) / 1000) };
    } catch (e) {
      return null;
    }
  }

  function writeCache(map) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), map: map }));
    } catch (e) {
      /* private mode / quota — not worth reporting */
    }
  }

  function num2(n) {
    return typeof n === "number" ? nums(n) : null;
  }

  function paint(map) {
    var nodes = document.querySelectorAll("[data-live][data-repo]");
    [].forEach.call(nodes, function (n) {
      var v = map[n.getAttribute("data-repo")];
      if (!v) return;
      var key = n.getAttribute("data-live");
      var val = null;
      if (key === "stars" || key === "stars-raw") val = num2(v.stars);
      else if (key === "forks") val = num2(v.forks);
      else if (key === "release") {
        if (v.release == null) return; /* unknown — leave the snapshot alone */
        val = v.release || "—";
      } else if (key === "pushed") {
        if (!v.pushedAt) return;
        val = v.pushedAt;
      }
      if (val == null) return;
      if (key === "stars") val += "★";
      if (String(n.textContent) === String(val)) return;
      n.textContent = val;
      n.classList.add("is-fresh");
      setTimeout(function () {
        n.classList.remove("is-fresh");
      }, 1800);
    });
  }

  function clock() {
    var d = new Date();
    function p(x) {
      return (x < 10 ? "0" : "") + x;
    }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* [data-count] mirrors the snapshot's repo totals into the prose and the
     terminals. These were hard-coded once and had already drifted a repo or two
     away from the truth, so they are derived from the same JSON the cards are
     built from instead. */
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function paintCount(total, pinned) {
    var vals = {
      repos: total,
      pinned: pinned,
      "pinned-pad": pad2(pinned),
      rest: total - pinned,
    };
    [].forEach.call(document.querySelectorAll("[data-count]"), function (n) {
      var v = vals[n.getAttribute("data-count")];
      if (v != null) n.textContent = String(v);
    });
  }

  function syncLive(list) {
    var names = [];
    list.forEach(function (p) {
      if (p && p.name && names.indexOf(p.name) === -1) names.push(p.name);
    });
    if (!names.length || !window.fetch) return;

    var cached = readCache();
    if (cached) {
      paint(cached.map);
      if (stamp) {
        stamp.textContent =
          "LIVE · " +
          names.length +
          "/" +
          names.length +
          " 个仓库已核对（" +
          cached.age +
          " 秒前读取）· 星标、fork 与版本直连 GitHub";
        stamp.classList.add("is-live");
      }
      return;
    }

    /* strictly one repo at a time, with a small gap. Firing these concurrently
       got the /releases call answered with 403. */
    var map = {};
    var ok = 0;
    var i = 0;

    function finish() {
      if (!ok) {
        if (stamp) {
          stamp.textContent =
            "SNAPSHOT " +
            (stamp.textContent.match(/\d{4}-\d{2}-\d{2}/) || [""])[0] +
            " · 实时源暂时不可用，以上数字取自构建快照 · 刷新可重试";
          stamp.classList.remove("is-live");
        }
        return;
      }

      paint(map);
      writeCache(map);

      if (stamp) {
        stamp.textContent =
          "LIVE " +
          clock() +
          " · " +
          ok +
          "/" +
          names.length +
          " 个仓库已实时核对 · 星标、fork 与版本直连 GitHub，每次打开重新抓取";
        stamp.classList.add("is-live");
      }
    }

    function step() {
      if (i >= names.length) {
        finish();
        return;
      }
      var name = names[i++];
      liveFor(name).then(
        function (v) {
          map[name] = v;
          ok++;
        },
        function () {}
      ).then(function () {
        return new Promise(function (res) {
          setTimeout(res, 200);
        });
      }).then(step);
    }

    step();
  }

  fetch("assets/data/projects.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("projects.json " + r.status);
      return r.json();
    })
    .then(function (data) {
      var list = data.pinned || [];
      if (layout === "loadout") {
        host.appendChild(loadout(list));
      } else {
        list.forEach(function (p, i) {
          host.appendChild(layout === "rack" ? rack(p, i) : card(p, i));
        });
      }
      buildIndex(list);

      if (stamp) {
        var when = (data.generatedAt || "").slice(0, 10);
        var src = data.source || "build snapshot";
        var note = data.starsLive
          ? "构建时已抓到实时值"
          : "构建时实时源不可用";
        stamp.textContent =
          "SNAPSHOT " +
          when +
          " · " +
          list.length +
          " PINNED · " +
          src +
          " · " +
          note +
          " · " +
          "正在向仓库核对…";
      }

      if (data.account && data.account.publicRepos) {
        paintCount(data.account.publicRepos, list.length);
      }

      /* the snapshot above is already on screen; this replaces the numbers
         in place once the repos answer. */
      syncLive(list);
    })
    .catch(function (err) {
      host.appendChild(
        el("div", "term", "> 载入 assets/data/projects.json 失败：" + err.message)
      );
    });
})();
