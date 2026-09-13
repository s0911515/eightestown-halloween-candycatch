# eightes-candycatch

エイテス太のキャンディキャッチ。エイテスタウン ハロウィン2026のミニゲームで、`eightes-town` Firebaseプロジェクトの Hosting サイト `candycatch-site` にデプロイされます。

静的HTML/CSS/JS(Canvas 2D描画) + Firebase(Firestore)構成。ビルド不要。

## あそびかた

- 画面を左右になぞって(PCは←→キー)、エイテス太を動かしてかごでアイテムをキャッチする
- 制限時間は45秒。ライフは3つ(👻👻👻)、なくなるとその時点でゲーム終了
- 落ちてくるアイテムは[game.js](game.js)の`ITEM_TYPES`で定義されており、以下の効果を持つ

| アイテム | 種別 | 効果 |
| --- | --- | --- |
| キャンディ | 良い | 10点 |
| かぼちゃ | 良い | 20点 |
| ピーナッツ | 良い | 25点。キャッチすると10秒間スコア2倍 |
| 砂時計 | 良い | 5点。キャッチすると残り時間+5秒 |
| 星 | 良い(レア) | 40点。キャッチすると7秒間無敵+移動速度アップ(この間はこうもり/くもに当たっても弾き飛ばして+15点にできる) |
| こうもり | 悪い | ライフ-1 |
| くも | 悪い | ライフ-1。さらに4秒間エイテス太が小さくなる |
| 呪いのキャンディ | 悪い | ライフは減らないが、3秒間操作が左右反転する |

- 5回連続でアイテムをキャッチする(コンボ)たびに+20点のボーナス
- 出現頻度・落下速度は経過時間に応じて徐々に難しくなる(`difficultyProgress()`で0〜1に正規化して線形補間)

## スコア・ランキング

- ラウンド終了時に`candycatch_scores`コレクション(Firestore)へ`{ name, score, createdAt }`を保存し、上位5件のランキングと総プレイ回数を表示する
- 自己ベストスコアはlocalStorage(`candycatch_best_v1`)に保存
- 表示名はlocalStorage(`candycatch_name_v1`)に保存され、次回以降のプレイにも引き継がれる。結果画面で名前を保存すると、そのラウンドで登録済みのスコアドキュメントも`updateDoc`で更新される
- ランキングはドキュメントの追加・削除は誰でも可能(スコア詐称を厳密には防いでいない、コミュニティイベント向けの簡易実装)。セキュリティルールは[eightes-town-shared](https://github.com/s0911515/eightes-town-shared)の`firestore.rules`で一元管理

## 音声

- BGM(`assets/sound/background.mp3`)はループ再生し、末尾に近づくとフェードアウト→頭出し→フェードインで自然にループする。ゲーム開始のたびに、再生中・停止中にかかわらず必ず頭から鳴らし直す(長時間プレイでループ処理が止まってしまうケースの復帰も兼ねる)
- 効果音はWeb Audio APIの単純な発振音(キャッチ音・コンボ音など)と、効果音ファイル(吹き飛ばし・めまい・ホイッスル・ティウンティウン)を併用
- ミュート設定はlocalStorage(`candycatch_muted_v1`)に保存
- クレジット: BGM「What do you play?」by えだまめ88 / 効果音: Springin' Sound Stock, chiru, ZOO(index.htmlの遊び方オーバーレイにも表記)

## ファイル構成

- [index.html](index.html) — マークアップ、HUD・オーバーレイ(あそびかた/結果発表/カウントダウン等)
- [game.js](game.js) — ゲーム本体(Canvas描画、当たり判定、Firebase連携)を含む唯一のスクリプト
- [style.css](style.css) — 見た目全般
- [assets/](assets) — キャラクター・アイテム・背景の画像とサウンド

## セットアップ

1. [game.js](game.js)冒頭の`firebaseConfig`には、eightes-townプロジェクトに登録済みのWebアプリの設定値を反映済み。再取得する場合は `firebase apps:sdkconfig WEB <appId> --project eightes-town`
2. Firestoreの`candycatch_scores`コレクション用ルールは[eightes-town-shared](https://github.com/s0911515/eightes-town-shared)側で管理。変更した場合はそちらのリポジトリから `firebase deploy --only firestore:rules --project eightes-town` を実行してデプロイする

## デプロイ

mainブランチへのpushでGitHub Actionsが自動デプロイします。手動デプロイする場合:

```
firebase deploy --only hosting:candycatch-site --project eightes-town
```
