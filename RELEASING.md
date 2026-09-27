# npm公開手順

公開対象は `@youdays/mtga-draft-lens-watcher`。管理アカウントは `youdays`。npm Organizationは使用しません。最初はwatcherのみを公開します。TypeScriptソースをこのリポジトリで管理し、distはビルド時に生成します。マージだけではnpmへ公開せず、対象バージョンを手動でリリースします。

## 初回公開前

1. LICENSEのMIT本文とpackage.jsonの `license: "MIT"` が一致し、配布物に同梱されることを確認します。
2. PRのCI（macOS / Windows / Linux、Node.js 22 / 24）が成功したことを確認します。実機のMTG Arena連携は別途確認します。
3. ソースと履歴に.env、実機の未加工ログ、ユーザー固有の絶対パス、トークンがないことを確認します。fixturesは匿名化済みまたは合成のものだけを保持します。
4. `npm login --registry=https://registry.npmjs.org` を実行します。パスワード・OTPは本人が入力し、Issueやチャットに貼らないでください。`npm whoami` の結果が `youdays` であることを確認します。
5. `npm view @youdays/mtga-draft-lens-watcher` で既存パッケージの状態を確認します。404は未登録の可能性を示しますが、公開権限の確認にはなりません。

## バージョン更新から公開まで

1. 作業ブランチでpackage.jsonのversionを更新し、変更内容をPRに記載します。`yarn install` でロックファイルも整合させます。
2. 次の検証を行い、配布物のファイル一覧と内容を確認します。

   ```sh
   yarn install --immutable
   yarn typecheck
   yarn test
   yarn test:package
   npm pack --dry-run
   npm pack
   ```

   配布物はdistのJavaScript、package.json、README、LICENSE、.env.exampleに限定します。ソースマップ、テスト、fixture、設定の実値は配布しません。実行時依存はtailとwsだけです。
3. レビュー後の明示的なマージ指示に従ってmainへマージし、mainのCI成功を確認します。
4. mainの対象コミットから再度 `npm pack` し、確認済みtarballを公開します。

   ```sh
   npm publish ./youdays-mtga-draft-lens-watcher-0.1.0.tgz --access public
   ```

   ファイル名は公開するバージョンに合わせます。OTPやブラウザ認証を求められた場合は本人が完了します。トークンをリポジトリへ保存しません。初回は手動公開とし、CIに公開用Secretは設定しません。
5. `npm view @youdays/mtga-draft-lens-watcher version` とクリーン環境でのインストール・起動で公開結果を確認し、対応コミットにバージョンタグを付けてリリース内容を記録します。

公開済みバージョンへの上書きは行わず、修正時は新しいバージョンを公開します。自動公開が必要になった場合は、その時点で認証方式と権限を検討します。
