# 自定义预设格式（Preset Format）

> 想给Open Theme加一个自己的光标特效？你只需要写**一个 `.js` 文件**。
> 不用懂 dsh、Cordis 或插件机制——文件格式就两种东西：注册一句 + 画一个函数。

## 1. 一个预设长什么样

```js
// my-preset.js —— 一个文件就是一套特效
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['my-preset'] = {
  id: 'my-preset',           // 唯一标识：字母/数字/-/_，≤48 字符（与 key 一致）
  name: '我的预设',           // 卡片显示名
  desc: '一句话描述',
  author: '你的名字',         // 可选：卡片上展示
  version: '1.0.0',          // 可选：卡片上展示
  render: function (ctx) {   // 每帧绘制（必填）
    ctx.g.beginPath();
    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);
    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.g.fill();
  },
};
```

写完保存成 `.js`，用下面任意一种方式加载就能用（见 §4）。

## 2. 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 唯一标识，与注册 key 一致；`^[a-zA-Z0-9_-]{1,48}$` |
| `name` | string | ✅ | 卡片显示名 |
| `desc` | string | 可选 | 一句话描述（默认空串） |
| `author` / `version` | string | 可选 | 卡片上展示的作者与版本 |
| `format` | number | 可选 | 格式版本（当前 `1`）；不写也行 |
| `render(ctx)` | function | ✅ | 每帧调用；`ctx` 见 §3 |
| `onEnter()` | function | 可选 | 切到该预设时调用（初始化状态 / 建 DOM / 挂事件） |
| `onExit()` | function | 可选 | 切走或插件卸载时调用（**清理 onEnter 创建的一切**） |
| `onPointerMove(e)` | function | 可选 | 光标移动（原生 pointermove 事件） |
| `onPointerDown(e)` | function | 可选 | 按下（原生 pointerdown 事件） |
| `canvasFilter` | string | 可选 | canvas 需要套 CSS 滤镜时返回字符串，如 `'blur(10px) contrast(20)'`（果冻粘连） |
| `params` | array | 可选 | 可调参数声明：`[{ key, label, min, max, step, default }]`。声明后引擎会把当前值合并进 `ctx.params`（含默认值），供 `render` 读取；用户在面板里拖动滑杆调节并自动保存 |

约定：

- **状态放闭包，不放全局**：多次加载、切换、卸载都不会串状态。
- **onEnter/onExit 成对出现**：建了 DOM / 挂了事件，就在 onExit 里删掉（示例见 `presets/template.js`）。
- **ctx 只读**：`mx/my` 已是平滑后的光标坐标，直接画即可。

## 3. render 的 ctx 参数

| 字段 | 说明 |
| --- | --- |
| `g` | canvas 2d 上下文。画布是透明全屏层，**垫在应用内容之下**（`z-index:-1`），`pointer-events:none` |
| `w` / `h` | 视口宽高（CSS 像素） |
| `mx` / `my` | 光标平滑坐标（CSS 像素） |
| `dt` | 帧间隔秒数（已钳制 ≤0.05） |
| `t` | 运行毫秒时间戳 |
| `colors` | 图片提取的配色：`{ base:[r,g,b], accent:[r,g,b], textLight:bool }`；未上传图片时为 `null`，记得给默认色 |

## 4. 怎么加载

| 方式 | 操作 | 生效 |
| --- | --- | --- |
| Open Theme UI（推荐） | 「＋添加预设」→ 粘贴源码，或「从 .js 文件选择」 | 立即生效，自动保存（刷新后仍在） |
| 命令行 | `open-theme preset add ./my-preset.js`（支持 URL） | 写入 profile 并注册为独立插件包，重启 dsh 生效 |

删除：UI 里自定义预设卡片右上角 ✕；命令行 `open-theme preset remove my-preset`。

## 5. 命令行工具

```bash
open-theme preset new my-neon        # 生成一个预设文件骨架（my-neon.js）
open-theme preset validate x.js      # 校验格式（写完先跑一遍）
open-theme preset add x.js           # 安装到 profile
open-theme preset list / remove <id> # 管理已安装的预设
```

## 6. 起步模板

仓库 [`presets/template.js`](../presets/template.js) 是一个可直接加载的预设模板：复制一份，改掉 `id/name/desc`，写你的 `render`，加载即可。`open-theme preset new <id>` 也能直接生成同样的骨架文件。

## 7. 注意事项

- **安全**：自定义预设会在你的浏览器页面里直接执行（与网页脚本同等权限）。只加载自己写的或可信来源的代码；UI 加载前有确认提示。
- **性能**：`render` 每帧调用。粒子请预分配（对象池），避免每帧 `new` / `push` / `splice`；DOM 操作优先 `translate3d` + `will-change`。
- **触摸屏**：引擎在 `(hover: none) and (pointer: coarse)` 设备上自动关闭光标渲染管线，`render` 不会被执行——省电设计，不是 bug。
- **兼容性**：`ctx.colors` 未上传图片时为 `null`；钩子只在该预设被选中时触发。
