// dsh-skin-preset: stardust（星尘引力）— 官方预设独立形态
// Genesis Cursor Engine 预置之一：径向万有引力 + 正交切向涡流 + 空气阻尼（对象池）。
// 自包含：粒子池在闭包里按需初始化；色相取图片主色 ±30°（c.colors）。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/stardust.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  let parts = [];
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
  function seed() {
    const hue = rgbToHsl([86, 130, 246])[0];
    parts = [];
    for (let i = 0; i < 80; i++) {
      parts.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        r: Math.random() * 2 + 1,
        hue: hue + (Math.random() - 0.5) * 60,
      });
    }
  }
  window.__DSH_SKIN_PRESETS__['stardust'] = {
    id: 'stardust',
    name: '星尘引力',
    desc: '星尘粒子被光标引力卷成涡流（官方独立形态）',
    onEnter: function () { seed(); },
    render: function (c) {
      const ctx = c.g;
      const w = c.w;
      const h = c.h;
      if (!parts.length) seed();
      const baseHue = (c.colors && c.colors.accent ? rgbToHsl(c.colors.accent)[0] : 220);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const dx = c.mx - p.x;
        const dy = c.my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 10;
        const force = Math.min(120 / (dist * dist), 0.8);
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * 15 - Math.sin(angle) * 0.4;
        p.vy += Math.sin(angle) * force * 15 + Math.cos(angle) * 0.4;
        p.vx *= 0.92;
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
    },
  };
})();
