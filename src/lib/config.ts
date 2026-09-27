import { readFileSync } from "fs";
// 実行環境Node.js 22の標準APIを使う（既存のNode.js 20型定義には未収録）。
const { parseEnv } = require("node:util") as { parseEnv: (text: string) => Record<string, string> };

/**
 * 明示指定された設定ファイルから対応する設定を読み、プロセス環境変数の未設定項目だけを補う。
 * 設定ファイルの指定がなければ既定値に任せ、OSのホーム情報は読み込み対象にしない。
 */
export function loadConfig(filePath?: string, env: NodeJS.ProcessEnv = process.env): void {
  if (filePath === undefined) return;
  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`設定ファイルを読み込めません: ${filePath}`, { cause: error });
  }
  const settings = parseEnv(contents);
  for (const key of ["PLAYER_LOG_PATH", "ALLOWED_ORIGINS"]) {
    if (env[key] === undefined && settings[key] !== undefined) env[key] = settings[key];
  }
}
