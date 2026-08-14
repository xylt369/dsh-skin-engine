# 🎨 dsh-skin-engine（换肤中心）

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 换皮肤的客户端插件。

- **npm**：[`@yeesy369/dsh-skin-engine`](https://www.npmjs.com/package/@yeesy369/dsh-skin-engine)
- **GitHub**：[`xylt369/dsh-skin-engine`](https://github.com/xylt369/dsh-skin-engine)

- **上传背景图**：点击选择或拖拽 jpg/png/webp/gif，整个应用立即变成你的皮肤
- **智能取色**：自动从图片提取主色/强调色/明暗，面板、输入框、气泡、菜单、按钮等全部主题 token 跟随换肤，文字自动黑白
- **6 种光标动态背景**：静态 / 光晕跟随 / 涟漪扩散 / 粒子拖尾 / 极光流动 / 星空视差
- **效果调节**：图片不透明度、面板通透度、背景模糊、暗化程度四个滑杆
- **入口**：侧边栏底部「🎨 换肤中心」按钮

> 皮肤状态是页面内存态：刷新页面后恢复默认（插件本身随 profile 常驻）。

---

## 部署方式（二选一）

### 方式 A：npm 发布后一键安装（适合分发给别人）

发布（需要 npm 账号，包名 `@yeesy369/dsh-skin-engine`）：

```bash
cd dsh-skin-engine
npm publish --access public
```

对方机器上安装（一条命令）：

```bash
node install.mjs --version ^0.1.0
```

或手动配置：编辑 `~/.dsh/profiles/web/package.json`，加两处：

```jsonc
{
  "dependencies": {
    "@yeesy369/dsh-skin-engine": "^0.1.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...原有 bundle...
        "@yeesy369/dsh-skin-engine"
      ]
    }
  }
}
```

然后 `cd ~/.dsh/profiles/web && pnpm install`，重启 dsh。

### 方式 B：本地包分发（不发布 npm）

把整个 `dsh-skin-engine` 文件夹拷给对方，然后：

```bash
node install.mjs --file /path/to/dsh-skin-engine
```

原理相同，只是依赖写成 `file:` 路径，无需 npm 发布。

---

## 卸载

1. 从 `~/.dsh/profiles/web/package.json` 的 `dependencies` 和 `dsh.profile.bundles` 中删除 `@yeesy369/dsh-skin-engine`
2. `cd ~/.dsh/profiles/web && pnpm install`
3. 重启 dsh

## 工作原理（给想改的人）

- 纯客户端插件：`lib/client.js` 是浏览器半区（`exports["./client"]`），`lib/index.js` 是空的 node 半区（仅用于在组合中出现）
- `package.json` 的 `dsh.client` 声明使其进入浏览器模块清单；`cordis.patch.yml` 在包被列入 profile `bundles` 时自动插入 `ui-skin-engine` 行
- 背景图实现：自建 `z-index:-1` 全屏层垫在应用内容之下（`lib/client.js` 中 `ensureBgLayer`），配合 `theme.overrideTokens` 全量覆盖 token 形成"玻璃面板"皮肤；所有副作用随插件卸载自动清理

## 版本历史

- **0.1.1** 发布到 npm 与 GitHub；README 补充仓库链接
- **0.1.0** 初始发布：上传背景图 + 智能取色 + 6 个 2D 光标动画 + 全量 token 换肤
