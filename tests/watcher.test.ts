import { DraftStateReducer } from "../src/lib/draft/DraftStateReducer";
import { NormalizedDraftEvent } from "../src/lib/draft/types";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { MtgaLogWatcher, WatcherEvent } from "../src/lib/MtgaLogWatcher";

const line = (pick: number) => `[UnityCrossThreadLogger]Draft.Notify {"SelfPack":1,"SelfPick":${pick},"PackCards":"123,456"}\n`;
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 150; i++) { if (check()) return; await delay(20); }
  assert.ok(check(), "監視イベントが期限内に届きませんでした");
}

test("起動前の履歴を配信せず、追記・分割行・不正JSON・未知イベントを処理して停止する", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-player-"));
  const file = join(dir, "Player.log");
  writeFileSync(file, line(99));
  const watcher = new MtgaLogWatcher(file);
  const picks: number[] = [];
  const errors: Error[] = [];
  const normalized: NormalizedDraftEvent[] = [];
  watcher.on(WatcherEvent.DraftEvent, event => normalized.push(event));
  watcher.on(WatcherEvent.PickNext, data => picks.push(data.pickNumber));
  watcher.on(WatcherEvent.Error, error => errors.push(error));
  try {
    watcher.watch(); watcher.watch();
    await delay(200);
    assert.deepEqual(picks, []);
    appendFileSync(file, line(1) + line(2).slice(0, 40));
    await waitFor(() => picks.length === 1);
    appendFileSync(file, line(2).slice(40) + 'Draft.Notify {不正JSON}\n未知イベント {}\n' + line(3));
    await waitFor(() => picks.length === 3);
    writeFileSync(join(dir, "other.log"), line(99));
    await delay(200);
    assert.deepEqual(picks, [1, 2, 3]);
    assert.deepEqual(normalized.map(e => e.type === "DraftPackObserved" ? e.pickNumber : -1), [0, 1, 2]);
    assert.deepEqual(errors, []);
    watcher.unwatch(); watcher.unwatch();
    appendFileSync(file, line(4));
    await delay(250);
    assert.deepEqual(picks, [1, 2, 3]);
    assert.equal(normalized.length, 3);
  } finally { watcher.unwatch(); rmSync(dir, { recursive: true, force: true }); }
});

for (const mode of ["短い内容への切詰め", "空への切詰め", "同サイズの置換", "大きいファイルへの置換", "削除後の再作成"] as const) {
  test(`${mode}でも先頭を取りこぼさず、旧部分行を混ぜず、一度ずつ受信する`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "mtga-restart-"));
    const file = join(dir, "Player.log");
    writeFileSync(file, "");
    const watcher = new MtgaLogWatcher(file);
    const picks: number[] = [];
    const errors: Error[] = [];
    let resets = 0;
    const reducer = new DraftStateReducer();
    watcher.on(WatcherEvent.DraftEvent, event => reducer.reduce(event));
    watcher.on(WatcherEvent.PickNext, data => picks.push(data.pickNumber));
    watcher.on(WatcherEvent.Reset, () => resets++);
    watcher.on(WatcherEvent.Error, error => errors.push(error));
    try {
      watcher.watch();
      const initial = line(1) + '古い未完了行';
      appendFileSync(file, initial);
      await waitFor(() => picks.length === 1);
      if (mode === "短い内容への切詰め") writeFileSync(file, line(2));
      else if (mode === "空への切詰め") {
        writeFileSync(file, "");
        await waitFor(() => resets === 1);
        appendFileSync(file, line(2));
      } else if (mode === "削除後の再作成") {
        renameSync(file, join(dir, "Player-prev.log"));
        await waitFor(() => resets === 1);
        await delay(200);
        writeFileSync(file, line(2));
      } else {
        const replacement = join(dir, "replacement");
        writeFileSync(replacement, line(2) + (mode === "同サイズの置換" ? 'x'.repeat(Buffer.byteLength('古い未完了行')) : '長い置換ファイル'.repeat(100)));
        renameSync(replacement, file);
      }
      await waitFor(() => picks.length === 2);
      appendFileSync(file, '\n' + line(3));
      await waitFor(() => picks.length === 3);
      await delay(250);
      assert.deepEqual(picks, [1, 2, 3]);
      assert.equal(resets, 1);
      assert.deepEqual(reducer.getState().observations.map(o => o.pickNumber), [0, 1, 2]);
      assert.deepEqual(errors, []);
    } finally { watcher.unwatch(); rmSync(dir, { recursive: true, force: true }); }
  });
}

test("再作成待機中に停止した場合はファイルが戻っても受信しない", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-stop-"));
  const file = join(dir, "Player.log");
  writeFileSync(file, "");
  const watcher = new MtgaLogWatcher(file);
  let resets = 0;
  const picks: unknown[] = [];
  watcher.on(WatcherEvent.Reset, () => resets++);
  watcher.on(WatcherEvent.PickNext, data => picks.push(data));
  try {
    watcher.watch();
    rmSync(file);
    await waitFor(() => resets === 1);
    watcher.unwatch();
    writeFileSync(file, line(1));
    await delay(300);
    assert.deepEqual(picks, []);
  } finally { watcher.unwatch(); rmSync(dir, { recursive: true, force: true }); }
});

test("再作成後の非同期読み取り中に停止しても残りの行を配信しない", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-reading-"));
  const file = join(dir, "Player.log");
  writeFileSync(file, "");
  const watcher = new MtgaLogWatcher(file);
  const picks: number[] = [];
  watcher.on(WatcherEvent.PickNext, data => { picks.push(data.pickNumber); watcher.unwatch(); });
  try {
    watcher.watch();
    const replacement = join(dir, "replacement");
    writeFileSync(replacement, line(1).repeat(2000));
    renameSync(replacement, file);
    await waitFor(() => picks.length === 1);
    await delay(250);
    assert.deepEqual(picks, [1]);
  } finally { watcher.unwatch(); rmSync(dir, { recursive: true, force: true }); }
});
