import { ParsedPickNext, ParsedPickSubmit } from "./lib/util/parseLog";
import { WebSocket, WebSocketServer } from "ws";
import { MtgaLogWatcher, WatcherEvent } from "./lib/MtgaLogWatcher";
import { getPlayerLogPath } from "./lib/util/getPaths";
import { getAllowedOrigins, isAllowedOrigin } from "./lib/websocketOrigin";

/** 解析済みピックを、履歴保存とWebSocket配信で共用するイベント形式に変換する。 */
const createJsonPickEvent = (data: ParsedPickNext | ParsedPickSubmit) => {
  return {
    type: data.type,
    payload: data,
  };
};

const logPath = getPlayerLogPath();
const eventHistory: ReturnType<typeof createJsonPickEvent>[] = [];

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
// 新規接続には収集済みの履歴を送り、UIが現在のピック状態を復元できるようにする。
wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocketクライアントが接続しました。");
  // 接続時にいままでの読み込んだイベントを返す
  ws.send(JSON.stringify({ type: "EventHistory", payload: eventHistory }));
  // クライアントの切断を記録する。
  ws.on("close", () => {
    console.log("WebSocketクライアントが切断しました。");
  });
});

// ログ監視
const watcher = new MtgaLogWatcher(logPath);
// 受信したピックを履歴へ追加し、接続中のクライアントへ即時配信する。
const broadcastPick = (data: ParsedPickNext | ParsedPickSubmit) => {
  console.log("ピックを受信しました:", data);

  const jsonEventPickNext = createJsonPickEvent(data);
  eventHistory.push(jsonEventPickNext);

  // 切断処理中のクライアントには送信しない。
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(jsonEventPickNext));
  });
};
watcher.on(WatcherEvent.PickNext, broadcastPick);
watcher.on(WatcherEvent.PickSubmit, broadcastPick);
watcher.on(WatcherEvent.Reset, () => { eventHistory.length = 0; });

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
