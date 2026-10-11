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
    function stat(label, value) {
      var s = el("span");
      s.appendChild(el("b", "", value));
      s.appendChild(document.createTextNode(" " + label));
      stats.appendChild(s);
    }
    stat("star", nums(p.stars) + "★");
    if (p.forks) stat("fork", nums(p.forks));
    if (p.release) stat("release", p.release);
    if (p.pushedAt) stat("最后提交", p.pushedAt);
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
        var live = data.starsLive
          ? "星标为实时抓取"
          : "实时源不可用，星标取自上次快照";
        stamp.textContent =
          "SNAPSHOT " + when + " · " + list.length + " PINNED · " + src + " · " + live;
      }

      var mo = document.getElementById("repo-count");
      if (mo && data.account && data.account.publicRepos) {
        var rest = data.account.publicRepos - list.length;
        mo.textContent = String(rest);
      }
    })
    .catch(function (err) {
      host.appendChild(
        el("div", "term", "> 载入 assets/data/projects.json 失败：" + err.message)
      );
    });
})();
