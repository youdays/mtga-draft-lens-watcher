import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { WebSocket } from "ws";

function expectOriginRejected(origin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket("ws://127.0.0.1:5500", origin === undefined ? {} : { origin });
    client.once("open", () => { client.terminate(); reject(new Error("未許可Originが接続できました")); });
    client.once("error", reject);
    client.once("unexpected-response", (_request, response) => {
      response.resume();
      try { assert.equal(response.statusCode, 403); resolve(); }
      catch (error) { reject(error); }
      finally { client.terminate(); }
    });
  });
}

test("WebSocketへcurrent full DraftStateと再接続時の同じStateを配信し正常停止する", { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-server-"));
  /** 配信内容をピック番号で識別できる検証用ログ行を生成する。 */
  const line = (n: number) => `Draft.Notify {"SelfPack":1,"SelfPick":${n},"PackCards":"123"}\n`;
  writeFileSync(join(dir, "Player.log"), line(1));
  const child = spawn(process.execPath, ["-r", "ts-node/register", "src/index.ts"], {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, PLAYER_LOG_PATH: join(dir, "Player.log"), ALLOWED_ORIGINS: "http://localhost:3000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<number | null>(resolve => child.once("exit", resolve));
  let ws: WebSocket | undefined;
  let reconnected: WebSocket | undefined;
  let output = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`サーバー検証がタイムアウトしました: ${output}`)), 10000);
      /** 待機タイマーを解除し、検証の成功または失敗を呼び出し元へ返す。 */
      const finish = (error?: Error) => { clearTimeout(timer); if (error) reject(error); else resolve(); };
      child.once("error", finish);
      child.once("exit", code => finish(new Error(`サーバーが終了しました: ${code} ${output}`)));
      child.stderr.on("data", data => { output += data; });
      // 起動後に接続し、過去の履歴が配信されないことを確認する。
      child.stdout.on("data", data => {
        output += data;
        if (ws || !output.includes("WebSocketサーバーを起動しました")) return;
        ws = new WebSocket("ws://127.0.0.1:5500", { origin: "http://localhost:5173" });
        ws.on("error", finish);
        // 空の初回履歴の後に追記し、パック更新とピック送信の両方を検証する。
        ws.on("message", raw => {
          try {
            const event = JSON.parse(raw.toString());
            assert.equal(event.type, "draftState");
            assert.equal(event.schemaVersion, 1);
            assert.deepEqual(Object.keys(event).sort(), ["data", "schemaVersion", "type"]);
            if (event.data.observations.length === 0) {
              assert.deepEqual(event.data, { draftId: null, eventName: null, currentPickedCardIds: [], observations: [] });
              appendFileSync(join(dir, "Player.log"), line(2));
            } else if (event.data.observations[0].pickedCardIds === null) {
              assert.deepEqual(event.data.observations[0], { packNumber: 0, pickNumber: 1, packCardIds: [123], pickedCardIds: null });
              appendFileSync(join(dir, "Player.log"), '[UnityCrossThreadLogger]==> Event_PlayerDraftMakePick {"Pack":1,"Pick":2,"GrpId":123}\n');
            } else {
              assert.equal(event.data.observations.length, 1);
              assert.deepEqual(event.data.currentPickedCardIds, [123]);
              assert.deepEqual(event.data.observations[0].pickedCardIds, [123]);
              reconnected = new WebSocket("ws://127.0.0.1:5500", { origin: "http://localhost:3000" });
              reconnected.on("error", finish);
              reconnected.once("message", async raw => {
                try {
                  assert.deepEqual(JSON.parse(raw.toString()), event);
                  await Promise.all([expectOriginRejected(), expectOriginRejected("https://evil.example"), expectOriginRejected("http://localhost.example.com")]);
                  finish();
                }
                catch (error) { finish(error as Error); }
              });
            }
          } catch (error) { finish(error as Error); }
        });
      });
    });
    child.kill("SIGTERM");
    // Windowsのchild.killはPOSIXのSIGTERMハンドラーを経由しない。
    assert.equal(await exited, process.platform === "win32" ? null : 0);
    assert.ok(output.includes(`Player.logの監視を開始しました: ${join(dir, "Player.log")}`));
  } finally {
    ws?.terminate();
    reconnected?.terminate();
    child.kill("SIGKILL");
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
