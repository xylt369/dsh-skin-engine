# 社区预设目录（Community Presets）

dsh-skin-engine 是一个**预设平台**：官方只维护引擎、协议与少量官方示例，特效全部来自社区。你的预设发布后，往本目录（`registry.json`）加一行，任何人就能用一条命令安装——**不需要把代码并入本仓库，引擎不会内嵌社区预设**。

## 平台流程一览

```
写预设（协议 v1） → preset validate → 本地试用 → npm publish → registry.json 加一行（PR）
                                                   ↓
用户：dsh-skin-engine preset search → preset install <id>
```

## 第一步：写一个预设

```bash
dsh-skin-engine preset new my-neon        # 生成包骨架（协议 v1 + render 模板）
cd dsh-skin-preset-my-neon
# 编辑 lib/client.js 里的 render(ctx)，格式见 docs/PRESET_FORMAT.md
dsh-skin-engine preset validate lib/client.js    # 校验
dsh-skin-engine preset add lib/client.js --no-install   # 本地先试（或用换肤中心「＋添加预设」）
```

## 第二步：发布到 npm

```bash
# package.json 已就绪（dsh.bundle + dsh.client + exports["./client"]），去掉 private: true 后：
npm publish
```

包命名规范：**`dsh-skin-preset-<name>`**（`<name>` 与预设 `id` 一致）。发布后用户即可安装：

```bash
dsh plugin --profile web add dsh-skin-preset-my-neon   # 或
dsh-skin-engine preset install dsh-skin-preset-my-neon
```

## 第三步：上社区目录（可选但推荐）

给本仓库提一个 PR，在 [`registry.json`](registry.json) 的 `presets` 数组加一行：

```json
{
  "id": "my-neon",
  "name": "我的霓虹",
  "desc": "一句话描述你的特效",
  "package": "dsh-skin-preset-my-neon",
  "author": "你的名字",
  "repo": "https://github.com/你/dsh-skin-preset-my-neon",
  "tags": ["glow"]
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 预设 id（与 spec 的 id 一致） |
| `name` | ✅ | 显示名 |
| `desc` | ✅ | 一句话描述（会出现在 `preset search` 里） |
| `package` | ✅ | npm 包名 |
| `author` | ✅ | 你的名字 / GitHub 用户名 |
| `repo` | 可选 | 源码仓库地址 |
| `tags` | 可选 | 标签数组（如 `glow`、`particle`、`cursor`） |

PR 审核只检查格式与可安装性（`preset validate` + 包名可解析），**不审查特效代码**——代码归属你自己，更新也由你发版。

## 上榜后

用户端体验：

```bash
dsh-skin-engine preset search neon        # 搜到你的预设
dsh-skin-engine preset install my-neon    # 一条命令安装（解析 registry.json → npm 包）
# 重启 dsh，换肤中心 → 动态背景 → 选你的预设（卡片带「社区」标签和作者/版本）
```

## 官方预设去哪了？

内置的 10 个只是**官方示例**（换肤中心里带「示例」标签），它们的独立文件形态在 [`presets/`](presets/) 目录，供参考、下载、改造。官方不维护社区预设，也不对社区预设做代码审核——选择安装即代表你信任该来源（第三方代码会在页面内执行，加载前有安全确认提示）。
