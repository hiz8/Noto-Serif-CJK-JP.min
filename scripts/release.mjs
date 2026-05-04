#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const WEIGHTS = [
  ['ExtraLight', 'ExtraLight'],
  ['Light', 'Light'],
  ['Regular', 'Regular'],
  ['Medium', 'Medium'],
  ['SemiBold', 'SemiBold'],
  ['Bold', 'Bold'],
  ['Black', 'Black'],
  ['Variable', 'VF'],
];

const SIZE_TABLE_START = '<!-- size-table:start -->';
const SIZE_TABLE_END = '<!-- size-table:end -->';

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

function runCapture(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `\`${mb.toFixed(2)} MB\``;
  const kb = bytes / 1024;
  return `\`${Math.round(kb)} KB\``;
}

async function preflight(version, dryRun) {
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) {
    fail(`invalid version: ${version} (expected e.g. 3.0.0)`);
  }
  const status = runCapture('git', ['status', '--porcelain']);
  if (status.status !== 0) fail('git status failed');
  if (status.stdout.trim() !== '') {
    fail(`working tree is not clean:\n${status.stdout}`);
  }
  const tag = runCapture('git', [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/tags/${version}`,
  ]);
  if (tag.status === 0) {
    fail(`tag ${version} already exists`);
  }
  const srcEntries = await readdir(join(repoRoot, 'src')).catch(() => []);
  const fonts = srcEntries.filter((f) => /\.(otf|ttf)$/i.test(f));
  if (fonts.length === 0) {
    fail('src/ contains no .otf or .ttf files');
  }
  console.log(
    `preflight ok (version ${version}${dryRun ? ', dry-run' : ''}, ${fonts.length} source font(s))`,
  );
}

async function runBuild() {
  console.log('--- build ---');
  run('node', ['build.js']);
}

async function copyDistToDocs() {
  console.log('--- copy dist/*.min.* -> docs/fonts/ ---');
  const distDir = join(repoRoot, 'dist');
  const docsDir = join(repoRoot, 'docs', 'fonts');
  const files = await readdir(distDir);
  const targets = files.filter((f) => /\.min\.(ttf|woff|woff2)$/i.test(f));
  for (const f of targets) {
    await copyFile(join(distDir, f), join(docsDir, f));
  }
  console.log(`copied ${targets.length} file(s)`);
}

function parseOtfColumn(readme) {
  const map = new Map();
  const start = readme.indexOf(SIZE_TABLE_START);
  const end = readme.indexOf(SIZE_TABLE_END);
  if (start === -1 || end === -1) return map;
  const block = readme.slice(start, end);
  const lineRe = /^\|\s*(\w+)\s*\|\s*(`[^`]+`|-)\s*\|/gm;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    const [, label, value] = m;
    if (label === 'Weight') continue;
    map.set(label, value);
  }
  return map;
}

async function buildSizeTable(fontsDir) {
  const readmePath = join(repoRoot, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  const otfMap = parseOtfColumn(readme);
  const lines = [
    '| Weight     | otf (Original) | ttf       | woff2     |',
    '| :--------- | :------------- | :-------- | :-------- |',
  ];
  for (const [label, fileTag] of WEIGHTS) {
    const ttfStat = await stat(
      join(fontsDir, `NotoSerifCJKjp-${fileTag}.min.ttf`),
    );
    const woff2Stat = await stat(
      join(fontsDir, `NotoSerifCJKjp-${fileTag}.min.woff2`),
    );
    const otf = otfMap.get(label) ?? '`-`';
    lines.push(
      `| ${label.padEnd(10)} | ${otf.padEnd(14)} | ${formatSize(ttfStat.size).padEnd(9)} | ${formatSize(woff2Stat.size).padEnd(9)} |`,
    );
  }
  return lines.join('\n');
}

async function updateReadme(table, dryRun) {
  const readmePath = join(repoRoot, 'README.md');
  const original = await readFile(readmePath, 'utf8');
  const startIdx = original.indexOf(SIZE_TABLE_START);
  const endIdx = original.indexOf(SIZE_TABLE_END);
  if (startIdx === -1 || endIdx === -1) {
    fail(
      `README.md is missing size-table markers (${SIZE_TABLE_START} / ${SIZE_TABLE_END})`,
    );
  }
  const before = original.slice(0, startIdx + SIZE_TABLE_START.length);
  const after = original.slice(endIdx);
  const next = `${before}\n${table}\n${after}`;
  if (dryRun) {
    console.log('--- README size table (preview) ---');
    console.log(table);
    return;
  }
  if (next === original) {
    console.log('README.md size table unchanged');
    return;
  }
  await writeFile(readmePath, next);
  console.log('README.md size table updated');
}

async function updatePackageVersion(version, dryRun) {
  const pkgPath = join(repoRoot, 'package.json');
  const original = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(original);
  const previous = pkg.version;
  console.log(`package.json version: ${previous} -> ${version}`);
  if (dryRun) return;
  pkg.version = version;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function gitRelease(version) {
  console.log('--- git ---');
  run('git', ['add', 'docs/fonts/', 'README.md', 'package.json']);
  run('git', ['commit', '-m', `Release ${version}`]);
  run('git', ['tag', version]);
  run('git', ['push']);
  run('git', ['push', '--tags']);
}

async function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values.version) fail('--version <semver> is required');
  const version = values.version;
  const dryRun = values['dry-run'];

  await preflight(version, dryRun);
  await runBuild();

  if (dryRun) {
    const table = await buildSizeTable(join(repoRoot, 'dist'));
    await updateReadme(table, true);
    await updatePackageVersion(version, true);
    console.log('\n--- dry-run summary ---');
    console.log(
      'No files modified beyond dist/. Re-run without --dry-run to publish.',
    );
    return;
  }

  await copyDistToDocs();
  const table = await buildSizeTable(join(repoRoot, 'docs', 'fonts'));
  await updateReadme(table, false);
  await updatePackageVersion(version, false);
  gitRelease(version);
  console.log(
    `\nReleased ${version}. GitHub Actions will create the Release shortly.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
