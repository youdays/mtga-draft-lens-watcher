import { test } from "node:test";
import * as assert from "node:assert/strict";
import { getAllowedOrigins, isAllowedOrigin } from "../src/lib/websocketOrigin";

test("HTTPのlocalhostと127.0.0.1を設定によらず任意ポートで許可する", () => {
  for (const allowed of [getAllowedOrigins(""), getAllowedOrigins("https://example.com")]) {
    for (const host of ["localhost", "127.0.0.1"]) {
      for (const port of ["", ":80", ":3000", ":5173", ":5174", ":65535"]) {
        const origin = `http://${host}${port}`;
        assert.equal(isAllowedOrigin(origin, allowed), true, origin);
      }
    }
  }
});

test("GitHub Pagesの既定値と明示設定の完全一致を維持する", () => {
  const defaults = getAllowedOrigins("");
  assert.equal(isAllowedOrigin("https://youdays.github.io", defaults), true);
  assert.equal(isAllowedOrigin("https://example.com", defaults), false);
  const configured = getAllowedOrigins(" https://example.com:8443, https://localhost:5173, ,");
  assert.deepEqual([...configured], ["https://example.com:8443", "https://localhost:5173"]);
  assert.equal(isAllowedOrigin("https://example.com:8443", configured), true);
  assert.equal(isAllowedOrigin("https://localhost:5173", configured), true);
  for (const origin of ["https://youdays.github.io", "https://example.com", "https://example.com:8444", "https://localhost:5174"]) {
    assert.equal(isAllowedOrigin(origin, configured), false, origin);
  }
  assert.deepEqual([...getAllowedOrigins(" , ")], [...defaults]);
});

test("Originなし・未許可ホスト・類似ドメイン・不正なOriginを拒否する", () => {
  const allowed = getAllowedOrigins("");
  for (const origin of [
    undefined, "", "null", "不正なURL",
    "http://example.com:5173", "http://localhost.example.com:5173",
    "http://example-localhost.com", "http://127.0.0.1.example.com",
    "http://localhost@evil.example", "http://evil.example@localhost",
    "http://localhost:65536", "http://localhost:abc",
    "http://localhost/", "http://localhost/path", "http://localhost?x=1",
    "http://localhost#fragment", "http://localhost\\evil.example",
    "https://localhost:5173", "ws://localhost:5173", "ftp://localhost",
    "http://127.1:5173", "http://2130706433:5173", "http://[::1]:5173",
    "https://youdays.github.io.evil.example",
  ]) {
    assert.equal(isAllowedOrigin(origin, allowed), false, String(origin));
  }
});
