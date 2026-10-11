/* mtoo.vip — interface behaviour. no dependencies, no tracking. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- boot flag: reveal styles only apply once JS is alive ---------- */
  /* the .js class is set by an inline script in <head>; if that script or this
     file ever fails, no [data-reveal] element is hidden and the page still reads
     top to bottom. (this is deliberate — see the note in neon.css) */

  /* ---------- scroll reveal ---------- */
  var targets = document.querySelectorAll("[data-reveal],[data-reveal-line]");
  function show(el) {
    var d = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
    if (d) el.style.transitionDelay = d + "ms";
    el.classList.add("is-in");
  }
  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach(show);
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          show(e.target);
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }
    );
    targets.forEach(function (el) {
      io.observe(el);
    });
    /* safety net: anything already inside the fold powers on next frame, so a
       late, throttled or mis-reporting observer can never leave a blank page */
    requestAnimationFrame(function () {
      var fold = (window.innerHeight || 0) * 0.94;
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < fold && r.bottom > 0) show(el);
      });
    });
  }

  /* ---------- ticker: duplicate the track once for a seamless -50% loop ---------- */
  var track = document.querySelector(".ticker-in");
  if (track && !track.getAttribute("data-cloned")) {
    track.setAttribute("data-cloned", "1");
    var kids = Array.prototype.slice.call(track.children);
    kids.forEach(function (n) {
      track.appendChild(n.cloneNode(true));
    });
  }

  /* ---------- mobile drawer ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var drawer = document.querySelector(".nav-drawer");
  function setDrawer(open) {
    if (!drawer) return;
    drawer.setAttribute("data-open", open ? "true" : "false");
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.documentElement.style.overflow = open ? "hidden" : "";
  }
  if (toggle && drawer) {
    toggle.addEventListener("click", function () {
      setDrawer(drawer.getAttribute("data-open") !== "true");
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) setDrawer(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setDrawer(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 760) setDrawer(false);
    });
  }

  /* ---------- copy-to-clipboard (used by the sponsor page) ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy") || "";
      var done = function () {
        var old = btn.getAttribute("data-label") || btn.textContent;
        btn.setAttribute("data-label", old);
        btn.textContent = "已复制 ✓";
        setTimeout(function () {
          btn.textContent = old;
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  /* ---------- streaming terminal ---------- */
  /* The full log is already in the HTML, so it reads fine without scripting.
     Here it is replayed: command lines are wiped in behind a clip so they look
     typed, output lines just drop in. Timing is per-line and deliberately
     uneven — real logs do not arrive on a metronome. */
  function initTerms() {
    if (reduce) return;
    document.querySelectorAll(".term[data-term]").forEach(function (term) {
      var lines = Array.prototype.slice.call(term.querySelectorAll(".tl"));
      if (!lines.length) return;

      term.classList.add("is-live");
      lines.forEach(function (l) {
        l.classList.remove("is-on");
      });

      var i = 0;
      function tail() {
        term.scrollTop = term.scrollHeight;
      }
      function next() {
        if (i >= lines.length) return; // cursor keeps blinking: it is a live shell
        var line = lines[i++];
        var blank = !line.textContent.trim();
        var isCmd = !!line.querySelector(".p");
        var wait;

        if (isCmd) {
          /* clip first, then reveal: the two classes land in the same recalc,
             so the full line never flashes before the wipe starts. */
          var n = Math.max(6, line.textContent.length);
          var dur = 160 + n * 26;
          line.classList.add("is-typing", "is-on");
          void line.offsetWidth; /* commit the clipped start value */
          line.style.transition = "clip-path " + dur + "ms steps(" + n + ",end)";
          line.style.clipPath = "inset(0 0 0 0)";
          wait = dur + 70;
          setTimeout(function () {
            line.style.transition = "";
            line.style.clipPath = "";
            line.classList.remove("is-typing");
          }, wait);
        } else {
          line.classList.add("is-on");
          wait = blank ? 90 : 48 + Math.min(130, line.textContent.length * 2);
        }
        tail();
        setTimeout(next, wait);
      }
      setTimeout(next, 320);
    });
  }
  initTerms();

  /* ---------- footer year ---------- */
  var y = String(new Date().getFullYear());
  document.querySelectorAll("[data-year]").forEach(function (n) {
    n.textContent = y;
  });
})();
