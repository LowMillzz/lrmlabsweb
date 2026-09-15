/* ============================================================
   LRM Labs — the field
   A lattice of short dashes. At rest they drift on a slow flow.
   Near the pointer they swing tangential, like filings around a
   current-carrying wire, and heat up through the palette:
   dim violet -> violet -> cyan -> pink -> amber at the core.
   Clicking pushes a ring out through the lattice.
   ============================================================ */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = document.getElementById('field');
  var ctx = canvas.getContext('2d', { alpha: true });

  var SPACING = 34;      // lattice pitch in css px
  var REACH = 230;       // pointer falloff in css px
  var dim = 1;           // alpha multiplier, lowered on small screens
  var RIPPLE_SPEED = 0.52;
  var RIPPLE_LIFE = 1100;

  // Heat ramp, coldest first. Each step is a stroke pass so the
  // whole lattice draws in five batched paths.
  var RAMP = [
    { rgb: '124, 58, 237',  alpha: 0.20, width: 1 },
    { rgb: '124, 58, 237',  alpha: 0.46, width: 1.1 },
    { rgb: '6, 182, 212',   alpha: 0.62, width: 1.25 },
    { rgb: '236, 72, 153',  alpha: 0.78, width: 1.45 },
    { rgb: '245, 158, 11',  alpha: 0.95, width: 1.7 }
  ];

  var w = 0, h = 0, dpr = 1;
  var cells = [];
  var ripples = [];

  // Pointer: tx/ty is where it actually is, px/py is the lagging
  // point the field reacts to.
  var tx = -9999, ty = -9999, px = tx, py = ty;
  var hasPointer = false;
  var lastMove = -9999;
  var started = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    SPACING = w < 760 ? 26 : 34;
    REACH = w < 760 ? 165 : 230;
    dim = w < 760 ? 0.62 : 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    cells.length = 0;
    var cols = Math.ceil(w / SPACING) + 1;
    var rows = Math.ceil(h / SPACING) + 1;
    var offX = (w - (cols - 1) * SPACING) / 2;
    var offY = (h - (rows - 1) * SPACING) / 2;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        cells.push({ x: offX + i * SPACING, y: offY + j * SPACING });
      }
    }
    if (!hasPointer) { px = tx = w / 2; py = ty = h / 2; }
  }

  // Smooth pseudo-flow: two crossed waves. Cheap and continuous,
  // which is all the resting state needs.
  function baseAngle(x, y, t) {
    return Math.sin(x * 0.0042 + t * 0.00014) * 1.3 +
           Math.cos(y * 0.0051 - t * 0.00018) * 1.3 +
           t * 0.00006;
  }

  function draw(now) {
    var t = now;
    ctx.clearRect(0, 0, w, h);

    // Pointer lag, then idle drift if nothing has moved recently.
    if (now - lastMove > 2600) {
      var s = now * 0.00021;
      tx = w * (0.5 + 0.30 * Math.sin(s)) ;
      ty = h * (0.5 + 0.26 * Math.sin(s * 1.37 + 1.1));
    }
    px += (tx - px) * 0.085;
    py += (ty - py) * 0.085;

    // Core glow under the lattice.
    var glow = ctx.createRadialGradient(px, py, 0, px, py, REACH * 1.9);
    glow.addColorStop(0, 'rgba(124, 58, 237, ' + (0.16 * dim).toFixed(3) + ')');
    glow.addColorStop(0.45, 'rgba(236, 72, 153, ' + (0.05 * dim).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(124, 58, 237, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Live ripples
    var live = [];
    for (var r = 0; r < ripples.length; r++) {
      var rp = ripples[r];
      var rage = now - rp.t0;
      if (rage >= RIPPLE_LIFE) continue;
      if (rage < 0) { live.push(rp); continue; }   // scheduled, not started
      rp.radius = rage * RIPPLE_SPEED;
      rp.power = 1 - rage / RIPPLE_LIFE;
      live.push(rp);
    }
    ripples = live;

    var paths = [];
    for (var b = 0; b < RAMP.length; b++) paths.push([]);

    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c];
      var dx = px - cell.x, dy = py - cell.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var inf = Math.exp(-d / REACH);

      for (var k = 0; k < ripples.length; k++) {
        var q = ripples[k];
        if (q.power <= 0) continue;
        var rd = Math.sqrt((q.x - cell.x) * (q.x - cell.x) + (q.y - cell.y) * (q.y - cell.y)) - q.radius;
        inf += q.power * Math.exp(-(rd * rd) / 2600);
      }
      if (inf > 1) inf = 1;

      var a = baseAngle(cell.x, cell.y, t);
      if (inf > 0.005) {
        // Tangential: perpendicular to the line back to the pointer.
        var target = Math.atan2(dy, dx) + Math.PI / 2;
        var diff = ((target - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        a += diff * inf;
      }

      var len = 6.5 + 13 * inf;
      var hx = Math.cos(a) * len * 0.5;
      var hy = Math.sin(a) * len * 0.5;

      var bucket = inf < 0.06 ? 0 : inf < 0.22 ? 1 : inf < 0.45 ? 2 : inf < 0.72 ? 3 : 4;
      paths[bucket].push(cell.x - hx, cell.y - hy, cell.x + hx, cell.y + hy);
    }

    ctx.lineCap = 'round';
    for (var p = 0; p < paths.length; p++) {
      var seg = paths[p];
      if (!seg.length) continue;
      ctx.strokeStyle = 'rgba(' + RAMP[p].rgb + ', ' + (RAMP[p].alpha * dim).toFixed(3) + ')';
      ctx.lineWidth = RAMP[p].width;
      ctx.beginPath();
      for (var m = 0; m < seg.length; m += 4) {
        ctx.moveTo(seg[m], seg[m + 1]);
        ctx.lineTo(seg[m + 2], seg[m + 3]);
      }
      ctx.stroke();
    }
  }

  function loop(now) {
    draw(now);
    requestAnimationFrame(loop);
  }

  function still() {
    // Reduced motion: one frame of the resting lattice, no pointer.
    px = py = tx = ty = -9999;
    ripples.length = 0;
    draw(0);
  }

  window.addEventListener('resize', function () {
    resize();
    if (reduced.matches) still();
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    if (reduced.matches) return;
    tx = e.clientX; ty = e.clientY;
    lastMove = performance.now();
    if (!hasPointer) { hasPointer = true; px = tx; py = ty; }
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (reduced.matches) return;
    ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now(), radius: 0, power: 1 });
    if (ripples.length > 5) ripples.shift();
  }, { passive: true });

  resize();
  if (reduced.matches) {
    canvas.classList.add('lit');
    still();
  } else {
    started = performance.now();
    canvas.classList.add('lit');
    // Opening ring, so the field arrives with the headline.
    ripples.push({ x: window.innerWidth / 2, y: window.innerHeight / 2, t0: started + 280, radius: 0, power: 0 });
    requestAnimationFrame(loop);
  }

  /* ── Page chrome ─────────────────────────────────────── */

  var nav = document.getElementById('nav');
  var scrim = document.documentElement;
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      nav.classList.toggle('stuck', y > 24);
      // Field stays loud in the hero, then steps back behind the copy.
      var k = Math.min(y / (window.innerHeight * 0.75), 1);
      scrim.style.setProperty('--scrim', (k * 0.82).toFixed(3));
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mark the section you are currently reading in the nav.
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
  var targets = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && targets.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('here', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }
})();
