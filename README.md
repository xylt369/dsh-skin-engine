# 🎨 dsh-skin-engine（换肤中心）

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 使用的纯客户端换肤插件：上传一张图片，整个界面就能立刻变成你的皮肤。

[![npm version](https://img.shields.io/npm/v/@yeesy369/dsh-skin-engine)](https://www.npmjs.com/package/@yeesy369/dsh-skin-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ 功能

- **上传背景图**：点击选择或拖拽 `jpg / png / webp / gif`，即时预览、即时生效
- **智能取色**：自动提取主色、强调色和明暗；面板、输入框、气泡、菜单、按钮等主题 token 全部跟随图片换肤，文字自动黑/白
- **6 种光标动态背景**：静态、光晕跟随、涟漪扩散、粒子拖尾、极光流动、星空视差
- **效果调节**：图片不透明度、面板通透度、背景模糊、暗化程度四个滑杆
- **轻量入口**：侧边栏底部「🎨 换肤中心」按钮

> 皮肤状态目前保存在页面内存中，刷新页面后恢复默认；插件本身随 profile 常驻，无需每次重装。

## 📦 安装

### 方式 A：npm 一键安装（推荐分发给别人）

发布者在项目目录发布：

```bash
npm publish --access public
```

对方机器上执行一条命令即可：

```bash
npx --yes @yeesy369/dsh-skin-engine@latest --version ^0.2.0
```

或使用 pnpm：

```bash
pnpm dlx @yeesy369/dsh-skin-engine --version ^0.2.0
```

脚本会自动修改 `~/.dsh/profiles/web/package.json`，写入依赖和 `dsh.profile.bundles` 条目，然后运行 `pnpm install`。

### 方式 B：本地包分发（不发布 npm）

把整个 `dsh-skin-engine` 文件夹拷给对方，然后执行：

```bash
node install.mjs --file /path/to/dsh-skin-engine
```

如果就在项目目录内：

```bash
node install.mjs --file .
```

原理相同，只是依赖写成 `file:` 绝对路径，无需 npm 发布。

### 手动配置

编辑 `~/.dsh/profiles/web/package.json`，把下面两处合并进你现有的配置（**不要覆盖整个文件**）：

```json
{
  "dependencies": {
    "@yeesy369/dsh-skin-engine": "^0.2.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@yeesy369/dsh-skin-engine"
      ]
    }
  }
}
```

然后：

```bash
cd ~/.dsh/profiles/web
pnpm install
```

重启 dsh 后生效。

## 🧹 卸载

一键卸载：

```bash
npx --yes @yeesy369/dsh-skin-engine@latest --uninstall
```

或手动：

1. 从 `~/.dsh/profiles/web/package.json` 的 `dependencies` 和 `dsh.profile.bundles` 中删除 `@yeesy369/dsh-skin-engine`
2. `cd ~/.dsh/profiles/web && pnpm install`
3. 重启 dsh

## ⚙️ install.mjs 参数

`install.mjs` 同时支持安装和卸载：

| 参数 | 说明 |
| --- | --- |
| `--version, -v <range>` | 写入的依赖版本范围，例如 `^0.2.0` |
| `--file, -f <path>` | 本地包路径，写入 `file:` 依赖 |
| `--profile, -p <name>` | dsh profile 名称，默认 `web` |
| `--dsh-home <path>` | dsh 根目录，默认 `~/.dsh`，也可用 `DSH_HOME` 环境变量覆盖 |
| `--uninstall` | 从配置中移除依赖和 bundles 条目 |
| `--no-install` | 只修改 `package.json`，不运行 `pnpm install` |
| `--dry-run` | 只打印将要写入的内容，不落盘 |
| `--help, -h` | 显示帮助 |

## 🧱 工作原理

- **纯客户端插件**：`lib/client.js` 是浏览器半区（`exports["./client"]`），`lib/index.js` 是空的 node 半区，仅用于让插件出现在 cordis/Loader 中。
- **模块清单**：`package.json` 的 `dsh.client` 声明使其进入浏览器模块清单；`cordis.patch.yml` 在包被列入 profile `bundles` 时自动插入 `ui-skin-engine`。
- **背景层**：自建 `z-index:-1` 全屏层垫在应用内容之下（`lib/client.js` 的 `ensureBgLayer`），配合 `theme.overrideTokens` 全量覆盖 token，形成“玻璃面板”皮肤。
- **取色**：图片缩放到 64×64 画布，平均色作为 `base`，饱和度最高的像素作为 `accent`，再根据亮度决定文字黑/白。
- **动画**：六种效果绘制在全屏 `canvas` 上，由 `requestAnimationFrame` 驱动，指针事件监听随插件卸载清理。
- **清理**：样式标签、DOM 节点、事件监听、token 覆盖全部在 `ctx.effect` 的清理函数中撤销，卸载后不残留副作用。

## 📁 目录结构

```text
dsh-skin-engine/
├── install.mjs          # 安装/卸载脚本，同时作为 npm bin 暴露
├── package.json         # 插件元数据、exports、bin、dsh.client 声明
├── cordis.patch.yml     # 进入 profile bundles 时自动插入 ui-skin-engine
├── lib/
│   ├── index.js         # node 半区：空的 apply
│   └── client.js        # 浏览器半区：换肤中心全部逻辑
├── LICENSE
└── README.md
```

## 🛠 开发与发布

环境要求：

- Node.js ≥ 18
- React ^18.2.0

发布前检查包内容：

```bash
npm pack --dry-run
```

正式发布：

```bash
npm publish --access public
```

## 版本历史

- **0.2.0**：新增 `install.mjs` 并作为 npm `bin` 暴露，支持 `--version / --file / --uninstall / --profile / --dry-run`；修复 npm 包未包含安装脚本、README JSON 示例带注释的问题
- **0.1.1**：发布到 npm 与 GitHub；README 补充仓库链接
- **0.1.0**：初始发布：上传背景图 + 智能取色 + 6 个 2D 光标动画 + 全量 token 换肤

## 许可证

[MIT](LICENSE)
