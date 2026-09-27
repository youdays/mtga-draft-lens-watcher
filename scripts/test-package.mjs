import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'mtga-package-'));
const npm = (args, cwd = root) => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
  cwd, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
});
let child;
let socket;
let exited;
try {
  const [pack] = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary]));
  const paths = pack.files.map(file => file.path);
  assert(paths.includes('dist/cli.js'));
  const sourceManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(sourceManifest.license, 'MIT');
  assert.notEqual(sourceManifest.private, true);
  assert(paths.includes('LICENSE'));
  for (const path of paths) {
    assert(/^(dist\/.*\.js|package\.json|README\.md|LICENSE|\.env\.example)$/.test(path), `配布対象外のファイル: ${path}`);
  }
  writeFileSync(join(temporary, 'package.json'), '{"private":true}');
  npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, pack.filename)], temporary);
  const installed = join(temporary, 'node_modules', '@youdays', 'mtga-draft-lens-watcher');
  const cli = join(installed, 'dist', 'cli.js');
  const bin = join(temporary, 'node_modules', '.bin', process.platform === 'win32' ? 'mtga-draft-lens-watcher.cmd' : 'mtga-draft-lens-watcher');
  assert.match(execFileSync(bin, ['--help'], { encoding: 'utf8', cwd: temporary, shell: process.platform === 'win32' }), /使い方/);
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.license, 'MIT');
  assert.equal(readFileSync(join(installed, 'LICENSE'), 'utf8'), readFileSync(join(root, 'LICENSE'), 'utf8'));
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8', cwd: temporary }).trim(), manifest.version);
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8', cwd: temporary }), /使い方/);
  assert.throws(() => execFileSync(process.execPath, [cli, '--config', join(temporary, 'missing.env')], { stdio: 'pipe' }));
  assert.throws(() => execFileSync(process.execPath, [cli, '--unknown'], { stdio: 'pipe' }));
  const log = join(temporary, 'Player.log');
  const config = join(temporary, 'watcher.env');
  writeFileSync(log, '');
  writeFileSync(config, `PLAYER_LOG_PATH="${log.replaceAll('\\', '/')}"\n`);
  const env = { ...process.env };
  delete env.PLAYER_LOG_PATH;
  delete env.ALLOWED_ORIGINS;
  child = spawn(process.execPath, [cli, '--config', config], { cwd: temporary, env, stdio: ['ignore', 'pipe', 'pipe'] });
  exited = new Promise(resolve => child.once('exit', resolve));
  const { WebSocket } = createRequire(join(installed, 'package.json'))('ws');
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`配布物の起動検証がタイムアウトしました: ${output}`)), 15000);
    const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
    child.once('error', finish);
    child.once('exit', code => finish(new Error(`配布物が途中終了しました: ${code} ${output}`)));
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      if (socket || !output.includes('WebSocketサーバーを起動しました')) return;
      socket = new WebSocket('ws://127.0.0.1:5500', { origin: 'http://localhost:5173' });
      socket.on('error', finish);
      socket.on('message', raw => {
        try {
          const event = JSON.parse(raw.toString());
          if (event.type === 'EventHistory') {
            assert.deepEqual(event.payload, []);
            appendFileSync(log, 'Draft.Notify {"SelfPack":1,"SelfPick":2,"PackCards":"123"}\n');
          } else {
            assert.equal(event.type, 'PickNext');
            assert.equal(event.payload.pickNumber, 2);
            finish();
          }
        } catch (error) { finish(error); }
      });
    });
  });
  console.log('配布物の許可リスト、開発依存なしのインストール、CLI、設定、ログ追記からWebSocket配信まで確認しました。');
} finally {
  socket?.terminate();
  child?.kill('SIGTERM');
  if (exited) await exited;
  rmSync(temporary, { recursive: true, force: true });
}
