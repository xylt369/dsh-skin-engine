# dsh-skin-engine 🎨

给 DeepSeek Harness（dsh）Web UI 换皮肤的客户端插件：上传一张背景图，整个界面立刻变成你的皮肤。

dsh 的 Web 界面默认是一套固定主题。这个插件会在侧边栏底部加一个「🎨 换肤中心」按钮，你上传图片后，它会自动提取图片的主色、强调色和明暗，把面板、输入框、气泡、菜单、按钮等主题 token 全部换成图片的配色，并叠加跟随光标变化的动态背景。

## 快速开始（3 步）

### 第 0 步 · 检查有没有 dsh（只需做一次）

打开终端，运行：

```bash
dsh --version
```

- ✅ 有输出（比如 `0.1.0-rc.6`）→ 已经装好，直接进入第 1 步
- ❌ 提示 “不是内部或外部命令” / “command not found” → 先安装 dsh：

```bash
npm i -g @deepseek-ai/dsh
```

装完重新打开一个终端窗口，再运行一次 `dsh --version`，确认有输出后继续。

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

### 第 3 步 · 开用

打开 dsh 网页，在左侧边栏最下面点「🎨 换肤中心」按钮。上传一张 `jpg / png / webp / gif`，或者点“试试示例背景”，界面会立刻换肤。

✅ 不需要任何额外配置。

## 可以怎么玩

| 操作 | 效果 |
| --- | --- |
| 上传或拖入一张图片 | 整个界面换成图片的配色 |
| 点击动态背景卡片 | 切换静态、光晕跟随、涟漪扩散、粒子拖尾、极光流动、星空视差 |
| 拖动四个滑杆 | 调节图片不透明度、面板通透度、背景模糊、暗化程度 |
| 点“移除图片” | 恢复 dsh 默认外观 |
| 点“恢复默认” | 重置所有皮肤设置 |

## 常见问题

### 入口在哪？

左侧边栏最下面，是一个「🎨 换肤中心」按钮。

### 上传图片后没变化？

依次检查：

1. 是否已经重启过 `dsh web`
2. 是否安装成功：打开 `~/.dsh/profiles/web/package.json`，确认 `dependencies` 里有 `@yeesy369/dsh-skin-engine`，且 `dsh.profile.bundles` 里也有它
3. 刷新页面后皮肤会恢复默认，因为当前版本皮肤只保存在页面内存里

### 皮肤能保存吗？

现在还不能跨刷新保存。上传的图片和设置只在当前页面有效，刷新后恢复默认；插件本身随 profile 常驻，不需要重复安装。

### 怎么卸载？

```bash
dsh plugin --profile web remove @yeesy369/dsh-skin-engine
```

然后重启 `dsh web`。

### 拿到的是本地文件夹，而不是 npm 包？

```bash
dsh plugin --profile web add file:/path/to/dsh-skin-engine
```

如果就在项目目录里，可以写：

```bash
dsh plugin --profile web add file:.
```

### 能装到别的 profile 吗？

可以，把命令里的 `web` 换成你的 profile 名：

```bash
dsh plugin --profile <你的 profile 名> add @yeesy369/dsh-skin-engine
```

不过这个插件是 Web UI 插件，建议装在 `web` profile。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `lib/client.js` | 浏览器半区，换肤中心全部逻辑 |
| `lib/index.js` | node 半区，空的 `apply`，让插件进入 cordis/Loader |
| `cordis.patch.yml` | 包被列入 profile bundles 时自动插入 `ui-skin-engine` |
| `package.json` | 插件元数据、`dsh.client` 声明、`exports` |
| `install.mjs` | 备用安装/卸载脚本，一般不需要，优先用 `dsh plugin` |

## 工作原理（简单版）

- 插件通过 `theme.overrideTokens` 把 dsh 的主题 token 全量换成从图片提取的配色
- 背景层是一个 `z-index:-1` 的全屏层，垫在应用内容下面
- 动态背景画在一个全屏 `canvas` 上，用 `requestAnimationFrame` 驱动
- 所有 DOM、事件、token 覆盖都会在插件卸载时清理

## 许可证

MIT
