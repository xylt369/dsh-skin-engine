# dsh-skin-engine 平台协议 v1（预设格式与接入指南）

> 这是 dsh-skin-engine **主题平台**的接入契约：**一个文件 = 一套特效**。
> 你不需要了解 dsh 插件机制、Cordis 或 canvas 之外的任何东西。写好你的前端效果，按本协议封装，
> 就能被引擎发现、校验、渲染，并分发给所有用户。
> 官方只维护引擎与协议本身——**你的代码归属你自己，不会被并入官方**。

## 0. 平台结构

```
┌─ 引擎（本插件）─────────────────────────────┐
│  · 渲染循环（RAF）、canvas 背景层、主题换肤   │
│  · 预设注册表：内置示例 + 社区预设 + 本地自定义│
│  · 平台接口 window.__DSH_SKIN_ENGINE__       │
└──────────────────────────────────────────────┘
         ▲ register / 注册表 / 校验
┌─ 你的预设（协议 v1 兼容的任意前端代码）───────┐
│  渲染函数、生命周期钩子、可选 DOM / 事件       │
└──────────────────────────────────────────────┘
```

引擎**只认协议，不审核代码**：只要 spec 通过校验（见 §4），任何来源的预设都能接入。

## 1. 一个预设长什么样

```js
// my-preset.js —— 一个文件 = 一套特效
window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};
window.__DSH_SKIN_PRESETS__['my-preset'] = {
  format: 1,                 // 可选：声明协议版本（当前 v1）
  id: 'my-preset',           // 唯一标识：字母/数字/-/_，≤48 字符（与 key 一致）
  name: '我的预设',           // 卡片显示名
  desc: '一句话描述',
  author: '你的名字',         // 可选：卡片上展示作者
  version: '1.0.0',          // 可选：卡片上展示版本
  render: function (ctx) {   // 每帧绘制（必填）
    ctx.g.beginPath();
    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);
    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.g.fill();
  },
};
```

## 2. 现成的接口（window.__DSH_SKIN_ENGINE__）

引擎运行时挂载在 `window.__DSH_SKIN_ENGINE__` 上，你的预设可以探测并调用：

```js
const eng = window.__DSH_SKIN_ENGINE__;
if (eng && eng.format === 1) {
  eng.register({ id: 'my-preset', name: '我的预设', desc: '…', render: function (ctx) { … } });
}
```

| 成员 | 说明 |
| --- | --- |
| `format` | 引擎支持的协议版本（当前 `1`）。探测用，后续大版本升级时据此做特性检测 |
| `register(spec)` | 校验并注册预设（比直接写注册表更安全：格式错误会被拒绝并返回错误信息） |
| `list()` | 当前全部预设（内置 + 社区 + 本地自定义） |
| `remove(id)` | 删除本地自定义预设 |
| `isCustom(id)` | 是否为本地自定义预设 |
| `utils` | 工具函数：`mix(c1,c2,t)`、`rgba(c,a)`、`lum(c)`、`rgbToHsl(c)`、`hslToRgb(h,s,l)`、`shiftHue(c,deg)`——与引擎内部同一套实现，方便你从图片取色派生配色 |

## 3. spec 完整字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `format` | number | 可选 | 协议版本，当前 `1`；填了就必须等于 1 |
| `id` | string | ✅ | 唯一标识，与注册 key 一致；`^[a-zA-Z0-9_-]{1,48}$` |
| `name` | string | ✅ | 卡片显示名 |
| `desc` | string | 可选 | 一句话描述（默认空串） |
| `author` | string | 可选 | 作者名，卡片展示 |
| `version` | string | 可选 | 版本号（字符串），卡片展示 |
| `render(ctx)` | function | ✅ | 每帧调用；`ctx` 见 §5 |
| `onEnter()` | function | 可选 | 切到该预设时调用（初始化状态 / 建 DOM / 挂事件） |
| `onExit()` | function | 可选 | 切走或卸载时调用（**清理 onEnter 创建的一切**） |
| `onPointerMove(e)` | function | 可选 | 光标移动（原生 pointermove 事件） |
| `onPointerDown(e)` | function | 可选 | 按下（原生 pointerdown 事件） |
| `canvasFilter` | string | 可选 | canvas 需要套 CSS 滤镜时返回字符串，如 `'blur(10px) contrast(20)'`（果冻粘连） |

约定：

- **状态放闭包，不放全局**：多次加载、切换、卸载都不会串状态。
- **onEnter/onExit 成对出现**：建了 DOM / 挂了事件，就在 onExit 里删掉（见 `presets/bauhaus.js`）。
- **尊重 ctx 坐标系**：`mx/my` 已是平滑后的光标坐标，直接画即可。
- **别改引擎状态**：`ctx` 只读。

## 4. 校验规则

引擎与命令行工具（`dsh-skin-engine preset validate`）用**同一套规则**：对象、id 格式、name 存在、render 是函数、可选钩子类型正确、`canvasFilter` 是字符串、`format` 等于 1。不合规会被拒绝并返回具体原因——所以写完后先跑一遍 validate 再发布。

## 5. render 的 ctx 参数

| 字段 | 说明 |
| --- | --- |
| `g` | canvas 2d 上下文。画布是透明全屏层，**垫在应用内容之下**（`z-index:-1`），`pointer-events:none` |
| `w` / `h` | 视口宽高（CSS 像素） |
| `mx` / `my` | 光标平滑坐标（CSS 像素） |
| `dt` | 帧间隔秒数（已钳制 ≤0.05） |
| `t` | 运行毫秒时间戳 |
| `colors` | 图片提取的配色：`{ base:[r,g,b], accent:[r,g,b], textLight:bool }`；未上传图片时为 `null`，记得给默认色 |

## 6. 接入与分发（三种方式）

| 方式 | 操作 | 生效 |
| --- | --- | --- |
| 换肤中心 UI | 「＋添加预设」→ 粘贴源码或选择 `.js` 文件 | 立即生效，自动保存到 localStorage |
| 命令行（本地文件） | `dsh-skin-engine preset add ./my-preset.js`（支持 URL） | 写入 profile 并注册为独立插件包，重启 dsh 生效 |
| 命令行（社区注册表） | `dsh-skin-engine preset search / install <id>` | 解析 `registry.json` → npm 包 → 安装，重启生效 |

## 7. 发布为 npm 包（标准分发方式）

```bash
dsh-skin-engine preset new my-neon     # 生成包骨架
cd dsh-skin-preset-my-neon
# 编辑 lib/client.js（就是你的预设文件），然后：
dsh-skin-engine preset validate lib/client.js
npm publish                            # 去掉 package.json 里的 private: true
```

包名规范：**`dsh-skin-preset-<name>`**。发布后：

- 用户直接安装：`dsh plugin --profile web add dsh-skin-preset-my-neon`
- 或上社区目录：PR 往 [`registry.json`](../registry.json) 加一行（见 [COMMUNITY.md](../COMMUNITY.md)），用户即可 `dsh-skin-engine preset install my-neon`

包结构（`dsh-skin-engine preset new` / `preset pack` 自动生成）：

```
dsh-skin-preset-my-neon/
├── package.json        # dsh.bundle.patch + dsh.client + exports["./client"]
├── cordis.patch.yml    # - insert: { id: dsh-skin-preset-my-neon, name: 'dsh-skin-preset-my-neon' }
└── lib/
    ├── index.js        # export function apply() {}
    └── client.js       # 你的预设文件（原样）
```

## 8. 注意事项

- **安全**：第三方预设会在你的浏览器页面里直接执行（与网页脚本同等权限）。引擎不做代码审查——**选择安装即代表信任来源**；UI 加载前有确认提示，命令行安装的是 npm 包，风险与装任何 npm 包一致。
- **性能**：`render` 每帧调用。粒子请预分配（对象池），避免每帧 `new` / `push` / `splice`；DOM 操作优先 `translate3d` + `will-change`。
- **触摸屏**：引擎在 `(hover: none) and (pointer: coarse)` 设备上自动关闭光标渲染管线，你的 `render` 不会被执行——省电设计，不是 bug。
- **兼容性**：`ctx.colors` 未上传图片时为 `null`；钩子只在该预设被选中时触发。
- **协议稳定性**：协议 v1 承诺向后兼容。引擎若升级到 v2，会同时支持 v1（`format: 1` 的预设继续可用），你的预设声明 `format` 字段即可参与特性检测。
