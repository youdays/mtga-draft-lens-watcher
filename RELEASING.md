# リリース手順

`@youdays/mtga-draft-lens-watcher`は、CIで検証したmainのコミットから手動でnpmへ公開します。

## リリースの準備

1. package.jsonのversionを更新し、変更内容をPRに記載します。依存関係を変更した場合はyarn.lockも更新します。
2. 型検査・テスト・配布物検証を実行し、PRのCIが成功することを確認します。

   ```sh
   corepack yarn install --immutable
   corepack yarn typecheck
   corepack yarn test
   corepack yarn test:package
   npm pack --dry-run
   ```

3. PRをレビューしてmainへマージし、mainのCI成功を確認します。

## npmへの公開

1. リリースするmainのコミットを取得し、作業ツリーがクリーンであることを確認します。
2. npmへログインし、対象パッケージを公開できるアカウントであることを確認します。

   ```sh
   npm login --registry=https://registry.npmjs.org
   npm whoami
   ```

3. 固定した依存関係からtarballを作成します。

   ```sh
   corepack yarn install --immutable
   npm pack
   ```

   配布対象はdistのJavaScript、package.json、README、MITのLICENSE、.env.exampleです。実設定、実ログ、ソースマップ、テスト用データが含まれていないことを確認してください。
4. 生成されたファイル名を指定し、ドライラン後に同じtarballを公開します。次は0.1.0の例です。

   ```sh
   npm publish ./youdays-mtga-draft-lens-watcher-0.1.0.tgz --access public --dry-run
   npm publish ./youdays-mtga-draft-lens-watcher-0.1.0.tgz --access public
   ```

   ドライランは実際の公開成功や公開権限を保証しません。認証・OTPを求められた場合はnpmの案内に従ってください。
5. 公開バージョンを確認し、クリーンな環境でインストール・起動を確認します。

   ```sh
   npm view @youdays/mtga-draft-lens-watcher version
   npm install -g @youdays/mtga-draft-lens-watcher@0.1.0
   mtga-draft-lens-watcher --version
   ```

6. 公開したコミットに対応するバージョンタグとGitHub Releaseを作成し、変更内容を記録します。

公開済みバージョンは上書きできません。修正時は新しいバージョンを公開してください。
