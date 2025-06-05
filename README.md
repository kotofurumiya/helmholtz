# Discord読み上げbot ヘルムホルツ

特定のテキストチャンネルに書き込まれたメッセージを、
ボイスチャンネルで読み上げます。

マイクをミュートしている人のメッセージしか読み上げません。

## 必要な権限

- Privileged Gateway Intents
  - ✅ PRESENCE INTENT
  - ✅ SERVER MEMBERS INTENT
  - ✅ MESSAGE CONTENT INTENT
- OAuth2
  - SCOPES
    - ✅ bot
    - ✅ applications.commands
    - ✅ applications.commands.permission.update
  - BOT PERMISSIONS
    - GENERAL PERMISSIONS
      - ✅ Read Message/View Channels
    - TEXT PERMISSIONS
      - ✅ Send Message
      - ✅ Read Message History
    - VOICE PERMISSIONS
      - ✅ Connect
      - ✅ Speak

## Slash Commandの登録

Helmholtzはスラッシュコマンドに対応している。

```
/helmholtz gender male
/helmholtz gender female
/hemlholtz pitch 5
```

スラッシュコマンドを使うには以下の条件を満たしている必要がある。

- botアカウントを `bot` + `applications.commands` でサーバに招待している
  - 普通は `applications.commands` はつけていないと思うので、bot画面からもうち一度招待
  - パーミッションは上書きできるので既にbotがサーバに入っていてもキックする必要はない
- スラッシュコマンドをサーバに登録している
  - スクリプトを同梱しているのでそれを実行すればok。

コマンドの登録は

```
export DISCORD_TOKEN="botのトークン（Discordの開発者ページから取得できる）"
export DISCORD_APPLICATION_ID="botのアプリケーションID"
export DISCORD_GUILD_ID="サーバID"
npm run start:registercommands
```

で行える。

## Docker

Discordの各種IDを調べて環境変数に書き込む。

各種IDは設定から開発者モードを有効化して「右クリック→IDをコピー」で取得できる。

- DISCORD_TOKEN: botのトークン（開発者ページの「Bot」から取得）
- DISCORD_GUILD_ID: サーバID
- DISCORD_SOURCE_CHANNEL_ID: テキストチャンネルのID

Google Cloud Platform で Cloud Text-to-Speech APIを有効にし、サービスアカウントを作る。
実行するコンテナ上でサービスアカウントの認証が通っている状態にする。

あとはビルドしてこれらの環境変数とともに実行する。

## 手動で動かす

Node.jsのv20以降で動かす。

依存モジュールをインストールする。

```
npm install
```

ビルドする。

```
npm run build
```

Discordの各種IDを調べて環境変数に書き込む。

各種IDは設定から開発者モードを有効化して「右クリック→IDをコピー」で取得できる。

- DISCORD_TOKEN: botのトークン（開発者ページの「Bot」から取得）
- DISCORD_GUILD_ID: サーバID
- DISCORD_SOURCE_CHANNEL_ID: テキストチャンネルのID

Google Cloud Platform で Cloud Text-to-Speech APIを有効にし、サービスアカウントを作る。
`gcloud` コマンドを使うなどしてCloud Text-to-Speech APIにアクセスできるアカウントでログインする。

これらの環境変数と一緒に以下を実行する。

```
export DISCORD_TOKEN="token"
export DISCORD_GUILD_ID="00000"
export DISCORD_SOURCE_CHANNEL_ID="12345"
npm run start
```

## 追加機能

また、以下の環境変数も使用できる。

- ENABLE_SYNC_WITH_FIRESTORE=true

`ENABLE_SYNC_WITH_FIRESTORE` を有効にするとスラッシュコマンドによるユーザ設定をFirestoreに永続化する。Cloud Firestoreのセットアップと、サービスアカウントに追加でCloud Firestoreの編集権限が必要になる。