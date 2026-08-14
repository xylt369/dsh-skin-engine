# dsh-skin-engine 🎨

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）Web UI 换皮肤的客户端插件。

装上之后，侧边栏底部会出现一个「🎨 换肤中心」按钮。上传一张背景图，插件会自动提取图片的主色、强调色和明暗，把面板、输入框、气泡、菜单、按钮等主题 token 全部换成图片的配色，并叠加跟随光标变化的动态背景。

## 功能

- **上传背景图**：点击选择或拖拽 `jpg / png / webp / gif`，即时预览、即时生效
- **智能取色**：自动从图片提取主色、强调色和明暗，文字自动黑/白
- **6 种光标动态背景**：静态、光晕跟随、涟漪扩散、粒子拖尾、极光流动、星空视差
- **效果调节**：图片不透明度、面板通透度、背景模糊、暗化程度四个滑杆
- **随时还原**：支持移除图片、恢复默认

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
| 上传或拖入图片 | 整个界面换成图片的配色 |
| 点击动态背景卡片 | 切换 6 种光标动态效果 |
| 拖动「图片不透明度」滑杆 | 调节背景图片的显示强度 |
| 拖动「面板通透度」滑杆 | 调节面板的透明程度 |
| 拖动「背景模糊」滑杆 | 模糊背景图片 |
| 拖动「暗化程度」滑杆 | 加深背景暗色，突出前景内容 |
| 点「移除图片」 | 恢复 dsh 默认外观 |
| 点「恢复默认」 | 重置所有皮肤设置 |

## 常见问题

### 入口在哪？

左侧边栏最下面，是一个「🎨 换肤中心」按钮。

### 上传图片后没变化？

依次检查：

1. 是否已经重启过 `dsh web`
2. 是否安装成功：打开 `~/.dsh/profiles/web/package.json`，确认 `dependencies` 和 `dsh.profile.bundles` 里都有 `@yeesy369/dsh-skin-engine`
3. 刷新页面后皮肤会恢复默认，因为当前版本皮肤只保存在页面内存里

### 皮肤能保存吗？

当前版本还不能跨刷新保存。上传的图片和设置只在当前页面有效，刷新后恢复默认；插件本身随 profile 常驻，不需要重复安装。

### 怎么卸载？

```bash
dsh plugin --profile web remove @yeesy369/dsh-skin-engine
```

然后重启 `dsh web`。

### 能装到别的 profile 吗？

可以，把命令里的 `web` 换成你的 profile 名：

```bash
dsh plugin --profile <profile 名> add @yeesy369/dsh-skin-engine
```

不过这是 Web UI 插件，建议装在 `web` profile。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `lib/client.js` | 浏览器半区，换肤中心全部逻辑 |
| `lib/index.js` | node 半区，空的 `apply`，让插件进入 cordis/Loader |
| `cordis.patch.yml` | 包被列入 profile bundles 时自动插入 `ui-skin-engine` |
| `package.json` | 插件元数据、`dsh.client` 声明、`exports` |

## 工作原理

- 插件通过 `theme.overrideTokens` 把 dsh 的主题 token 全量换成从图片提取的配色
- 背景层是一个 `z-index:-1` 的全屏层，垫在应用内容下面
- 动态背景绘制在一个全屏 `canvas` 上，用 `requestAnimationFrame` 驱动
- 所有 DOM、事件监听、token 覆盖都会在插件卸载时自动清理

## 许可证

MIT
