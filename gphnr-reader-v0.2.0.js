/* GPHNR: page-turning engine. Version v0.2.0.
   The engine knows nothing about PDFs. It is handed a "book" object:
     book.id          stable id for remembering the last page
     book.title       shown in the bar
     book.pageCount   story pages
     book.aspect      page width / height
     book.closePage   url of the close page, appended after the last page
     book.load(n)     Promise of an image url for page n (1-based)
     book.loadZoom(n) Promise of a larger image url for page n
     book.focus(n)    hint: the reader is looking at page n now
   No outside libraries. */
(function () {
  "use strict";
  var VERSION = "v0.2.0";
  var FLIP_MS = 750;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), bookEl = $("book"), counter = $("counter"), progress = $("progress");
  var btnPrev = $("btnPrev"), btnNext = $("btnNext"), btnFirst = $("btnFirst"), btnFull = $("btnFull");
  var zoom = $("zoom"), zoomImg = $("zoomImg"), zoomClose = $("zoomclose"), hint = $("hint");
  var edgePrev = document.querySelector(".edge.prev"), edgeNext = document.querySelector(".edge.next");

  var B = null, N = 0, T = 0, ASPECT = 0.655;
  var spread = false, views = [], vi = 0, pw = 0, ph = 0;
  var busy = false, queued = 0, pendingPage = 0, active = false;

  function src(n, img, slot) {
    if (n > N) { img.src = B.closePage; return; }
    if (slot) slot.classList.add("loading");
    B.load(n).then(function (u) {
      img.src = u;
      if (slot) slot.classList.remove("loading");
    }, function () { if (slot) slot.classList.remove("loading"); });
  }

  function buildViews() {
    views = [];
    var p;
    if (spread) {
      views.push([0, 1]);
      for (p = 2; p <= T; p += 2) views.push([p, p + 1 <= T ? p + 1 : 0]);
    } else {
      for (p = 1; p <= T; p++) views.push([p]);
    }
  }
  function viewOf(page) {
    for (var i = 0; i < views.length; i++) if (views[i].indexOf(page) !== -1) return i;
    return 0;
  }
  function firstPage(v) {
    for (var i = 0; i < v.length; i++) if (v[i]) return v[i];
    return 1;
  }

  function layout(keep) {
    if (keep === undefined) keep = views.length ? firstPage(views[vi]) : 1;
    var W = window.innerWidth, H = window.innerHeight;
    spread = W > H && W >= 700;
    var availW = W - 32, availH = H - 44 - 24;
    ph = spread ? Math.min(availH, availW / (2 * ASPECT)) : Math.min(availH, availW / ASPECT);
    ph = Math.floor(ph); pw = Math.floor(ph * ASPECT);
    bookEl.style.width = (spread ? 2 * pw : pw) + "px";
    bookEl.style.height = ph + "px";
    bookEl.className = spread ? "spread" : "single";
    buildViews();
    vi = viewOf(keep);
    render();
  }

  function offsetFor(v) {
    if (!spread) return 0;
    if (!v[0] && v[1]) return -pw / 2;
    if (v[0] && !v[1]) return pw / 2;
    return 0;
  }

  function makeSlot(cls, page, left) {
    var d = document.createElement("div");
    d.className = "slot " + cls + (page ? "" : " empty");
    d.style.left = left + "px";
    d.style.width = pw + "px";
    if (page) {
      var img = document.createElement("img");
      img.alt = page > N ? "Fin" : "Page " + page;
      img.draggable = false;
      d.setAttribute("data-page", page);
      d.appendChild(img);
      src(page, img, d);
    }
    return d;
  }

  function drawStatic(l, r) {
    bookEl.innerHTML = "";
    if (spread) {
      bookEl.appendChild(makeSlot("left", l, 0));
      bookEl.appendChild(makeSlot("right", r, pw));
    } else {
      bookEl.appendChild(makeSlot("right", r, 0));
    }
  }

  function render(fade) {
    var v = views[vi];
    if (spread) drawStatic(v[0], v[1]); else drawStatic(0, v[0]);
    bookEl.style.transition = "none";
    bookEl.style.transform = "translateX(" + offsetFor(v) + "px)";
    void bookEl.offsetWidth;
    bookEl.style.transition = "";
    bookEl.classList.toggle("fade-in", !!fade);
    updateUi();
    var f = firstPage(v);
    if (B.focus) B.focus(f);
    for (var i = f - 2; i <= f + 4; i++) if (i >= 1 && i <= N) B.load(i);
  }

  function updateUi() {
    var pages = views[vi].filter(function (x) { return x; });
    var story = pages.filter(function (x) { return x <= N; });
    var label;
    if (pages.length === 1 && pages[0] === 1) label = "Cover";
    else if (!story.length) label = "Fin";
    else if (story.length === 1) label = "Page " + story[0] + " of " + N;
    else label = "Pages " + story[0] + "-" + story[1] + " of " + N;
    counter.textContent = label;
    progress.style.width = (100 * pages[pages.length - 1] / T) + "%";
    btnPrev.disabled = btnFirst.disabled = vi === 0;
    btnNext.disabled = vi === views.length - 1;
    edgePrev.classList.toggle("off", vi === 0);
    edgeNext.classList.toggle("off", vi === views.length - 1);
    save(pages[0]);
  }

  function face(cls, page) {
    var f = document.createElement("div");
    f.className = "face " + cls + (page ? "" : " blank");
    if (page) {
      var img = document.createElement("img");
      img.alt = ""; img.draggable = false;
      f.appendChild(img);
      src(page, img, null);
    }
    var s = document.createElement("div");
    s.className = "shade";
    f.appendChild(s);
    return f;
  }

  function go(dir, fast) {
    if (!active || zoom.classList.contains("on")) return;
    var target = vi + dir;
    if (target < 0 || target >= views.length) { queued = 0; return; }
    if (busy) { queued = Math.max(-3, Math.min(3, queued + dir)); return; }
    if (reduceMotion) { vi = target; render(true); return; }

    var cur = views[vi], nxt = views[target];
    var leaf = document.createElement("div");
    leaf.className = "leaf";
    leaf.style.width = pw + "px";
    leaf.style.left = (spread ? pw : 0) + "px";
    var front, back = 0, from, to;
    if (spread) {
      if (dir > 0) { drawStatic(cur[0], nxt[1]); front = cur[1]; back = nxt[0]; from = 0; to = -180; }
      else { drawStatic(nxt[0], cur[1]); front = nxt[1]; back = cur[0]; from = -180; to = 0; }
    } else {
      if (dir > 0) { drawStatic(0, nxt[0]); front = cur[0]; from = 0; to = -180; }
      else { drawStatic(0, cur[0]); front = nxt[0]; from = -180; to = 0; }
    }
    var ff = face("front", front), bf = face("back", back);
    leaf.appendChild(ff); leaf.appendChild(bf);
    bookEl.appendChild(leaf);

    busy = true;
    var ms = fast ? 420 : FLIP_MS;
    var opts = { duration: ms, easing: "cubic-bezier(0.45, 0.05, 0.35, 1)", fill: "forwards" };
    var frames = [
      { transform: "rotateY(" + from + "deg)" },
      { transform: "rotateY(" + (from + to) / 2 + "deg) translateZ(1px)" },
      { transform: "rotateY(" + to + "deg)" }
    ];
    if (!spread) {
      frames[0].opacity = dir > 0 ? 1 : 0;
      frames[1].opacity = 1;
      frames[2].opacity = dir > 0 ? 0 : 1;
    }
    var anim = leaf.animate(frames, opts);
    var shF = dir > 0 ? [0, 0.85, 0.85] : [0.85, 0.85, 0];
    var shB = dir > 0 ? [0.85, 0.85, 0] : [0, 0.85, 0.85];
    ff.lastChild.animate([{ opacity: shF[0] }, { opacity: shF[1] }, { opacity: shF[2] }], opts);
    bf.lastChild.animate([{ opacity: shB[0] }, { opacity: shB[1] }, { opacity: shB[2] }], opts);
    bookEl.style.transform = "translateX(" + offsetFor(nxt) + "px)";

    var done = false;
    function finish() {
      if (done) return; done = true;
      vi = target; busy = false;
      render();
      if (pendingPage) { var pp = pendingPage; pendingPage = 0; queued = 0; goTo(pp); }
      else if (queued) { var d = queued > 0 ? 1 : -1; queued -= d; go(d, true); }
    }
    anim.onfinish = finish;
    setTimeout(finish, ms + 200);
  }

  function goTo(page) {
    if (!active) return;
    if (busy) { pendingPage = page; return; }
    queued = 0;
    vi = viewOf(page); render(true);
  }

  /* memory, per book */
  function key() { return "gphnr:last:" + B.id; }
  function save(p) { try { localStorage.setItem(key(), String(p)); } catch (e) { /* storage off */ } }
  function lastPage() {
    try { var s = +localStorage.getItem(key()); if (s >= 1 && s <= T) return s; } catch (e) { /* storage off */ }
    return 1;
  }

  /* zoom */
  function openZoom(page, fx, fy) {
    var w = Math.round(Math.max(700, Math.min(1400, window.innerWidth * 2.2)));
    if (window.innerWidth >= 1400) w = 1400;
    var h = Math.round(w / ASPECT);
    zoomImg.removeAttribute("src");
    zoomImg.style.width = w + "px"; zoomImg.style.height = h + "px";
    zoom.classList.add("on");
    zoom.scrollLeft = Math.max(0, fx * w - window.innerWidth / 2);
    zoom.scrollTop = Math.max(0, fy * h - window.innerHeight / 2);
    if (page > N) { zoomImg.src = B.closePage; return; }
    B.loadZoom(page).then(function (u) { if (zoom.classList.contains("on")) zoomImg.src = u; });
  }
  function closeZoom() { zoom.classList.remove("on"); }
  zoomClose.addEventListener("click", closeZoom);
  var pan = null;
  zoom.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse") return;
    pan = { x: e.clientX, y: e.clientY, l: zoom.scrollLeft, t: zoom.scrollTop };
    zoom.classList.add("dragging");
  });
  window.addEventListener("pointermove", function (e) {
    if (!pan) return;
    zoom.scrollLeft = pan.l - (e.clientX - pan.x); zoom.scrollTop = pan.t - (e.clientY - pan.y);
  });
  window.addEventListener("pointerup", function () { pan = null; zoom.classList.remove("dragging"); });
  zoom.addEventListener("dblclick", closeZoom);
  var lastZoomTap = 0;
  zoom.addEventListener("touchend", function (e) {
    var now = Date.now();
    if (now - lastZoomTap < 300 && e.changedTouches.length === 1) { closeZoom(); lastZoomTap = 0; }
    else lastZoomTap = now;
  });

  /* input */
  document.addEventListener("keydown", function (e) {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (zoom.classList.contains("on")) {
      if (k === "Escape" || k === "z" || k === "Z") { closeZoom(); e.preventDefault(); }
      return;
    }
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown") { go(1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp") { go(-1); e.preventDefault(); }
    else if (k === "Home") { goTo(1); e.preventDefault(); }
    else if (k === "End") { goTo(T); e.preventDefault(); }
    else if (k === "f" || k === "F") { toggleFull(); }
  });
  btnPrev.addEventListener("click", function () { go(-1); });
  btnNext.addEventListener("click", function () { go(1); });
  btnFirst.addEventListener("click", function () { goTo(1); });

  var down = null, lastTap = null;
  function onArea(t) { return !(t.closest && (t.closest("#bar") || t.closest("#zoom") || t.closest("#zoomclose") || t.closest("#drop"))); }
  document.addEventListener("pointerdown", function (e) {
    if (!active || !onArea(e.target) || zoom.classList.contains("on")) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  document.addEventListener("pointerup", function (e) {
    if (!down) return;
    var dx = e.clientX - down.x, dy = e.clientY - down.y, dt = Date.now() - down.t;
    down = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 900) { go(dx < 0 ? 1 : -1); lastTap = null; return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    var edge = edgeAt(e.clientX), now = Date.now();
    if (!edge && lastTap && now - lastTap.t < 320 &&
        Math.abs(e.clientX - lastTap.x) < 40 && Math.abs(e.clientY - lastTap.y) < 40) {
      lastTap = null; zoomAt(e.clientX, e.clientY); return;
    }
    lastTap = { x: e.clientX, y: e.clientY, t: now };
    if (edge) go(edge);
  });
  function edgeAt(x) {
    var w = window.innerWidth, z = Math.max(48, w * 0.12);
    return x < z ? -1 : (x > w - z ? 1 : 0);
  }
  function zoomAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var slot = el && el.closest ? el.closest(".slot[data-page]") : null;
    if (!slot) return;
    var r = slot.getBoundingClientRect();
    openZoom(+slot.getAttribute("data-page"), (x - r.left) / r.width, (y - r.top) / r.height);
  }

  var de = document.documentElement;
  var canFull = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  if (!canFull) btnFull.style.display = "none";
  function toggleFull() {
    if (!canFull) return;
    var fe = document.fullscreenElement || document.webkitFullscreenElement;
    if (fe) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
  }
  btnFull.addEventListener("click", toggleFull);

  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt); rt = setTimeout(function () { if (active && !busy) layout(); }, 120);
  });

  function open(book) {
    B = book; N = book.pageCount; T = N + (book.closePage ? 1 : 0); ASPECT = book.aspect;
    views = []; vi = 0; busy = false; queued = 0; pendingPage = 0; active = true;
    $("titleText").innerHTML = "<b></b>";
    $("titleText").firstChild.textContent = book.title;
    $("ver").textContent = VERSION;
    document.title = book.title + " - GPHNR";
    layout(lastPage());
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    hint.textContent = coarse
      ? "Swipe or tap the edges to turn. Double-tap a page to zoom."
      : "Arrow keys or click the edges to turn. Double-click a page to zoom. F for full screen.";
    hint.classList.remove("gone");
    setTimeout(function () { hint.classList.add("gone"); }, 4500);
  }
  function close() { active = false; closeZoom(); bookEl.innerHTML = ""; }

  window.GPHNR = {
    version: VERSION, open: open, close: close, go: go, goTo: goTo,
    state: function () { return { spread: spread, view: views[vi], busy: busy }; }
  };
})();
