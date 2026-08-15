#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG_NAME = '@yeesy369/dsh-skin-engine';
const DEFAULT_PROFILE = process.env.DSH_PROFILE || 'web';
const DEFAULT_DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
// 兼容范围（与 package.json 的 dsh.compat 保持一致）：[min, max)
const DSH_COMPAT = { min: '0.1.0-rc.6', max: '0.2.0', tested: ['0.1.0-rc.6'] };

function printHelp() {
  console.log(`
dsh-skin-engine 安装器

用法：
  node dsh-skin-engine.mjs                # 使用当前包版本，写入 npm 依赖并安装
  node dsh-skin-engine.mjs --version <range>   # 指定 npm 版本范围
  node dsh-skin-engine.mjs --file <path>       # 使用本地文件夹作为依赖
  node dsh-skin-engine.mjs --status            # 查看当前安装状态
  node dsh-skin-engine.mjs --uninstall         # 卸载

参数：
  --version, -v <range>   要写入 package.json 的依赖版本范围，例如 ^0.6.0
  --file, -f <path>       本地包路径（写入 file: 依赖，无需 npm 发布）
  --profile, -p <name>    dsh profile 名称，默认 web（可用 DSH_PROFILE 覆盖）
  --dsh-home <path>       dsh 根目录，默认 ~/.dsh（可用 DSH_HOME 覆盖）
  --strict                检测到 dsh 版本不在支持范围内时直接中止安装
  --dsh-version <v>       手动指定 dsh 版本（跳过 dsh --version 检测，测试用）
  --status                只查看安装状态，不修改任何文件
  --uninstall             从 package.json 移除依赖和 bundles 条目
  --no-install            只修改 package.json，不运行 pnpm install
  --dry-run               只打印将要写入的内容，不落盘
  --help, -h              显示本帮助

兼容性：支持 dsh ${DSH_COMPAT.min} ≤ 版本 < ${DSH_COMPAT.max}（实测 ${DSH_COMPAT.tested.join('、')}）。
超出范围的版本会给出警告（--strict 则中止）；运行时插件还会做能力检测并自动降级。

预设子命令（统一格式见 docs/PRESET_FORMAT.md）：
  dsh-skin-engine preset validate <file|url>   校验预设文件是否符合统一格式
  dsh-skin-engine preset add <file|url>        校验并安装到 profile（包装成独立插件包，重启 dsh 生效）
  dsh-skin-engine preset pack <file> --out <d> 生成可发布的 npm 包结构（不安装）
  dsh-skin-engine preset list                  列出已安装的预设
  dsh-skin-engine preset remove <id>           卸载预设
`);
}

function parseArgs(argv) {
  const opts = {
    version: null,
    file: null,
    profile: DEFAULT_PROFILE,
    dshHome: DEFAULT_DSH_HOME,
    strict: false,
    dshVersion: null,
    id: null,
    out: null,
    registry: null,
    status: false,
    uninstall: false,
    noInstall: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' || arg === '-v') opts.version = argv[++i];
    else if (arg === '--file' || arg === '-f') opts.file = argv[++i];
    else if (arg === '--profile' || arg === '-p') opts.profile = argv[++i];
    else if (arg === '--dsh-home') opts.dshHome = argv[++i];
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--dsh-version') opts.dshVersion = argv[++i];
    else if (arg === '--id') opts.id = argv[++i];
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--registry') opts.registry = argv[++i];
    else if (arg === '--status') opts.status = true;
    else if (arg === '--uninstall') opts.uninstall = true;
    else if (arg === '--no-install') opts.noInstall = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('-')) {
      console.warn(`[warn] 忽略未知参数：${arg}`);
    }
    // 其余视为位置参数（预设子命令的文件路径等），静默保留
  }

  return opts;
}

async function readOwnVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'package.json'), join(here, '..', 'package.json')];
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(await readFile(candidate, 'utf8'));
      if (json.name === PKG_NAME && json.version) return json.version;
    } catch {
      // 继续尝试下一个位置
    }
  }
  return '0.6.0';
}

// ---------- dsh 版本兼容性检查 ----------
// 按 semver 规则比较（含 prerelease：数字标识 < 字母数字标识，无 prerelease > 有 prerelease）。
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : null,
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1; // 正式版 > 预发布
  if (b.pre === null) return -1;
  const n = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < n; i += 1) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn) return -1; // 数字标识优先级低于字母数字标识
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// 返回 { ok: true | false | null(无法判定), version, message }
function checkDshCompat(versionText) {
  const version = String(versionText).trim();
  const v = parseVersion(version);
  if (!v) return { ok: null, version, message: `无法解析 dsh 版本「${version}」，跳过兼容性检查。` };
  const min = parseVersion(DSH_COMPAT.min);
  const max = parseVersion(DSH_COMPAT.max);
  if (compareVersions(v, min) < 0 || compareVersions(v, max) >= 0) {
    return {
      ok: false,
      version,
      message: `当前 dsh ${version} 不在支持范围（${DSH_COMPAT.min} ≤ dsh < ${DSH_COMPAT.max}，实测 ${DSH_COMPAT.tested.join('、')}）。皮肤功能可能异常。`,
    };
  }
  return { ok: true, version, message: `dsh ${version} 在支持范围内（${DSH_COMPAT.min} ≤ dsh < ${DSH_COMPAT.max}）。` };
}

function detectDshVersion(opts) {
  if (opts.dshVersion !== null) return { status: 0, stdout: `${opts.dshVersion}\n` };
  const bin = process.platform === 'win32' ? 'dsh.cmd' : 'dsh';
  try {
    // Windows 下 .cmd 需要 shell 才能被 spawn，与下方 pnpm 调用保持一致
    return spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
  } catch {
    return { error: new Error('dsh not found') };
  }
}

function verifyDshCompat(opts) {
  const child = detectDshVersion(opts);
  if (child.error || child.status !== 0) {
    console.warn('[warn] 无法检测 dsh 版本（dsh 不在 PATH 上？），跳过兼容性检查。');
    return;
  }
  const result = checkDshCompat(String(child.stdout || '').trim().split(/\r?\n/)[0]);
  if (result.ok === true) {
    console.log(`兼容性检查通过：${result.message}`);
  } else if (result.ok === false) {
    const line = `[${opts.strict ? 'error' : 'warn'}] ${result.message}`;
    if (opts.strict) {
      console.error(line);
      console.error('已按 --strict 中止安装。可升级/降级 dsh 到支持范围，或去掉 --strict 继续（不保证功能正常）。');
      process.exit(1);
    }
    console.warn(line);
  } else {
    console.warn(`[warn] ${result.message}`);
  }
}

function normalizeFileSpec(filePath) {
  return 'file:' + resolve(filePath).replace(/\\/g, '/');
}

function profilePackagePath(opts) {
  return join(opts.dshHome, 'profiles', opts.profile, 'package.json');
}

async function readProfilePackage(pkgPath) {
  if (!existsSync(pkgPath)) {
    console.error(`未找到配置文件：${pkgPath}`);
    console.error('请确认 dsh 已初始化，或使用 --dsh-home / --profile 指向正确的 profile 目录。');
    process.exit(1);
  }
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw.replace(/^\uFEFF/, ''));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dsh = pkg.dsh || {};
  pkg.dsh.profile = pkg.dsh.profile || {};
  pkg.dsh.profile.bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  return { raw, pkg };
}

function printStatus(pkg, pkgPath) {
  const dep = pkg.dependencies[PKG_NAME];
  const inBundles = pkg.dsh.profile.bundles.includes(PKG_NAME);
  console.log(`配置文件：${pkgPath}`);
  console.log(`依赖：${dep || '未安装'}`);
  console.log(`bundles：${inBundles ? '已启用' : '未启用'}`);
}

// ---------- 预设子命令（统一格式见 docs/PRESET_FORMAT.md） ----------
const PRESET_DIR_NAME = 'dsh-skin-presets';
// 社区预设注册表（任何人 PR registry.json 加一行即可上榜，见 COMMUNITY.md）
const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/xylt369/dsh-skin-engine/main/registry.json';

function presetHelp() {
  console.log(`
dsh-skin-engine preset — 预设平台工具（协议 v1，格式见 docs/PRESET_FORMAT.md）

用法：
  dsh-skin-engine preset validate <file|url>       校验预设文件是否符合平台协议 v1
  dsh-skin-engine preset add <file|url> [--id x]   校验并安装到 profile（包装成独立插件包）
  dsh-skin-engine preset new <id>                 生成一个可直接开发的预设包（含 render 骨架）
  dsh-skin-engine preset pack <file> [--out <dir>] 生成可发布的 npm 包结构（不安装）
  dsh-skin-engine preset search [关键词]            搜索社区注册表（registry.json）
  dsh-skin-engine preset install <id|npm包名>       从社区注册表安装预设（或直接按 npm 包名安装）
  dsh-skin-engine preset list                      列出已安装的预设
  dsh-skin-engine preset remove <id>               卸载预设

参数：
  --profile, -p <name>    dsh profile 名称，默认 web（可用 DSH_PROFILE 覆盖）
  --dsh-home <path>       dsh 根目录，默认 ~/.dsh
  --id <x>                多预设文件时指定安装哪个（默认取第一个）
  --out <dir>             pack/new 的输出目录
  --registry <url>        社区注册表地址（默认 GitHub raw 上的 registry.json）
  --no-install            只生成包装目录，不运行 dsh plugin add/remove
  --dry-run               只打印将执行的内容
  --help, -h              显示本帮助
`);
}

// 与 lib/client.js 的 validateSpec 保持一致的 node 侧校验
function validateSpecNode(spec) {
  if (!spec || typeof spec !== 'object') return '预设必须是对象';
  if (spec.format !== undefined && spec.format !== 1) return 'format 必须是 1（平台协议 v1）';
  if (typeof spec.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(spec.id)) return '缺少合法的 id（字母/数字/-/_，≤48 字符）';
  if (typeof spec.name !== 'string' || !spec.name) return '缺少 name（显示名）';
  if (typeof spec.desc !== 'string') spec.desc = '';
  if (spec.author !== undefined && typeof spec.author !== 'string') return 'author 必须是字符串';
  if (spec.version !== undefined && typeof spec.version !== 'string') return 'version 必须是字符串';
  if (spec.render !== undefined && typeof spec.render !== 'function') return 'render 必须是函数';
  if (spec.onEnter !== undefined && typeof spec.onEnter !== 'function') return 'onEnter 必须是函数';
  if (spec.onExit !== undefined && typeof spec.onExit !== 'function') return 'onExit 必须是函数';
  if (spec.onPointerMove !== undefined && typeof spec.onPointerMove !== 'function') return 'onPointerMove 必须是函数';
  if (spec.onPointerDown !== undefined && typeof spec.onPointerDown !== 'function') return 'onPointerDown 必须是函数';
  if (spec.canvasFilter !== undefined && typeof spec.canvasFilter !== 'string') return 'canvasFilter 必须是字符串';
  if (typeof spec.render !== 'function') return '必须提供 render(ctx)（每帧绘制）';
  return null;
}

function validatePresetSource(source) {
  const reg = {};
  const fakeWindow = { __DSH_SKIN_PRESETS__: reg };
  try {
    new Function('window', 'console', '"use strict";\n' + source)(fakeWindow, console);
  } catch (e) {
    return { ok: false, error: `执行失败：${e.message}`, ids: [] };
  }
  const ids = Object.keys(reg);
  if (!ids.length) return { ok: false, error: '没有注册任何预设（需要 window.__DSH_SKIN_PRESETS__["id"] = {...}）', ids: [] };
  for (const id of ids) {
    const err = validateSpecNode(reg[id]);
    if (err) return { ok: false, error: `预设「${id}」不符合统一格式：${err}`, ids: [] };
  }
  return { ok: true, ids: ids };
}

async function readPresetSource(input) {
  if (/^https?:\/\//.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
    return await res.text();
  }
  const p = resolve(input);
  if (!existsSync(p)) throw new Error(`文件不存在：${p}`);
  return await readFile(p, 'utf8');
}

function presetRoot(opts) {
  return join(opts.dshHome, 'profiles', opts.profile, PRESET_DIR_NAME);
}

function pickId(v, opts) {
  if (v.ids.length === 1) return v.ids[0];
  if (opts.id && v.ids.includes(opts.id)) return opts.id;
  return v.ids[0];
}

function assertNpmId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error(`[error] 预设 id「${id}」不符合 npm 包名要求（小写字母/数字/-，首字符字母或数字）。`);
    process.exit(1);
  }
}

// 生成迷你插件包装包：package.json + cordis.patch.yml + lib/{index,client}.js
async function scaffoldPresetWrapper(dir, id, source) {
  const wrapperName = `dsh-skin-preset-${id}`;
  await mkdir(join(dir, 'lib'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: wrapperName,
    version: '1.0.0',
    private: true,
    type: 'module',
    main: 'lib/index.js',
    exports: { './client': './lib/client.js' },
    files: ['lib', 'cordis.patch.yml'],
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [] },
    },
  }, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, 'cordis.patch.yml'), `- insert:\n    - id: ${wrapperName}\n      name: '${wrapperName}'\n`, 'utf8');
  await writeFile(join(dir, 'lib', 'index.js'), 'export function apply() {}\n', 'utf8');
  await writeFile(join(dir, 'lib', 'client.js'), source, 'utf8');
  return wrapperName;
}

function runDshPlugin(opts, args) {
  const bin = process.platform === 'win32' ? 'dsh.cmd' : 'dsh';
  const child = spawnSync(bin, ['plugin', '--profile', opts.profile, ...args], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (child.error || child.status !== 0) {
    console.error('[error] dsh plugin 执行失败。请确认 dsh 在 PATH 上，或手动运行上面的命令。');
    process.exit(child.status || 1);
  }
}

async function presetValidate(input) {
  try {
    const source = await readPresetSource(input);
    const v = validatePresetSource(source);
    if (v.ok) console.log(`✓ 校验通过：${v.ids.join('、')}`);
    else { console.error(`[error] ${v.error}`); process.exit(1); }
  } catch (e) {
    console.error(`[error] ${e.message}`);
    process.exit(1);
  }
}

async function presetAdd(args, opts) {
  const input = args[0];
  if (!input) { presetHelp(); process.exit(1); }
  const source = await readPresetSource(input);
  const v = validatePresetSource(source);
  if (!v.ok) { console.error(`[error] ${v.error}`); process.exit(1); }
  console.log(`校验通过：${v.ids.join('、')}`);
  const id = pickId(v, opts);
  assertNpmId(id);
  const wrapperName = `dsh-skin-preset-${id}`;
  const dir = join(presetRoot(opts), wrapperName);
  if (opts.dryRun) {
    console.log(`[dry-run] 将生成包装包：${dir}`);
    return;
  }
  await scaffoldPresetWrapper(dir, id, source);
  console.log(`包装包已生成：${dir}`);
  if (opts.noInstall) {
    console.log(`已跳过安装（--no-install）。手动安装：dsh plugin --profile ${opts.profile} add ${normalizeFileSpec(dir)}`);
    return;
  }
  runDshPlugin(opts, ['add', normalizeFileSpec(dir)]);
  console.log('安装完成，请重启 dsh 使预设生效。');
}

async function presetPack(args, opts) {
  const input = args[0];
  const outDir = opts.out ? resolve(opts.out) : process.cwd();
  if (!input) { presetHelp(); process.exit(1); }
  const source = await readPresetSource(input);
  const v = validatePresetSource(source);
  if (!v.ok) { console.error(`[error] ${v.error}`); process.exit(1); }
  const id = pickId(v, opts);
  assertNpmId(id);
  const dir = join(outDir, `dsh-skin-preset-${id}`);
  if (opts.dryRun) {
    console.log(`[dry-run] 将生成可发布包：${dir}`);
    return;
  }
  await scaffoldPresetWrapper(dir, id, source);
  console.log(`可发布包已生成：${dir}`);
  console.log('发布：cd 到该目录后 npm publish（记得去掉 package.json 里的 private: true）');
}

async function presetList(opts) {
  const dir = presetRoot(opts);
  if (!existsSync(dir)) { console.log('未安装任何预设（目录不存在：' + dir + '）。'); return; }
  const entries = await readdir(dir, { withFileTypes: true });
  let found = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const clientPath = join(dir, entry.name, 'lib', 'client.js');
    if (!existsSync(clientPath)) continue;
    found++;
    try {
      const source = await readFile(clientPath, 'utf8');
      const v = validatePresetSource(source);
      console.log(`- ${v.ok ? '✓' : '✗'} ${entry.name}  ${v.ok ? v.ids.join('、') : v.error}`);
    } catch (e) {
      console.log(`- ? ${entry.name}（读取失败：${e.message}）`);
    }
  }
  if (!found) console.log('未安装任何预设。');
}

// ---- 社区注册表（registry.json）：发现与安装 ----
async function fetchRegistry(opts) {
  const url = opts.registry || DEFAULT_REGISTRY;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`注册表下载失败：HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.presets) ? data.presets : []);
  if (!Array.isArray(list)) throw new Error('注册表格式不正确（需要数组或 { presets: [...] }）');
  return list;
}

async function presetSearch(args, opts) {
  const kw = String(args[0] || '').toLowerCase();
  let list;
  try {
    list = await fetchRegistry(opts);
  } catch (e) {
    console.error(`[error] ${e.message}`);
    process.exit(1);
  }
  const hits = kw
    ? list.filter((p) =>
        String(p.id || '').toLowerCase().includes(kw) ||
        String(p.name || '').toLowerCase().includes(kw) ||
        String(p.desc || '').toLowerCase().includes(kw))
    : list;
  if (!hits.length) { console.log('没有匹配的社区预设。'); return; }
  for (const p of hits) {
    console.log(`- ${p.id}  ${p.name}  (${p.package})  by ${p.author || '?'}`);
    if (p.desc) console.log(`    ${p.desc}`);
  }
}

async function presetInstall(args, opts) {
  const target = args[0];
  if (!target) { presetHelp(); process.exit(1); }
  let pkgName = target;
  // 裸 id（无 @、无 /）：先查社区注册表，命中则解析成 npm 包名
  if (/^[a-zA-Z0-9_-]+$/.test(target)) {
    try {
      const list = await fetchRegistry(opts);
      const hit = list.find((p) => p.id === target);
      if (hit && hit.package) pkgName = hit.package;
    } catch (e) {
      console.warn(`[warn] 注册表不可用（${e.message}），按 npm 包名处理。`);
    }
  }
  if (opts.dryRun) {
    console.log(`[dry-run] 将安装：dsh plugin --profile ${opts.profile} add ${pkgName}`);
    return;
  }
  runDshPlugin(opts, ['add', pkgName]);
  console.log(`已安装 ${pkgName}。请重启 dsh 后，在换肤中心选择对应预设。`);
}

async function presetNew(args, opts) {
  const id = args[0];
  if (!id) { presetHelp(); process.exit(1); }
  assertNpmId(id);
  const wrapperName = `dsh-skin-preset-${id}`;
  const dir = opts.out ? join(resolve(opts.out), wrapperName) : join(process.cwd(), wrapperName);
  const source = [
    `// ${wrapperName} — 平台协议 v1 预设（格式见 docs/PRESET_FORMAT.md，社区注册见 COMMUNITY.md）`,
    'window.__DSH_SKIN_PRESETS__ = window.__DSH_SKIN_PRESETS__ || {};',
    `window.__DSH_SKIN_PRESETS__['${id}'] = {`,
    `  format: 1,`,
    `  id: '${id}',`,
    `  name: '你的预设名',`,
    `  desc: '一句话描述',`,
    `  author: '你的名字',`,
    `  version: '1.0.0',`,
    '  render: function (ctx) {',
    '    // ctx: { g, w, h, mx, my, dt, t, colors } — g 是垫在应用之下的透明 canvas',
    '    ctx.g.beginPath();',
    '    ctx.g.arc(ctx.mx, ctx.my, 20, 0, Math.PI * 2);',
    "    ctx.g.fillStyle = 'rgba(255,255,255,0.5)';",
    '    ctx.g.fill();',
    '  },',
    '  // 可选：onEnter / onExit / onPointerMove / onPointerDown / canvasFilter',
    '};',
    '',
  ].join('\n');
  if (opts.dryRun) {
    console.log(`[dry-run] 将生成预设包：${dir}`);
    return;
  }
  await scaffoldPresetWrapper(dir, id, source);
  console.log(`预设包已生成：${dir}`);
  console.log('步骤：编辑 render → preset validate lib/client.js → 本地试用 preset add → npm publish → 到 registry.json 加一行（见 COMMUNITY.md）');
}

async function presetRemove(args, opts) {
  const id = args[0];
  if (!id) { presetHelp(); process.exit(1); }
  const wrapperName = `dsh-skin-preset-${id}`;
  const dir = join(presetRoot(opts), wrapperName);
  if (opts.dryRun) {
    console.log(`[dry-run] 将移除：${dir}`);
    return;
  }
  if (!opts.noInstall) runDshPlugin(opts, ['remove', wrapperName]);
  await rm(dir, { recursive: true, force: true });
  console.log(`已移除 ${wrapperName}（请重启 dsh）。`);
}

// 从子命令参数里提取位置参数（过滤掉 --flag 及其取值，任意顺序皆可）
const FLAG_WITH_VALUE = new Set(['--profile', '-p', '--dsh-home', '--id', '--out', '--registry', '--version', '-v', '--file', '-f', '--dsh-version']);
const FLAG_BARE = new Set(['--no-install', '--dry-run', '--strict', '--help', '-h', '--status', '--uninstall']);
function positionalArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (FLAG_WITH_VALUE.has(a)) { i += 1; continue; }
    if (FLAG_BARE.has(a) || a.startsWith('--') || a.startsWith('-')) continue;
    out.push(a);
  }
  return out;
}

async function presetMain(args) {
  const action = args[0] || 'help';
  const opts = parseArgs(args.slice(1));
  const pos = positionalArgs(args.slice(1));
  if (action === 'help' || action === '-h' || action === '--help' || opts.help) {
    presetHelp();
    return;
  }
  if (action === 'validate') await presetValidate(pos[0]);
  else if (action === 'add') await presetAdd(pos, opts);
  else if (action === 'pack') await presetPack(pos, opts);
  else if (action === 'new') await presetNew(pos, opts);
  else if (action === 'search') await presetSearch(pos, opts);
  else if (action === 'install') await presetInstall(pos, opts);
  else if (action === 'list') await presetList(opts);
  else if (action === 'remove') await presetRemove(pos, opts);
  else {
    console.error(`未知子命令：${action}`);
    presetHelp();
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'preset') {
    await presetMain(argv.slice(1));
    return;
  }

  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const pkgPath = profilePackagePath(opts);
  const { raw, pkg } = await readProfilePackage(pkgPath);

  if (opts.status) {
    printStatus(pkg, pkgPath);
    return;
  }

  if (opts.uninstall) {
    delete pkg.dependencies[PKG_NAME];
    pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((item) => item !== PKG_NAME);
    console.log(`已从配置中移除 ${PKG_NAME}`);
  } else {
    verifyDshCompat(opts);
    const ownVersion = await readOwnVersion();
    const spec = opts.file
      ? normalizeFileSpec(opts.file)
      : (opts.version || '^' + ownVersion);

    pkg.dependencies[PKG_NAME] = spec;
    if (!pkg.dsh.profile.bundles.includes(PKG_NAME)) {
      pkg.dsh.profile.bundles.push(PKG_NAME);
    }
    console.log(`依赖已写入：${PKG_NAME} -> ${spec}`);
  }

  if (opts.dryRun) {
    console.log('[dry-run] 以下内容不会落盘：');
    console.log(JSON.stringify(pkg, null, 2));
    return;
  }

  const profileDir = join(opts.dshHome, 'profiles', opts.profile);
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`已更新：${pkgPath}`);

  if (opts.noInstall) return;

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  console.log('正在运行 pnpm install ...');
  const child = spawnSync(pnpm, ['install'], { cwd: profileDir, stdio: 'inherit', shell: process.platform === 'win32' });

  if (child.error || child.status !== 0) {
    // 安装失败时恢复原文件，避免留下一个无法安装的 package.json。
    await writeFile(pkgPath, raw, 'utf8');
    console.error(`安装失败，已恢复原配置：${pkgPath}`);
    if (child.error) {
      console.error(`无法运行 pnpm，请手动执行：cd "${profileDir}" && pnpm install`);
    } else {
      console.error('pnpm install 退出码非 0，请检查上方输出。');
    }
    process.exit(child.status || 1);
  }

  console.log('安装完成，请重启 dsh 使插件生效。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
