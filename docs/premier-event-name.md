# Premierのイベント名補完

## 原因と境界

FRAの実Arenaログでは、`Draft.Notify`にDraft ID・提示カード・座標がある一方、イベント名がない。公開watcher 0.2.0は提示内のイベント名だけを採用するため、Pagesがセット・形式を照合できず、強調と推薦を停止する。

補完対象は、確認済みの `PremierDraft_<SET>_<8桁日付>` 形式だけとする。Pagesの照合条件、推薦式、全量Draft StateのschemaVersion 1は変更しない。Course IDとDraft IDは別物なので、ID一致を根拠にしない。

## 補完する条件

1. `EventJoin`要求からRPC IDとイベント名を取得する。
2. 同じRPC IDの応答で、`Course.InternalEventName`が要求と一致し、`CurrentModule`が`PlayerDraft`であることを確認する。
3. `Client.SceneChange`が`EventLanding`から`TableDraftQueue`への遷移で、contextが `Entering table draft queue: <SET>_Premier_Draft` と一致することを確認する。
4. 次に解析できたパック提示が、まだ観測していないDraft IDのP1P1である場合だけ、一度限りでイベント名を対応づける。同じDraftの後続提示へ補完する。

これはログの参加成功・画面遷移・新規開始の順序に基づく対応づけであり、参加応答にDraft IDが含まれているわけではない。ログ順序を前提とする限定対応で、途中再開を推測する機能ではない。

応答不一致、失敗、未知の命名、特殊形式、異なる画面・セット、不正JSON、新たな参加要求、P1P1欠落では候補を捨てる。パック内の明示イベント名を優先する。別Draftに名前を引き継がず、ログ再作成ではAdapterの対応を破棄する。Reducerが保持する過去の観測事実は既存方針を維持する。

## 検証

ユーザー提供のPlayer-prev.logから、個人情報・RPC ID・Draft ID・Course ID・所持品・対戦情報を除き、参加応答、画面遷移、パック提示、ピック要求だけを許可リストで抽出した `fixtures/premier-fra-event-name.txt` を追加した。42提示・42Pick、P1P1〜P3P14を含む。カードIDとイベント名は保持し、元ログはコミットしない。

- 全watcherテスト、typecheck、lint、buildを実行する。候補が確定する経路と各拒否条件、既存Quick/Premier、実ファイル置換、接続安全化を検証する。
- 元ログを修正Adapterへ通し、イベント名以外の84イベントが公開0.2.0と一致することを確認する。
- 匿名化fixtureを検証専用15587番のwatcherへ追記し、初回空Stateを含む85全量配信がAdapter/Reducerと一致することを確認する。既存Pagesの受信契約とFRA/Premier一致、FRA/Quick・HOB/Premier不一致を確認する。
- 検証用のポート置換は一時preloadのみで実施し、製品の5500番や常用watcherは変更しない。

2026-10-12のローカル結果: watcher全51件、typecheck/lint/build成功。Pagesの既存データ・Engine63件とUI210件も再実行して成功。実WebSocket85配信の契約・照合検証成功。初回の通常テストは環境のローカル待受制限（EPERM）でサーバーテスト1件が失敗したため、常用5500番を保護する一時preloadと許可されたローカル待受で全件を再実行した。

CI初回は固定TypeScript 5.3.3でテストのfilter型絞り込みが失敗した。明示的な型述語へ修正し、Yarn 4.5.1のimmutable installでCIと同じ依存関係を取得して全51件・typecheck/lint/buildを再実行し成功した。

## 手元での確認

0.2.1で提供する修正。グローバルに0.2.0が残っている場合は更新して再起動する。ソース版を使用する場合はcheckoutで依存関係を入れ、次の順序でビルドして起動する。

```sh
corepack yarn install --immutable
corepack yarn build
# 既存5500番watcherを通常の方法で停止した後、ドラフト開始前に起動する
corepack yarn start
```

Player.logの詳細ログを有効にし、参加前から起動する。Pagesでは実ドラフトと同じセット・Premierの指標を選ぶ。FRAの指標がない環境では先に一致するデータを用意する。参加記録を取り逃した途中起動、復帰だけのログ、別OSや他セットの画面contextは保証しない。これらは照合待ちを維持する。

ユーザーは修正版のビルド後に実Arenaの受信を確認した。P1P8→P1P9・Pack切替・再接続の全項目、別セット・別OSの実機確認は未完了。2026-10-25にユーザーがマージ・公開を承認した。Pages側のセット名・Quick/Premier指標代用はPages v3.1の変更で扱う。
