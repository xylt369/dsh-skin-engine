// dsh-skin-preset: ripple（涟漪扩散）— 官方预设独立形态
// 自包含：波纹数组放在闭包里，onPointerMove/onPointerDown 是可选钩子。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/ripple.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const rings = [];
  let lastRing = 0;
  window.__DSH_SKIN_PRESETS__['ripple'] = {
    id: 'ripple',
    name: '涟漪扩散',
    desc: '移动与点击产生扩散波纹（官方独立形态）',
    onPointerMove: function (e) {
      const now = performance.now();
      if (now - lastRing > 90) {
        lastRing = now;
        rings.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.5 });
      }
    },
    onPointerDown: function (e) {
      for (let i = 0; i < 3; i++) {
        rings.push({ x: e.clientX + (Math.random() - 0.5) * 40, y: e.clientY + (Math.random() - 0.5) * 40, r: 6, a: 0.55 });
      }
    },
    render: function (c) {
      const ctx = c.g;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += c.dt * 280;
        r.a -= c.dt * 0.75;
        if (r.a <= 0) { rings.splice(i, 1); continue; }
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, r.a).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  };
})();
