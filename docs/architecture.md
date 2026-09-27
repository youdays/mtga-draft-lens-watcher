# watcherの技術仕様

## ログ入力と配信

Player.logの起動後の追記を読み取り、解析したドラフトイベントをWebSocketで配信します。起動前のログを読み返さないことで、過去のドラフトを現在のパックとして表示することを避けます。

| 入力イベント | 配信イベント | Pack/Pickの変換 |
| --- | --- | --- |
| `CardsInPack` / `Draft.Notify` | `PickNext`（Premier/Traditional） | 1始まりを保持 |
| `Event_PlayerDraftMakePick` の `GrpId` | `PickSubmit` | 1始まりを保持 |
| `BotDraftDraftStatus` / `BotDraft_DraftStatus` / `DraftStatus: PickNext` | `PickNext`（Quick） | 0始まりに1を加算 |
| `BotDraftDraftPick` / `BotDraft_DraftPick` の `PickInfo` | `PickSubmit` | 0始まりに1を加算 |

Quickの選択カードは`CardId`または1要素の`CardIds`に対応します。複数枚同時ピックは読み飛ばします。TraditionalはWeb UIの形式に合わせて`PremierDraft`として通知します。

JSONの直接形式と、`request` / `Payload`内のJSON文字列形式を扱います。ヘッダーと本文が別行の場合も結合します。不正JSON、未知イベント、必要な値が欠けたデータは読み飛ばします。

## WebSocket

待ち受けは`127.0.0.1:5500`です。接続時にOriginを検証し、未許可のOriginやOriginのない接続はHTTP 403で拒否します。

既定の許可元は`https://youdays.github.io`です。`ALLOWED_ORIGINS`の指定時はこの既定値を置き換え、完全一致で許可します。HTTPのlocalhostと127.0.0.1は常に任意ポートを許可します。HTTPSのローカルOriginや`localhost.example.com`のような別ホストは、この例外に含みません。

配信形式は`{ type, payload }`です。接続直後は今回の起動以降のイベント一覧を`EventHistory`として送り、以降は`PickNext`と`PickSubmit`を逐次送信します。ログの再作成・切詰めを検出すると履歴を消去します。接続中のWeb UIのパック表示は次の`PickNext`で更新されます。

## ファイル監視

読み取りと部分行の結合には`tail` 2.2.6を使い、100ミリ秒間隔で監視します。監視登録時の非同期statより先に追記が発生しても回収できるよう、登録後にもtailの読込位置を照合します。

ファイル識別子とサイズで置換・切詰めを検出し、tailとパーサーを再生成します。再作成後は先頭から読み、旧ファイルの部分行を混ぜません。一時的にファイルが消失した場合は、同じパスへの再作成を待ちます。

停止時は監視と再作成待機タイマーを解除します。旧tailの非同期読み取りから遅れて届いたイベントは配信しません。

### 制約

ポーリングの間に同じファイルが切り詰められ、以前のサイズ以上に再成長すると、通常の追記と区別できません。また、読み取り前に削除・上書きされたイベントは回収できません。

入力形式の根拠と実機ログによる検証範囲は[fixtureの説明](../fixtures/README.md)に記載しています。
