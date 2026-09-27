import { test } from "node:test";
import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../src/lib/config";
import { getAllowedOrigins } from "../src/lib/websocketOrigin";
import { getPlayerLogPath, validatePlayerLogPath } from "../src/lib/util/getPaths";

test("明示された設定を読み、プロセスの環境変数とOS情報を優先する", () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-config-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(file, 'PLAYER_LOG_PATH="/tmp/log directory"\nALLOWED_ORIGINS=https://example.com,http://localhost:3000\nHOME=/wrong\nUSERPROFILE=C:\\wrong\n');
    const env: NodeJS.ProcessEnv = { HOME: "/real" };
    loadConfig(file, env);
    assert.equal(env["PLAYER_LOG_PATH"], "/tmp/log directory");
    assert.deepEqual([...getAllowedOrigins(env["ALLOWED_ORIGINS"])], ["https://example.com", "http://localhost:3000"]);
    assert.equal(env["HOME"], "/real"); assert.equal(env["USERPROFILE"], undefined);
    const override = { PLAYER_LOG_PATH: "/override", ALLOWED_ORIGINS: "https://override.com" };
    loadConfig(file, override);
    assert.equal(override.PLAYER_LOG_PATH, "/override");
    assert.deepEqual([...getAllowedOrigins(override.ALLOWED_ORIGINS)], ["https://override.com"]);
    loadConfig(undefined, {});
    assert.throws(() => loadConfig(join(dir, "missing"), {}), /設定ファイルを読み込めません/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("macOS・Windowsの既定パスと明示指定を解決し、その他のOSは設定を求める", () => {
  assert.equal(getPlayerLogPath({}, "darwin", "/Users/test"), "/Users/test/Library/Logs/Wizards of the Coast/MTGA/Player.log");
  assert.equal(getPlayerLogPath({ PLAYER_LOG_PATH: "/tmp/Player.log" }, "linux"), "/tmp/Player.log");
  assert.equal(getPlayerLogPath({}, "win32", "C:\\Users\\test"), "C:\\Users\\test\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log");
  assert.equal(getPlayerLogPath({ PLAYER_LOG_PATH: " " }, "win32", "D:\\Users\\test"), "D:\\Users\\test\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log");
  assert.equal(getPlayerLogPath({ PLAYER_LOG_PATH: "/tmp/custom/Player.log" }, "win32"), resolve("/tmp/custom/Player.log"));
  assert.throws(() => getPlayerLogPath({}, "linux"), /PLAYER_LOG_PATH/);
});

test("未検出ファイルとディレクトリには対象パスと設定方法を案内する", () => {
  const dir = mkdtempSync(join(tmpdir(), "mtga-path-"));
  try {
    for (const file of [dir, join(dir, "missing.log")]) {
      assert.throws(() => validatePlayerLogPath(file), (error: Error) => error.message.includes(file) && error.message.includes("PLAYER_LOG_PATH"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
