// Open Theme 预设：动态背景 · 透镜光标（Apple VisionOS Lens Cursor & Ambient Backdrop）
// 设计规格：
//   1. 透镜 = 光标本身：用浏览器原生 cursor:url(SVG) 把鼠标画成 Apple 玻璃透镜
//      （完美圆形、任何环境必然显示、零 JS 开销），而非 DOM 元素跟随鼠标
//   2. 氛围光层：全屏动态背景——从图片取色的光晕 + 三团色斑（hue 族），
//      视差跟随光标 + 慢速漂移 + 呼吸尺寸，铺满整个界面
//   3. Agent 思考态联动：window.__OT_AGENT__.running 时自动切换为蓝紫光环透镜光标，
//      氛围光同步增强（demo 手动 setThinking / data-ot-thinking 同样生效）
// 工程：cursor 由浏览器渲染；氛围光 transform-only（translate3d）零 Reflow；
// 触屏 (hover:none) 自动降级（保留系统光标）。
// 本文件自包含（CSS + 引擎类 + 注册）：
//   · 在 Open Theme「＋添加预设」加载 → 注册为「动态背景」预设（由 Open Theme 帧循环驱动）
//   · 独立演示：<script src="presets/portal.js"></script> → new window.PortalLens().start()（自驱动）
(function () {
  'use strict';

  // ---------- 透镜光标 SVG（Apple 玻璃透镜：外圈玻璃环 + 内圈细线 + 中心锚点） ----------
  const LENS_CURSOR_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" +
    "<circle cx='14' cy='14' r='12.6' fill='rgba(255,255,255,0.30)' stroke='rgba(130,130,140,0.85)' stroke-width='1.1'/>" +
    "<circle cx='14' cy='14' r='8.8' fill='none' stroke='rgba(255,255,255,0.45)' stroke-width='0.8'/>" +
    "<circle cx='14' cy='14' r='2.1' fill='rgba(70,70,80,0.95)'/></svg>";
  // Agent 思考态：蓝紫光环透镜
  const LENS_CURSOR_THINKING_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" +
    "<circle cx='14' cy='14' r='12.6' fill='rgba(139,92,246,0.22)' stroke='rgba(139,92,246,0.95)' stroke-width='1.2'/>" +
    "<circle cx='14' cy='14' r='13.4' fill='none' stroke='rgba(167,139,250,0.55)' stroke-width='1.6'/>" +
    "<circle cx='14' cy='14' r='2.1' fill='rgba(255,255,255,0.98)'/></svg>";

  function cursorDataUri(svg) {
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // ---------- 样式（自包含注入，防重复） ----------
  const LENS_CSS = `
.ot-lens-cursor,.ot-lens-cursor *{cursor:url("${cursorDataUri(LENS_CURSOR_SVG)}") 14 14,auto!important}
.ot-lens-cursor.ot-lens-thinking,.ot-lens-cursor.ot-lens-thinking *{cursor:url("${cursorDataUri(LENS_CURSOR_THINKING_SVG)}") 14 14,auto!important}
.ot-db{position:fixed;inset:0;pointer-events:none;z-index:2147482990;overflow:hidden;opacity:.35}
.ot-db-glow{position:absolute;border-radius:50%;will-change:transform;filter:blur(60px)}
.ot-db-orb{position:absolute;border-radius:50%;will-change:transform}`;

  // ---------- 工具 ----------
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const f = function (t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function accentHueOf(colors) {
    const accent = colors && colors.accent ? colors.accent : [139, 92, 246];
    const r = accent[0] / 255, g = accent[1] / 255, b = accent[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 260;
    const d = max - min;
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return h * 60;
  }

  // ---------- 引擎类（OO 封装，事件/渲染完全解耦） ----------
  // opts.autoLoop=true（默认）：start() 自带 RAF 循环（独立演示页用）
  // opts.autoLoop=false：由宿主帧循环调用 tick(t, params, colors)（Open Theme 内嵌用）
  class PortalLens {
    constructor(opts) {
      this.opts = opts || {};
      this.state = {
        tx: 0, ty: 0,           // 光标目标坐标（pointermove 只写这里）
        thinking: false,
        hue: -1,
        // 氛围光层锚点（视口比例）与当前坐标：0 = 光晕，1..3 = 色斑
        amb: [
          { ax: 0.5, ay: 0.5, px: 0.5, py: 0.5, k: 0.35, s: 900 },
          { ax: 0.25, ay: 0.3, px: 0.25, py: 0.3, k: 0.22, s: 520 },
          { ax: 0.75, ay: 0.65, px: 0.75, py: 0.65, k: 0.28, s: 420 },
          { ax: 0.55, ay: 0.2, px: 0.55, py: 0.2, k: 0.34, s: 360 },
        ],
      };
      this.db = null; this.dbLayers = [];
      this.raf = 0; this.lastT = 0; this.running = false;
      this._move = (e) => { const s = this.state; s.tx = e.clientX; s.ty = e.clientY; };
      this._loop = (t) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this._loop);
        this.tick(t, null, null);
      };
    }
    get touchOnly() {
      return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
    }
    // ---------- 生命周期 ----------
    start() {
      if (this.running) return;
      if (this.touchOnly) {
        if (typeof console !== 'undefined') console.warn('[open-theme] 触屏设备（hover:none）：动态背景已自动降级。');
        return;
      }
      this._injectCss();
      this._build();
      // 透镜 = 光标：直接替换系统光标（浏览器原生渲染，必然显示）
      if (document.documentElement) document.documentElement.classList.add('ot-lens-cursor');
      document.addEventListener('pointermove', this._move, { passive: true });
      const s = this.state;
      s.tx = window.innerWidth / 2;
      s.ty = window.innerHeight / 2;
      this.running = true;
      this.lastT = performance.now();
      if (this.opts.autoLoop !== false) this.raf = requestAnimationFrame(this._loop);
    }
    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      document.removeEventListener('pointermove', this._move);
      if (this.db && this.db.parentNode) this.db.parentNode.removeChild(this.db);
      this.db = null; this.dbLayers = [];
      if (document.documentElement) {
        document.documentElement.classList.remove('ot-lens-cursor');
        document.documentElement.classList.remove('ot-lens-thinking');
      }
    }
    // ---------- 状态切换 API ----------
    setThinking(v) {
      this.state.thinking = !!v;
      if (document.documentElement) document.documentElement.classList.toggle('ot-lens-thinking', this.state.thinking);
    }
    // ---------- 帧步进（Open Theme 内嵌时由宿主 RAF 调用） ----------
    tick(t, params, colors) {
      if (!this.running || !this.db) return;
      const s = this.state;
      const p = params || {};
      const ambience = p.ambience !== undefined ? p.ambience : 0.18;
      const dt = Math.min(0.05, this.lastT ? (t - this.lastT) / 1000 : 0.016);
      this.lastT = t;
      // Agent 思考态联动（主引擎轮询写入 window.__OT_AGENT__）
      const agentRunning = !!(typeof window !== 'undefined' && window.__OT_AGENT__ && window.__OT_AGENT__.running);
      if (agentRunning !== s.thinking) this.setThinking(agentRunning);
      // 氛围光层：全屏动态背景（视差跟随 + 漂移 + 呼吸），transform-only
      this._tickAmbience(t, dt, colors, ambience);
    }
    _tickAmbience(t, dt, colors, ambience) {
      const s = this.state;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!this.db || !this.dbLayers.length || !w || !h) return;
      const hue = colors ? accentHueOf(colors) : (s.hue < 0 ? 260 : s.hue);
      s.hue = hue;
      const boost = s.thinking ? 1.6 : 1;
      const mx = s.tx / w;
      const my = s.ty / h;
      const cols = [hslToRgb(hue, 0.85, 0.68), hslToRgb(hue + 120, 0.8, 0.62), hslToRgb(hue + 240, 0.75, 0.66)];
      this.db.style.opacity = Math.min(0.6, ambience * 2.2 * boost).toFixed(3);
      for (let i = 0; i < s.amb.length; i++) {
        const amb = s.amb[i];
        const layer = this.dbLayers[i];
        amb.ax += Math.sin(t * 0.0001 + i * 2.1) * 0.0012 * dt * 60;
        amb.ay += Math.cos(t * 0.00013 + i * 1.7) * 0.0012 * dt * 60;
        const tx = amb.ax + (mx - 0.5) * amb.k;
        const ty = amb.ay + (my - 0.5) * amb.k;
        const k2 = Math.min(1, dt * 2.2);
        amb.px += (tx - amb.px) * k2;
        amb.py += (ty - amb.py) * k2;
        const x = amb.px * w;
        const y = amb.py * h;
        const rad = amb.s * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.0002 + i)));
        if (i === 0) {
          layer.style.background = 'radial-gradient(circle, rgba(' + cols[0].join(',') + ',0.16), transparent 70%)';
        } else {
          const col = cols[(i - 1) % 3];
          layer.style.background = 'radial-gradient(circle, rgba(' + col.join(',') + ',0.22), transparent 72%)';
        }
        layer.style.width = rad + 'px';
        layer.style.height = rad + 'px';
        layer.style.transform = 'translate3d(' + (x - rad / 2).toFixed(1) + 'px,' + (y - rad / 2).toFixed(1) + 'px,0)';
      }
    }
    // ---------- 内部 ----------
    _injectCss() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('ot-lens-style')) return;
      const tag = document.createElement('style');
      tag.id = 'ot-lens-style';
      tag.textContent = LENS_CSS;
      document.head.appendChild(tag);
    }
    _build() {
      if (this.db) return;
      this.db = document.createElement('div');
      this.db.className = 'ot-db';
      for (let i = 0; i < this.state.amb.length; i++) {
        const layer = document.createElement('div');
        layer.className = i === 0 ? 'ot-db-glow' : 'ot-db-orb';
        layer.style.position = 'absolute';
        layer.style.left = '0';
        layer.style.top = '0';
        this.db.appendChild(layer);
        this.dbLayers.push(layer);
      }
      document.body.appendChild(this.db);
    }
  }

  // ---------- 注册为 Open Theme 预设（统一格式；由 Open Theme 帧循环驱动，autoLoop=false） ----------
  window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
  window.__DSH_SKIN_PRESETS__['portal'] = {
    id: 'portal',
    name: '动态背景',
    desc: '透镜光标 · 全屏氛围光 · Agent 思考光环',
    params: [
      { key: 'inertia', label: '惯性 Inertia', min: 0.05, max: 0.4, step: 0.01, default: 0.14 },
      { key: 'ambience', label: '氛围光强度', min: 0, max: 0.4, step: 0.01, default: 0.18 },
    ],
    onEnter: function () {
      window.__OT_LENS__ = new PortalLens({ autoLoop: false });
      window.__OT_LENS__.start();
    },
    onExit: function () {
      if (window.__OT_LENS__) { window.__OT_LENS__.destroy(); window.__OT_LENS__ = null; }
    },
    render: function (c) {
      if (window.__OT_LENS__) window.__OT_LENS__.tick(c.t, c.params, c.colors);
    },
  };

  // ---------- 供独立演示页使用 ----------
  window.PortalLens = PortalLens;
})();
