# MTGA Draft Lens watcher

MTG Arenaのドラフトを、MTGA Draft LensのWeb UIと連携するためのローカルツールです。`Player.log`を読み取り、現在のパックとピックしたカードを同じPC上のWeb UIへ送ります。

## 動作環境

- Node.js 22.11.0以上
- MTG Arenaの詳細ログを有効にした環境
- Web UIとwatcherを同じPCで実行

macOSでのQuick Draft連携を確認しています。Windows・Linuxの実機連携とPremier / Traditionalの現行ログとの照合は未確認です。

## インストール

次のコマンドでインストールできます。

```sh
npm install -g @youdays/mtga-draft-lens-watcher
```

## 使い方

1. MTG Arenaで詳細ログを有効にし、一度起動して`Player.log`を作成します。
2. ドラフトを始める前に、ターミナルでwatcherを起動します。

   ```sh
   mtga-draft-lens-watcher
   ```

3. [MTGA Draft LensのPick Viewer](https://youdays.github.io/mtga-draft-lens-pages/#/pickViewer)を同じPCで開きます。Chromeがローカルネットワークへのアクセス許可を求めた場合は許可してください。
4. Web UIに「Live」と表示されたことを確認し、ドラフトを開始します。

終了するときは、ターミナルでCtrl+Cを押します。

起動前のログは読み返しません。ドラフトの途中から起動した場合は、次のパック更新から表示されます。MTG Arenaの再起動によるログの再作成には自動で追従します。

## 設定

macOS・Windowsでは、次の場所にある`Player.log`を自動で探します。

| OS | 既定の場所 |
| --- | --- |
| macOS | `~/Library/Logs/Wizards of the Coast/MTGA/Player.log` |
| Windows | `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log` |

別の場所にあるログやLinux環境では、設定ファイルでパスを指定してください。例えば、`watcher.env`を作成します。

```dotenv
PLAYER_LOG_PATH="C:/Users/ユーザー名/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log"
```

そのファイルを指定して起動します。PowerShellでも同じコマンドを使えます。

```sh
mtga-draft-lens-watcher --config "watcher.env"
```

| 設定 | 内容 |
| --- | --- |
| `PLAYER_LOG_PATH` | Player.logのパス。絶対パスを推奨します。 |
| `ALLOWED_ORIGINS` | 別のWeb UIを使う場合の接続元Origin。カンマ区切りで指定し、既定の`https://youdays.github.io`を置き換えます。パスや末尾の`/`は含めません。 |

環境変数は設定ファイルより優先されます。`--config`を省略した場合、設定ファイルは読みません。設定変更後はwatcherを再起動してください。

設定ファイル内の`~`・`%USERPROFILE%`・`$HOME`は展開されません。実際のパスを指定してください。相対パスは起動したディレクトリを基準にします。

watcherは`ws://127.0.0.1:5500`で待ち受けます。既定の接続元に加え、HTTPの`localhost`と`127.0.0.1`は任意のポートで利用できます。

## 困ったときは

- **ログが見つからない**：MTG Arenaを起動して詳細ログが有効か確認し、必要に応じて`PLAYER_LOG_PATH`を指定してください。
- **Web UIにつながらない**：watcherとブラウザが同じPCで動いているか、Chromeのローカルネットワークアクセスが許可されているか確認してください。
- **5500番ポートが使用中**：すでに起動しているwatcherなどを停止してから再実行してください。
- **「Live」なのにカードが出ない**：次のパック更新を待ってください。ログの削除・上書きによって、未読のイベントを取得できない場合もあります。

使い方とバージョンは次のコマンドで確認できます。

```sh
mtga-draft-lens-watcher --help
mtga-draft-lens-watcher --version
```

解決しない場合は[Issues](https://github.com/youdays/mtga-draft-lens-watcher/issues)へ、OS・Node.jsとwatcherのバージョン・再現手順を添えて報告してください。ログを添付する場合は、アカウント情報やトークンなどを除いてください。

## 更新・アンインストール

```sh
npm install -g @youdays/mtga-draft-lens-watcher@latest
npm uninstall -g @youdays/mtga-draft-lens-watcher
```

## ソースから起動する

```sh
git clone https://github.com/youdays/mtga-draft-lens-watcher.git
cd mtga-draft-lens-watcher
corepack yarn install --immutable
corepack yarn build
corepack yarn start
```

設定ファイルを指定する場合は、最後のコマンドを`corepack yarn start --config "watcher.env"`に置き換えてください。

## ライセンス

[MIT](LICENSE)
