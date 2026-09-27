# Player.logパーサーの検証データ

個人名・アカウントID・トークンは含めません。カードIDとドラフトの番号だけを検証に使います。

- `pickNextQuick.txt` / `pickSubmitQuick.txt`: RPCエンベロープ形式。Quick DraftのPack/Pickは0始まりです。パック更新にはPlayer.logのヘッダーを付けています。
- `pickNextPremier.txt` / `pickSubmitPremier.txt`: UnityCrossThreadLogger形式。PremierのPack/Pickは1始まりです。ドラフトIDを匿名値へ置換しています。
- `player-events.json`: [Arenaログ形式の参考資料](https://github.com/kkunde/skills/blob/main/skills/mtga-draft-helper/references/arena-log-parsing.md) のイベント候補をもとに作成した合成fixtureです。新たな実機採取データではありません。Quickの番号は参考資料の例を採用せず、既存fixtureと同じ0始まりにしています。JSONの直接形式とエンベロープ形式で番号の意味を変えません。

`quick-player-macos.txt` と `quick-player-macos.expected.json` は2026-09-26のmacOS実ログから抽出したQuick Draftのパック更新42件・ピック送信42件です。イベント以外の行を除き、JSONは解析に必要なフィールドだけを許可リストで残しています。IDは匿名値に置換し、資産・アカウント情報やピック済みカード・スタイル情報は保存しません。`BotDraftDraftStatus` / `BotDraftDraftPick`、単一選択の `CardIds` 配列、Pack/Pickの0始まりを確認しました。期待値は抽出時に実ログのフィールドから作成し、パーサーの結果とは独立に照合します。Premier/Traditionalの現行実ログとの照合は未実施です。Traditionalのパックは既存UIとの互換性のためPremierDraftとして通知します。複数枚同時ピック（GrpIds）は解析対象外です。
