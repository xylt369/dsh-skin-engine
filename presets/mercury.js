// dsh-skin-preset: mercury（液态水银）— 官方预设独立形态
// Genesis Cursor Engine 预置之一：Verlet 质点链 + 距离约束，配 canvasFilter 果冻滤镜。
// 自包含：质点数组放在闭包里；canvasFilter 交给引擎挂到 canvas 上（blur+contrast 粘连）。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/mercury.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const LINK = 16;
  let points = null;
  window.__DSH_SKIN_PRESETS__['mercury'] = {
    id: 'mercury',
    name: '液态水银',
    desc: 'Verlet 质点链与果冻粘连拖尾（官方独立形态）',
    canvasFilter: 'blur(10px) contrast(20)',
    onEnter: function () { points = null; },
    render: function (c) {
      const ctx = c.g;
      if (!points) {
        points = [];
        for (let i = 0; i < 6; i++) points.push({ x: c.mx, y: c.my, px: c.mx, py: c.my });
      }
      points[0].px = points[0].x;
      points[0].py = points[0].y;
      points[0].x += (c.mx - points[0].x) * 0.35;
      points[0].y += (c.my - points[0].y) * 0.35;
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        const vx = (p.x - p.px) * 0.9;
        const vy = (p.y - p.py) * 0.9;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy;
        const prev = points[i - 1];
        let dx = p.x - prev.x;
        let dy = p.y - prev.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (d - LINK) / d;
        p.x -= dx * diff;
        p.y -= dy * diff;
      }
      const accent = c.colors && c.colors.accent ? c.colors.accent : [86, 130, 246];
      ctx.fillStyle = 'rgba(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ',0.9)';
      for (let i = 0; i < points.length; i++) {
        const r = Math.max(3.5, 12 - i * 1.6);
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
})();
