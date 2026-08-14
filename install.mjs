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

function printHelp() {
  console.log(`
dsh-skin-engine 安装器

用法：
  node install.mjs                        # 使用当前包版本，写入 npm 依赖并安装
  node install.mjs --version <range>      # 指定 npm 版本范围
  node install.mjs --file <path>          # 使用本地文件夹作为依赖
  node install.mjs --status               # 查看当前安装状态
  node install.mjs --uninstall            # 卸载

参数：
  --version, -v <range>   要写入 package.json 的依赖版本范围，例如 ^0.2.0
  --file, -f <path>       本地包路径（写入 file: 依赖，无需 npm 发布）
  --profile, -p <name>    dsh profile 名称，默认 web（可用 DSH_PROFILE 覆盖）
  --dsh-home <path>       dsh 根目录，默认 ~/.dsh（可用 DSH_HOME 覆盖）
  --status                只查看安装状态，不修改任何文件
  --uninstall             从 package.json 移除依赖和 bundles 条目
  --no-install            只修改 package.json，不运行 pnpm install
  --dry-run               只打印将要写入的内容，不落盘
  --help, -h              显示本帮助
`);
}

function parseArgs(argv) {
  const opts = {
    version: null,
    file: null,
    profile: DEFAULT_PROFILE,
    dshHome: DEFAULT_DSH_HOME,
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
  return '0.2.0';
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
  const pkg = JSON.parse(raw);
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
  const child = spawnSync(pnpm, ['install'], { cwd: profileDir, stdio: 'inherit' });

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
