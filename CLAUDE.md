# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト

楽器練習の譜読みを支援する自動譜めくり PWA(スマホ・タブレット向け)。React 19 + TypeScript + Vite、PDF 描画は pdfjs-dist、保存は IndexedDB(idb-keyval)。サーバーは無く、楽譜もマイク音声も端末の外へ出さないことが製品上の約束になっている(README に明記)。

UI 文言・コードコメント・README はすべて日本語。追加するものも日本語でそろえる。

## コマンド

```sh
npm ci                                   # 依存の導入(node_modules はコミットされない)
npm run dev                              # 開発サーバー
npm test                                 # 単体テスト(vitest run)
npx vitest run src/layout.test.ts        # 1 ファイルだけ
npx vitest run -t "テスト名の一部"        # 名前で絞る
npx vitest                               # ウォッチ
npx tsc --noEmit                         # 型チェックのみ
npm run build                            # 型チェック + 本番ビルド(dist/)
npm run preview                          # ビルド結果の配信(Service Worker 込みの確認はこちら)
```

- リンターは無い。`tsconfig.json` の `strict` + `noUnusedLocals` + `noUnusedParameters` がその代わりで、未使用の変数や引数は `npm run build` を落とす。
- vitest の設定ファイルは無く、既定の node 環境で動く。DOM・Web Audio・canvas はテストから使えない。
- マイク(`getUserMedia`)と PWA インストールは HTTPS か localhost でしか動かない。実機から LAN 越しに開発サーバーへつなぐ場合は HTTPS が要る。
- ビルドの「500 kB 超のチャンク」警告は pdfjs 由来で既知。

## アーキテクチャ

### 純粋ロジックと、それを駆動する Viewer

時間・DOM・マイクに触れない純粋ロジックが 3 つあり、テストがあるのはここだけ。

- `src/turner.ts` — 表示位置 `Pos { page, half }` と時計 `Clock { pos, elapsed, finished }`。`tick(clock, dt, timingOf, pageCount, halfTurn)` が dt 秒進めた新しい時計を返し、ページ境界と半ページめくりの判定を一手に持つ。
- `src/layout.ts` — 段マーク `System { y, bars }` から、分割線の位置(`splitY`)、上側を差し替える時点(`halfFraction`)、現在段(`systemAtFraction`)、ページの所要時間(`pageTiming`)を求める。
- `src/follow.ts` — `PlayGate`。音の立ち上がりと「まだ鳴っているか」から、演奏中/停止を判定する。

`src/Viewer.tsx` がこれらを 1 つの `requestAnimationFrame` ループで駆動し、表示・操作・設定 UI もすべて持つ。振る舞いを変えるときは、判定を純粋ロジック側に置いてテストを書き、Viewer には配線だけを足す、という分け方を保つ。

### 位置の持ち方

- 進行位置は「現在ページ内の経過秒」で持つ。小節や拍の位置は持たず、段や進行バーは `elapsed / duration` の割合から毎回求める。
- `half: 1` は「分割線より上に次ページ、下に現在ページが見えている」状態。`pos.page` は下側のページのまま。タップ位置からページを決める処理(`onStageClick`)はこれを考慮している。
- ページの小節数の優先順は、段マークの合計 → `barsByPage[page]` → `defaultBars`(`pageBars`)。段マークがあるページでは設定画面の小節数は編集不可になる。
- ページ番号は内部ではすべて 0 始まり。表示のときだけ +1 する。
- 段マークの `y` と分割線は、ページ高さに対する割合(0〜1)。画面座標への変換は Viewer の `rect`(ページが画面上で占める範囲)を通す。

### Viewer の時計と再描画

- 時計は `useRef`(`clock`)に置き、進行バーは DOM を直接書き換える。React の state を更新するのはページ・半ページ・現在段が変わったときだけ。毎フレームの `setState` を足さない。
- 設定は `settingsRef` 経由でループから読む。演奏中にテンポや段マークを変えても、ループを作り直さずに次のフレームから効く。
- `snapshot` は「最後に音が立ち上がった時点の時計」。マイク追従で停止と判定したら、`snapshot` から 1 拍進めた位置へ巻き戻して次の音を待つ。手動移動(`setClock`)は `clock` と `snapshot` を同時に書き換える。
- マイク使用時はカウントインとメトロノーム音を出さない(自分の音を拾うため)。
- 段マーク編集モード(`mode === 'mark'`)では半ページめくりを無効にし、常にページ全体を見せる。

### マイク入力

`src/mic.ts` が `AnalyserNode` を開き、`src/onset.ts` の `OnsetDetector`(スペクトルフラックス法)へ毎フレーム渡す。しきい値は `onset.ts` 冒頭の定数と `push` 内の係数。合成音でしか確認しておらず、実楽器・実機マイクでの調整は未着手なので、ここの数値は確定値として扱わない。

`AudioContext` は `src/metronome.ts` の `audioContext()` が 1 つだけ持ち、マイクと共有する。iOS ではユーザー操作の中で最初に呼ぶ必要があり、`togglePlay` の先頭で呼んでいる。

### ページの描画

`src/source.ts` の `PageSource` が PDF と画像を同じ「ページ」として扱う。`render` は呼ばれるたびに新しい canvas を返す。1 ページあたり 800 万画素の上限は iOS Safari の canvas 制限への対策。

Viewer は前・現在・次の 3 ページを `PageView` として常に置き、表示しないものは `visibility: hidden` で先読みだけさせる。半ページめくりは次ページの canvas を `clip-path` で上側だけ見せて重ねている。

### 保存

`src/store.ts`。IndexedDB のキーは 2 種類で、`scores`(全楽譜の `ScoreMeta[]`、設定込み)と `files:<id>`(その楽譜の Blob 配列)。

- `ScoreSettings` に項目を足すときは `defaultSettings` にも必ず足す。`listScores` が読み込み時に既定値で補うことで、旧バージョンで保存した楽譜との互換を保っている。項目の改名や意味の変更はこの仕組みでは救えない。
- `saveSettings` は一覧全体を読んで書き戻す。Viewer は設定かページが変わるたびに呼ぶ。

## リポジトリ

- 既定ブランチは `ccr-62f5fbf2-afuggv`(`main` は無い)。リモートは `origin` = GitHub の `YukiKudo03/score-reader`。
- CI・E2E テスト・デプロイ設定は無い。`data-testid`(`pageno` / `cursor` / `listen`)はブラウザでの手動・自動確認用に付けてある。
- 今後の方向(README「これから」): 楽譜認識(OMR)による段・小節の自動検出と音高照合での位置追従、顔ジェスチャーでのめくり、横向きの見開き表示、リピート・ダカーポ対応。
