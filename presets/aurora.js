// dsh-skin-preset: aurora（极光流动）— 官方预设独立形态
// 自包含：光带（blobs）状态放在闭包里，随光标偏移缓慢流动。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/aurora.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const blobs = [
    { x: 0.3, y: 0.35, r: 0.5, c: [86, 156, 255], p: 0 },
    { x: 0.72, y: 0.62, r: 0.55, c: [162, 96, 255], p: 2.2 },
    { x: 0.5, y: 0.15, r: 0.4, c: [52, 214, 200], p: 4.4 },
  ];
  window.__DSH_SKIN_PRESETS__['aurora'] = {
    id: 'aurora',
    name: '极光流动',
    desc: '流动光带随光标偏移（官方独立形态）',
    render: function (c) {
      const ctx = c.g;
      const mx = c.mx / c.w;
      const my = c.my / c.h;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        b.p += c.dt * 0.5;
        b.x += Math.sin(b.p) * c.dt * 0.06 + (mx - b.x) * c.dt * 0.1;
        b.y += Math.cos(b.p * 0.77) * c.dt * 0.05 + (my - b.y) * c.dt * 0.08;
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
  };
})();
