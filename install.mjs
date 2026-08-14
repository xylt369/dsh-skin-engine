#!/usr/bin/env node
/**
 * dsh-skin-engine 一键部署脚本
 *
 * 用法：
 *   node install.mjs                                  # 默认装到 ~/.dsh/profiles/web，依赖 npm 版本 ^0.1.0
 *   node install.mjs --profile <profile目录>          # 指定 profile（例如别的机器上 DSH_HOME 不同）
 *   node install.mjs --file <本地包目录>              # 不发布 npm，直接使用本地包目录（file: 依赖）
 *   node install.mjs --version <semver>              # 指定 npm 版本范围（默认 ^0.1.0）
 *
 * 它做三件事：
 *   1. 在 profile 的 package.json dependencies 中加入 @yeesy369/dsh-skin-engine
 *   2. 在 dsh.profile.bundles 中加入 @yeesy369/dsh-skin-engine（触发包里 cordis.patch.yml 自动挂载）
 *   3. 在 profile 目录执行 pnpm install
 *
 * 完成后重启 dsh（--profile web）即生效。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PKG_NAME = '@yeesy369/dsh-skin-engine';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const profile = resolve(argValue('--profile') || join(os.homedir(), '.dsh', 'profiles', 'web'));
const filePkg = argValue('--file');
const version = argValue('--version') || '^0.1.0';
const spec = filePkg ? 'file:' + resolve(filePkg).replace(/\\/g, '/') : version;

const pkgJsonPath = join(profile, 'package.json');
if (!existsSync(pkgJsonPath)) {
  console.error('[dsh-skin-engine] 找不到 profile package.json: ' + pkgJsonPath);
  console.error('  请确认 DSH profile 目录，或用 --profile <目录> 指定。');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
const prev = pkg.dependencies[PKG_NAME];
pkg.dependencies[PKG_NAME] = spec;
pkg.dsh = pkg.dsh || {};
pkg.dsh.profile = pkg.dsh.profile || {};
pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
if (!pkg.dsh.profile.bundles.includes(PKG_NAME)) pkg.dsh.profile.bundles.push(PKG_NAME);

writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('[dsh-skin-engine] 已更新 ' + pkgJsonPath);
console.log('  dependencies.' + PKG_NAME + ' = ' + spec + (prev ? '（原为 ' + prev + '）' : ''));
console.log('  bundles: ' + pkg.dsh.profile.bundles.join(', '));

console.log('[dsh-skin-engine] 正在 pnpm install ...');
try {
  execSync('pnpm install', { cwd: profile, stdio: 'inherit' });
} catch (e) {
  console.error('[dsh-skin-engine] pnpm install 失败，请在 ' + profile + ' 目录手动执行 pnpm install。');
  process.exit(1);
}
console.log('[dsh-skin-engine] 安装完成。');
console.log('  下一步：重启 dsh（例如 dsh --profile web），侧边栏底部会出现 🎨 换肤中心 按钮。');
