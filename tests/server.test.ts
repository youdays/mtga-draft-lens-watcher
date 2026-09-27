import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { WebSocket } from "ws";

test("WebSocketへ今回受信した履歴とパック・ピックイベントを配信し正常停止する", { timeout: 15000 }, async () => {
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
      const finish = (error?: Error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
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
            if (event.type === "EventHistory") {
              assert.deepEqual(event.payload, []);
              appendFileSync(join(dir, "Player.log"), line(2));
            } else if (event.type === "PickNext") {
              assert.equal(event.payload.pickNumber, 2);
              assert.deepEqual(event.payload.draftPack, ["123"]);
              appendFileSync(join(dir, "Player.log"), '[UnityCrossThreadLogger]==> Event_PlayerDraftMakePick {"Pack":1,"Pick":2,"GrpId":123}\n');
            } else {
              assert.equal(event.type, "PickSubmit");
              assert.deepEqual(event.payload, { type: "PickSubmit", format: "PremierDraft", packNumber: 1, pickNumber: 2, pickCard: "123" });
              reconnected = new WebSocket("ws://127.0.0.1:5500", { origin: "http://localhost:3000" });
              reconnected.on("error", finish);
              reconnected.once("message", raw => {
                try {
                  const history = JSON.parse(raw.toString());
                  assert.equal(history.type, "EventHistory");
                  assert.deepEqual(history.payload.map((item: { type: string }) => item.type), ["PickNext", "PickSubmit"]);
                  assert.equal(history.payload[0].payload.pickNumber, 2);
                  finish();
                } catch (error) { finish(error as Error); }
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
