# jeffrey-apps

htmlcat 切版直人的作品站。內容不是手寫的：build 時從 GitHub 的公開資料抓專案、星數、最近更新，產生靜態網頁。

- 首頁：自我介紹 → 作品 → 最近在忙什麼 → 工具 → 聯絡
- `/devlog/`：開發日誌，各專案的更新合成一條時間線
- `/work/`：全部作品，可依類型篩選（`/work/#kit` 直接帶到某一類）

## 指令

```bash
npm run build           # 抓最新資料並產生 dist/
npm run dev             # 用上次抓的資料重新產生，並在 http://localhost:4071 預覽（改版面用，快）
npm test
```

沒有任何依賴，不需要 `npm install`。需要 Node 20 以上。

build 會用 `GITHUB_TOKEN` 環境變數，沒有就用 `gh auth token`。token 只是為了不被流量限制擋住，以及拿活躍度格子；讀的都是公開資料。

## 改內容

全部在 `site.config.json`：

| 欄位 | 用途 |
|---|---|
| `brand`、`name`、`role`、`hero`、`contact` | 站名與首頁開頭、結尾的文字 |
| `avatar`、`palette` | 頭貼檔名（放在 `src/`）與馬賽克裝飾用的顏色 |
| `links` | GitHub、Email、Instagram、Threads。留空就不顯示 |
| `home` | 首頁作品區放哪些專案（`lead` 大卡、`dark` 深色卡、`small` 小卡、三棟、kit、自架清單） |
| `blurbs` | 專案的中文說明。沒寫就用 GitHub 上的描述 |
| `categoryOf` | 指定專案屬於哪一類。沒指定的照名稱與語言自動分 |
| `hide` | 不顯示的專案（正規表示式，比對名稱） |
| `redact` | 出現這些字樣的描述、網址、commit 訊息整段不用（私人網域、本機位址、IP） |
| `hideUntouchedBefore` | 這個日期之前就沒更新、又沒有星星的專案不顯示 |

沒有描述又沒有星星的專案、fork、已封存的專案一律不顯示。

## 部署

push 到 `main` 會由 GitHub Actions 跑測試、build、部署到 GitHub Pages。網站上的數字是部署當下的資料；想更新就在 Actions 頁手動執行一次，或隨便 push 一筆。

## 結構

```
site.config.json    內容設定
scripts/build.mjs   抓資料 → 整理 → 輸出 dist/
scripts/github.mjs  GitHub API（只讀公開資料）
scripts/model.mjs   分類、過濾、統計（純函式）
scripts/render.mjs  HTML 樣板
scripts/serve.mjs   本機預覽
src/                site.css、site.js
```
