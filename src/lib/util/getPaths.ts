import * as path from "path";
import * as fs from "fs";
import { homedir } from "os";

export const Platform = { Mac: "darwin", Windows: "win32" } as const;

/** 明示指定を優先し、macOS・WindowsではOSのホーム情報から既定パスを解決する。 */
export function getPlayerLogPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  home = homedir()
): string {
  if (env["PLAYER_LOG_PATH"]?.trim()) return path.resolve(env["PLAYER_LOG_PATH"]);
  if (platform === Platform.Mac) {
    return path.join(home, "Library/Logs/Wizards of the Coast/MTGA/Player.log");
  }
  if (platform === Platform.Windows) {
    return path.win32.join(home, "AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
  }
  throw new Error("このOSのPlayer.log既定パスは未確認です。環境変数または--configで指定した設定ファイルのPLAYER_LOG_PATHにPlayer.logの絶対パスを指定してください。");
}

/** ディレクトリや読めないファイルを起動前に検出し、設定方法と元のエラーを残す。 */
export function validatePlayerLogPath(file: string): void {
  try {
    if (!fs.statSync(file).isFile()) throw new Error("通常ファイルではありません。");
    fs.accessSync(file, fs.constants.R_OK);
  } catch (cause) {
    throw new Error(`Player.logを読み込めません: ${file}。MTG Arenaを起動するとPlayer.logが作成されるはずです。起動後にもう一度確認してください。それでも見つからない、または読み込めない場合は、環境変数または--configで指定した設定ファイルのPLAYER_LOG_PATHと読み取り権限を確認してください。`, { cause });
  }
}
