// dsh-skin-preset: bauhaus（包豪斯网格）— 官方预设独立形态
// Genesis Cursor Engine 预置之一：8px 网格吸附 + 交互元素磁吸边框（前台 DOM 光标）。
// 自包含：DOM 元素与 hover 追踪由 onEnter/onExit 管理（这也是「前台」类预设的示范）。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/bauhaus.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const HOVER_SELECTOR = 'a,button,input,textarea,select,[role="button"],[contenteditable]';
  let el = null;
  let hover = null;
  function onOver(e) {
    const t = e.target;
    hover = (t && t.closest && t.closest(HOVER_SELECTOR)) || null;
  }
  window.__DSH_SKIN_PRESETS__['bauhaus'] = {
    id: 'bauhaus',
    name: '包豪斯网格',
    desc: '网格吸附方块，靠近按钮吸附边框（官方独立形态）',
    onEnter: function () {
      if (el) return;
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:0;left:0;width:24px;height:24px;pointer-events:none;z-index:2147483647;mix-blend-mode:difference;background:#fff;border-radius:0;will-change:transform;transform:translate3d(-999px,-999px,0)';
      document.body.appendChild(el);
      document.addEventListener('pointerover', onOver, { passive: true });
    },
    onExit: function () {
      document.removeEventListener('pointerover', onOver);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
      hover = null;
    },
    render: function (c) {
      if (!el) return;
      if (hover && hover.isConnected) {
        const r = hover.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          el.style.width = r.width + 'px';
          el.style.height = r.height + 'px';
          el.style.transform = 'translate3d(' + r.left + 'px,' + r.top + 'px,0)';
          return;
        }
      }
      el.style.width = '24px';
      el.style.height = '24px';
      const gx = Math.round(c.mx / 8) * 8;
      const gy = Math.round(c.my / 8) * 8;
      el.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';
    },
  };
})();
