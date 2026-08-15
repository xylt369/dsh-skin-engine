// Open Theme 预设：动态背景 · 空间光效（Apple VisionOS Ambient Dynamic Backdrop）
// 设计规格：
//   1. 光学材质：Backdrop Blur 24px + Sat 200% 玻璃透镜，0.5px 高光内描边，双层环境漫反射阴影（克制无泛光）
//   2. 氛围光层：全屏动态背景——跟随光标的柔和光晕 + 三团从图片取色的色斑（hue 族），
//      mix-blend screen，视差漂移，铺满整个界面（"动态背景"而非"光标特效"）
//   3. 胶囊延展：悬停 [data-agent-action] 热区 → 液态展开为药丸胶囊，SF 风格 11.5px Medium 文字
//   4. 物理：高阻尼低刚度 LERP（默认 0.14），速度矢量微形变（≤1.25x），点击下陷 Scale 0.92
//   5. 智能态：Thinking 时蓝紫流光呼吸光环（Apple Intelligence Glow）
// 工程：事件只写数据，渲染统一 RAF；transform-only（translate3d），零 Reflow；触屏 (hover:none) 自动降级。
// 本文件自包含（CSS + 引擎类 + 注册）：
//   · 在 Open Theme「＋添加预设」加载 → 注册为「动态背景」预设（由 Open Theme 帧循环驱动）
//   · 独立演示：<script src="presets/portal.js"></script> → new window.PortalLens().start()（自驱动）
(function () {
  'use strict';

  // ---------- 样式（自包含注入，防重复） ----------
  // 可见性策略：氛围光/透镜不依赖 mix-blend（screen 在浅色界面上等于隐形），
  // 改为直接半透明叠加 + 取色描边光晕，浅色/深色背景都可见。
  const LENS_CSS = `
.ot-lens{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform;
  display:flex;align-items:center;border-radius:999px;
  background:rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(24px) saturate(200%);backdrop-filter:blur(24px) saturate(200%);
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 0 12px rgba(255,255,255,.10),
    0 6px 24px rgba(0,0,0,.10),0 16px 48px rgba(0,0,0,.06)}
.ot-lens-dot{width:4px;height:4px;border-radius:50%;background:rgba(52,52,60,.85);flex:none;margin-left:12px}
.ot-lens-label{flex:1;min-width:0;text-align:center;white-space:nowrap;
  font:500 11.5px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;
  color:rgba(30,30,36,.92);letter-spacing:.01em;opacity:0}
.ot-lens-halo{position:absolute;inset:-8px;border-radius:999px;pointer-events:none;opacity:0;z-index:-1;
  background:conic-gradient(from 0deg,rgba(139,92,246,.55),rgba(99,102,241,.3),rgba(167,139,250,.6),rgba(139,92,246,.55));
  filter:blur(7px)}
.ot-lens-thinking .ot-lens-halo{animation:ot-lens-breath 2.6s ease-in-out infinite}
@keyframes ot-lens-breath{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.85;transform:scale(1.22)}}
.ot-lens-hide-cursor,.ot-lens-hide-cursor *{cursor:none!important}
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
        x: 0, y: 0, tx: 0, ty: 0,
        px: 0, py: 0,
        vx: 0, vy: 0,
        press: 0,
        expand: 0, targetExpand: 0,
        thinking: false,
        hideNative: true,
        size: 28, pillW: 28, labelW: 0,
        hoverEl: null,
        hue: -1, // -1 = 首帧强制写入取色描边
        // 氛围光层锚点（视口比例）与当前坐标：0 = 光晕，1..3 = 色斑
        amb: [
          { ax: 0.5, ay: 0.5, px: 0.5, py: 0.5, k: 0.35, s: 900 },
          { ax: 0.25, ay: 0.3, px: 0.25, py: 0.3, k: 0.22, s: 520 },
          { ax: 0.75, ay: 0.65, px: 0.75, py: 0.65, k: 0.28, s: 420 },
          { ax: 0.55, ay: 0.2, px: 0.55, py: 0.2, k: 0.34, s: 360 },
        ],
      };
      this.el = null; this.dot = null; this.label = null; this.halo = null;
      this.db = null; this.dbLayers = [];
      this.raf = 0; this.lastT = 0; this.running = false;
      this._move = (e) => { const s = this.state; s.tx = e.clientX; s.ty = e.clientY; };
      this._down = () => { this.state.press = 1; };
      this._up = () => { this.state.press = 0; };
      this._over = (e) => this._onOver(e);
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
      document.addEventListener('pointermove', this._move, { passive: true });
      document.addEventListener('pointerdown', this._down, { passive: true });
      document.addEventListener('pointerup', this._up, { passive: true });
      document.addEventListener('pointerover', this._over, { passive: true });
      const s = this.state;
      s.x = s.tx = window.innerWidth / 2;
      s.y = s.ty = window.innerHeight / 2;
      s.px = s.x; s.py = s.y;
      this.running = true;
      this.lastT = performance.now();
      if (this.opts.autoLoop !== false) this.raf = requestAnimationFrame(this._loop);
    }
    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      document.removeEventListener('pointermove', this._move);
      document.removeEventListener('pointerdown', this._down);
      document.removeEventListener('pointerup', this._up);
      document.removeEventListener('pointerover', this._over);
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      if (this.db && this.db.parentNode) this.db.parentNode.removeChild(this.db);
      this.el = this.dot = this.label = this.halo = null;
      this.db = null; this.dbLayers = [];
      if (document.documentElement) document.documentElement.classList.remove('ot-lens-hide-cursor');
    }
    // ---------- 状态切换 API ----------
    setThinking(v) {
      this.state.thinking = !!v;
      if (this.el) this.el.classList.toggle('ot-lens-thinking', this.state.thinking);
    }
    // ---------- 帧步进（Open Theme 内嵌时由宿主 RAF 调用） ----------
    tick(t, params, colors) {
      if (!this.running || !this.el) return;
      const s = this.state;
      const p = params || {};
      const inertia = p.inertia !== undefined ? p.inertia : 0.14;
      const stretch = (p.stretch !== undefined ? p.stretch : 0.25) * 0.001;
      const ambience = p.ambience !== undefined ? p.ambience : 0.18;
      if (p.size !== undefined && p.size !== s.size) { s.size = p.size; this._measure(); }
      const hideNative = p.hideNative === undefined ? true : !!p.hideNative;
      if (hideNative !== s.hideNative) {
        s.hideNative = hideNative;
        if (document.documentElement) document.documentElement.classList.toggle('ot-lens-hide-cursor', hideNative);
      }
      const dt = Math.min(0.05, this.lastT ? (t - this.lastT) / 1000 : 0.016);
      this.lastT = t;
      // 透镜：高阻尼低刚度 LERP（帧率无关）
      const a = 1 - Math.pow(1 - inertia, dt * 60);
      s.px = s.x; s.py = s.y;
      s.x += (s.tx - s.x) * a;
      s.y += (s.ty - s.y) * a;
      const ivx = (s.x - s.px) / dt;
      const ivy = (s.y - s.py) / dt;
      const vk = Math.min(1, dt * 10);
      s.vx += (ivx - s.vx) * vk;
      s.vy += (ivy - s.vy) * vk;
      const sx = 1 + Math.min(0.25, Math.abs(s.vx) * stretch);
      const sy = 1 + Math.min(0.25, Math.abs(s.vy) * stretch);
      const ps = 1 - 0.08 * s.press;
      const ea = 1 - Math.pow(1 - 0.16, dt * 60);
      s.expand += (s.targetExpand - s.expand) * ea;
      const ease = 1 - Math.pow(1 - s.expand, 3);
      const sw = s.size / s.pillW;
      const wf = sw + (1 - sw) * ease;
      this.el.style.transform =
        'translate3d(' + (s.x - s.pillW / 2).toFixed(2) + 'px,' + (s.y - s.size / 2).toFixed(2) + 'px,0)' +
        ' scale(' + (sx * ps * wf).toFixed(3) + ',' + (sy * ps).toFixed(3) + ')';
      this.label.style.opacity = Math.max(0, Math.min(1, (s.expand - 0.55) / 0.35)).toFixed(3);
      if (s.thinking !== this._lastThinking) {
        this._lastThinking = s.thinking;
        this.el.classList.toggle('ot-lens-thinking', s.thinking);
      }
      // 氛围光层：全屏动态背景（视差跟随 + 漂移），transform-only
      this._tickAmbience(t, dt, colors, ambience);
    }
    _tickAmbience(t, dt, colors, ambience) {
      const s = this.state;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!this.db || !this.dbLayers.length || !w || !h) return;
      const hue = colors ? accentHueOf(colors) : (s.hue < 0 ? 260 : s.hue);
      // 透镜描边光晕：取色 hue 派生，换图换色（仅在 hue 变化时重写 box-shadow）
      if (hue !== s.hue) {
        s.hue = hue;
        const ring = hslToRgb(hue, 0.65, 0.7);
        this.el.style.boxShadow =
          'inset 0 0 0 .5px rgba(255,255,255,.6), 0 0 0 1px rgba(' + ring.join(',') + ',.45),' +
          ' 0 0 24px rgba(' + ring.join(',') + ',.30), 0 6px 24px rgba(0,0,0,.10), 0 16px 48px rgba(0,0,0,.06)';
      }
      const mx = s.tx / w;
      const my = s.ty / h;
      const cols = [hslToRgb(hue, 0.85, 0.68), hslToRgb(hue + 120, 0.8, 0.62), hslToRgb(hue + 240, 0.75, 0.66)];
      this.db.style.opacity = Math.min(0.6, ambience * 2.2).toFixed(3);
      for (let i = 0; i < s.amb.length; i++) {
        const amb = s.amb[i];
        const layer = this.dbLayers[i];
        // 锚点漂移（幅度 ×100，让"实时流动"肉眼可见）
        amb.ax += Math.sin(t * 0.0001 + i * 2.1) * 0.0012 * dt * 60;
        amb.ay += Math.cos(t * 0.00013 + i * 1.7) * 0.0012 * dt * 60;
        // 目标 = 锚点 + 光标视差；平滑跟随
        const tx = amb.ax + (mx - 0.5) * amb.k;
        const ty = amb.ay + (my - 0.5) * amb.k;
        const k2 = Math.min(1, dt * 2.2);
        amb.px += (tx - amb.px) * k2;
        amb.py += (ty - amb.py) * k2;
        const x = amb.px * w;
        const y = amb.py * h;
        const rad = amb.s * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.0002 + i)));
        if (i === 0) {
          // 光晕：直接半透明叠加（不依赖 blend，浅色/深色都可见）
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
      if (this.el) return;
      this.el = document.createElement('div');
      this.el.className = 'ot-lens';
      this.halo = document.createElement('div');
      this.halo.className = 'ot-lens-halo';
      this.dot = document.createElement('div');
      this.dot.className = 'ot-lens-dot';
      this.label = document.createElement('div');
      this.label.className = 'ot-lens-label';
      this.el.appendChild(this.halo);
      this.el.appendChild(this.dot);
      this.el.appendChild(this.label);
      document.body.appendChild(this.el);
      this._measure();
      if (this.state.thinking) this.el.classList.add('ot-lens-thinking');
      // 氛围光层
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
    _measure() {
      const s = this.state;
      s.labelW = this.label.scrollWidth || 0;
      s.pillW = Math.max(s.size + 6, s.size + s.labelW + 28);
      this.el.style.width = s.pillW + 'px';
      this.el.style.height = s.size + 'px';
    }
    _onOver(e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-agent-action]') : null;
      if (t === this.state.hoverEl) return;
      this.state.hoverEl = t;
      this.state.targetExpand = t ? 1 : 0;
      if (t) {
        const txt = (t.getAttribute('data-agent-action') || '').trim() || t.textContent.trim().slice(0, 12);
        if (this.label.textContent !== txt) {
          this.label.textContent = txt;
          this._measure();
        }
      }
    }
  }

  // ---------- 注册为 Open Theme 预设（统一格式；由 Open Theme 帧循环驱动，autoLoop=false） ----------
  window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
  window.__DSH_SKIN_PRESETS__['portal'] = {
    id: 'portal',
    name: '动态背景',
    desc: 'VisionOS 空间光效 · 玻璃透镜 · 氛围光 · 动作胶囊',
    params: [
      { key: 'inertia', label: '惯性 Inertia', min: 0.05, max: 0.4, step: 0.01, default: 0.14 },
      { key: 'size', label: '透镜大小 Size', min: 20, max: 40, step: 1, default: 28 },
      { key: 'ambience', label: '氛围光强度', min: 0, max: 0.4, step: 0.01, default: 0.18 },
      { key: 'stretch', label: '形变 Stretch', min: 0, max: 0.5, step: 0.01, default: 0.25 },
      { key: 'hideNative', label: '隐藏原生光标', min: 0, max: 1, step: 1, default: 1 },
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
