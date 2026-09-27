#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadConfig } from "./lib/config";

// ヘルプ・バージョン表示ではログ監視やサーバーを起動しない。
try {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      config: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    console.log(`MTGA Draft Lens watcher

使い方: mtga-draft-lens-watcher [--config 設定ファイル]

  --config <パス>  指定した.env形式の設定ファイルを読む
  -h, --help      この案内を表示する
  -v, --version   バージョンを表示する

設定: PLAYER_LOG_PATH、ALLOWED_ORIGINS
環境変数を優先し、--config省略時は設定ファイルを読みません。
Node.js 22.11.0以上が必要です。停止はCtrl+Cです。`);
  } else if (values.version) {
    console.log((require("../package.json") as { version: string }).version);
  } else {
    loadConfig(values.config === undefined ? undefined : resolve(values.config));
    require("./index");
  }
} catch (error) {
  console.error("watcherを起動できません。--helpで使い方を確認してください。", error);
  process.exitCode = 1;
}
