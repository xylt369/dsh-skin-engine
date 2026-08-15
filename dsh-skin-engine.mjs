#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
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
  --version, -v <range>   要写入 package.json 的依赖版本范围，例如 ^0.4.0
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
    else if (arg === '--status') opts.status = true;
    else if (arg === '--uninstall') opts.uninstall = true;
    else if (arg === '--no-install') opts.noInstall = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.warn(`[warn] 忽略未知参数：${arg}`);
    }
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
  return '0.4.0';
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
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
