// dsh-skin-preset: quantum（量子霓虹）— 官方预设独立形态
// Genesis Cursor Engine 预置之一：速度投影 + RGB 双通道分离（色散）。
// 自包含：上次位置存在闭包里；补色由 HSL 色相旋转派生（可改为硬编码霓虹色）。
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/quantum.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
(function () {
  let last = null;
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
  window.__DSH_SKIN_PRESETS__['quantum'] = {
    id: 'quantum',
    name: '量子霓虹',
    desc: 'RGB 色散准星随速度拉伸旋转（官方独立形态）',
    render: function (c) {
      const ctx = c.g;
      const accent = c.colors && c.colors.accent ? c.colors.accent : [86, 130, 246];
      const hsl = rgbToHsl(accent);
      const cyan = hslToRgb(hsl[0] + 170, hsl[1], hsl[2]);
      const prev = last || { x: c.mx, y: c.my };
      const dx = c.mx - prev.x;
      const dy = c.my - prev.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const stretch = Math.min(1 + speed * 0.04, 2.2); // 面积守恒：scaleY = 1/scaleX
      last = { x: c.mx, y: c.my };
      ctx.save();
      ctx.translate(c.mx, c.my);
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
    },
  };
})();
