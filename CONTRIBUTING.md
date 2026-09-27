# 開発への参加

不具合の報告や改善提案はIssuesへ、コードの変更はPull Requestへお願いします。

## 開発環境とソースからの起動

Node.js 22.11.0以上とYarn 4.5.1を使用します。

```sh
git clone https://github.com/youdays/mtga-draft-lens-watcher.git
cd mtga-draft-lens-watcher
corepack enable
corepack yarn install --immutable
corepack yarn build
corepack yarn start
```

設定ファイルを使う場合は、`.env.example`を参考に作成し、明示指定します。

```sh
corepack yarn start --config /設定ファイルの絶対パス/watcher.env
```

変更中のTypeScriptを直接実行する場合は`corepack yarn dev`を使えます。

## 構成

| 場所 | 役割 |
| --- | --- |
| `src/` | CLI、ログ監視・解析、WebSocket配信 |
| `tests/` | 自動テスト |
| `fixtures/` | 合成・匿名化済みの検証データ |
| `scripts/` | ビルドとnpm配布物の検証 |
| `docs/architecture.md` | イベント形式・監視処理・制約 |

`dist/`はビルド時に生成し、Gitにはコミットしません。npmにはJavaScriptの成果物を配布します。

## 検証

```sh
corepack yarn typecheck
corepack yarn test
corepack yarn test:package
```

WebSocketのテストは5500番ポートを使用します。実行前に通常のwatcherを停止してください。

通常のテストではパーサー、設定、接続元制限、ログの追記・置換・切詰め・再作成を検証します。配布物テストではtarballを一時ディレクトリへ開発依存なしでインストールし、CLI・設定・ログ追記からWebSocket配信まで確認します。

CIはmacOS・Windows・LinuxとNode.js 22・24で実行します。CIの合成ログによる検証と、MTG Arenaを使った実機検証は別です。fixtureの由来と検証範囲は[検証データの説明](fixtures/README.md)を参照してください。

## Pull Request

変更の目的、利用者への影響、実施した検証を記載してください。動作を変更する場合は、関連するテストと文書も更新します。実ログをテストに追加する際は、解析に必要な情報だけを残し、個人情報や認証情報を除いてください。

リリース担当者向けの手順は[RELEASING.md](RELEASING.md)にあります。
