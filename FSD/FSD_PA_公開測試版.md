# FSD-PA 公開測試版（本機模擬後端）

- 日期：2026-10-12
- 依據：`FSD/公開測試版_評估與積木規劃.md`（PB-A 定案）與產品負責人 10/12 裁決
- 範圍：只動前端與建置設定；內部展示版行為不變；不寫、不發布任何 Rules

## 產品負責人裁決（2026-10-12）

1. 天氣用模擬天氣（不連外部天氣服務）。
2. 模擬隊友：Michael、KC、Rosie、Show；訪客預設名稱 Ken（可改）。
3. 公開版第一頁沿用 yoxi 首頁示意圖。
4. 資料只存在訪客瀏覽器；3 天未使用即清除（以最後一次使用起算）。
5. 新 Firebase 專案（只開 Hosting）由產品負責人建立：專案 ID `yoi-public-demo`（網址 https://yoi-public-demo.web.app）。
6. 功能體驗清單 11 項：原 10 項＋「開啟定位，看地圖與天氣」（放最後、可略過，前 10 項完成即「全部體驗完成」）；第一次進入看完「怎麼玩」後自動跳出。
7. 體驗工具放進所屬頁籤；「一鍵模擬團隊達標」改為快轉到隊友走到達標，一次體驗只能用一次。
8. 回饋：選單最後一項與清單完成時，另開 Google 表單 https://forms.gle/6Pgw6uG15NGRVqsSA ，App 不帶任何資料。

## 架構（取代原 PA-01「資料層介面化」）

公開版建置（`vite build --mode public`）把 `firebase/app`、`firebase/auth`、`firebase/firestore` 換成 `src/local/` 的本機替身：

- 只實作 App 用到的函式：`doc`、`collection`、`query`、`where`（`==`、`in`）、`getDoc`、`getDocFromServer`、`onSnapshot`、`runTransaction`（`get`／`set`／`update`）、`serverTimestamp`、`Timestamp`、`onAuthStateChanged`、`signOut`。
- 文件存在記憶體，每次寫入後存進 `localStorage`；快照一律視為「伺服器已確認」。
- 現有服務與畫面不改寫；規則判斷沿用已測試的服務與純函式。
- 本機沒有 Rules：只有訪客自己的資料，不需要權限防護；服務本身送出的資料就是 Rules 會接受的資料。
- 模擬隊友與模擬新戶以同一套服務代為操作（暫時切換本機登入身分），資料一致性與正式版相同。

## 積木

| 編號 | 內容 |
|---|---|
| PA-00 | 建置模式 `public`、輸出 `dist-public`、獨立 Hosting 設定；公開版不含管理頁、登入頁與內部帳號 |
| PA-02 | 本機替身與資料保存、3 天清除、首次建立個人世界（場次、時鐘、訪客 Ken、四位隊友、一位模擬新戶） |
| PA-03 | 個人時鐘：快轉到明天、快轉到下週一、自動七天、重新開始體驗 |
| PA-04 | 模擬隊友：建隊後可邀請；隨時鐘前進產生步數並計入團隊 |
| PA-05 | 模擬新戶：綁定我的推薦碼、模擬首趟搭乘 |
| PA-06 | 訪客進入：首頁示意圖 → 直接進入 App（免登入） |
| PA-07 | 導覽沿用 Yoika 介紹頁；選單「功能體驗清單」10 項，完成與否直接從體驗資料判斷，「去試試」帶到對應頁面 |
| PA-08 | 聲明：模擬資料、非正式 yoxi／和泰 Points、非商業用途、資料只存在本機且 3 天未使用清除 |
| PA-09 | 外部服務：地圖沿用 OpenStreetMap（標示出處）；天氣改模擬 |

## 做不到的部分

跨裝置與多人即時同步（每位訪客自己一個世界）。

## 部署（產品負責人說「部署公開版」才執行）

```
npm run build:public
npx firebase deploy --only hosting --project yoi-public-demo --config firebase.public.json
```

內部版的部署指令與網址不變。
