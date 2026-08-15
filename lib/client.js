window.__ModuleLoader__.load({
  id: "@yeesy369/open-theme",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // ================= Open Theme (browser half) =================
    // 入口：侧边栏底部「Open Theme」按钮；界面注册在 shell.overlay。
    // 背景：自建 z-index:-1 全屏层垫在应用内容之下 + theme.overrideTokens 全量换肤。
    const h = React.createElement;

    // ---------- 状态 ----------
    const STATE = {
      open: false,
      imageUrl: null,
      colors: null, // { base:[r,g,b], accent:[r,g,b], textLight:bool }
      animation: null,
      params: {}, // 每个特效的可调参数：{ 预设id: { 参数key: 值 } }
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

    // ---------- 持久化（localStorage）----------
    // 皮肤（背景图 + 全部设置）保存在本机浏览器，刷新页面后自动恢复。
    // 图片优先原样保存（GIF 动画得以保留）；超出 localStorage 配额时压缩成 JPEG 再存。
    const STORAGE_KEYS = { state: 'dsh.skin.state.v1', image: 'dsh.skin.image.v1' };
    let storageAvailable = false;
    let lastSavedImage = null;
    let saveSeq = 0;
    try {
      localStorage.setItem('__dsh_skin_probe__', '1');
      localStorage.removeItem('__dsh_skin_probe__');
      storageAvailable = true;
    } catch (e) { storageAvailable = false; }

    function readStored(key) {
      if (!storageAvailable) return null;
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeStored(key, value) {
      if (!storageAvailable) return false;
      try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }
    function removeStored(key) {
      if (!storageAvailable) return;
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }

    // 设置变化时同步保存（小 JSON，每次都写，无压力）
    function persistSettings() {
      if (!storageAvailable) return;
      writeStored(STORAGE_KEYS.state, JSON.stringify({
        animation: STATE.animation,
        imageOpacity: STATE.imageOpacity,
        panelAlpha: STATE.panelAlpha,
        blur: STATE.blur,
        dim: STATE.dim,
      }));
    }

    // 图片变化时异步保存；超配额则压缩后重试（saveSeq 防止旧压缩结果覆盖新图）
    function compressImage(dataUrl, maxDim, quality) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
    }
    function persistImage() {
      if (!storageAvailable) return;
      const url = STATE.imageUrl;
      if (url === lastSavedImage) return;
      const seq = ++saveSeq;
      lastSavedImage = url;
      if (!url) { removeStored(STORAGE_KEYS.image); return; }
      if (writeStored(STORAGE_KEYS.image, url)) return;
      compressImage(url, 1600, 0.82).then(function (compressed) {
        if (seq !== saveSeq || STATE.imageUrl !== url) return;
        if (compressed === url) {
          console.warn('[open-theme] 图片过大，无法持久化，本次仅当前页面有效。');
          return;
        }
        if (!writeStored(STORAGE_KEYS.image, compressed)) {
          console.warn('[open-theme] 图片持久化失败（localStorage 不可用），本次仅当前页面有效。');
          return;
        }
        lastSavedImage = compressed;
        setState({ imageUrl: compressed });
      });
    }

    // 插件启动时恢复上次的皮肤；解析失败则丢弃旧数据
    function loadSkin() {
      if (!storageAvailable) return;
      try {
        const rawState = readStored(STORAGE_KEYS.state);
        if (rawState) {
          const saved = JSON.parse(rawState);
          const next = {};
          if (typeof saved.animation === 'string' && getPreset(saved.animation)) next.animation = saved.animation;
          if (typeof saved.imageOpacity === 'number') next.imageOpacity = Math.min(1, Math.max(0.2, saved.imageOpacity));
          if (typeof saved.panelAlpha === 'number') next.panelAlpha = Math.min(1, Math.max(0.3, saved.panelAlpha));
          if (typeof saved.blur === 'number') next.blur = Math.min(24, Math.max(0, saved.blur));
          if (typeof saved.dim === 'number') next.dim = Math.min(0.7, Math.max(0, saved.dim));
          setState(next);
        }
        const url = readStored(STORAGE_KEYS.image);
        if (url) {
          setState({ imageUrl: url });
          extractColors(url).then(function (colors) {
            setState({ colors: colors });
            applySkinFn();
          });
        }
      } catch (e) {
        console.warn('[open-theme] 读取本地皮肤失败，已忽略并清理：', e);
        removeStored(STORAGE_KEYS.state);
        removeStored(STORAGE_KEYS.image);
      }
    }

    // ---------- 兼容性检测 ----------
    // dsh 0.1.x 之前/之后的版本可能没有这些能力；检测到缺失时自动降级而不是崩溃。
    // 支持范围：dsh >=0.1.0-rc.6 <0.2.0（与 package.json 的 dsh.compat 保持一致）。
    function checkCompat(ctx) {
      const themeSvc = ctx.get('theme');
      const slotsSvc = ctx.get('slots');
      const hasTheme = !!(themeSvc && typeof themeSvc.overrideTokens === 'function');
      const hasSlots = !!(slotsSvc && typeof slotsSvc.inject === 'function');
      if (!hasTheme) {
        console.warn('[open-theme] 未检测到 theme.overrideTokens（兼容 dsh >=0.1.0-rc.6 <0.2.0，见 README「兼容性」）。已降级：只显示背景图片与光标动态效果，不覆盖主题配色。');
      }
      if (!hasSlots) {
        console.warn('[open-theme] 未检测到 slots.inject（兼容 dsh >=0.1.0-rc.6 <0.2.0，见 README「兼容性」）。已降级：不注册侧边栏入口与弹窗。');
      }
      return { hasTheme: hasTheme, hasSlots: hasSlots };
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
            let sr = 0, sg = 0, sb = 0, sw = 0;
            for (let i = 0; i < data.length; i += 4) {
              const rr = data[i], gg = data[i + 1], bb = data[i + 2], aa = data[i + 3];
              if (aa < 128) continue;
              r += rr; g += gg; b += bb; n++;
              const max = Math.max(rr, gg, bb);
              const min = Math.min(rr, gg, bb);
              const sat = max === 0 ? 0 : (max - min) / max;
              const l = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
              // 强调色 = 饱和像素的加权质心（饱和度平方作权重）：比单点更稳，能代表图片主色调
              if (sat > 0.18 && l > 0.08 && l < 0.95) {
                const w = sat * sat;
                sr += rr * w; sg += gg * w; sb += bb * w; sw += w;
              }
            }
            if (!n) { resolve({ base: [24, 26, 32], accent: [86, 130, 246], textLight: false }); return; }
            const base = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
            const accent = sw > 0 ? [Math.round(sr / sw), Math.round(sg / sw), Math.round(sb / sw)] : [86, 130, 246];
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

    // ============ 预设引擎（统一接口） ============
    // 每个预设是一个 spec 对象（一个文件即可定义，见 docs/PRESET_FORMAT.md）：
    //   {
    //     id, name, desc,
    //     onEnter?, onExit?,              // 切到/切走（建 DOM、挂事件、重置状态）
    //     onPointerMove?, onPointerDown?, // 指针事件钩子（可选）
    //     render(ctx),                    // 每帧：ctx = { g, w, h, mx, my, dt, t, colors }
    //     canvasFilter?,                  // 需要 canvas CSS 滤镜时返回字符串（如 'blur(10px) contrast(20)'）
    //   }
    // 来源三路合一（统一注册表）：
    //   1) 内置：BUILTIN_PRESETS（内嵌本文件——dsh 客户端插件无法 require 外部文件）
    //   2) 外部：window.__DSH_SKIN_PRESETS__（独立预设包/预设插件在页面加载时注册）
    //   3) 本地：localStorage 自定义（Open Theme「添加预设」粘贴/选文件加载）
    const CUSTOM_PRESETS_KEY = 'dsh.skin.customPresets.v1';
    const EXTERNAL_REGISTRY_NAME = '__DSH_SKIN_PRESETS__';
    // 预设可选的 format 字段：声明所用格式版本（当前为 1），不声明则视为 1
    const PLATFORM_FORMAT = 1;
    const customPresets = {}; // id -> spec（本地加载的）

    function externalRegistry() {
      return (typeof window !== 'undefined' && window[EXTERNAL_REGISTRY_NAME]) || null;
    }
    function getAllPresets() {
      const out = {};
      for (const key in BUILTIN_PRESETS) out[key] = BUILTIN_PRESETS[key];
      const ext = externalRegistry();
      if (ext) for (const key in ext) out[key] = ext[key];
      for (const key in customPresets) out[key] = customPresets[key];
      return out;
    }
    function getPreset(id) {
      if (!id) return null;
      if (customPresets[id]) return customPresets[id];
      const ext = externalRegistry();
      if (ext && ext[id]) return ext[id];
      return BUILTIN_PRESETS[id] || null;
    }
    function isCustomPreset(id) { return !!customPresets[id]; }

    // 当前预设的可调参数（合并声明默认值 + 用户覆盖值，并夹取到合法范围）
    function activeParams() {
      const spec = getPreset(STATE.animation);
      const out = {};
      if (spec && spec.params) {
        const over = (STATE.params && STATE.params[STATE.animation]) || {};
        for (const d of spec.params) {
          const v = over[d.key];
          out[d.key] = typeof v === 'number' ? Math.min(d.max, Math.max(d.min, v)) : d.default;
        }
      }
      return out;
    }
    function setParamValue(key, value) {
      const id = STATE.animation;
      const next = {};
      for (const k in STATE.params) next[k] = STATE.params[k];
      next[id] = Object.assign({}, next[id] || {});
      next[id][key] = value;
      setState({ params: next });
    }

    // 校验一个 spec 是否符合统一接口；返回错误字符串或 null（通过）
    function validateSpec(spec) {
      if (!spec || typeof spec !== 'object') return '预设必须是对象';
      if (spec.format !== undefined && spec.format !== PLATFORM_FORMAT) return 'format 必须是 ' + PLATFORM_FORMAT + '（当前格式版本）';
      if (typeof spec.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(spec.id)) return '缺少合法的 id（字母/数字/-/_，≤48 字符）';
      if (typeof spec.name !== 'string' || !spec.name) return '缺少 name（显示名）';
      if (typeof spec.desc !== 'string') spec.desc = '';
      if (spec.author !== undefined && typeof spec.author !== 'string') return 'author 必须是字符串';
      if (spec.version !== undefined && typeof spec.version !== 'string') return 'version 必须是字符串';
      if (spec.render !== undefined && typeof spec.render !== 'function') return 'render 必须是函数';
      if (spec.onEnter !== undefined && typeof spec.onEnter !== 'function') return 'onEnter 必须是函数';
      if (spec.onExit !== undefined && typeof spec.onExit !== 'function') return 'onExit 必须是函数';
      if (spec.onPointerMove !== undefined && typeof spec.onPointerMove !== 'function') return 'onPointerMove 必须是函数';
      if (spec.onPointerDown !== undefined && typeof spec.onPointerDown !== 'function') return 'onPointerDown 必须是函数';
      if (spec.canvasFilter !== undefined && typeof spec.canvasFilter !== 'string') return 'canvasFilter 必须是字符串';
      if (typeof spec.render !== 'function') return '必须提供 render(ctx)（每帧绘制）';
      return null;
    }

    // 求值一段预设源码（来自粘贴/选文件），注册到本地自定义预设
    function evalPresetSource(source) {
      const before = new Set(Object.keys(externalRegistry() || {}));
      let regAfter;
      try {
        new Function('window', 'console', '"use strict";\n' + source + '\n;return window.__DSH_SKIN_PRESETS__;')(window, console);
        regAfter = externalRegistry();
      } catch (e) {
        return { ok: false, error: '执行失败：' + (e && e.message ? e.message : String(e)) };
      }
      if (!regAfter) return { ok: false, error: '预设未注册：源码里没有 window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {}; ...' };
      const added = [];
      for (const key in regAfter) if (!before.has(key)) added.push(key);
      if (!added.length) return { ok: false, error: '没有发现新注册的预设（请用 window.__DSH_SKIN_PRESETS__["你的id"] = {...} 注册）' };
      for (const id of added) {
        const err = validateSpec(regAfter[id]);
        if (err) { delete regAfter[id]; return { ok: false, error: '预设「' + id + '」不符合统一格式：' + err }; }
        regAfter[id].__source = source; // 持久化时存源码，启动后重新求值
        customPresets[id] = regAfter[id];
      }
      persistCustomPresets();
      return { ok: true, added: added };
    }

    function persistCustomPresets() {
      if (!storageAvailable) return;
      try {
        const map = {};
        for (const id in customPresets) map[id] = customPresets[id].__source;
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(map));
      } catch (e) { console.warn('[open-theme] 保存自定义预设失败：', e); }
    }
    function loadCustomPresets() {
      if (!storageAvailable) return;
      try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        if (!raw) return;
        const map = JSON.parse(raw);
        for (const id in map) {
          if (typeof map[id] === 'string') {
            const r = evalPresetSource(map[id]);
            if (!r.ok) console.warn('[open-theme] 自定义预设「' + id + '」加载失败：' + r.error);
          }
        }
      } catch (e) { console.warn('[open-theme] 读取自定义预设失败：', e); }
    }
    function removeCustomPreset(id) {
      if (!customPresets[id]) return false;
      if (STATE.animation === id) setState({ animation: null });
      const src = customPresets[id].__source;
      delete customPresets[id];
      const reg = externalRegistry();
      if (reg && reg[id] && reg[id].__source === src) delete reg[id];
      persistCustomPresets();
      setState({});
      return true;
    }

    // ---------- 光标渲染管线 ----------
    // 事件只更新目标坐标，所有物理/渲染由统一 RAF 驱动；触摸屏（coarse pointer）自动关闭。
    const TOUCH_COARSE = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

    // ============ 内置预设：动态背景 · 空间光效（Apple VisionOS） ============
    // 与 presets/portal.js 同源（内嵌版由 Open Theme 帧循环驱动，autoLoop=false）
    const LENS_CSS = `
.ot-lens{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform;
  display:flex;align-items:center;border-radius:999px;opacity:.65;
  background:rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(24px) saturate(200%);backdrop-filter:blur(24px) saturate(200%);
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 0 12px rgba(255,255,255,.10),
    0 6px 24px rgba(0,0,0,.10),0 16px 48px rgba(0,0,0,.06)}
.ot-lens-thinking{opacity:1}
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


    class PortalLens {
    constructor(opts) {
      this.opts = opts || {};
      const wantHide = this.opts.hideNative !== undefined ? !!this.opts.hideNative : false;
      this.state = {
        x: 0, y: 0, tx: 0, ty: 0,
        px: 0, py: 0,
        vx: 0, vy: 0,
        press: 0,
        expand: 0, targetExpand: 0,
        thinking: false,
        hideNative: wantHide, // 默认保留系统光标：透镜是低调的能量指示器，不是光标替身
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
      // 构造时指定 hideNative（demo 用）→ 立即生效，无需等 tick 对比
      if (s.hideNative && document.documentElement) document.documentElement.classList.add('ot-lens-hide-cursor');
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
      const hideNative = p.hideNative === undefined ? false : !!p.hideNative;
      if (hideNative !== s.hideNative) {
        s.hideNative = hideNative;
        if (document.documentElement) document.documentElement.classList.toggle('ot-lens-hide-cursor', hideNative);
      }
      // Agent 思考态联动：主引擎轮询 host 的 agent/status 写入 window.__OT_AGENT__，
      // 这里只做状态比较，变化时点亮/熄灭思考光环（demo 手动 setThinking 同样生效）
      const agentRunning = !!(typeof window !== 'undefined' && window.__OT_AGENT__ && window.__OT_AGENT__.running);
      if (agentRunning !== s.thinking) this.setThinking(agentRunning);
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

    // 内置预设：动态背景（第一个官方预设；其余等待前端方案重设计）
    const BUILTIN_PRESETS = {
      portal: {
        id: 'portal',
        name: '动态背景',
        desc: 'VisionOS 空间光效 · 玻璃透镜 · 氛围光 · 动作胶囊',
        params: [
          { key: 'inertia', label: '惯性 Inertia', min: 0.05, max: 0.4, step: 0.01, default: 0.14 },
          { key: 'size', label: '透镜大小 Size', min: 20, max: 40, step: 1, default: 28 },
          { key: 'ambience', label: '氛围光强度', min: 0, max: 0.4, step: 0.01, default: 0.18 },
          { key: 'stretch', label: '形变 Stretch', min: 0, max: 0.5, step: 0.01, default: 0.25 },
          { key: 'hideNative', label: '隐藏原生光标', min: 0, max: 1, step: 1, default: 0 },
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
      },
    };
    let bgRoot = null;
    let bgCanvas = null;
    let bgCtx = null;
    let rafId = 0;
    let lastT = 0;
    let dpr = 1;
    const anim = {
      mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5,
    };

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
      const spec = getPreset(STATE.animation);
      if (spec && spec.onPointerMove) spec.onPointerMove(e);
    }

    function onPointerDown(e) {
      anim.tx = e.clientX / window.innerWidth;
      anim.ty = e.clientY / window.innerHeight;
      const spec = getPreset(STATE.animation);
      if (spec && spec.onPointerDown) spec.onPointerDown(e);
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

      // 预设分发：所有动画模式统一走 spec.render(ctx)
      const spec = getPreset(a);
      if (spec && spec.render) {
        spec.render({ g: ctx, w: w, h: h, mx: mx, my: my, dt: dt, t: t, colors: STATE.colors, params: activeParams() });
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
      // 触摸屏（coarse pointer）自适应隐藏光标渲染管线（文档第 4 节第 4 条）
      if (!TOUCH_COARSE) {
        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        startLoop();
      }
    }

    let lastAnim = null;
    function destroyBgLayer() {
      stopLoop();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerdown', onPointerDown);
      const prev = getPreset(lastAnim);
      if (prev && prev.onExit) prev.onExit();
      if (bgRoot && bgRoot.parentNode) bgRoot.parentNode.removeChild(bgRoot);
      bgRoot = null;
      bgCanvas = null;
      bgCtx = null;
      lastAnim = null;
    }

    function syncBg() {
      // 背景层常驻：没有图片时特效也能显示（画布垫在应用之下，透明）
      ensureBgLayer();
      const img = bgRoot.children[0];
      const dim = bgRoot.children[1];
      if (STATE.imageUrl) {
        img.style.backgroundImage = 'url("' + STATE.imageUrl + '")';
        img.style.opacity = String(STATE.imageOpacity);
        img.style.filter = STATE.blur > 0 ? 'blur(' + STATE.blur + 'px)' : 'none';
        const base = STATE.colors ? STATE.colors.base : [20, 22, 28];
        const dimColor = mix(base, [0, 0, 0], 0.55);
        dim.style.backgroundColor = rgba(dimColor, STATE.dim * 0.5);
        dim.style.backgroundImage = 'radial-gradient(ellipse at center, rgba(0,0,0,' + (STATE.dim * 0.55).toFixed(3) + ') 0%, rgba(0,0,0,' + STATE.dim.toFixed(3) + ') 100%)';
      } else {
        img.style.backgroundImage = 'none';
        img.style.opacity = '0';
        img.style.filter = 'none';
        dim.style.backgroundColor = 'transparent';
        dim.style.backgroundImage = 'none';
      }
      // 模式切换：旧预设 onExit → 新预设 onEnter + 内部状态重置 + canvas 滤镜
      if (STATE.animation !== lastAnim) {
        const prev = getPreset(lastAnim);
        if (prev && prev.onExit) prev.onExit();
        lastAnim = STATE.animation;
        const spec = getPreset(lastAnim);
        if (spec && spec.onEnter) spec.onEnter();
      }
      if (bgCanvas) {
        const spec = getPreset(STATE.animation);
        bgCanvas.style.filter = (spec && spec.canvasFilter) ? spec.canvasFilter : 'none';
      }
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
      const [adding, setAdding] = React.useState(false);
      const [code, setCode] = React.useState('');
      const [presetMsg, setPresetMsg] = React.useState(null);
      const fileRef = React.useRef(null);
      const presetFileRef = React.useRef(null);
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
        setState({ imageUrl: null, colors: null, animation: null, params: {}, imageOpacity: 0.85, panelAlpha: 0.8, blur: 0, dim: 0.42 });
        applySkinFn();
      };
      const setNumber = function (key, value) {
        setState({ [key]: value });
        if (key === 'panelAlpha') applySkinFn();
      };
      const presetList = Object.keys(getAllPresets());
      const openPresetFile = function () { if (presetFileRef.current) presetFileRef.current.click(); };
      const runPresetSource = function (src) {
        if (!window.confirm('加载第三方预设会在当前页面直接执行其代码（与网页脚本同等权限），请确认来源可信。继续？')) return;
        const r = evalPresetSource(src);
        if (r.ok) {
          setCode('');
          setAdding(false);
          setPresetMsg({ ok: true, text: '✅ 已添加：' + r.added.join('、') });
        } else {
          setPresetMsg({ ok: false, text: '❌ ' + r.error });
        }
      };
      const applyPresetCode = function () { runPresetSource(code); };
      const onPresetFile = function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () { runPresetSource(String(reader.result)); };
        reader.readAsText(file);
        e.target.value = '';
      };
      const deletePreset = function (id) {
        if (!window.confirm('删除自定义预设「' + id + '」？')) return;
        removeCustomPreset(id);
      };

      return h('div', { className: 'dsh-skin-backdrop', onClick: function () { setState({ open: false }); } },
        h('div', { className: 'dsh-skin-panel', onClick: function (e) { e.stopPropagation(); } },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 } },
            h('div', null,
              h('div', { className: 'dsh-skin-title' }, '🎨 Open Theme'),
              h('div', { className: 'dsh-skin-sub' }, '上传图片作为应用背景，并叠加光标交互的动态效果 —— 所有修改即时生效，整个应用就是预览。皮肤自动保存在本机浏览器，刷新页面后仍然保留。'),
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
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { className: 'dsh-skin-section-title', style: { marginBottom: 0 } }, '动态背景'),
              h('button', { className: 'dsh-skin-btn dsh-skin-btn-ghost', onClick: function () { setAdding(!adding); setPresetMsg(null); } }, adding ? '收起' : '＋ 添加预设'),
            ),
            h('div', { className: 'dsh-skin-grid', style: { marginTop: 10 } },
              presetList.map(function (key) {
                const item = getAllPresets()[key];
                return h('div', {
                  key: key,
                  className: 'dsh-skin-card',
                  'data-active': s.animation === key ? '' : undefined,
                  onClick: function () { setState({ animation: key }); },
                },
                  h('div', { className: 'dsh-skin-card-name' },
                    item.name,
                    isCustomPreset(key)
                      ? h('span', { className: 'dsh-skin-card-tag' }, '自定义')
                      : h('span', { className: 'dsh-skin-card-tag', 'data-kind': 'external' }, '外部'),
                  ),
                  h('div', { className: 'dsh-skin-card-desc' },
                    item.desc,
                    (item.author || item.version)
                      ? h('span', { className: 'dsh-skin-card-meta' }, ' @' + (item.author || '?') + (item.version ? ' v' + item.version : ''))
                      : null,
                  ),
                  isCustomPreset(key)
                    ? h('button', { className: 'dsh-skin-card-del', title: '删除此预设', onClick: function (e) { e.stopPropagation(); deletePreset(key); } }, '✕')
                    : null,
                );
              }),
            ),
            adding
              ? h('div', { className: 'dsh-skin-addpreset' },
                  h('div', { className: 'dsh-skin-section-title' }, '添加自定义预设（统一格式见 docs/PRESET_FORMAT.md）'),
                  h('textarea', {
                    className: 'dsh-skin-code',
                    placeholder: '粘贴预设源码：window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};\nwindow.__DSH_SKIN_PRESETS__["my-preset"] = { id: "my-preset", name: "我的预设", desc: "…", render(ctx) { /* 每帧绘制 */ } };',
                    value: code,
                    onChange: function (e) { setCode(e.target.value); },
                    spellCheck: false,
                  }),
                  h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
                    h('button', { className: 'dsh-skin-btn', onClick: applyPresetCode, disabled: !code.trim() }, '粘贴加载'),
                    h('button', { className: 'dsh-skin-btn dsh-skin-btn-ghost', onClick: openPresetFile }, '从 .js 文件选择'),
                    h('span', { className: 'dsh-skin-addpreset-note' }, '⚠️ 第三方代码会在当前页面直接执行，仅加载可信来源'),
                  ),
                  h('input', { ref: presetFileRef, type: 'file', accept: '.js,text/javascript', style: { display: 'none' }, onChange: onPresetFile }),
                  presetMsg
                    ? h('div', { className: 'dsh-skin-addpreset-msg', 'data-ok': presetMsg.ok ? '' : undefined }, presetMsg.text)
                    : null,
                )
              : null,
          ),
          h('div', { className: 'dsh-skin-section' },
            h('div', { className: 'dsh-skin-section-title' }, '效果调节'),
            h(SliderRow, { label: '图片不透明度', min: 0.2, max: 1, step: 0.05, value: s.imageOpacity, onChange: function (v) { setNumber('imageOpacity', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
            h(SliderRow, { label: '面板通透度', min: 0.3, max: 1, step: 0.05, value: s.panelAlpha, onChange: function (v) { setNumber('panelAlpha', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
            h(SliderRow, { label: '背景模糊', min: 0, max: 24, step: 1, value: s.blur, onChange: function (v) { setNumber('blur', v); }, format: function (v) { return v + 'px'; } }),
            h(SliderRow, { label: '暗化程度', min: 0, max: 0.7, step: 0.05, value: s.dim, onChange: function (v) { setNumber('dim', v); }, format: function (v) { return Math.round(v * 100) + '%'; } }),
          ),
          (function () {
            // 当前预设的可调参数滑杆（每个预设自己声明 params）
            const spec = getAllPresets()[s.animation];
            const list = spec && spec.params ? spec.params : [];
            if (!list.length) return null;
            return h('div', { className: 'dsh-skin-section' },
              h('div', { className: 'dsh-skin-section-title' }, '特效参数 · ' + spec.name),
              list.map(function (d) {
                const over = (s.params && s.params[s.animation]) || {};
                const val = over[d.key] !== undefined ? over[d.key] : d.default;
                return h(SliderRow, {
                  key: d.key,
                  label: d.label,
                  min: d.min,
                  max: d.max,
                  step: d.step,
                  value: val,
                  onChange: function (v) { setParamValue(d.key, v); },
                  format: function (v) { return String(Math.round(v * 100) / 100); },
                });
              }),
            );
          })(),
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
      return h('button', { className: 'dsh-skin-entry-btn', title: 'Open Theme', onClick: function () { setState({ open: true }); } },
        h('span', { style: { fontSize: 15 } }, '🎨'),
        wide ? h('span', null, 'Open Theme') : null,
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
.dsh-skin-card-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:500;vertical-align:1px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);opacity:0.9}
.dsh-skin-card-tag[data-kind="external"]{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}
.dsh-skin-card-meta{display:block;margin-top:2px;font-size:10.5px;opacity:0.5}
.dsh-skin-card-del{position:absolute;top:6px;right:6px;width:20px;height:20px;line-height:1;border:none;border-radius:6px;background:rgba(232,88,88,0.16);color:#e85858;font-size:11px;cursor:pointer;opacity:0;transition:opacity .15s}
.dsh-skin-card:hover .dsh-skin-card-del{opacity:1}
.dsh-skin-card-del:hover{background:rgba(232,88,88,0.32)}
.dsh-skin-card{position:relative}
.dsh-skin-addpreset{margin-top:12px;padding:14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-skin-code{box-sizing:border-box;width:100%;min-height:120px;resize:vertical;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;outline:none}
.dsh-skin-code:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-skin-addpreset-note{font-size:11px;opacity:0.6}
.dsh-skin-addpreset-msg{font-size:12px;margin-top:8px;opacity:0.95}
.dsh-skin-addpreset-msg[data-ok]{color:#4ade80}
.dsh-skin-addpreset-msg:not([data-ok]){color:#f87171}
.dsh-skin-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.dsh-skin-row-label{width:132px;font-size:13px;opacity:0.85;flex:none}
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
    const CSS_TAG_ID = "@yeesy369/open-theme/skin.css";
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
      const compat = checkCompat(ctx);
      const theme = ctx.get('theme');
      applySkinFn = function () {
        if (disposeTokens) { disposeTokens(); disposeTokens = null; }
        if (!compat.hasTheme) return;
        if (!STATE.imageUrl || !STATE.colors) return;
        disposeTokens = theme.overrideTokens('open-theme', buildTokens(STATE.colors, STATE.panelAlpha));
      };
      const slots = ctx.get('slots');
      if (compat.hasSlots) {
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-skin-entry', order: -10, label: 'Open Theme' },
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
        const unsub = subscribe(function () { syncBg(); persistSettings(); persistImage(); });
        // Agent 思考态轮询：node 半区把 agent/status 暴露为 /open-theme/agent-status，
        // 结果写入 window.__OT_AGENT__，动态背景预设据此自动点亮/熄灭思考光环
        const timerSvc = ctx.get('timer');
        const unsubAgent = timerSvc
          ? timerSvc.interval(function () {
              fetch('/open-theme/agent-status')
                .then(function (r) { return r.json(); })
                .then(function (d) { window.__OT_AGENT__ = { running: !!(d && d.running) }; })
                .catch(function () { /* 服务不可用时静默 */ });
            }, 2000)
          : null;
        loadCustomPresets(); // 先恢复本地自定义预设，再恢复皮肤（动画 id 可能引用自定义预设）
        loadSkin();
        syncBg(); // 保证没有图片时背景层与光标特效也常驻
        return function () {
          if (unsubAgent) unsubAgent();
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
