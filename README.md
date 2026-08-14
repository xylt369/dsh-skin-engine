# dsh-skin-engine

一个给 DeepSeek Harness Web UI 使用的纯客户端换肤插件。上传一张图片，插件会自动提取图片的主色、强调色和明暗，把整个界面的主题 token 换掉，再叠加跟随光标变化的动态背景。

[![npm version](https://img.shields.io/npm/v/@yeesy369/dsh-skin-engine)](https://www.npmjs.com/package/@yeesy369/dsh-skin-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能

- **背景图上传**：点击选择或拖拽 `jpg / png / webp / gif`，即时预览、即时生效
- **智能取色**：自动提取主色、强调色和明暗，面板、输入框、气泡、菜单、按钮等主题 token 全部跟随换肤，文字自动黑/白
- **6 种光标动态背景**：静态、光晕跟随、涟漪扩散、粒子拖尾、极光流动、星空视差
- **效果调节**：图片不透明度、面板通透度、背景模糊、暗化程度四个滑杆
- **入口**：侧边栏底部「🎨 换肤中心」按钮

> 皮肤状态目前保存在页面内存中，刷新页面后恢复默认；插件本身随 profile 常驻，无需重复安装。

## 部署

### 前置条件

- Node.js ≥ 18
- 已安装 `pnpm`
- 已初始化的 dsh profile，默认路径为 `~/.dsh/profiles/web/package.json`

### 方式 A：npm 一键安装

发布者在项目目录执行：

```bash
npm publish --access public
```

对方机器上直接执行：

```bash
npx --yes @yeesy369/dsh-skin-engine@latest
```

或使用 pnpm：

```bash
pnpm dlx @yeesy369/dsh-skin-engine
```

也可以显式指定版本范围：

```bash
npx --yes @yeesy369/dsh-skin-engine@latest --version ^0.2.0
```

脚本会自动：

1. 修改 `~/.dsh/profiles/web/package.json`
2. 写入 `dependencies` 和 `dsh.profile.bundles`
3. 运行 `pnpm install`
4. 提示你重启 dsh

如果 `pnpm install` 失败，脚本会自动恢复原来的 `package.json`，避免留下坏配置。

### 方式 B：本地文件夹部署

把整个项目文件夹拷贝给对方，然后执行：

```bash
node install.mjs --file /path/to/dsh-skin-engine
```

在项目目录内可以直接：

```bash
node install.mjs --file .
```

这种方式会在 `package.json` 中写入 `file:` 绝对路径依赖，不需要发布到 npm。

### 手动部署

编辑 `~/.dsh/profiles/web/package.json`，把下面两处合并进现有配置：

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

## 卸载

```bash
npx --yes @yeesy369/dsh-skin-engine@latest --uninstall
```

或手动删除 `dependencies` 和 `dsh.profile.bundles` 中的 `@yeesy369/dsh-skin-engine`，再运行 `pnpm install` 并重启 dsh。

## install.mjs 参数

`install.mjs` 同时支持安装、查看状态和卸载：

| 参数 | 说明 |
| --- | --- |
| `--version, -v <range>` | 写入的依赖版本范围，例如 `^0.2.0` |
| `--file, -f <path>` | 本地包路径，写入 `file:` 依赖 |
| `--profile, -p <name>` | dsh profile 名称，默认 `web`，可用 `DSH_PROFILE` 环境变量覆盖 |
| `--dsh-home <path>` | dsh 根目录，默认 `~/.dsh`，可用 `DSH_HOME` 环境变量覆盖 |
| `--status` | 只查看当前安装状态，不修改任何文件 |
| `--uninstall` | 从配置中移除依赖和 bundles 条目 |
| `--no-install` | 只修改 `package.json`，不运行 `pnpm install` |
| `--dry-run` | 只打印将要写入的内容，不落盘 |
| `--help, -h` | 显示帮助 |

如果执行 `node install.mjs` 时没有传 `--version` 或 `--file`，脚本会默认使用当前包版本，并写入形如 `^0.2.0` 的版本范围。

## 工作原理

- **纯客户端插件**：`lib/client.js` 是浏览器半区（`exports["./client"]`），`lib/index.js` 是空的 node 半区，只用于让插件出现在 cordis/Loader 中。
- **模块清单**：`package.json` 的 `dsh.client` 声明让插件进入浏览器模块清单；`cordis.patch.yml` 在包被列入 profile `bundles` 时自动插入 `ui-skin-engine`。
- **背景层**：在应用内容下方自建 `z-index:-1` 全屏层，配合 `theme.overrideTokens` 全量覆盖主题 token，形成“玻璃面板”效果。
- **取色**：图片缩放到 64×64 画布后，取平均色作为 `base`、饱和度最高的像素作为 `accent`，再根据亮度决定文字黑/白。
- **动画**：六种动态背景绘制在全屏 `canvas` 上，由 `requestAnimationFrame` 驱动，指针事件监听随卸载清理。
- **资源清理**：样式标签、DOM 节点、事件监听、token 覆盖都在 `ctx.effect` 的清理函数中撤销，卸载后不残留副作用。

## 目录结构

```text
dsh-skin-engine/
├── install.mjs          # 安装/卸载/状态查询脚本，同时作为 npm bin
├── package.json         # 插件元数据、exports、bin、dsh.client 声明
├── cordis.patch.yml     # 进入 profile bundles 时自动插入 ui-skin-engine
├── lib/
│   ├── index.js         # node 半区：空的 apply
│   └── client.js        # 浏览器半区：换肤中心全部逻辑
├── LICENSE
└── README.md
```

## 本地开发

安装依赖并运行语法检查：

```bash
node --check install.mjs
```

模拟修改某个 profile：

```bash
DSH_HOME=/tmp/dsh-test node install.mjs --profile web --dry-run --version ^0.2.0
```

## 发布

发布前检查包内容：

```bash
npm pack --dry-run
```

正式发布：

```bash
npm publish --access public
```

## 版本历史

- **0.2.0**：新增 `install.mjs`，作为 npm `bin` 暴露；支持默认版本安装、`--status`、`--uninstall`、`--dry-run`，并在 `pnpm install` 失败时自动回滚配置；重写 README
- **0.1.1**：发布到 npm 与 GitHub，README 补充仓库链接
- **0.1.0**：初始版本，上传背景图、智能取色、6 种动态背景、全量 token 换肤

## 许可证

[MIT](LICENSE)
