// dsh-skin-preset: glow（光晕跟随）— 官方预设独立形态
// 自包含：状态放在闭包里，不依赖宿主引擎的共享状态。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/glow.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const state = { lagX: 0.5, lagY: 0.5 };
  window.__DSH_SKIN_PRESETS__['glow'] = {
    id: 'glow',
    name: '光晕跟随',
    desc: '柔光拖着光尾跟随光标（官方独立形态）',
    render: function (c) {
      const ctx = c.g;
      ctx.globalCompositeOperation = 'screen';
      let g = ctx.createRadialGradient(c.mx, c.my, 0, c.mx, c.my, Math.max(c.w, c.h) * 0.42);
      g.addColorStop(0, 'rgba(255,255,255,0.30)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.w, c.h);
      state.lagX += (c.mx / c.w - state.lagX) * Math.min(1, c.dt * 2.4);
      state.lagY += (c.my / c.h - state.lagY) * Math.min(1, c.dt * 2.4);
      g = ctx.createRadialGradient(state.lagX * c.w, state.lagY * c.h, 0, state.lagX * c.w, state.lagY * c.h, Math.max(c.w, c.h) * 0.24);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.w, c.h);
    },
  };
})();
