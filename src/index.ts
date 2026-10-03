import { DraftStateReducer } from "./lib/draft/DraftStateReducer";
import { NormalizedDraftEvent, draftStateEnvelope } from "./lib/draft/types";
import { WebSocket, WebSocketServer } from "ws";
import { MtgaLogWatcher, WatcherEvent } from "./lib/MtgaLogWatcher";
import { getPlayerLogPath } from "./lib/util/getPaths";
import { getAllowedOrigins, isAllowedOrigin } from "./lib/websocketOrigin";

const logPath = getPlayerLogPath();
const reducer = new DraftStateReducer();

// Websocketサーバー
const PORT = 5500;
const HOST = "127.0.0.1";
const allowedOrigins = getAllowedOrigins();
const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  // 接続確立前にOriginを照合し、許可されていない接続を拒否する。
  verifyClient: (info, done) => {
    const origin = info.origin;
    if (isAllowedOrigin(origin, allowedOrigins)) {
      done(true);
      return;
    }

    console.warn(`拒否したWebSocket接続元: ${origin ?? "Originなし"}`);
    done(false, 403, "許可されていない接続元です。");
  },
}, () => {
  // 待ち受け開始後に接続先と許可元を案内する。
  console.log(`WebSocketサーバーを起動しました: ws://${HOST}:${PORT}`);
  console.log(`許可した接続元: ${[...allowedOrigins].join(", ")}、http://localhost と http://127.0.0.1（任意のポート）`);
});
// 接続・再接続とも現在のfull DraftStateを送信する。
wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocketクライアントが接続しました。");
  // 更新時と同一Envelopeで配信する
  ws.send(JSON.stringify(draftStateEnvelope(reducer.getState())));
  // クライアントの切断を記録する。
  ws.on("close", () => {
    console.log("WebSocketクライアントが切断しました。");
  });
});

// ログ監視
const watcher = new MtgaLogWatcher(logPath);
// 正規化イベントだけをReducerへ渡し、現在の全量Stateを送信する。
watcher.on(WatcherEvent.DraftEvent, (event: NormalizedDraftEvent) => {
  const before = JSON.stringify(reducer.getState());
  const state = reducer.reduce(event);
  if (before === JSON.stringify(state)) return;
  const message = JSON.stringify(draftStateEnvelope(state));
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
});
// ファイル世代交代はAdapterのみリセット。取得済み事実はDraft境界まで保持する。

/** ログ監視と全クライアント接続を閉じ、サーバーの待ち受けを終了する。 */
const stop = () => {
  watcher.unwatch();
  for (const client of wss.clients) client.terminate();
  wss.close();
};
// 監視を継続できない場合は理由を表示し、異常終了として資源を解放する。
watcher.on(WatcherEvent.Error, (error: Error) => {
  console.error("ログ監視中にエラーが発生しました:", error);
  process.exitCode = 1;
  stop();
});
try {
  watcher.watch();
  console.log(`Player.logの追記を待っています: ${logPath}`);
} catch (error) {
  console.error("ログ監視を開始できません:", error);
  process.exitCode = 1;
  stop();
}
// 待ち受け失敗などのサーバー障害でも、開始済みのログ監視を解除する。
wss.on("error", (error) => {
  console.error("WebSocketサーバーでエラーが発生しました:", error);
  process.exitCode = 1;
  stop();
});
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
