// Open Theme 预设：空间透镜（Apple VisionOS Spatial Lens & Action Portal）
// 设计规格：
//   1. 光学材质：Backdrop Blur 24px + Sat 200% 玻璃圆环，0.5px 高光内描边，双层环境漫反射阴影（克制无泛光）
//   2. 胶囊延展：悬停 [data-agent-action] 热区 → 液态展开为药丸胶囊，SF 风格 11.5px Medium 文字，移出弹簧回缩
//   3. 物理：高阻尼低刚度 LERP（默认 0.14），速度矢量微形变（≤1.25x），点击下陷 Scale 0.92
//   4. 智能态：Thinking 时蓝紫流光呼吸光环（Apple Intelligence Glow）
// 工程：事件只写数据，渲染统一 RAF；transform-only（translate3d + scale），零 Reflow；触屏 (hover:none) 自动降级。
// 本文件自包含（CSS + 引擎类 + 注册）：
//   · 在 Open Theme「＋添加预设」加载 → 注册为「空间透镜」预设（由 Open Theme 帧循环驱动）
//   · 独立演示：<script src="presets/portal.js"></script> → new window.PortalLens().start()（自驱动）
(function () {
  'use strict';

  // ---------- 样式（自包含注入，防重复） ----------
  const LENS_CSS = `
.ot-lens{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform;
  display:flex;align-items:center;border-radius:999px;
  background:rgba(255,255,255,.14);
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
.ot-lens-hide-cursor,.ot-lens-hide-cursor *{cursor:none!important}`;

  // ---------- 引擎类（OO 封装，事件/渲染完全解耦） ----------
  // opts.autoLoop=true（默认）：start() 自带 RAF 循环（独立演示页用）
  // opts.autoLoop=false：由宿主帧循环调用 tick(t, params)（Open Theme 内嵌用）
  class PortalLens {
    constructor(opts) {
      this.opts = opts || {};
      // 数据层：事件只写这里，渲染只读这里
      this.state = {
        x: 0, y: 0, tx: 0, ty: 0, // 渲染坐标 / 目标坐标
        px: 0, py: 0,             // 上一帧渲染坐标（算速度）
        vx: 0, vy: 0,             // 平滑速度 px/s
        press: 0,                 // 点击下陷 0..1
        expand: 0, targetExpand: 0, // 胶囊展开 0..1
        thinking: false,
        hideNative: true,
        size: 28, pillW: 28, labelW: 0,
        hoverEl: null,
      };
      this.el = null; this.dot = null; this.label = null; this.halo = null;
      this.raf = 0; this.lastT = 0; this.running = false;
      this._move = (e) => { const s = this.state; s.tx = e.clientX; s.ty = e.clientY; };
      this._down = () => { this.state.press = 1; };
      this._up = () => { this.state.press = 0; };
      this._over = (e) => this._onOver(e);
      this._loop = (t) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this._loop);
        this.tick(t, null);
      };
    }
    get touchOnly() {
      return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
    }
    // ---------- 生命周期 ----------
    start() {
      if (this.running) return;
      if (this.touchOnly) return; // 触屏移动端优雅降级
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
      this.el = this.dot = this.label = this.halo = null;
      if (document.documentElement) document.documentElement.classList.remove('ot-lens-hide-cursor');
    }
    // ---------- 状态切换 API ----------
    setThinking(v) {
      this.state.thinking = !!v;
      if (this.el) this.el.classList.toggle('ot-lens-thinking', this.state.thinking);
    }
    // ---------- 帧步进（Open Theme 内嵌时由宿主 RAF 调用） ----------
    tick(t, params) {
      if (!this.running || !this.el) return;
      const s = this.state;
      const p = params || {};
      const inertia = p.inertia !== undefined ? p.inertia : 0.14;
      const stretch = (p.stretch !== undefined ? p.stretch : 0.25) * 0.001;
      // 尺寸 / 隐藏原生光标 参数同步（仅变化时写）
      if (p.size !== undefined && p.size !== s.size) { s.size = p.size; this._measure(); }
      const hideNative = p.hideNative === undefined ? true : !!p.hideNative;
      if (hideNative !== s.hideNative) {
        s.hideNative = hideNative;
        if (document.documentElement) document.documentElement.classList.toggle('ot-lens-hide-cursor', hideNative);
      }
      const dt = Math.min(0.05, this.lastT ? (t - this.lastT) / 1000 : 0.016);
      this.lastT = t;
      // 高阻尼低刚度 LERP（帧率无关）
      const a = 1 - Math.pow(1 - inertia, dt * 60);
      s.px = s.x; s.py = s.y;
      s.x += (s.tx - s.x) * a;
      s.y += (s.ty - s.y) * a;
      // 速度矢量（px/s）平滑 → 微形变（≤1.25x）
      const ivx = (s.x - s.px) / dt;
      const ivy = (s.y - s.py) / dt;
      const vk = Math.min(1, dt * 10);
      s.vx += (ivx - s.vx) * vk;
      s.vy += (ivy - s.vy) * vk;
      const sx = 1 + Math.min(0.25, Math.abs(s.vx) * stretch);
      const sy = 1 + Math.min(0.25, Math.abs(s.vy) * stretch);
      // 点击下陷（Scale 0.92）
      const ps = 1 - 0.08 * s.press;
      // 胶囊展开（弹簧感插值 + 缓出）
      const ea = 1 - Math.pow(1 - 0.16, dt * 60);
      s.expand += (s.targetExpand - s.expand) * ea;
      const ease = 1 - Math.pow(1 - s.expand, 3);
      const sw = s.size / s.pillW; // 圆环态视觉宽度系数
      const wf = sw + (1 - sw) * ease;
      // 唯一布局写点：transform（GPU 合成层，零 Reflow）
      this.el.style.transform =
        'translate3d(' + (s.x - s.pillW / 2).toFixed(2) + 'px,' + (s.y - s.size / 2).toFixed(2) + 'px,0)' +
        ' scale(' + (sx * ps * wf).toFixed(3) + ',' + (sy * ps).toFixed(3) + ')';
      // 文字淡入（展开过半后）
      this.label.style.opacity = Math.max(0, Math.min(1, (s.expand - 0.55) / 0.35)).toFixed(3);
      // 光环由 CSS animation 驱动，这里只切 class
      if (s.thinking !== this._lastThinking) {
        this._lastThinking = s.thinking;
        this.el.classList.toggle('ot-lens-thinking', s.thinking);
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
    }
    _measure() {
      // 只在文字/尺寸变化时测量（一次性布局，不进帧循环）
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
    name: '空间透镜',
    desc: 'Apple VisionOS 玻璃透镜 · 动作胶囊 · 思考光环',
    params: [
      { key: 'inertia', label: '惯性 Inertia', min: 0.05, max: 0.4, step: 0.01, default: 0.14 },
      { key: 'size', label: '大小 Size', min: 20, max: 40, step: 1, default: 28 },
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
      if (window.__OT_LENS__) window.__OT_LENS__.tick(c.t, c.params);
    },
  };

  // ---------- 供独立演示页使用 ----------
  window.PortalLens = PortalLens;
})();
