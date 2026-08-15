// dsh-skin-preset: stars（星空视差）— 官方预设独立形态
// 自包含：星点数组在闭包里按需初始化。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/stars.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  let stars = [];
  window.__DSH_SKIN_PRESETS__['stars'] = {
    id: 'stars',
    name: '星空视差',
    desc: '星空随光标视差浮动（官方独立形态）',
    render: function (c) {
      const ctx = c.g;
      if (stars.length === 0) {
        stars = [];
        for (let i = 0; i < 140; i++) {
          stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, tw: Math.random() * Math.PI * 2 });
        }
      }
      const mx = c.mx / c.w;
      const my = c.my / c.h;
      ctx.globalCompositeOperation = 'screen';
      const ox = (mx - 0.5) * 0.16;
      const oy = (my - 0.5) * 0.16;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const sx = (s.x - ox * s.z) * c.w;
        const sy = (s.y - oy * s.z) * c.h;
        const al = 0.3 + 0.7 * Math.abs(Math.sin(s.tw + c.t * 0.0011 * s.z));
        ctx.fillStyle = 'rgba(255,255,255,' + (al * 0.8).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.7 + s.z * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
})();
