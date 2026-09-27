# MTGA Draft Lens watcher

MTG Arenaの `Player.log` を読み取り、同じPCのWeb UIへWebSocketで送信します。実行にはNode.js 22.11.0以上が必要です。開発にはYarn 4.5.1を使用します。

ライセンスは [MIT](LICENSE) です。このリポジトリでTypeScriptソース・テスト・CIを管理し、npmにはビルドしたJavaScriptを配布します。`dist/` はGit管理対象外です。

## 初回設定と起動

MTG Arena側で詳細ログを有効にし、一度起動してPlayer.logを作成してください。ドラフトを開始する前にwatcherを起動します。

npm公開後は次のコマンドで導入できます（初回公開準備中）。

```sh
npm install -g @youdays/mtga-draft-lens-watcher
mtga-draft-lens-watcher
```

既定のPlayer.log以外を使用する場合は、任意の場所に.env形式の設定ファイルを作り、明示指定します。

```sh
mtga-draft-lens-watcher --config /設定ファイルの絶対パス/watcher.env
mtga-draft-lens-watcher --help
mtga-draft-lens-watcher --version
```

設定ファイルの例は [.env.example](.env.example) です。`--config` を省略すると設定ファイルは読みません。インストール先や起動ディレクトリの.envを自動で読むことはありません。設定変更後は再起動してください。停止はCtrl+Cです。

PowerShellでも同じCLIを使えます。空白を含む設定ファイルのパスは引用符で囲んでください。

更新は `npm install -g @youdays/mtga-draft-lens-watcher@latest`、削除は `npm uninstall -g @youdays/mtga-draft-lens-watcher` です。

## 設定とPlayer.logの場所

優先順位は「起動プロセスの環境変数 → --configで指定した設定ファイル → コードの既定値」です。空の設定値には既定値を使います。`HOME`、`USERPROFILE` はOSの情報を使い、`.env` では上書きしません。

| 設定 | 内容 |
| --- | --- |
| `PLAYER_LOG_PATH` | Player.logのファイルパス。絶対パスを推奨します。空白を含むパスは引用符で囲みます。相対パスは起動時の作業ディレクトリ基準です。 |
| `ALLOWED_ORIGINS` | 許可するOriginのカンマ区切り。指定するとGitHub Pagesの既定値を置き換え、完全一致で許可します。HTTPのlocalhostと127.0.0.1の任意ポート許可は維持します。URLのパスや末尾の `/` は含めません。 |

OSごとのパス:

- macOSの既定値: `~/Library/Logs/Wizards of the Coast/MTGA/Player.log`。2026-09-26に実機で存在を確認しました。
- Windowsの既定値: `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log`。OSのホーム情報から解決します。実機では未確認のため、見つからない場合は `PLAYER_LOG_PATH` で明示指定してください。
- Linux Steamの候補: `~/.local/share/Steam/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log`。インストール先により異なるため明示指定してください。

`.env` では `~`、`%USERPROFILE%`、`$HOME` を展開しません。明示指定ではユーザー名を含む実際の絶対パスを書きます。

```dotenv
PLAYER_LOG_PATH="C:/Users/ユーザー名/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log"
```

ファイルが見つからない・読み込めない場合は、対象パスと `PLAYER_LOG_PATH` の案内を表示して停止します。Arenaの起動、パスの綴り、ディレクトリではなくファイルを指定していること、読み取り権限を確認してください。

明示許可リストの既定値は `https://youdays.github.io` です。設定の有無にかかわらず、`http://localhost:<任意のポート>` と `http://127.0.0.1:<任意のポート>`（ポート省略も可）を許可します。その他は明示許可したOriginだけを完全一致で許可します。Originなし、未許可ホスト、`localhost.example.com` などの別ホストは拒否します。HTTPSのローカルOriginは明示設定が必要です。待ち受け先は `ws://127.0.0.1:5500` です。公開HTTPSページからの接続時にChromeがローカルネットワークアクセスの許可を求めた場合は、このサイトからの接続を許可してください。拒否した場合はChromeのサイト設定で許可を変更して再読み込みします。

## イベントと状態復元

Player.logだけを監視します。起動前のログは読み返しません。過去のドラフトのパックをUIへ再表示しないためです。ドラフトの途中でwatcherを起動した場合は、次のパック更新から表示します。

対応するイベント:

| イベント | UIへの通知 | Pack/Pickの変換 |
| --- | --- | --- |
| `CardsInPack` / `Draft.Notify` | `PickNext`（Premier/Traditional） | 1始まりの値を保持 |
| `Event_PlayerDraftMakePick` の `GrpId` | `PickSubmit` | 1始まりの値を保持 |
| `BotDraftDraftStatus` / `BotDraft_DraftStatus` / `DraftStatus: PickNext` | `PickNext`（Quick） | 0始まりに1を加算 |
| `BotDraftDraftPick` / `BotDraft_DraftPick` の `PickInfo` | `PickSubmit` | 0始まりに1を加算 |

Quickの選択カードは `CardId` または1要素の `CardIds` に対応します。複数枚同時ピックは読み飛ばします。

JSONを直接記録する形式と、`request` / `Payload` にJSON文字列が入る形式に対応します。イベントヘッダーと1行JSONが別行の場合も扱います。不正JSON、未知イベント、必要な値が欠けたデータは読み飛ばして監視を続けます。Traditionalは既存UIの形式に合わせて `PremierDraft` として通知します。

UI接続時は今回のwatcher起動以降に収集した `EventHistory` を返し、再接続時に最後のパックを復元できます。その後は既存の `{ type, payload }` 形式で `PickNext` と `PickSubmit` を逐次送信します。ファイルの再作成・切詰めを検出すると履歴を消去します。接続中UIの表示は従来どおり、次の `PickNext` で更新されます。

イベント形式の根拠と実機確認の範囲は [fixtureの説明](fixtures/README.md) に記録しています。Quickの番号が0始まりであることは2026-09-26のmacOS実ログでも確認しました。同ログのパック更新42件とピック送信42件を匿名化して自動テストに追加しています。Macでの動作とPlayer.logの出力が速いことはユーザーによる確認済みです。Premier/Traditionalの現行実ログとの照合とWindows実機確認は未実施です。

## Arena再起動と停止

読み取り・部分行の結合は引き続き `tail` に任せ、100ミリ秒間隔のファイル監視を利用します。独自のバイトオフセット読み取りは行いません。監視登録時の非同期statが追記を初期状態として扱う場合に備え、登録後にもtailの読込位置と照合します。改行前の部分行は次の追記まで保持します。

`tail` 2.2.6の標準ポーリング処理では切詰め・置換時の先頭読み取りを保証できないため、監視通知でファイル識別子とサイズを比較し、該当時だけtailを再生成します。再作成後のファイルは先頭から読み、旧ファイルの部分行を混ぜません。Arena再起動時の一時的なファイル消失は、同じパスの再作成を待って復帰します。監視開始・再開時には対象パスを表示します。

ポーリングの間に同じファイルが切り詰められ、以前のサイズ以上に再成長した場合は、通常の追記と区別できません。また、置換前に削除された未読内容は回収できません。一般的なファイル置換、観測可能な切詰め、削除後の再作成を自動テストしています。

Ctrl+Cでtailの監視と再作成待機タイマーを解除します。停止済みtailの非同期読み取りから届いたイベントは配信しません。

## 開発と検証

watcherの変更はこの公開リポジトリで行います。別リポジトリからの定期コピーやマージ時の成果物同期は行いません。初回は次のようにcloneしてください。

```sh
git clone https://github.com/youdays/mtga-draft-lens-watcher.git
cd mtga-draft-lens-watcher
yarn install --immutable
yarn build
yarn start --help
yarn typecheck
yarn test
yarn test:package
```

サニタイズ済み・合成fixtureでQuick/PremierのイベントとP1P1を確認します。一時ファイルによる追記、部分行、不正JSON、未知イベント、切詰め、同サイズ・大サイズへの置換、削除後の再作成、重複防止、停止、設定とエラー案内を検証します。WebSocketのテストは5500番ポートを使用するため、実行前に通常のwatcherを停止してください。Originの任意ポート許可、明示許可、未許可ホスト・Originなし・類似ドメインの拒否も検証します。

Windows実機でMTG Arenaから公開UIまで接続する検証は未実施です。CIのWindows検証は合成ログに基づく動作確認です。

配布物テストではtarballを一時ディレクトリへ開発依存なしでインストールし、CLIのヘルプ・バージョン・エラー・設定読込・WebSocket配信を確認します。公開手順は [RELEASING.md](RELEASING.md) を参照してください。
