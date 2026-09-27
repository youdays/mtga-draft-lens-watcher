import { statSync, Stats } from "fs";
import { EventEmitter } from "events";
import { Tail } from "tail";
import { ParsedEvent, PlayerLogParser } from "./util/parseLog";
import { validatePlayerLogPath } from "./util/getPaths";

export const WatcherEvent = { ...ParsedEvent, Error: "watchError", Reset: "logReset" } as const;
const POLL_INTERVAL_MS = 100;

// tail 2.2.6の公開型にない監視コールバックだけを補う。オフセットと読み取り処理には触れない。
interface TailPolling { change(): void; emit(event: "error", error: unknown): boolean; }
const tailPolling = Tail.prototype as unknown as TailPolling;

/** tailのポーリング通知で世代交代を検出し、古いカーソルと部分行を持ち越さない。 */
class PlayerLogTail extends Tail {
  onReset?: () => void;
  watchFileEvent(current: Stats, previous: Stats): void {
    if (current.nlink === 0 || current.ino !== previous.ino || current.dev !== previous.dev || current.size < previous.size) {
      this.onReset?.();
      return;
    }
    // fs.watchFileの初回stat前の追記も、tail自身の読込位置から回収する。
    try { tailPolling.change.call(this); }
    catch (error) { tailPolling.emit.call(this, "error", error); }
  }
}

/** 固定パスのPlayer.logを監視し、読み取りと部分行の結合をtailに任せる。 */
export class MtgaLogWatcher extends EventEmitter {
  public static readonly EVENT_PICK_NEXT = WatcherEvent.PickNext;
  public static readonly EVENT_PICK_SUBMIT = WatcherEvent.PickSubmit;
  private tailer?: PlayerLogTail;
  private retryTimer?: NodeJS.Timeout;
  private initialCheckTimer?: NodeJS.Timeout;
  private watching = false;

  constructor(private readonly logPath: string) { super(); }

  watch(): void {
    if (this.watching) return;
    validatePlayerLogPath(this.logPath);
    this.watching = true;
    try {
      // 起動前の過去ドラフトを再生せず、今回受信したイベントだけを履歴にする。
      this.startTail(false);
      console.log(`Player.logの監視を開始しました: ${this.logPath}`);
    } catch (error) { this.unwatch(); throw error; }
  }

  private startTail(fromBeginning: boolean): void {
    const initialStats = statSync(this.logPath);
    const parser = new PlayerLogParser();
    const tailer = new PlayerLogTail(this.logPath, {
      fromBeginning,
      useWatchFile: true,
      fsWatchOptions: { interval: POLL_INTERVAL_MS },
      follow: true,
      flushAtEOF: false,
    });
    this.tailer = tailer;
    tailer.onReset = () => {
      if (this.tailer !== tailer) return;
      this.stopTail();
      this.emit(WatcherEvent.Reset);
      this.resume();
    };
    tailer.on("line", (line: string) => {
      if (this.tailer !== tailer) return;
      const parsed = parser.parse(line);
      if (parsed.type !== ParsedEvent.Unknown) this.emit(parsed.type, parsed);
    });
    tailer.on("error", (error: Error) => {
      if (this.tailer !== tailer) return;
      // 再作成までの一時的な消失は異常終了せず待機する。
      if ((error as NodeJS.ErrnoException).code === "ENOENT") tailer.onReset?.();
      else this.emit(WatcherEvent.Error, new Error(`Player.logの読み取りに失敗しました: ${this.logPath}。PLAYER_LOG_PATHと読み取り権限を確認してください。`, { cause: error }));
    });
    // 監視登録時の非同期statが追記後を初期値にしても、一度は読込位置と照合する。
    this.initialCheckTimer = setTimeout(() => {
      if (this.tailer !== tailer) return;
      try { tailer.watchFileEvent(statSync(this.logPath), initialStats); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") tailer.onReset?.();
        else this.emit(WatcherEvent.Error, error);
      }
    }, POLL_INTERVAL_MS);
  }

  /** Arenaがファイルを再作成するまで待ち、再作成分は先頭から受信する。 */
  private resume(): void {
    if (!this.watching) return;
    try {
      statSync(this.logPath);
      validatePlayerLogPath(this.logPath);
      this.startTail(true);
      console.log(`Player.logの再作成・切詰め後の監視を再開しました: ${this.logPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.retryTimer = setTimeout(() => this.resume(), POLL_INTERVAL_MS);
      } else {
        this.emit(WatcherEvent.Error, error);
      }
    }
  }

  private stopTail(): void {
    clearTimeout(this.initialCheckTimer);
    this.initialCheckTimer = undefined;
    const tailer = this.tailer;
    this.tailer = undefined;
    tailer?.unwatch();
  }

  /** 停止後に非同期の読み取りが終わっても通知せず、再作成待機も解除する。 */
  unwatch(): void {
    this.watching = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.stopTail();
  }
}
