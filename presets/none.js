// dsh-skin-preset: none（静态）— 官方预设独立形态
// 加载方式：换肤中心「＋添加预设」→ 从 .js 文件选择；或命令行：dsh-skin-engine preset add ./presets/none.js
// 统一格式说明见 docs/PRESET_FORMAT.md
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['none'] = {
  id: 'none',
  name: '静态',
  desc: '仅显示图片背景（官方独立形态）',
  render: function () {},
};
