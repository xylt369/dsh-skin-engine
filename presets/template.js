// open-theme-preset: 模板（Template）— 照着这个写你的第一个预设
// 统一格式说明见 docs/PRESET_FORMAT.md；写完可直接在 Open Theme「＋添加预设」加载，
// 或命令行安装：open-theme preset add ./presets/template.js --id my-preset
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['template'] = {
  // id：唯一标识（字母/数字/-/_，≤48 字符）；与文件里的 key 保持一致
  id: 'template',
  // name：卡片上显示的名字
  name: '模板',
  // desc：一句话描述
  desc: '新建预设请复制本文件，改掉 id/name/desc，然后写 render',

  // render：每帧调用一次，在这里画你的特效。
  // ctx 参数：
  //   g      — canvas 2d 上下文（画布垫在应用内容之下，透明背景）
  //   w, h   — 视口宽高（CSS 像素）
  //   mx, my — 光标平滑后的坐标（CSS 像素）
  //   dt     — 上一帧到这一帧的秒数（已钳制，最大 0.05）
  //   t      — 自开始以来的毫秒时间戳
  //   colors — 图片提取的配色 { base:[r,g,b], accent:[r,g,b], textLight:bool }
  render: function (ctx) {
    // 示例：以光标为中心画一个随速度拉伸的圆
    // （要记住移动指针才会看到效果）
    ctx.g.beginPath();
    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);
    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.g.fill();
  },

  // ---- 以下都是可选 ----

  // onEnter / onExit：切到这个预设 / 切走或卸载时调用。
  // 在这里初始化状态、创建 DOM、挂事件监听；在 onExit 里清理。
  // onEnter: function () {},
  // onExit: function () {},

  // onPointerMove / onPointerDown：可选指针事件钩子（浏览器原生事件对象）。
  // onPointerMove: function (e) {},
  // onPointerDown: function (e) {},

  // canvasFilter：可选。需要让 canvas 整体套 CSS 滤镜时返回字符串，
  // 例如果冻粘连：canvasFilter: 'blur(10px) contrast(20)'
  // canvasFilter: null,
};
