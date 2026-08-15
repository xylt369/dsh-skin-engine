# dsh-skin-engine 🎨

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）Web UI 换皮肤的客户端插件。装上之后，侧边栏底部会出现一个「🎨 换肤中心」按钮：上传一张背景图，插件自动提取图片的主色、强调色和明暗，把面板、输入框、气泡、菜单、按钮等主题 token 全部换成图片的配色，并叠加跟随光标变化的动态背景。

想让换肤中心多一种特效？**不用写插件**——按[自定义预设格式](docs/PRESET_FORMAT.md)写一个 `.js` 文件，在换肤中心「＋添加预设」里加载即可（见下方[怎么自己加特效](#怎么自己加特效)）。

## 功能

- **上传背景图**：点击选择或拖拽 `jpg / png / webp / gif`，即时预览、即时生效
- **智能取色**：自动从图片提取主色、强调色和明暗，文字自动黑/白
- **10 种光标动态背景**：静态、光晕跟随、涟漪扩散、粒子拖尾、极光流动、星空视差，以及 4 个 Genesis 光标引擎预置——量子霓虹（RGB 色散）、液态水银（Verlet 质点链 + 果冻粘连）、星尘引力（引力涡流粒子）、包豪斯网格（网格吸附 + 磁吸边框）
- **效果调节**：图片不透明度、面板通透度、背景模糊、暗化程度四个滑杆
- **自动保存**：皮肤（图片 + 全部设置）保存在本机浏览器，刷新页面后自动恢复；图片过大时自动压缩后保存
- **自定义特效**：写一个 `.js` 文件就能给自己加一种光标动态效果（统一格式 + 换肤中心一键加载），不用写插件
- **随时还原**：支持移除图片、恢复默认
- **兼容降级**：运行时自动检测 dsh 客户端能力，缺少主题/插槽接口时降级运行而不是报错

## 安装（npm 部署）

### 第 0 步 · 检查 dsh

打开终端，运行：

```bash
dsh --version
```

有输出（例如 `0.1.0-rc.6`）说明 dsh 已安装。如果提示“不是内部或外部命令”或 `command not found`，先安装 dsh：

```bash
npm i -g @deepseek-ai/dsh
```

装完重新打开终端，再运行一次 `dsh --version` 确认。

### 第 1 步 · 安装插件

在任意终端执行：

```bash
dsh plugin --profile web add @yeesy369/dsh-skin-engine
```

### 第 2 步 · 重启 dsh

在运行 `dsh web` 的终端按 `Ctrl+C`，然后重新运行：

```bash
dsh web
```

### 第 3 步 · 开始使用

打开 dsh 网页，点击左侧边栏底部的「🎨 换肤中心」按钮，上传一张图片，或点“试试示例背景”，界面会立刻换肤。

## 使用说明

| 操作 | 效果 |
| --- | --- |
| 上传或拖入图片 | 整个界面换成图片的配色，并自动保存到本机浏览器 |
| 点击动态背景卡片 | 切换 10 种光标动态效果 |
| 拖动「图片不透明度」滑杆 | 调节背景图片的显示强度 |
| 拖动「面板通透度」滑杆 | 调节面板的透明程度 |
| 拖动「背景模糊」滑杆 | 模糊背景图片 |
| 拖动「暗化程度」滑杆 | 加深背景暗色，突出前景内容 |
| 刷新页面 / 重启 `dsh web` | 自动恢复上次的皮肤 |
| 点「＋添加预设」 | 粘贴源码或选择 `.js` 文件，加载第三方/自制预设（自动保存） |
| 点「移除图片」 | 恢复 dsh 默认外观（同时清掉已保存的图片） |
| 点「恢复默认」 | 重置所有皮肤设置（同时清掉已保存的皮肤） |

## 光标算法预置（Genesis Cursor Engine）

后 4 种动态背景来自次世代可组合光标系统设计文档（Genesis Cursor Engine）的算法模型，配色从上传图片提取，不写死：

| 预置 | 底层算法 | 效果 |
| --- | --- | --- |
| 量子霓虹 | LERP + 速度投影 + RGB 双通道分离（色散） | 准星随速度沿运动方向拉伸旋转，主色/补色双通道错位叠出霓虹色散 |
| 液态水银 | Verlet 积分 + 距离约束 + 阈值融球（果冻滤镜） | 6 个质点组成的链珠跟随光标，经 `blur + contrast` 滤镜粘连成液态拖尾 |
| 星尘引力 | 径向万有引力 + 正交切向涡流 + 空气阻尼 | 80 个预分配粒子（对象池）被光标引力卷成旋转星云，色相取图片主色 ±30° |
| 包豪斯网格 | 8px 模块化网格吸附 + 磁吸吸附 | 白色方块在 8px 网格上跳动，靠近按钮/链接时吸附到其边界盒（`mix-blend-mode: difference`） |

工程实现遵循设计文档的性能原则：事件只更新目标坐标、物理与渲染统一由 `requestAnimationFrame` 驱动；DOM 光标用 `translate3d` + `will-change` 走 GPU 合成层；粒子定长预分配，运行时不做 `new`/`push`/`splice`；触摸屏（`(hover: none) and (pointer: coarse)`）自动关闭光标渲染管线以省电。

## 怎么自己加特效

想给换肤中心加一种自己的动态效果？**一个 `.js` 文件就够了**，格式见 [docs/PRESET_FORMAT.md](docs/PRESET_FORMAT.md)：

```js
// my-preset.js
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['my-preset'] = {
  id: 'my-preset',
  name: '我的预设',
  desc: '一句话描述',
  render: function (ctx) {   // 每帧调用；ctx.g 是垫在应用之下的透明 canvas
    ctx.g.beginPath();
    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);
    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.g.fill();
  },
  // 可选：onEnter / onExit / onPointerMove / onPointerDown / canvasFilter / author / version
};
```

**加载方式（二选一）：**

| 方式 | 操作 | 生效 |
| --- | --- | --- |
| 换肤中心 UI（推荐） | 「＋添加预设」→ 粘贴源码，或「从 .js 文件选择」 | 立即生效，自动保存（刷新后仍在） |
| 命令行 | `dsh-skin-engine preset add ./my-preset.js` | 重启 dsh 生效 |

**最快上手**：`dsh-skin-engine preset new my-neon` 会直接生成一个 `my-neon.js` 骨架文件；或者从仓库 [`presets/`](presets/) 里复制一个官方特效（10 个内置特效的独立文件，同源）改配色改参数。

**命令行工具：**

```bash
dsh-skin-engine preset new my-neon        # 生成预设文件骨架
dsh-skin-engine preset validate x.js      # 校验格式（写完先跑一遍）
dsh-skin-engine preset add x.js           # 安装到 profile
dsh-skin-engine preset list / remove <id> # 管理已安装的预设
```

删除：UI 里自定义预设卡片右上角 ✕，或命令行 `preset remove`。**安全提醒**：预设代码会在你的页面里直接执行，只加载自己写的或可信来源的代码。

## 常见问题

### 入口在哪？

左侧边栏最下面，是一个「🎨 换肤中心」按钮。

### 上传图片后没变化？

依次检查：

1. 是否已经重启过 `dsh web`
2. 是否安装成功：打开 `~/.dsh/profiles/web/package.json`，确认 `dependencies` 和 `dsh.profile.bundles` 里都有 `@yeesy369/dsh-skin-engine`
3. 是否输出了兼容性警告：打开浏览器控制台（F12），若出现 `[dsh-skin-engine]` 开头的警告，说明当前 dsh 版本缺少部分接口，插件已降级运行（见下方「兼容性」）

### 皮肤能保存吗？

能。上传的图片和所有设置会自动保存在**本机浏览器的 localStorage** 里，刷新页面或重启 `dsh web` 后自动恢复；插件本身随 profile 常驻，不需要重复安装。

两点说明：

- 图片优先原样保存（GIF 动画得以保留）；超出 localStorage 配额（约 5MB）时，插件会自动把图片压缩成 JPEG 再保存。若压缩后仍然存不下，控制台会给出警告，本次皮肤仅当前页面有效。
- 点「移除图片」或「恢复默认」会同时清掉已保存的皮肤。

### 皮肤存在哪里？隐私安全吗？

图片和设置只存在你本机浏览器的 localStorage（该 dsh 网页的源下），**不会上传到任何服务器**，换浏览器或清除站点数据后会丢失。介意隐私的话，不要上传敏感图片作为背景即可。

### 怎么卸载？

```bash
dsh plugin --profile web remove @yeesy369/dsh-skin-engine
```

然后重启 `dsh web`。已保存的皮肤数据会留在浏览器 localStorage 里，如需一并清除，可在卸载前先点一次「恢复默认」。

### 能装到别的 profile 吗？

可以，把命令里的 `web` 换成你的 profile 名：

```bash
dsh plugin --profile <profile 名> add @yeesy369/dsh-skin-engine
```

不过这是 Web UI 插件，建议装在 `web` profile。

## 兼容性

| 项 | 说明 |
| --- | --- |
| 支持范围 | dsh `>=0.1.0-rc.6` 且 `<0.2.0`（声明在 `package.json` 的 `dsh.compat`） |
| 实测版本 | `0.1.0-rc.6` |
| 依赖的接口 | `theme.overrideTokens`、插槽 `shell.overlay` 与 `sidebar.footer.action`、`dsh.bundle.patch` 打包机制 |

**安装时**：`dsh-skin-engine.mjs` 安装器会自动运行 `dsh --version` 并核对支持范围，超出范围给出警告（`--strict` 则直接中止）。用 `dsh plugin add` 安装则跳过该检查。

**运行时**：插件启动时做能力检测，而不是假设接口一定存在——

- 缺 `theme.overrideTokens`：降级为「只显示背景图片和光标动态效果，不覆盖主题配色」；
- 缺 `slots.inject`：降级为「不注册侧边栏入口和弹窗」。

两种情况都只会在浏览器控制台输出 `[dsh-skin-engine]` 警告，不会报错崩溃。如果你在未列出的 dsh 版本上使用正常，欢迎在 [Issues](https://github.com/xylt369/dsh-skin-engine/issues) 里告知，我们会更新支持范围。

**已知限制**：换肤依赖 dsh Web UI 的 DOM 结构（`#root > div:first-child` 透明化 + `z-index:-1` 背景层），dsh 未来大版本改动布局时可能失效——这也是支持范围收窄到 0.1.x 的原因之一。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `lib/client.js` | 浏览器半区，换肤中心全部逻辑（预设引擎 + 持久化 + 兼容性检测） |
| `lib/index.js` | node 半区，空的 `apply`，让插件进入 cordis/Loader |
| `cordis.patch.yml` | 包被列入 profile bundles 时自动插入 `ui-skin-engine` |
| `package.json` | 插件元数据、`dsh.client` 声明、`dsh.compat` 兼容范围、`exports` |
| `dsh-skin-engine.mjs` | 独立安装器（dsh 版本检查 + `preset` 自定义预设工具） |
| `presets/` | 10 个内置特效的独立文件形态 + `template.js` 模板，可直接下载改造、加载 |
| `docs/PRESET_FORMAT.md` | 自定义预设格式规范（字段、ctx、加载方式） |

## 工作原理

- 插件通过 `theme.overrideTokens` 把 dsh 的主题 token 全量换成从图片提取的配色
- 背景层是一个 `z-index:-1` 的全屏层，垫在应用内容下面
- **预设引擎**：所有动画模式统一走 spec 接口（`render(ctx)` + 生命周期钩子），内置示例内嵌、外部预设走 `window.__DSH_SKIN_PRESETS__` 全局注册表、本地自定义预设存 localStorage，三路合一——用户写一个 `.js` 文件即可注册新特效
- 动态背景绘制在一个全屏 `canvas` 上，用 `requestAnimationFrame` 驱动；事件只更新光标目标坐标，物理与渲染统一在帧循环内完成（文档要求）
- Genesis 预置遵循性能原则：粒子定长预分配（对象池）、DOM 光标走 `translate3d` + `will-change`、触摸屏自动关闭光标渲染管线
- 皮肤保存在浏览器 localStorage（`dsh.skin.state.v1` / `dsh.skin.image.v1`），启动时自动恢复，超配额时压缩重试
- 启动时做能力检测（`theme.overrideTokens` / `slots.inject`），缺失时降级运行
- 所有 DOM、事件监听、token 覆盖都会在插件卸载时自动清理

## 许可证

MIT
