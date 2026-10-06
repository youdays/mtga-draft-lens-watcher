# npmへの公開手順

CIが成功し、レビューしてマージしたmainから手動で公開します。package.jsonのversionを確認し、2回目以降は未公開のバージョンへ更新してください。

```sh
corepack yarn install --immutable
npm pack --dry-run
npm pack
```

`npm pack`時に自動でビルドされます。配布内容はdistのJavaScriptと型定義（.d.ts）、package.json、README、LICENSE、.env.exampleです。実設定や実ログが含まれていないことを確認します。

初回は生成したtarballをインストールし、ヘルプ表示と実際のログ・Web UIとの連携を確認します。以下は0.1.0の例です。

```sh
npm install -g ./youdays-mtga-draft-lens-watcher-0.1.0.tgz
mtga-draft-lens-watcher --help
mtga-draft-lens-watcher
```

確認後はCtrl+Cで停止し、youdaysアカウントでログインして同じtarballを公開します。

```sh
npm login --registry=https://registry.npmjs.org
npm whoami
npm publish ./youdays-mtga-draft-lens-watcher-0.1.0.tgz --access public --dry-run
npm publish ./youdays-mtga-draft-lens-watcher-0.1.0.tgz --access public
npm view @youdays/mtga-draft-lens-watcher version
```

ドライランは公開権限や実際の公開成功を保証しません。公開済みのバージョンは上書きできないため、修正時は新しいバージョンを使います。

## v2の公開順序

1. PRのCI成功を確認し、mainへマージします。
2. mainのversionが0.2.0-rc.1であることを確認し、pack内容・インストール・CLI・型解決を検証します。
3. 同じtarballを `npm publish <tarball> --access public --tag next` で公開します。
4. `npm view @youdays/mtga-draft-lens-watcher dist-tags` でnext=0.2.0-rc.1、latest=0.1.0を確認し、一時prefixへnextをグローバルインストールしてCLIを確認します。
5. RC確認が通った後、versionを0.2.0へ更新するPRのCIを確認してmainへマージし、再pack・検証したtarballをlatestとして公開します。
6. latest=0.2.0と、一時prefixへのlatest install / --version成功を確認してからPages v2を公開します。

問題が見つかった場合は次工程へ進みません。Release NotesとRollback時の利用者向け案内はREADMEを参照してください。
