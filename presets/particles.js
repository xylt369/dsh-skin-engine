// dsh-skin-preset: particles（粒子拖尾）— 官方预设独立形态
// 自包含：粒子池放在闭包里（对象池：预分配，运行时尽量复用）。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/particles.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  const parts = [];
  let spawnAcc = 0;
  function makePart(x, y) {
    return {
      x: x, y: y,
      vx: (Math.random() - 0.5) * 160,
      vy: (Math.random() - 0.5) * 160,
      life: 0.8 + Math.random() * 0.9,
      size: 1 + Math.random() * 2.4,
    };
  }
  window.__DSH_SKIN_PRESETS__['particles'] = {
    id: 'particles',
    name: '粒子拖尾',
    desc: '光标持续拖出闪烁粒子（官方独立形态）',
    onPointerDown: function (e) {
      for (let i = 0; i < 10; i++) parts.push(makePart(e.clientX, e.clientY));
    },
    render: function (c) {
      const ctx = c.g;
      spawnAcc += c.dt;
      while (spawnAcc > 0.05) {
        spawnAcc -= 0.05;
        if (parts.length < 420) parts.push(makePart(c.mx + (Math.random() - 0.5) * 30, c.my + (Math.random() - 0.5) * 30));
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= c.dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
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
  };
})();
