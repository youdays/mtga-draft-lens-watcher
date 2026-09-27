# npmへの公開手順

CIが成功し、レビューしてマージしたmainから手動で公開します。package.jsonのversionを確認し、2回目以降は未公開のバージョンへ更新してください。

```sh
corepack yarn install --immutable
npm pack --dry-run
npm pack
```

`npm pack`時に自動でビルドされます。配布内容はdistのJavaScript、package.json、README、LICENSE、.env.exampleです。実設定や実ログが含まれていないことを確認します。

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
