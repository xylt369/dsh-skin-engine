# dsh-skin-engine 预设格式（Preset Format）

> 给 [dsh-skin-engine](https://github.com/xylt369/dsh-skin-engine) 写光标动态特效的**唯一需要知道的东西**。
> 你不需要理解 dsh 插件机制、Cordis、canvas 之外的任何东西——**一个文件就是一套特效**。

## 1. 一个预设长什么样

一个预设 = 一个 `.js` 文件，向全局注册表注册一个 **spec 对象**：

```js
// my-preset.js
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['my-preset'] = {
  id: 'my-preset',           // 唯一标识：字母/数字/-/_，≤48 字符（与 key 一致）
  name: '我的预设',           // 卡片显示名
  desc: '一句话描述',
  render: function (ctx) {   // 每帧绘制（必填）
    ctx.g.beginPath();
    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);
    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.g.fill();
  },
};
```

保存成 `.js` 文件，即可通过下面任一方式加载（见 §4）。

## 2. spec 完整字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 唯一标识，与注册 key 一致；正则会校验 `^[a-zA-Z0-9_-]{1,48}$` |
| `name` | string | ✅ | 卡片上显示的名字 |
| `desc` | string | 可选 | 一句话描述（默认空串） |
| `render(ctx)` | function | ✅ | 每帧调用；`ctx` 结构见 §3 |
| `onEnter()` | function | 可选 | 切到该预设时调用（初始化状态 / 建 DOM / 挂事件） |
| `onExit()` | function | 可选 | 切走或插件卸载时调用（**清理 onEnter 创建的一切**） |
| `onPointerMove(e)` | function | 可选 | 光标移动（原生 pointermove 事件） |
| `onPointerDown(e)` | function | 可选 | 按下（原生 pointerdown 事件） |
| `canvasFilter` | string | 可选 | 需要 canvas 整体套 CSS 滤镜时返回字符串，如 `'blur(10px) contrast(20)'`（果冻粘连） |

约定：

- **状态放闭包，不放全局**：多次加载、切换、卸载都不会串状态。
- **onEnter/onExit 成对出现**：建了 DOM / 挂了事件，就在 onExit 里删掉（见 `presets/bauhaus.js` 示范）。
- **尊重 ctx 坐标系**：`mx/my` 已是平滑后的光标坐标，直接画即可。
- **别改 `ctx.g` 之外的引擎状态**：`ctx` 只读。

## 3. render 的 ctx 参数

| 字段 | 说明 |
| --- | --- |
| `g` | canvas 2d 上下文。画布是一个透明全屏层，**垫在应用内容之下**（`z-index:-1`），`pointer-events:none` |
| `w` / `h` | 视口宽高（CSS 像素） |
| `mx` / `my` | 光标平滑坐标（CSS 像素；已用 lerp 平滑过） |
| `dt` | 帧间隔秒数（已钳制 ≤0.05） |
| `t` | 运行毫秒时间戳 |
| `colors` | 图片提取的配色：`{ base:[r,g,b], accent:[r,g,b], textLight:bool }`；未上传图片时为 `null`，记得给默认色 |

## 4. 三种加载方式

| 方式 | 命令 / 操作 | 生效时机 |
| --- | --- | --- |
| 换肤中心 UI | 「＋添加预设」→ 粘贴源码，或「从 .js 文件选择」 | 立即生效，并存入 localStorage（刷新后仍在） |
| 命令行 | `dsh-skin-engine preset add ./my-preset.js`（也支持 URL） | 写入 profile 并注册为独立客户端插件，**重启 dsh 后生效** |
| npm 包 | 预设作者把文件发成 npm 包（见 §6），用户 `dsh plugin --profile web add <包名>` | 重启 dsh 后生效 |

卸载：UI 里自定义预设卡片右上角 ✕；命令行 `dsh-skin-engine preset remove my-preset`；npm 包 `dsh plugin remove <包名>`。

## 5. 提交到官方仓库

1. 复制 `presets/template.js`，改好 `id/name/desc/render`，文件放进仓库的 `presets/` 目录（文件名建议用 id）。
2. 在 `presets/` 里跑本地校验：`dsh-skin-engine preset validate ./presets/你的文件.js`
3. 提 Pull Request。审核通过后会被收录为**官方预设**（内嵌进插件本体，零依赖加载）。

官方预设的独立形态就是 `presets/` 目录里的那 10 个文件——它们与插件内置的 10 个效果同源，可直接下载、加载、改造成你自己的版本。

## 6. 发布成 npm 包（进阶）

把预设文件发布为 npm 包，让用户一条命令安装。包结构（一个迷你 dsh 客户端插件）：

```
dsh-skin-preset-xxx/
├── package.json        # 见下
├── cordis.patch.yml    # - insert: { id: dsh-skin-preset-xxx, name: 'dsh-skin-preset-xxx' }
└── lib/
    ├── index.js        # export function apply() {}
    └── client.js       # 就是你的预设文件（原样）
```

`package.json` 关键字段：

```json
{
  "name": "dsh-skin-preset-xxx",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": { "./client": "./lib/client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [] }
  },
  "files": ["lib", "cordis.patch.yml"]
}
```

也可以不用手动搭：`dsh-skin-engine preset pack ./my-preset.js` 会生成这个包结构（命令行自动完成）。

## 7. 注意事项

- **安全**：第三方预设代码会在你的浏览器页面里直接执行（与网页脚本同等权限）。只加载可信来源；换肤中心加载前有确认提示。
- **性能**：`render` 每帧调用。粒子请预分配（对象池），避免每帧 `new` / `push` / `splice`（见 `presets/stardust.js` 风格）；DOM 操作优先 `translate3d` + `will-change`。
- **触摸屏**：引擎在 `(hover: none) and (pointer: coarse)` 设备上自动关闭光标渲染管线，你的 `render` 不会被执行——这是省电设计，不是 bug。
- **兼容性**：`render(ctx)` 的 `ctx.colors` 在未上传图片时为 `null`；`onPointerMove` 等钩子只在该预设被选中时触发。
