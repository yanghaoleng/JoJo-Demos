/**
 * HalftoneDots — vanilla-JS port of github.com/haaarshsingh/halftone-dots
 *
 * Samples any image into a dot-halftone on a single <canvas>. Switching
 * the image plays a radial-wave morph: old dots implode from the centre,
 * new dots explode back with an overshoot ease.
 *
 * Features:
 *  - Image cache + concurrent load cancellation (no race conditions).
 *  - Configurable speed, cell size and gradient.
 *  - Honors `prefers-reduced-motion`.
 */
(function (global) {
  "use strict";

  /* ---- helpers ------------------------------------------------------- */
  function hexRgb(hex) {
    const n = hex.replace("#", "");
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ];
  }

  const easeOutBack = (t) => {
    const c1 = 1.9,
      c3 = c1 + 1,
      p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  };

  /* ---- main class ---------------------------------------------------- */
  class HalftoneDot {
    /**
     * @param {HTMLElement} container - Filled completely by the canvas.
     * @param {object}      opts
     * @param {string}      opts.src
     * @param {[string,string]} [opts.gradient]  top→bottom hex recolor
     * @param {number}      [opts.cell=6]       grid cell size in CSS px
     * @param {number}      [opts.speed=1]      <1 = slower, >1 = faster
     * @param {function}    [opts.onComplete]   fires after each morph animation
     */
    constructor(container, opts = {}) {
      this._c = container;
      this._o = Object.assign({ cell: 6, speed: 1 }, opts);
      this._img = null;
      this._dots = [];
      this._prev = [];
      this._raf = 0;
      this._start = 0;
      this._onComplete = typeof opts.onComplete === "function" ? opts.onComplete : null;
      this._cancel = false;
      this._loadToken = 0;          // monotonic, used to cancel stale loads
      this._cache = new Map();      // url -> HTMLImageElement
      this._reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      /* build DOM */
      this._canvas = document.createElement("canvas");
      this._canvas.style.cssText = "display:block;width:100%;height:100%";
      this._c.style.position = this._c.style.position || "relative";
      this._c.appendChild(this._canvas);
      this._ctx = this._canvas.getContext("2d");

      /* initial render — redraw on layout settle */
      requestAnimationFrame(() => this._render(false));

      this._ro = new ResizeObserver(() => this._render(false));
      this._ro.observe(this._c);

      if (opts.src) this.src(opts.src);
    }

    /* ---- public API --------------------------------------------------- */

    /** Change the source image. Triggers a morph if a previous one exists. */
    src(url) {
      this._load(url);
    }

    /** Change the top→bottom gradient used to recolor the dots. */
    gradient(g) {
      this._o.gradient = g;
      this._render(true);
    }

    /** Register a callback fired after each morph animation finishes. */
    onComplete(fn) {
      this._onComplete = typeof fn === "function" ? fn : null;
    }

    /** Preload a list of images into the cache. */
    preload(urls) {
      urls.forEach((u) => this._load(u, /* silent */ true));
    }

    destroy() {
      this._cancel = true;
      cancelAnimationFrame(this._raf);
      this._ro.disconnect();
    }

    /* ---- internals ---------------------------------------------------- */

    _load(url, silent) {
      if (!url) return;
      const token = ++this._loadToken;

      // already cached → use immediately
      const cached = this._cache.get(url);
      if (cached) {
        this._img = cached;
        this._render(true);
        return;
      }

      const img = new Image();
      img.onload = () => {
        // a newer load was requested → drop this one
        if (token !== this._loadToken) return;
        this._cache.set(url, img);
        this._img = img;
        this._render(true);
      };
      img.onerror = () => {
        if (silent) return;
        console.warn("HalftoneDot: failed to load", url);
      };
      img.src = url;
    }

    _render(animate) {
      if (this._cancel) return;
      const img = this._img;
      const ctx = this._ctx;
      if (!img || !ctx) return;

      const rect = this._c.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;
      if (cssW < 4 || cssH < 4) return;

      const ss = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
      this._canvas.width = Math.round(cssW * ss);
      this._canvas.height = Math.round(cssH * ss);
      ctx.setTransform(ss, 0, 0, ss, 0, 0);

      const CELL = this._o.cell;
      const cols = Math.max(1, Math.round(cssW / CELL));
      const rows = Math.max(1, Math.round(cssH / CELL));
      const cw = cssW / cols;
      const ch = cssH / rows;
      const maxR = Math.min(cw, ch) / 2;

      /* supersample each cell into 4×4 sub-pixels */
      const SUP = 4;
      const bw = cols * SUP;
      const bh = rows * SUP;
      const sc = document.createElement("canvas");
      sc.width = bw;
      sc.height = bh;
      const sctx = sc.getContext("2d");
      if (!sctx) return;
      sctx.clearRect(0, 0, bw, bh);
      const s = Math.min(bw / img.width, bh / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      sctx.drawImage(img, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
      const { data } = sctx.getImageData(0, 0, bw, bh);

      const grad = this._o.gradient;
      const gTop = grad ? hexRgb(grad[0]) : null;
      const gBot = grad ? hexRgb(grad[1]) : null;

      /* build dot list */
      const dots = [];
      for (let yy = 0; yy < rows; yy++) {
        for (let xx = 0; xx < cols; xx++) {
          let cr = 0,
            cg = 0,
            cb = 0,
            ink = 0;
          for (let sy = 0; sy < SUP; sy++) {
            for (let sx = 0; sx < SUP; sx++) {
              const i = ((yy * SUP + sy) * bw + (xx * SUP + sx)) * 4;
              if (data[i + 3] < 24) continue;
              const r0 = data[i],
                g0 = data[i + 1],
                b0 = data[i + 2];
              const lum = (0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 255;
              if (lum > 0.92) continue;
              cr += r0;
              cg += g0;
              cb += b0;
              ink++;
            }
          }
          if (ink === 0) continue;
          const coverage = ink / (SUP * SUP);
          const radius = maxR * Math.min(1, 0.42 + coverage * 0.7);
          let color;
          if (gTop && gBot) {
            const ty = yy / (rows - 1 || 1);
            color = `rgb(${Math.round(gTop[0] + (gBot[0] - gTop[0]) * ty)},${Math.round(gTop[1] + (gBot[1] - gTop[1]) * ty)},${Math.round(gTop[2] + (gBot[2] - gTop[2]) * ty)})`;
          } else {
            color = `rgb(${Math.round(cr / ink)},${Math.round(cg / ink)},${Math.round(cb / ink)})`;
          }
          dots.push({
            x: (xx + 0.5) * cw + (Math.random() - 0.5) * 1.2,
            y: (yy + 0.5) * ch + (Math.random() - 0.5) * 1.2,
            r: Math.min(maxR * 1.05, radius),
            color,
            w: 0,
          });
        }
      }

      /* radial wave coefficient (0 centre → 1 corner) */
      const cx = cssW / 2,
        cy = cssH / 2,
        maxD = Math.hypot(cx, cy) || 1;
      for (let k = 0; k < dots.length; k++) {
        dots[k].w = Math.hypot(dots[k].x - cx, dots[k].y - cy) / maxD;
      }

      /* commit new state and capture the old one for the morph */
      const self = this;
      const prev = animate && !this._reduced ? this._dots : [];
      const wasFirst = this._dots.length === 0;
      this._prev = prev;
      this._dots = dots;
      this._start = performance.now();
      cancelAnimationFrame(this._raf);

      if (!animate || this._reduced || wasFirst) {
        this._drawStatic();
        return;
      }

      /* ---- morph animation ------------------------------------------- */
      const spd = this._o.speed;
      const EXIT_DUR = (300 / spd) | 0,
        EXIT_STAGGER = (200 / spd) | 0;
      const ENTER_DELAY = (150 / spd) | 0,
        ENTER_DUR = (380 / spd) | 0,
        ENTER_STAGGER = (220 / spd) | 0;
      const prevList = prev;

      function tick(now) {
        if (self._cancel) return;
        const el = now - self._start;
        ctx.clearRect(0, 0, cssW, cssH);
        let done = true;

        /* old dots pop then implode from centre */
        for (let k = 0; k < prevList.length; k++) {
          const d = prevList[k];
          const u = (el - d.w * EXIT_STAGGER) / EXIT_DUR;
          if (u >= 1) continue;
          done = false;
          let scale;
          if (u <= 0) scale = 1;
          else if (u < 0.35) scale = 1 + (u / 0.35) * 0.35;
          else scale = 1.35 * (1 - (u - 0.35) / 0.65);
          const r = d.r * scale;
          if (r <= 0.06) continue;
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        /* new dots explode back with overshoot */
        const list = self._dots;
        for (let k = 0; k < list.length; k++) {
          const d = list[k];
          const t = Math.min(
            1,
            Math.max(0, (el - ENTER_DELAY - d.w * ENTER_STAGGER) / ENTER_DUR)
          );
          if (t < 1) done = false;
          if (t <= 0) continue;
          const r = d.r * Math.max(0, easeOutBack(t));
          if (r <= 0.06) continue;
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!done) self._raf = requestAnimationFrame(tick);
        else {
          self._prev = [];
          if (self._onComplete) {
            try { self._onComplete(); } catch (e) { console.error(e); }
          }
        }
      }
      self._raf = requestAnimationFrame(tick);
    }

    _drawStatic() {
      const ctx = this._ctx;
      const rect = this._c.getBoundingClientRect();
      const cssW = rect.width,
        cssH = rect.height;
      ctx.clearRect(0, 0, cssW, cssH);
      for (const d of this._dots) {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---- export -------------------------------------------------------- */
  global.HalftoneDot = HalftoneDot;
})(window);
