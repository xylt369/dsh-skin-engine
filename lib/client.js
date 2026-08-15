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
          console.warn('[dsh-skin-engine] 图片过大，无法持久化，本次仅当前页面有效。');
          return;
        }
        if (!writeStored(STORAGE_KEYS.image, compressed)) {
          console.warn('[dsh-skin-engine] 图片持久化失败（localStorage 不可用），本次仅当前页面有效。');
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
        console.warn('[dsh-skin-engine] 读取本地皮肤失败，已忽略并清理：', e);
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
        console.warn('[dsh-skin-engine] 未检测到 theme.overrideTokens（兼容 dsh >=0.1.0-rc.6 <0.2.0，见 README「兼容性」）。已降级：只显示背景图片与光标动态效果，不覆盖主题配色。');
      }
      if (!hasSlots) {
        console.warn('[dsh-skin-engine] 未检测到 slots.inject（兼容 dsh >=0.1.0-rc.6 <0.2.0，见 README「兼容性」）。已降级：不注册侧边栏入口与弹窗。');
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
    //   3) 本地：localStorage 自定义（换肤中心「添加预设」粘贴/选文件加载）
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
      } catch (e) { console.warn('[dsh-skin-engine] 保存自定义预设失败：', e); }
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
            if (!r.ok) console.warn('[dsh-skin-engine] 自定义预设「' + id + '」加载失败：' + r.error);
          }
        }
      } catch (e) { console.warn('[dsh-skin-engine] 读取自定义预设失败：', e); }
    }
    function removeCustomPreset(id) {
      if (!customPresets[id]) return false;
      if (STATE.animation === id) setState({ animation: 'glow' });
      const src = customPresets[id].__source;
      delete customPresets[id];
      const reg = externalRegistry();
      if (reg && reg[id] && reg[id].__source === src) delete reg[id];
      persistCustomPresets();
      setState({});
      return true;
    }

    // ---------- 动画（Genesis 引擎预置，见设计文档 README_Cursor_Architecture_and_Algorithms.md） ----------

    // ---------- Genesis 光标引擎预置（设计文档：README_Cursor_Architecture_and_Algorithms.md）----------
    // 工程原则（来自文档第 4 节）：
    //   1. 事件只更新目标坐标，所有物理/渲染由统一 RAF 驱动；
    //   2. DOM 光标用 translate3d + will-change 触发 GPU 合成层；
    //   3. 粒子预分配定长数组（Object Pooling），运行时不做 new/push/splice；
    //   4. 触摸屏（coarse pointer）自动关闭光标渲染管线。
    const TOUCH_COARSE = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

    // --- HSL 派生：把取色结果变成霓虹通道 / 星系色谱（而非硬编码配色）---
    function rgbToHsl(c) {
      const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
      }
      return [h * 360, s, l];
    }
    function hslToRgb(h, s, l) {
      h = (((h % 360) + 360) % 360) / 360;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const hue2rgb = function (t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        r = hue2rgb(h + 1 / 3);
        g = hue2rgb(h);
        b = hue2rgb(h - 1 / 3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    function shiftHue(c, deg) {
      const hsl = rgbToHsl(c);
      return hslToRgb(hsl[0] + deg, hsl[1], hsl[2]);
    }
    function accentHue() {
      const accent = STATE.colors ? STATE.colors.accent : [86, 130, 246];
      return rgbToHsl(accent)[0];
    }
    function accentRgb() {
      return STATE.colors ? STATE.colors.accent : [86, 130, 246];
    }

    // --- 3.2 Liquid Mercury：Verlet 质点链 + 果冻滤镜 ---
    const mercury = { points: [], ready: false };
    const MERCURY_POINTS = 6;
    const MERCURY_LINK = 16; // 相邻质点距离约束 L0
    function initMercury(x, y) {
      mercury.points = [];
      for (let i = 0; i < MERCURY_POINTS; i++) mercury.points.push({ x: x, y: y, px: x, py: y });
      mercury.ready = true;
    }
    function stepMercury(mx, my) {
      if (!mercury.ready) initMercury(mx, my); // 必须先初始化再取引用，否则 pts 是旧空数组
      const pts = mercury.points;
      // 质点 0 绑定光标（LERP 跟随）
      pts[0].px = pts[0].x;
      pts[0].py = pts[0].y;
      pts[0].x += (mx - pts[0].x) * 0.35;
      pts[0].y += (my - pts[0].y) * 0.35;
      // 后续质点：Verlet 积分 + 距离约束（文档 1.4）
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.9; // 速度衰减（阻尼）
        const vy = (p.y - p.py) * 0.9;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy;
        const prev = pts[i - 1];
        let dx = p.x - prev.x;
        let dy = p.y - prev.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (d - MERCURY_LINK) / d;
        p.x -= dx * diff;
        p.y -= dy * diff;
      }
    }
    function drawMercury(mx, my) {
      const ctx = bgCtx;
      stepMercury(mx, my);
      const accent = accentRgb();
      ctx.fillStyle = 'rgba(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ',0.9)';
      const pts = mercury.points;
      for (let i = 0; i < pts.length; i++) {
        const r = Math.max(3.5, 12 - i * 1.6);
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- 3.1 Quantum Cyber：速度投影 + RGB 通道分离（色散）---
    function drawQuantum(mx, my) {
      const ctx = bgCtx;
      const accent = accentRgb();
      const cyan = shiftHue(accent, 170);
      const last = anim.lastQuantum || { x: mx, y: my };
      const dx = mx - last.x;
      const dy = my - last.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const stretch = Math.min(1 + speed * 0.04, 2.2); // 面积守恒：scaleY = 1/scaleX
      anim.lastQuantum = { x: mx, y: my };
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.scale(stretch, 1 / stretch);
      ctx.globalCompositeOperation = 'screen';
      const ab = 8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ',0.85)';
      ctx.strokeRect(-12 - ab, -12, 24, 24);
      ctx.strokeStyle = 'rgba(' + cyan[0] + ',' + cyan[1] + ',' + cyan[2] + ',0.85)';
      ctx.strokeRect(-12 + ab, -12, 24, 24);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.restore();
    }

    // --- 3.3 Celestial Stardust：径向引力场 + 切向涡流（对象池）---
    const stardust = { parts: [], seeded: false };
    const STARDUST_COUNT = 80;
    function seedStardust() {
      stardust.parts = [];
      const hue = accentHue();
      for (let i = 0; i < STARDUST_COUNT; i++) {
        stardust.parts.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          r: Math.random() * 2 + 1,
          hue: hue + (Math.random() - 0.5) * 60,
        });
      }
      stardust.seeded = true;
    }
    function drawStardust(mx, my) {
      const ctx = bgCtx;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!stardust.seeded) seedStardust();
      const baseHue = accentHue();
      for (let i = 0; i < stardust.parts.length; i++) {
        const p = stardust.parts[i];
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 10;
        const force = Math.min(120 / (dist * dist), 0.8); // 径向引力（文档 1.5）
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * 15 - Math.sin(angle) * 0.4; // 引力 + 切向环绕
        p.vy += Math.sin(angle) * force * 15 + Math.cos(angle) * 0.4;
        p.vx *= 0.92; // 空气阻尼
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.vx = (Math.random() - 0.5) * 2;
          p.vy = (Math.random() - 0.5) * 2;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + p.hue.toFixed(1) + ',90%,75%,0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'hsl(' + baseHue.toFixed(1) + ',100%,70%)';
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    // --- 3.4 Swiss Bauhaus：网格捕捉 + 磁吸吸附（前台 DOM 光标）---
    let bauhausEl = null;
    let bauhausHover = null;
    const BAUHAUS_HOVER_SELECTOR = 'a,button,input,textarea,select,[role="button"],[contenteditable]';
    function onBauhausOver(e) {
      const t = e.target;
      bauhausHover = (t && t.closest && t.closest(BAUHAUS_HOVER_SELECTOR)) || null;
    }
    function ensureBauhaus() {
      if (TOUCH_COARSE) return;
      if (bauhausEl && document.body.contains(bauhausEl)) return;
      destroyBauhaus();
      bauhausEl = document.createElement('div');
      bauhausEl.setAttribute('data-dsh-skin', 'bauhaus');
      bauhausEl.style.cssText = 'position:fixed;top:0;left:0;width:24px;height:24px;pointer-events:none;z-index:2147483647;mix-blend-mode:difference;background:#fff;border-radius:0;will-change:transform;transform:translate3d(-999px,-999px,0)';
      document.body.appendChild(bauhausEl);
      document.addEventListener('pointerover', onBauhausOver, { passive: true });
    }
    function destroyBauhaus() {
      document.removeEventListener('pointerover', onBauhausOver);
      if (bauhausEl && bauhausEl.parentNode) bauhausEl.parentNode.removeChild(bauhausEl);
      bauhausEl = null;
      bauhausHover = null;
    }
    function stepBauhaus(mx, my) {
      if (!bauhausEl) return;
      if (bauhausHover && bauhausHover.isConnected) {
        const r = bauhausHover.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // 磁吸：吸附到可交互元素的边界盒
          bauhausEl.style.width = r.width + 'px';
          bauhausEl.style.height = r.height + 'px';
          bauhausEl.style.transform = 'translate3d(' + r.left + 'px,' + r.top + 'px,0)';
          return;
        }
      }
      // 自由状态：8px 模块化网格吸附
      bauhausEl.style.width = '24px';
      bauhausEl.style.height = '24px';
      const gx = Math.round(mx / 8) * 8;
      const gy = Math.round(my / 8) * 8;
      bauhausEl.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';
    }

    // 内置预设：与外部/自定义预设完全同构（统一接口），只是内嵌在本文件里
    const BUILTIN_PRESETS = {
      none: {
        id: 'none', name: '静态', desc: '仅显示图片背景',
        render: function () {},
      },
      glow: {
        id: 'glow', name: '光晕跟随', desc: '柔光拖着光尾跟随光标',
        render: function (c) {
          const ctx = c.g;
          ctx.globalCompositeOperation = 'screen';
          let g = ctx.createRadialGradient(c.mx, c.my, 0, c.mx, c.my, Math.max(c.w, c.h) * 0.42);
          g.addColorStop(0, 'rgba(255,255,255,0.30)');
          g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, c.w, c.h);
          anim.lagX += (anim.mx - anim.lagX) * Math.min(1, c.dt * 2.4);
          anim.lagY += (anim.my - anim.lagY) * Math.min(1, c.dt * 2.4);
          g = ctx.createRadialGradient(anim.lagX * c.w, anim.lagY * c.h, 0, anim.lagX * c.w, anim.lagY * c.h, Math.max(c.w, c.h) * 0.24);
          g.addColorStop(0, 'rgba(255,255,255,0.14)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, c.w, c.h);
        },
      },
      ripple: {
        id: 'ripple', name: '涟漪扩散', desc: '移动与点击产生扩散波纹',
        onPointerMove: function (e) {
          const now = performance.now();
          if (now - anim.lastRing > 90) {
            anim.lastRing = now;
            anim.rings.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.5 });
          }
        },
        onPointerDown: function (e) {
          for (let i = 0; i < 3; i++) anim.rings.push({ x: e.clientX + (Math.random() - 0.5) * 40, y: e.clientY + (Math.random() - 0.5) * 40, r: 6, a: 0.55 });
        },
        render: function (c) {
          const ctx = c.g;
          for (let i = anim.rings.length - 1; i >= 0; i--) {
            const r = anim.rings[i];
            r.r += c.dt * 280;
            r.a -= c.dt * 0.75;
            if (r.a <= 0) { anim.rings.splice(i, 1); continue; }
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, r.a).toFixed(3) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
          }
        },
      },
      particles: {
        id: 'particles', name: '粒子拖尾', desc: '光标持续拖出闪烁粒子',
        onPointerDown: function (e) {
          for (let i = 0; i < 10; i++) anim.parts.push(makePart(e.clientX, e.clientY));
        },
        render: function (c) {
          const ctx = c.g;
          anim.spawnAcc += c.dt;
          while (anim.spawnAcc > 0.05) {
            anim.spawnAcc -= 0.05;
            if (anim.parts.length < 420) anim.parts.push(makePart(c.mx + (Math.random() - 0.5) * 30, c.my + (Math.random() - 0.5) * 30));
          }
          for (let i = anim.parts.length - 1; i >= 0; i--) {
            const p = anim.parts[i];
            p.life -= c.dt;
            if (p.life <= 0) { anim.parts.splice(i, 1); continue; }
            p.x += p.vx * c.dt;
            p.y += p.vy * c.dt;
            p.vy += 30 * c.dt;
            const al = Math.max(0, Math.min(1, p.life / 0.9));
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255,255,255,' + (al * 0.85).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size * al), 0, Math.PI * 2);
            ctx.fill();
          }
        },
      },
      aurora: {
        id: 'aurora', name: '极光流动', desc: '流动光带随光标偏移',
        render: function (c) {
          const ctx = c.g;
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < anim.blobs.length; i++) {
            const b = anim.blobs[i];
            b.p += c.dt * 0.5;
            b.x += Math.sin(b.p) * c.dt * 0.06 + (anim.mx - b.x) * c.dt * 0.1;
            b.y += Math.cos(b.p * 0.77) * c.dt * 0.05 + (anim.my - b.y) * c.dt * 0.08;
            const bx = b.x * c.w;
            const by = b.y * c.h;
            const br = b.r * Math.max(c.w, c.h);
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0.15)');
            g.addColorStop(1, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, c.w, c.h);
          }
        },
      },
      stars: {
        id: 'stars', name: '星空视差', desc: '星空随光标视差浮动',
        render: function (c) {
          const ctx = c.g;
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
            const sx = (s.x - ox * s.z) * c.w;
            const sy = (s.y - oy * s.z) * c.h;
            const al = 0.3 + 0.7 * Math.abs(Math.sin(s.tw + c.t * 0.0011 * s.z));
            ctx.fillStyle = 'rgba(255,255,255,' + (al * 0.8).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(sx, sy, 0.7 + s.z * 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      },
      quantum: {
        id: 'quantum', name: '量子霓虹', desc: 'RGB 色散准星随速度拉伸旋转',
        render: function (c) { drawQuantum(c.mx, c.my); },
      },
      mercury: {
        id: 'mercury', name: '液态水银', desc: 'Verlet 质点链与果冻粘连拖尾',
        canvasFilter: 'blur(10px) contrast(20)',
        render: function (c) { drawMercury(c.mx, c.my); },
      },
      stardust: {
        id: 'stardust', name: '星尘引力', desc: '星尘粒子被光标引力卷成涡流',
        render: function (c) { drawStardust(c.mx, c.my); },
      },
      bauhaus: {
        id: 'bauhaus', name: '包豪斯网格', desc: '网格吸附方块，靠近按钮吸附边框',
        onEnter: ensureBauhaus,
        onExit: destroyBauhaus,
        render: function (c) { stepBauhaus(c.mx, c.my); },
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
        spec.render({ g: ctx, w: w, h: h, mx: mx, my: my, dt: dt, t: t, colors: STATE.colors });
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
      mercury.ready = false;
      stardust.seeded = false;
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
      // 模式切换：旧预设 onExit → 新预设 onEnter + 内部状态重置 + canvas 滤镜
      if (STATE.animation !== lastAnim) {
        const prev = getPreset(lastAnim);
        if (prev && prev.onExit) prev.onExit();
        lastAnim = STATE.animation;
        const spec = getPreset(lastAnim);
        if (spec && spec.onEnter) spec.onEnter();
        mercury.ready = false;
        stardust.seeded = false;
        anim.rings.length = 0;
        anim.parts.length = 0;
        anim.stars.length = 0;
        anim.lastQuantum = undefined;
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
        setState({ imageUrl: null, colors: null, animation: 'glow', imageOpacity: 0.85, panelAlpha: 0.8, blur: 0, dim: 0.42 });
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
              h('div', { className: 'dsh-skin-title' }, '🎨 换肤中心'),
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
              h('div', { className: 'dsh-skin-section-title', style: { marginBottom: 0 } }, '光标动态背景'),
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
                      : h('span', { className: 'dsh-skin-card-tag', 'data-kind': BUILTIN_PRESETS[key] ? 'builtin' : 'external' }, BUILTIN_PRESETS[key] ? '示例' : '外部'),
                  ),
                  h('div', { className: 'dsh-skin-card-desc' },
                    item.desc,
                    (!BUILTIN_PRESETS[key] && (item.author || item.version))
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
      const compat = checkCompat(ctx);
      const theme = ctx.get('theme');
      applySkinFn = function () {
        if (disposeTokens) { disposeTokens(); disposeTokens = null; }
        if (!compat.hasTheme) return;
        if (!STATE.imageUrl || !STATE.colors) return;
        disposeTokens = theme.overrideTokens('dsh-skin-engine', buildTokens(STATE.colors, STATE.panelAlpha));
      };
      const slots = ctx.get('slots');
      if (compat.hasSlots) {
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
        const unsub = subscribe(function () { syncBg(); persistSettings(); persistImage(); });
        loadCustomPresets(); // 先恢复本地自定义预设，再恢复皮肤（动画 id 可能引用自定义预设）
        loadSkin();
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
