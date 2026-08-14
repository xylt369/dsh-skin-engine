window.__ModuleLoader__.load({
  id: "@yeesy369/dsh-skin-engine",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // ================= 换肤中心 skin-engine (browser half) =================
    // 入口：侧边栏底部「换肤中心」按钮；界面注册在 shell.overlay。
    // 背景：自建 z-index:-1 全屏层垫在应用内容之下 + theme.overrideTokens 全量换肤。
    const h = React.createElement;

    // ---------- 状态 ----------
    const STATE = {
      open: false,
      imageUrl: null,
      colors: null, // { base:[r,g,b], accent:[r,g,b], textLight:bool }
      animation: 'glow', // none | glow | ripple | particles | aurora | stars
      imageOpacity: 0.85,
      panelAlpha: 0.8,
      blur: 0,
      dim: 0.42,
    };
    const LISTENERS = new Set();
    function setState(patch) {
      Object.assign(STATE, patch);
      LISTENERS.forEach(function (fn) { try { fn() } catch (e) { console.error(e) } });
    }
    function subscribe(fn) { LISTENERS.add(fn); return function () { LISTENERS.delete(fn) }; }
    function useStore() {
      const [, force] = React.useState(0);
      React.useEffect(function () { return subscribe(function () { force(function (x) { return x + 1 }) }) }, []);
      return STATE;
    }

    // ---------- 颜色工具 ----------
    function mix(c1, c2, t) {
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
      ];
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

    function extractColors(url) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          try {
            const size = 64;
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0, size, size);
            const data = cx.getImageData(0, 0, size, size).data;
            let r = 0, g = 0, b = 0, n = 0;
            let accent = [86, 130, 246];
            let bestSat = -1;
            for (let i = 0; i < data.length; i += 4) {
              const rr = data[i], gg = data[i + 1], bb = data[i + 2], aa = data[i + 3];
              if (aa < 128) continue;
              r += rr; g += gg; b += bb; n++;
              const max = Math.max(rr, gg, bb);
              const min = Math.min(rr, gg, bb);
              const sat = max === 0 ? 0 : (max - min) / max;
              const l = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
              if (sat > bestSat && l > 0.08 && l < 0.95) { bestSat = sat; accent = [rr, gg, bb]; }
            }
            if (!n) { resolve({ base: [24, 26, 32], accent: accent, textLight: false }); return; }
            const base = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
            resolve({ base: base, accent: accent, textLight: lum(base) < 0.55 });
          } catch (err) {
            resolve({ base: [24, 26, 32], accent: [86, 130, 246], textLight: false });
          }
        };
        img.onerror = function () { resolve({ base: [24, 26, 32], accent: [86, 130, 246], textLight: false }); };
        img.src = url;
      });
    }

    // ---------- 主题 Token 覆盖（全量清扫）----------
    let disposeTokens = null;
    let applySkinFn = function () {};

    function buildTokens(colors, alpha) {
      const base = colors.base;
      const accent = colors.accent;
      const textLight = colors.textLight;
      const label = textLight ? [248, 250, 253] : [16, 18, 24];
      const labelInv = textLight ? [16, 18, 24] : [248, 250, 253];
      const p1 = mix(base, [0, 0, 0], 0.2);
      const p2 = mix(base, [0, 0, 0], 0.32);
      const p3 = mix(base, [0, 0, 0], 0.42);
      const overlay = mix(base, [0, 0, 0], 0.12);
      const sidebar = mix(base, [0, 0, 0], 0.24);
      const input = mix(base, [0, 0, 0], 0.08);
      const bubble = mix(base, [0, 0, 0], 0.22);
      const bubbleHl = mix(base, [0, 0, 0], 0.3);
      const menu = mix(base, [0, 0, 0], 0.14);
      const tip = mix(base, [0, 0, 0], 0.18);
      const code = mix(base, [0, 0, 0], 0.45);
      const elevated = mix(base, [0, 0, 0], 0.16);
      const border = mix(base, [255, 255, 255], 0.38);
      const solid = Math.min(0.94, alpha + 0.14);
      const bubbleA = Math.min(0.92, alpha + 0.12);
      const oa = Math.min(0.96, alpha + 0.14);
      const hover = rgba(label, 0.08);
      const hoverSolid = rgba(label, 0.1);
      const active = rgba(label, 0.12);
      const fgOnAccent = lum(accent) > 0.55 ? rgba([18, 20, 26], 0.96) : rgba([250, 252, 255], 0.97);
      const inv = textLight ? rgba([0, 0, 0], 0.25) : rgba([255, 255, 255], 0.25);
      const inv2 = textLight ? rgba([0, 0, 0], 0.42) : rgba([255, 255, 255], 0.42);
      const t = {};
      const set = function (k, v) { t[k] = { light: v, dark: v }; };
      set('--dsw-alias-bg-base', rgba(mix(base, [0, 0, 0], 0.08), Math.min(0.5, alpha * 0.5)));
      set('--dsw-alias-bg-layer-1', rgba(p1, alpha));
      set('--dsw-alias-bg-layer-2', rgba(p2, alpha));
      set('--dsw-alias-bg-layer-3', rgba(p3, alpha));
      set('--dsw-alias-bg-overlay', rgba(overlay, oa));
      set('--dsw-alias-bg-mask-1', rgba(label, 0.04));
      set('--dsw-alias-bg-mask-2', rgba(label, 0.08));
      set('--dsw-alias-bg-mask-3', rgba(label, 0.12));
      set('--dsw-alias-bg-mask-drop', rgba(label, 0.1));
      set('--dsw-alias-bg-mask-photo', 'rgba(0,0,0,0.35)');
      set('--dsw-alias-bg-module-platform', rgba(mix(base, [0, 0, 0], 0.1), alpha));
      set('--dsw-alias-bg-multi-select', rgba(mix(base, [0, 0, 0], 0.2), 0.92));
      set('--dsw-alias-bg-skeleton', rgba(label, 0.08));
      set('--dsw-alias-border-l1', rgba(border, 0.16));
      set('--dsw-alias-border-l2', rgba(border, 0.3));
      set('--dsw-alias-border-l2-darkmode-thin', rgba(border, 0.24));
      set('--dsw-alias-border-l3', rgba(border, 0.45));
      set('--dsw-alias-border-l4', rgba(border, 0.62));
      set('--dsw-alias-border-inverted', inv);
      set('--dsw-alias-border-inverted2', inv2);
      set('--dsw-alias-brand-primary', rgba(accent, 1));
      set('--dsw-alias-brand-primary-invert', fgOnAccent);
      set('--dsw-alias-brand-primary-new-colorprimary-new-color', rgba(accent, 1));
      set('--dsw-alias-brand-text', fgOnAccent);
      set('--dsw-alias-button-floating-fill', rgba(input, solid));
      set('--dsw-alias-button-floating-hover', rgba(mix(input, [255, 255, 255], 0.1), solid));
      set('--dsw-alias-button-elevated-fill', rgba(elevated, 0.95));
      set('--dsw-alias-button-contrast-fill', rgba(mix(base, [0, 0, 0], 0.1), solid));
      set('--dsw-alias-button-primary-fill', rgba(accent, 1));
      set('--dsw-alias-button-primary-hover', rgba(mix(accent, [255, 255, 255], 0.12), 1));
      set('--dsw-alias-button-primary-dimmed', rgba(accent, 0.32));
      set('--dsw-alias-button-info-fill', rgba(mix(accent, [0, 0, 0], 0.5), 1));
      set('--dsw-alias-button-info-hover', rgba(mix(accent, [0, 0, 0], 0.42), 1));
      set('--dsw-alias-button-tool-bar-fill', rgba(input, 0.9));
      set('--dsw-alias-button-tool-bar-fill-invisible', rgba(input, 0.55));
      set('--dsw-alias-button-tool-bar-hover', rgba(mix(input, [255, 255, 255], 0.08), 0.95));
      set('--dsw-alias-button-ghost-active-fill', active);
      set('--dsw-alias-button-ghost-active-hover', rgba(label, 0.16));
      set('--dsw-alias-button-ghost-active-border', rgba(border, 0.4));
      set('--dsw-alias-interactive-bg-hover', hover);
      set('--dsw-alias-interactive-bg-hover-solid', hoverSolid);
      set('--dsw-alias-interactive-bg-hover-accent', rgba(accent, 0.12));
      set('--dsw-alias-interactive-bg-hover-danger', 'rgba(232,88,88,0.14)');
      set('--dsw-alias-interactive-bg-active', active);
      set('--dsw-alias-label-primary', rgba(label, 0.97));
      set('--dsw-alias-label-primary-bluish', rgba(label, 0.95));
      set('--dsw-alias-label-primary-dimmed', rgba(label, 0.85));
      set('--dsw-alias-label-primary-foreground', fgOnAccent);
      set('--dsw-alias-label-primary-inverted', rgba(labelInv, 0.95));
      set('--dsw-alias-label-secondary', rgba(label, 0.68));
      set('--dsw-alias-label-tertiary', rgba(label, 0.45));
      set('--dsw-alias-label-caption', rgba(label, 0.55));
      set('--dsw-alias-label-cap', rgba(label, 0.5));
      set('--dsw-alias-label-dimmed', rgba(label, 0.5));
      set('--dsw-alias-markdown-code-block', rgba(code, 0.92));
      set('--dsw-alias-markdown-code-block-banner', rgba(mix(code, [255, 255, 255], 0.05), 0.92));
      set('--dsw-alias-markdown-code-segment-selected', rgba(accent, 0.22));
      set('--dsw-alias-markdown-code-segment-unselected', rgba(label, 0.06));
      set('--dsw-alias-markdown-inline-code', rgba(mix(base, [0, 0, 0], 0.35), 0.85));
      set('--dsw-alias-markdown-citation', rgba(accent, 0.14));
      set('--dsw-alias-markdown-placeholder', rgba(label, 0.3));
      set('--dsw-alias-markdown-tag', rgba(mix(base, [0, 0, 0], 0.25), 0.9));
      set('--dsw-alias-scrollbar-bg-l1', rgba(label, 0.12));
      set('--dsw-alias-scrollbar-bg-l2', rgba(label, 0.16));
      set('--dsw-alias-scrollbar-hover-l1', rgba(label, 0.22));
      set('--dsw-alias-scrollbar-hover-l2', rgba(label, 0.3));
      set('--dsw-alias-state-business-primary', rgba(accent, 1));
      set('--dsw-alias-state-business-tertiary', rgba(accent, 0.3));
      set('--dsw-alias-toast-bg', rgba(mix(base, [0, 0, 0], 0.28), 0.97));
      set('--dsw-alias-tooltip-bg', rgba(mix(base, [0, 0, 0], 0.32), 0.97));
      set('--dsw-specific-sidebar-fill', rgba(sidebar, alpha));
      set('--dsw-specific-input-major', rgba(input, solid));
      set('--dsw-specific-login-input', rgba(input, solid));
      set('--dsw-specific-bubble', rgba(bubble, bubbleA));
      set('--dsw-specific-bubble-highlight', rgba(bubbleHl, bubbleA));
      set('--dsw-specific-menu', rgba(menu, 0.96));
      set('--dsw-specific-selector', rgba(input, solid));
      set('--dsw-specific-tip', rgba(tip, 0.92));
      set('--dsw-specific-sidebar-nav-item-hover', hover);
      set('--dsw-specific-sidebar-nav-item-active', rgba(accent, 0.16));
      set('--dsw-specific-sidebar-nav-item-active-accent', rgba(accent, 1));
      return t;
    }

    // ---------- 动画 ----------
    const ANIMATIONS = {
      none: { name: '静态', desc: '仅显示图片背景' },
      glow: { name: '光晕跟随', desc: '柔光拖着光尾跟随光标' },
      ripple: { name: '涟漪扩散', desc: '移动与点击产生扩散波纹' },
      particles: { name: '粒子拖尾', desc: '光标持续拖出闪烁粒子' },
      aurora: { name: '极光流动', desc: '流动光带随光标偏移' },
      stars: { name: '星空视差', desc: '星空随光标视差浮动' },
    };

    let bgRoot = null;
    let bgCanvas = null;
    let bgCtx = null;
    let rafId = 0;
    let lastT = 0;
    let dpr = 1;
    const anim = {
      mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5,
      lagX: 0.5, lagY: 0.5,
      rings: [], parts: [], stars: [],
      blobs: [
        { x: 0.3, y: 0.35, r: 0.5, c: [86, 156, 255], p: 0 },
        { x: 0.72, y: 0.62, r: 0.55, c: [162, 96, 255], p: 2.2 },
        { x: 0.5, y: 0.15, r: 0.4, c: [52, 214, 200], p: 4.4 },
      ],
      spawnAcc: 0,
      lastRing: 0,
    };

    function makePart(x, y) {
      return {
        x: x, y: y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        life: 0.8 + Math.random() * 0.9,
        size: 1 + Math.random() * 2.4,
      };
    }

    function resizeCanvas() {
      if (!bgCanvas) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      bgCanvas.width = Math.round(window.innerWidth * dpr);
      bgCanvas.height = Math.round(window.innerHeight * dpr);
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointerMove(e) {
      anim.tx = e.clientX / window.innerWidth;
      anim.ty = e.clientY / window.innerHeight;
      if (STATE.animation === 'ripple') {
        const now = performance.now();
        if (now - anim.lastRing > 90) {
          anim.lastRing = now;
          anim.rings.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.5 });
        }
      }
    }

    function onPointerDown(e) {
      anim.tx = e.clientX / window.innerWidth;
      anim.ty = e.clientY / window.innerHeight;
      if (STATE.animation === 'ripple') {
        for (let i = 0; i < 3; i++) {
          anim.rings.push({ x: e.clientX + (Math.random() - 0.5) * 40, y: e.clientY + (Math.random() - 0.5) * 40, r: 6, a: 0.55 });
        }
      }
      if (STATE.animation === 'particles') {
        for (let i = 0; i < 10; i++) anim.parts.push(makePart(e.clientX, e.clientY));
      }
    }

    function step(dt, t) {
      const canvas = bgCanvas;
      const ctx = bgCtx;
      if (!canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) resizeCanvas();
      ctx.clearRect(0, 0, w, h);
      const a = STATE.animation;
      anim.mx += (anim.tx - anim.mx) * Math.min(1, dt * 5);
      anim.my += (anim.ty - anim.my) * Math.min(1, dt * 5);
      const mx = anim.mx * w;
      const my = anim.my * h;

      if (a === 'glow') {
        ctx.globalCompositeOperation = 'screen';
        let g = ctx.createRadialGradient(mx, my, 0, mx, my, Math.max(w, h) * 0.42);
        g.addColorStop(0, 'rgba(255,255,255,0.30)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        anim.lagX += (anim.mx - anim.lagX) * Math.min(1, dt * 2.4);
        anim.lagY += (anim.my - anim.lagY) * Math.min(1, dt * 2.4);
        g = ctx.createRadialGradient(anim.lagX * w, anim.lagY * h, 0, anim.lagX * w, anim.lagY * h, Math.max(w, h) * 0.24);
        g.addColorStop(0, 'rgba(255,255,255,0.14)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      } else if (a === 'ripple') {
        for (let i = anim.rings.length - 1; i >= 0; i--) {
          const r = anim.rings[i];
          r.r += dt * 280;
          r.a -= dt * 0.75;
          if (r.a <= 0) { anim.rings.splice(i, 1); continue; }
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, r.a).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (a === 'particles') {
        anim.spawnAcc += dt;
        while (anim.spawnAcc > 0.05) {
          anim.spawnAcc -= 0.05;
          if (anim.parts.length < 420) anim.parts.push(makePart(mx + (Math.random() - 0.5) * 30, my + (Math.random() - 0.5) * 30));
        }
        for (let i = anim.parts.length - 1; i >= 0; i--) {
          const p = anim.parts[i];
          p.life -= dt;
          if (p.life <= 0) { anim.parts.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 30 * dt;
          const al = Math.max(0, Math.min(1, p.life / 0.9));
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(255,255,255,' + (al * 0.85).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size * al), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (a === 'aurora') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < anim.blobs.length; i++) {
          const b = anim.blobs[i];
          b.p += dt * 0.5;
          b.x += Math.sin(b.p) * dt * 0.06 + (anim.mx - b.x) * dt * 0.1;
          b.y += Math.cos(b.p * 0.77) * dt * 0.05 + (anim.my - b.y) * dt * 0.08;
          const bx = b.x * w;
          const by = b.y * h;
          const br = b.r * Math.max(w, h);
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0.15)');
          g.addColorStop(1, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      } else if (a === 'stars') {
        if (anim.stars.length === 0) {
          for (let i = 0; i < 140; i++) {
            anim.stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, tw: Math.random() * Math.PI * 2 });
          }
        }
        ctx.globalCompositeOperation = 'screen';
        const ox = (anim.mx - 0.5) * 0.16;
        const oy = (anim.my - 0.5) * 0.16;
        for (let i = 0; i < anim.stars.length; i++) {
          const s = anim.stars[i];
          const sx = (s.x - ox * s.z) * w;
          const sy = (s.y - oy * s.z) * h;
          const al = 0.3 + 0.7 * Math.abs(Math.sin(s.tw + t * 0.0011 * s.z));
          ctx.fillStyle = 'rgba(255,255,255,' + (al * 0.8).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(sx, sy, 0.7 + s.z * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function loop(t) {
      if (!bgRoot) { rafId = 0; return; }
      rafId = requestAnimationFrame(loop);
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
      lastT = t;
      step(dt, t);
    }

    function startLoop() {
      if (rafId) return;
      lastT = 0;
      rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    // ---------- 背景层（自建 z-index:-1 全屏层，垫在应用内容之下）----------
    function ensureBgLayer() {
      if (bgRoot && document.body.contains(bgRoot)) return;
      destroyBgLayer();
      bgRoot = document.createElement('div');
      bgRoot.setAttribute('data-dsh-skin', 'root');
      bgRoot.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden';
      const img = document.createElement('div');
      img.setAttribute('data-dsh-skin', 'image');
      img.style.cssText = 'position:absolute;inset:0;background-size:cover;background-position:center';
      const dim = document.createElement('div');
      dim.setAttribute('data-dsh-skin', 'dim');
      dim.style.cssText = 'position:absolute;inset:0';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-dsh-skin', 'canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      bgRoot.appendChild(img);
      bgRoot.appendChild(dim);
      bgRoot.appendChild(canvas);
      document.body.appendChild(bgRoot);
      bgCanvas = canvas;
      bgCtx = canvas.getContext('2d');
      resizeCanvas();
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerdown', onPointerDown, { passive: true });
      startLoop();
    }

    function destroyBgLayer() {
      stopLoop();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerdown', onPointerDown);
      if (bgRoot && bgRoot.parentNode) bgRoot.parentNode.removeChild(bgRoot);
      bgRoot = null;
      bgCanvas = null;
      bgCtx = null;
      anim.rings.length = 0;
      anim.parts.length = 0;
      anim.stars.length = 0;
    }

    function syncBg() {
      if (!STATE.imageUrl) { destroyBgLayer(); return; }
      ensureBgLayer();
      const img = bgRoot.children[0];
      const dim = bgRoot.children[1];
      img.style.backgroundImage = 'url("' + STATE.imageUrl + '")';
      img.style.opacity = String(STATE.imageOpacity);
      img.style.filter = STATE.blur > 0 ? 'blur(' + STATE.blur + 'px)' : 'none';
      const base = STATE.colors ? STATE.colors.base : [20, 22, 28];
      const dimColor = mix(base, [0, 0, 0], 0.55);
      dim.style.backgroundColor = rgba(dimColor, STATE.dim * 0.5);
      dim.style.backgroundImage = 'radial-gradient(ellipse at center, rgba(0,0,0,' + (STATE.dim * 0.55).toFixed(3) + ') 0%, rgba(0,0,0,' + STATE.dim.toFixed(3) + ') 100%)';
    }

    // ---------- 组件 ----------
    function SliderRow(props) {
      return h('div', { className: 'dsh-skin-row' },
        h('span', { className: 'dsh-skin-row-label' }, props.label),
        h('input', {
          type: 'range',
          min: String(props.min),
          max: String(props.max),
          step: String(props.step),
          value: String(props.value),
          onChange: function (e) { props.onChange(parseFloat(e.target.value)); },
        }),
        h('span', { className: 'dsh-skin-row-value' }, props.format ? props.format(props.value) : String(props.value)),
      );
    }

    function makeDemoImage() {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const cx = c.getContext('2d');
      const g = cx.createLinearGradient(0, 0, 640, 360);
      g.addColorStop(0, '#1f2b56');
      g.addColorStop(0.5, '#3b1f5e');
      g.addColorStop(1, '#0f2a3f');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 640, 360);
      for (let i = 0; i < 26; i++) {
        cx.beginPath();
        cx.arc(Math.random() * 640, Math.random() * 360, 1 + Math.random() * 2.5, 0, Math.PI * 2);
        cx.fillStyle = 'rgba(255,255,255,0.55)';
        cx.fill();
      }
      return c.toDataURL('image/png');
    }

    function SkinCenterInner() {
      const s = useStore();
      const [drag, setDrag] = React.useState(false);
      const fileRef = React.useRef(null);
      React.useEffect(function () {
        const onKey = function (e) { if (e.key === 'Escape') setState({ open: false }); };
        document.addEventListener('keydown', onKey);
        return function () { document.removeEventListener('keydown', onKey); };
      }, []);

      const loadImageFile = function (file) {
        const reader = new FileReader();
        reader.onload = function () {
          const url = String(reader.result);
          setState({ imageUrl: url });
          extractColors(url).then(function (colors) {
            setState({ colors: colors });
            applySkinFn();
          });
        };
        reader.readAsDataURL(file);
      };
      const onPick = function (e) {
        const file = e.target.files && e.target.files[0];
        if (file) loadImageFile(file);
        e.target.value = '';
      };
      const onDrop = function (e) {
        e.preventDefault();
        setDrag(false);
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadImageFile(file);
      };
      const openPicker = function () { if (fileRef.current) fileRef.current.click(); };
      const tryDemo = function () {
        const url = makeDemoImage();
        setState({ imageUrl: url });
        extractColors(url).then(function (colors) {
          setState({ colors: colors });
          applySkinFn();
        });
      };
      const removeImage = function () {
        setState({ imageUrl: null, colors: null });
        applySkinFn();
      };
      const resetAll = function () {
        setState({ imageUrl: null, colors: null, animation: 'glow', imageOpacity: 0.85, panelAlpha: 0.8, blur: 0, dim: 0.42 });
        applySkinFn();
      };
      const setNumber = function (key, value) {
        setState({ [key]: value });
        if (key === 'panelAlpha') applySkinFn();
      };
      const animKeys = Object.keys(ANIMATIONS);

      return h('div', { className: 'dsh-skin-backdrop', onClick: function () { setState({ open: false }); } },
        h('div', { className: 'dsh-skin-panel', onClick: function (e) { e.stopPropagation(); } },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 } },
            h('div', null,
              h('div', { className: 'dsh-skin-title' }, '🎨 换肤中心'),
              h('div', { className: 'dsh-skin-sub' }, '上传图片作为应用背景，并叠加光标交互的动态效果 —— 所有修改即时生效，整个应用就是预览。'),
            ),
            h('button', { className: 'dsh-skin-close', title: '关闭', onClick: function () { setState({ open: false }); } }, '✕'),
          ),
          h('div', { className: 'dsh-skin-section' },
            h('div', { className: 'dsh-skin-section-title' }, '背景图片'),
            s.imageUrl
              ? h('div', { className: 'dsh-skin-preview-wrap' },
                  h('img', { className: 'dsh-skin-preview', src: s.imageUrl, alt: '背景预览' }),
                  h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' } },
                    h('button', { className: 'dsh-skin-btn', onClick: openPicker }, '重新上传'),
                    h('button', { className: 'dsh-skin-btn dsh-skin-btn-ghost', onClick: removeImage }, '移除图片'),
                  ),
                )
              : h('div', null,
                  h('div', {
                    className: 'dsh-skin-drop',
                    onClick: openPicker,
                    onDragOver: function (e) { e.preventDefault(); setDrag(true); },
                    onDragLeave: function () { setDrag(false); },
                    onDrop: onDrop,
                    'data-dragging': drag ? '' : undefined,
                  },
                    h('div', null, '点击选择或拖拽图片到此处'),
                    h('div', { style: { fontSize: 11.5, opacity: 0.55, marginTop: 6 } }, '支持 jpg / png / webp / gif'),
                  ),
                  h('button', { className: 'dsh-skin-btn dsh-skin-btn-ghost', style: { marginTop: 8 }, onClick: tryDemo }, '没有图片？试试示例背景'),
                ),
            h('input', { ref: fileRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onPick }),
          ),
          h('div', { className: 'dsh-skin-section' },
            h('div', { className: 'dsh-skin-section-title' }, '光标动态背景'),
            h('div', { className: 'dsh-skin-grid' },
              animKeys.map(function (key) {
                const item = ANIMATIONS[key];
                return h('div', {
                  key: key,
                  className: 'dsh-skin-card',
                  'data-active': s.animation === key ? '' : undefined,
                  onClick: function () { setState({ animation: key }); },
                },
                  h('div', { className: 'dsh-skin-card-name' }, item.name),
                  h('div', { className: 'dsh-skin-card-desc' }, item.desc),
                );
              }),
            ),
          ),
          h('div', { className: 'dsh-skin-section' },
            h('div', { className: 'dsh-skin-section-title' }, '效果调节'),
            h(SliderRow, { label: '图片不透明度', min: 0.2, max: 1, step: 0.05, value: s.imageOpacity, onChange: function (v) { setNumber('imageOpacity', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
            h(SliderRow, { label: '面板通透度', min: 0.3, max: 1, step: 0.05, value: s.panelAlpha, onChange: function (v) { setNumber('panelAlpha', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
            h(SliderRow, { label: '背景模糊', min: 0, max: 24, step: 1, value: s.blur, onChange: function (v) { setNumber('blur', v); }, format: function (v) { return v + 'px'; } }),
            h(SliderRow, { label: '暗化程度', min: 0, max: 0.7, step: 0.05, value: s.dim, onChange: function (v) { setNumber('dim', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
          ),
          h('div', { className: 'dsh-skin-foot' },
            h('button', { className: 'dsh-skin-btn dsh-skin-btn-ghost', onClick: resetAll }, '恢复默认'),
            h('button', { className: 'dsh-skin-btn dsh-skin-btn-primary', onClick: function () { setState({ open: false }); } }, '完成'),
          ),
        ),
      );
    }

    function SkinCenterModal() {
      const s = useStore();
      return s.open ? h(SkinCenterInner) : null;
    }

    function SidebarEntry(props) {
      useStore();
      const wide = !!(props && props.wide);
      return h('button', { className: 'dsh-skin-entry-btn', title: '打开换肤中心', onClick: function () { setState({ open: true }); } },
        h('span', { style: { fontSize: 15 } }, '🎨'),
        wide ? h('span', null, '换肤中心') : null,
      );
    }

    // ---------- 样式 ----------
    const CSS = `
/* 应用根容器 frame 叠了一层 bg-base，改为透明，避免图片被双重叠色压暗 */
#root > div:first-child{background:transparent !important}
.dsh-skin-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,0.4);overflow:auto;font-family:var(--dsw-font-family, system-ui);padding:24px}
.dsh-skin-panel{box-sizing:border-box;width:min(760px,calc(100vw - 48px));max-height:88vh;overflow:auto;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.45);color:var(--dsw-alias-label-primary);padding:22px 26px 16px}
.dsh-skin-title{font-size:18px;font-weight:600;line-height:1.3}
.dsh-skin-sub{font-size:12.5px;opacity:0.65;margin-top:4px;line-height:1.5}
.dsh-skin-close{background:none;border:none;color:var(--dsw-alias-label-secondary);font-size:18px;cursor:pointer;line-height:1;padding:6px 10px;border-radius:8px}
.dsh-skin-close:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-skin-section{margin-top:18px}
.dsh-skin-section-title{font-size:13px;font-weight:600;opacity:0.8;margin-bottom:10px}
.dsh-skin-drop{border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:32px 16px;text-align:center;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13.5px;transition:border-color .15s, background .15s}
.dsh-skin-drop:hover,.dsh-skin-drop[data-dragging]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}
.dsh-skin-preview-wrap{display:flex;gap:12px;align-items:stretch}
.dsh-skin-preview{flex:1;height:170px;object-fit:cover;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);min-width:0}
.dsh-skin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:10px}
.dsh-skin-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;cursor:pointer;background:var(--dsw-alias-bg-layer-1);transition:border-color .15s, transform .15s}
.dsh-skin-card:hover{transform:translateY(-1px)}
.dsh-skin-card[data-active]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}
.dsh-skin-card-name{font-size:13.5px;font-weight:600}
.dsh-skin-card-desc{font-size:11.5px;opacity:0.6;margin-top:3px;line-height:1.4}
.dsh-skin-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.dsh-skin-row-label{width:92px;font-size:13px;opacity:0.85;flex:none}
.dsh-skin-row input[type=range]{flex:1;accent-color:var(--dsw-alias-brand-primary);min-width:0}
.dsh-skin-row-value{width:48px;text-align:right;font-size:12px;opacity:0.7;flex:none}
.dsh-skin-foot{display:flex;align-items:center;justify-content:space-between;margin-top:20px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-skin-btn{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;transition:border-color .15s}
.dsh-skin-btn:hover{border-color:var(--dsw-alias-border-l2)}
.dsh-skin-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.dsh-skin-btn-primary:hover{border-color:transparent;opacity:0.92}
.dsh-skin-btn-ghost{background:none;border:none;color:var(--dsw-alias-label-secondary);padding:8px 10px}
.dsh-skin-btn-ghost:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border-radius:8px}
.dsh-skin-entry-btn{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--dsw-alias-label-secondary);font-size:13px;padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}
.dsh-skin-entry-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
`;

    // 静态包：手动注入样式（与官方客户端插件一致），随插件卸载自动移除
    const CSS_TAG_ID = "@yeesy369/dsh-skin-engine/skin.css";
    function insertSkinCss(css) {
      if (typeof document === 'undefined') return function () {};
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']')) return function () {};
      const tag = document.createElement('style');
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
      return function () { if (tag.parentNode) tag.parentNode.removeChild(tag); };
    }

    // ---------- 插件 ----------
    function apply(ctx) {
      destroyBgLayer();
      const theme = ctx.get('theme');
      applySkinFn = function () {
        if (disposeTokens) { disposeTokens(); disposeTokens = null; }
        if (!theme) return;
        if (!STATE.imageUrl || !STATE.colors) return;
        disposeTokens = theme.overrideTokens('dsh-skin-engine', buildTokens(STATE.colors, STATE.panelAlpha));
      };
      const slots = ctx.get('slots');
      if (slots) {
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-skin-entry', order: -10, label: '换肤中心' },
            function (props) { return h(SidebarEntry, props); },
          );
        });
        slots.inject('shell.overlay', function () {
          return slots.register(
            { name: 'shell.overlay', id: 'dsh-skin-center', order: 10 },
            function () { return h(SkinCenterModal); },
          );
        });
      }
      ctx.effect(function () {
        const disposeCss = insertSkinCss(CSS);
        const unsub = subscribe(function () { syncBg(); });
        return function () {
          disposeCss();
          unsub();
          destroyBgLayer();
          if (disposeTokens) { disposeTokens(); disposeTokens = null; }
        };
      });
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
