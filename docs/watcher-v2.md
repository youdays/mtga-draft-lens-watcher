# watcher v2 (#83)

正本: https://github.com/youdays/mtga-draft-lens/issues/83 の本文と今回の実装指示。

2026-10-04に本文とコメントを取得して確認した。実装開始時の追記コメントには古いcourseId Contractが残っていたが、PR作成前の再確認では本文と同じ `draftId: string | null` / `eventName: string | null` に修正済みだった。今回の仕様変更・逸脱はなし。Recommendation Engine / Pages UIは実装していない。

## Architecture / 変更ファイル

```text
Player.log
  → MtgaLogWatcher（既存tail監視）
  → PlayerLogAdapter（別行ヘッダー・JSONエンベロープ）
      → QuickDraftAdapter / PremierDraftAdapter
  → NormalizedDraftEvent
  → DraftStateReducer
  → in-memory DraftState
  → WebSocket full-state envelope
```

| ファイル | 変更内容 |
| --- | --- |
| `src/lib/adapters/logData.ts` | JSON・カードID・番号の検証用共通処理 |
| `src/lib/adapters/PlayerLogAdapter.ts` | ログ行の形式判定、別行ヘッダーとJSON文字列の展開 |
| `src/lib/adapters/QuickDraftAdapter.ts` | Quick固有形式を正規化 |
| `src/lib/adapters/PremierDraftAdapter.ts` | Premier / 既存Traditional固有形式を正規化 |
| `src/lib/draft/types.ts` | DraftState / PickObservation / 正規化イベント / Envelope |
| `src/lib/draft/DraftStateReducer.ts` | 観測事実・Pool・Draft境界の更新 |
| `src/lib/MtgaLogWatcher.ts` | 既存の監視に正規化イベント通知を追加 |
| `src/index.ts` | メモリ上のReducerをSource of Truthにし全量配信 |
| `tests/draftState.test.ts` | AdapterからDraftStateまでのfixture / lifecycle / identityテスト |
| `tests/server.test.ts` | full-state・再接続・Originの実接続拒否テストに更新 |
| `tests/watcher.test.ts` | 既存監視Regressionに正規化イベントとReducerの検証を追加 |
| `fixtures/v2-quick.txt` | 実ログ由来の最小Quickシーケンス |
| `fixtures/v2-premier.txt` | #83の確認済み形式を使う最小合成Premierシーケンス |
| `fixtures/README.md` | fixtureの出典・限界を記載 |
| `eslint.config.mjs` | TypeScript用lint。CLIの既存遅延requireだけ例外 |
| `tsconfig.check.json` | ソースとテストの両方を型検査 |
| `package.json` / `yarn.lock` | lint追加、typecheckの対象拡大と固定依存 |
| `.github/workflows/ci.yml`（保留） | typecheck / lint追加案はGitHub認証のworkflow権限不足によりPRから除外。既存CIは維持 |
| `README.md` / `docs/watcher-v2.md` | v2通信・互換性・実装説明 |

## Contracts

```ts
type DraftState = {
  draftId: string | null;
  eventName: string | null;
  currentPickedCardIds: number[];
  observations: PickObservation[];
};
type PickObservation = {
  packNumber: number; // 0-based
  pickNumber: number; // 0-based
  packCardIds: number[];
  pickedCardIds: number[] | null;
};
```

`NormalizedDraftEvent` はdiscriminated union。以下の3種類を定義する。

- `DraftPackObserved`: `draftId`, `eventName`, `packNumber`, `pickNumber`, `packCardIds`
- `PickObserved`: `draftId`, `packNumber`, `pickNumber`, `pickedCardIds`
- `PickedCardsSnapshotObserved`: `draftId`, `pickedCardIds`

Reducerより下にはArena固有のイベント名やフィールド名を渡さない。DraftStateは上記4フィールドだけであり、推薦由来のDerived Valueを含めない。

## Adapter正規化

Quickはログの `PackNumber` / `PickNumber` の0-based値をそのまま使う。`DraftPack` を数値配列にし、`PickInfo.CardId` / `CardIds` を `pickedCardIds` にする。累積 `PickedCards` があればSnapshotイベントを生成する。同じログにPackとSnapshotがある場合はPackを先に適用し、Draft切替後にSnapshotを適用する。

Premierは `Draft.Notify.SelfPack` / `SelfPick` と `EventPlayerDraftMakePick.Pack` / `Pick` をそれぞれ1減らす。`PackCards` のCSVまたは配列を数値配列にする。`GrpIds` は全要素を保持し、旧形式 `GrpId` も1枚の配列にする。`Event_PlayerDraftMakePick` の旧表記と `CardsInPack` の既存Premier/Traditional形式も扱う。

カードIDは正の安全な整数、番号は0以上の安全な整数として検証する。不正JSON・未知イベント・不正な値は読み飛ばす。UI向けP1P1変換は行わない。

## Reducer / Pool / Identity

Observationの一意キーは `packNumber:pickNumber`。

- Pack観測: 同一キーのPackをlast-write-winsで更新し `pickedCardIds: null` にする。キーがなければOPENを作る。
- Pick観測: 存在する同一キーのObservationだけを更新する。次Observationや未観測Packを作らない。
- 次Pack観測: そのキーのOPENを作る。古いOPENが残っていても勝手に補完・削除しない。
- Pickだけが届いた場合もPoolには保持する。Observationを架空の空Packで埋めない。
- Snapshot観測: `currentPickedCardIds` を全量置換しPrimary Sourceにする。それまでに観測したPickキーをSnapshot反映済みとして記録する。
- SnapshotがないPremier等: 正規化Pickを累積する。重複Pickは二重加算せず、同一キーの訂正は以前の寄与を置き換える。同じカードの別Pickは重複枚数を保持する。
- Snapshot反映後の既知Pick再送・訂正ではSnapshotのPoolを上書きしない。その後の新しいPickは累積し、次Snapshotで再び全量置換する。

PoolはObservationから再構築しない。重複処理用のPickキー・寄与はReducerの内部にだけ保持し、wire formatには含めない。

Premierのidentityは `Draft.Notify.draftId` / `EventPlayerDraftMakePick.DraftId`。非null IDが現在のIDと異なれば、Stateと内部Pick寄与をリセットする。`DraftCompleteDraft.CourseId` は採用しない。

QuickのIDが取れなければnull。既存P1P1があり、その先のPackまたはPickが観測済みで、今回のP1P1の `packCardIds` が既存P1P1と異なる場合だけ新Draftにする。同じ配列の再送はリセットしない。synthetic IDは作らない。

`eventName` は明示的に観測した値だけを保持する。未取得ならnull、次Draftではリセットする。取得後のログに名前がなくても観測済みの名前を推測値へ置き換えない。

## WebSocket / 既存基盤への影響

接続直後・再接続時・State変更時に以下の全量を送る。初回未観測時も、null identity・空配列のDraftStateを送る。

```json
{
  "type": "draftState",
  "schemaVersion": 1,
  "data": {
    "draftId": null,
    "eventName": null,
    "currentPickedCardIds": [],
    "observations": []
  }
}
```

全く同一のStateになる重複イベントでは追加配信しない。delta protocol、永続化、起動時の過去ログ復元は追加していない。

`127.0.0.1:5500` と既存Origin検証を維持する。追記・部分行・再作成・切詰め・再作成待機・停止時の世代検査も維持する。ログ世代交代ではAdapter/Parserを作り直すが、取得済みDraftStateは実際のDraft境界まで保持する。

旧Parser APIとイベント通知は既存Regression確認用に維持する。WebSocketの `EventHistory` / `PickNext` / `PickSubmit` は仕様に従ってfull DraftStateへ置換しているため、旧Pagesとの通信互換性はない。マージ・公開時期は#86のRelease Strategyに従う。

## Acceptance自己レビュー

| #83のAcceptance Criteria | 対応・検証 |
| --- | --- |
| Quick/Premier固有ログを吸収 | format別Adapter、最小fixture、旧RPC fixture、Quick42Pick実ログ |
| Adapterより下がArena固有名へ非依存 | Reducer / types / serverのコード確認 |
| 正規化イベントContract | 3種類のunion、Adapter出力assert |
| DraftState / Observation Contract | 指定型、Envelope全量assert |
| Derived Valueなし | Stateの4フィールドと内部Pick重複管理だけ |
| Observation lifecycle | OPEN、同一Observation更新、次OPEN、responseのみでは作らない |
| currentPickedCardIds | 累積、複数枚、同カード別Pick、Snapshot、Snapshot後再送 |
| 新Draft切替 | ID変更、異なるQuick P1P1、同一Pack再送、欠損Pack後のPick |
| 0-based統一 | Quick/Premier P1P1・P2P3、旧RPC、全Quick実ログ |
| メモリ上Source of Truth | Reducerとserver、返却Stateからの内部改変防止 |
| 接続時/更新時full-state | 実serverへの接続・更新・再接続テスト |
| schemaVersion 1 | Envelopeのキーと値をassert |
| Quick/Premier fixture | 新規2 fixtureと既存fixture群 |
| test / typecheck / lint | 下記実行結果 |
| Origin / file monitoring Regression | 既存監視・Originテスト、実接続403拒否 |

## 限界・未解決事項

- 現行Premierの生ログをこのrepoで採取・照合していない。新fixtureは#83の確認済みフィールドを使った合成データ。
- 非空の累積PickedCardsは合成テスト。既存RPC fixtureには空のPickedCardsがあり、実ログ由来Quick42Pick fixtureではこのフィールドが削除済み。
- #83追記コメントのContract不一致は修正済み。今回の実装は本文・コメント・ユーザー指示・#84/#85のdraftId Contractに一致する。
- 完全Recovery、高度Replay判定、過去Snapshotに含まれる未観測Pickの重複推定はスコープ外。
- Windows/Linuxの実機Arenaログ接続は未検証。既存CIのOS/Node matrixを維持する。

## 実行結果（2026-10-04 / macOS / Node 22.11.0）

- `npm test`: 43 / 43 pass、fail / skip 0。既存29テスト（仕様に合わせたserver更新を含む）と追加14テスト。
- `npm run typecheck`: pass。`src` と `tests` の両方が対象。
- `npm run lint`: pass。新規ESLint設定で `src` と `tests` を検査。
- `npm run build`: pass。
- Yarn 4.5.1 `install --immutable`: pass。
- `git diff --check`: pass。
- WebSocket実接続テストはlocalhost待受が必要なため、実行制限外で実施した。

作業ブランチ: `codex/issue-83-watcher-v2`。ローカルprimary repoの古い初期checkoutを公開main `7478733` までfast-forwardしてから実装した。この変更はPRでレビューする。merge / npm公開はRelease Strategyに従い別途行う。

実ログでの確認はユーザーの方針により一旦保留。v2全体の実装完了後にArenaでまとめて動作確認する。現時点の検証根拠はfixtureと自動テスト。

CIのtypecheck / lint追加は保留。push時にGitHubがworkflow権限不足を返したため、PRには既存CI設定を維持した。提案差分はローカル `/tmp/watcher-v2-ci.patch` に保存した。
