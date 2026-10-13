# yoi 遊移遊戲（原名智行遊移）交接快照（2026-09-30 起，持續更新）

## 最新狀態（2026-10-13，新 session 先讀這段；下方 10-05 段為較早紀錄）

- **兩個網站**（部署都只動 Hosting、不動 Rules；雲端與本機 Rules 皆為 `ffc851d07d033003…`，03E＋04B 已於 2026-10-06 由產品負責人發布，10-13 以貼上的 Console 內容核對一致）
  - 內部展示版 https://yoxi-yoi-demo.web.app ：指令「部署前端、不動 Rules」→ `npm run build` ＋ `npx firebase deploy --only hosting`。
  - 公開測試版 https://yoi-public-demo.web.app ：指令「部署公開版」→ `npm run build:public` ＋ `npx firebase deploy --only hosting --project yoi-public-demo --config firebase.public.json`。
  - 兩者都只在產品負責人明確說出上述指令時部署。
- **公開測試版**（規格 `FSD/FSD_PA_公開測試版.md`）：`vite --mode public` 把 `firebase/app|auth|firestore` 換成 `src/local/` 本機替身（資料存瀏覽器、3 天未用清除），現有服務與畫面沿用。公開版專屬程式在 `src/public/`（world、sim、mount、views、checklist、weather-sim）；入口在 `main.ts` 的 `IS_PUBLIC`（`src/app/edition.ts`）。
  - 模擬隊友 Michael、KC、Rosie、Show；訪客預設 Ken；模擬新朋友；推薦碼欄預填 Michael 的 YOI-M01。
  - 體驗工具放在各頁籤（今日／昨日：快轉到明天；本週：自動七天、快轉到下週一；寶箱：一鍵模擬團隊達標，快轉到隊友走到 30 萬，一次體驗只能用一次）。
  - 功能體驗清單 11 項（第 11 項「開啟定位，看地圖與天氣」可略過）；第一次進入看完「怎麼玩」後自動跳出。
  - 選單：功能體驗清單、修改我的名稱、關於公開測試版、重新開始體驗、給我們回饋（Google 表單 https://forms.gle/6Pgw6uG15NGRVqsSA ）。
  - 分頁名稱「yoi 遊移遊戲｜公開測試版」（vite 外掛在建置時替換）。天氣為模擬天氣。
- **近期內部版改動**：FSD-08C（步數頁今日卡、慶祝彈窗）、`FSD/FSD_UX1010_全站調整.md`（Rosie F1–F17：團隊寶箱「達標當週就能開」等）、即將推出介紹頁（`src/assets/intro-*.png`）、全站「你」改「您」。
- **其他產出**：`UI-design/QRcode/`（公開版 QR，卡片版含去背與白字版）；`報告/yoi_開發進度報告_20261008.html`。
- **測試**：`npm test`（含 `tests/today-card.test.mjs`、`tests/public.test.mjs`）全過；本機預覽 `.claude/launch.json` 的 `vite-dev`（5173）、`vite-public`（5174）。
- **GitHub（2026-10-13 建立）**：私人 repo https://github.com/1989lyj-ken/yoi-demo-webapp （本目錄已 `git init`，換行一律 LF，見 `.gitattributes`）。CI（`.github/workflows/ci.yml`）每次 push 跑 tsc、`npm test`、兩版建置與 Emulator Rules 測試（`scripts/test-firestore-rules-ci.sh`，首次 121/121）。手動部署 `deploy-hosting.yml`（Secrets `FIREBASE_SA_INTERNAL`／`FIREBASE_SA_PUBLIC`，服務帳戶只有 Firebase 託管管理員角色；環境限 `main`）：2026-10-13 公開版首次經 Actions 部署成功。部署仍只在產品負責人下指令時執行（`gh workflow run deploy-hosting.yml -f target=public|internal`）。
- **待辦**：遊戲語調切換暫不啟動（2026-10-13 產品負責人決定，規劃見 `FSD/遊戲語調切換_規劃.md`）；Hermes 試跑（`驗收指令_Hermes試跑.md`）等結果。（J7 表情符號隊名已於正式環境驗收通過。）

## 目前狀態（2026-10-05，新 session 先讀這段）

- **雲端 Rules**：`70acb267…5327`（2026-10-04 產品負責人發布，含 01C、03B-UI、03C-1、03C-2、04A、AC1、06A、07A）；場次 `s6`（起始 2026-10-05 09:00）。
- **雲端前端**：08A-6 已部署（2026-10-05）。部署歷程：08A-1／08A-2（產品負責人）→ 08A-3、08A-4、08A-5、08A-6（產品負責人指示由 Claude `firebase deploy --only hosting`，Rules 未動）。
- **待人工驗收**：`發布與驗收清單_AC1_06A_07A.md` 的 F（08A-3）、G（08A-4）、H（08A-5）、I（08A-6）段；Hermes agent 依 `驗收指令_給agent.md`（畫面位置速查已改為標籤式版面，第 9 節為 08A-6）。agent 不得推進時間或重設場次。
- **待發布：03E＋04B（合併，已實作、QA／Security 審查通過、建議項已修）**
  - 待發布 Rules 雜湊 `ffc851d07d033003a2c12f4b65a07f3bd5295bc2acc332892c0509cb661b1b90`（LF）；回復檔 `tests/fixtures/published-rules-70acb267.rules`。發布步驟與驗收：`發布與驗收清單_AC1_06A_07A.md` J 段（先 Rules 後前端，不重設場次）。
  - 03E：`src/team/team-name.ts`、`team-name-service.ts`、`team-panel.ts`（rename 對話框）、`views.ts`（`#team-rename`、`teamRenameDialogView`）。Emulator 實測 Rules `string.size()` 以 UTF-16 計數，表情符號算 2 個字（提示措辭產品負責人已確認）；發布後需在正式環境驗 J7。
  - 04B：`weekVerdict` 只看七天達標；規則句與遊玩指南已改。mutation：teamname 26 殺／3 等價、coupon 33 殺／5 等價。
  - 文件修訂已完成（2026-10-05 產品負責人確認）：PRD §5.2 與 P21、P22；`FSD_04A`、`FSD_08A-3`、`FSD_08A-6` 加註「04B 起不適用」。
- **同批前端（2026-10-06，不改 Rules）**：產品負責人 15 點畫面調整（里程碑改為不可點的狀態框、領點只用下方按鈕、昨日恢復里程碑列與「不讓昨日的步數白費」、乘車加成汽車圖示、移除地圖上方昨日提醒、設計師 LOGO `src/assets/yoi-lockup.svg`、團隊按鈕等寬、寶箱圖案依 3-5、移除診斷畫面與關於展示版）、管理頁「自動七天」（`src/admin/auto-week.ts`）、FSD-08B 定位天氣（`src/weather/`，Open-Meteo）。驗收：清單 J14–J25。
- **公開測試版**：評估與積木 `FSD/公開測試版_評估與積木規劃.md`（PB-00～PB-10，尚未排程）。
- **不開發**：02C、定位估算步數、Apps Script（已移除）、03D 短邀請碼（備案）、隊名重複檢查（2026-10-05 決定不加）。
- **下一步**：產品負責人依 J 段發布 Rules → 部署前端 → 驗收 F–J；全部通過後錄製 Demo。發布後把 Rules 基準改為 `ffc851d0…`。本機驗證基準：`npm test` 192/192、`npm run test:rules` 121/121（PowerShell 用 `npm.cmd`／`npx.cmd`）。

## 目標與邊界

- 六人內部展示版；產品決策以 `PRD/智行遊移_PRD_v0.1.md` 的文件內版本及產品負責人後續決策為準，開發規範見 `AGENTS.md`，積木契約見 `FSD/`。
- 步數、乘車與 Points 為模擬資料；跨帳號團隊資料共享與權限必須是真實可驗證功能。AI 情境推薦不在首版。
- 不自行發布 Firestore Rules、部署、變更或重設雲端資料、開啟計費服務；這些由產品負責人掌握。不要將憑證寫入檔案。

## 技術與目錄

- Vite + TypeScript 前端：`src/`；Firestore Rules：`firestore.rules`；Rules Emulator 測試：`tests/firestore-rules.test.mjs`；其他測試：`tests/`、`gas-spike/`。
- 契約：`FSD/FSD_03A_招募成團與今日共享薄片.md`、`FSD/FSD_03B_退團週鎖定與隊長交接薄片.md`。03B 文件已於 2026-09-30 晚間改為單一 schema 描述，與現行 Rules／測試一致。
- 本目錄目前不是 Git repository（`git status` 回報 not a git repository）；請先保留原始檔案，不要為了接手而重建或覆蓋。

## 目前實測狀態

- `npx tsc --noEmit`：通過。
- `npm test`：13/13 通過（3 個 daily-state + 10 個 gas-spike）。
- `npm run build`：通過；Vite 提示單一 JS bundle 超過 500 kB，非阻斷。
- `npm run test:rules`：43/43 通過（連續兩次）。已修：重複的 `actorMemberId`、list `+` 串接、既存索引 `clockVersion` 早於目前時鐘時無法退團／回隊、招募取消或退團後無法再建隊；隊伍規則改用 `diff` 並移除跨文件重複形狀驗證以避開 1000 表達式上限。測試改為單一 schema，含 03B 正反向、竄改連結欄位、並發與 5 人最壞情況。Emulator 日誌中的「1000 expressions」只出現在被拒的 dailySteps 更新（`firestore.rules` 約第 218 行，既有問題），團隊規則沒有。
- 產品負責人裁決（2026-09-30）：隊伍／成員索引與每日步數皆採「新場次才啟用」單一格式，不遷移舊資料；暫停隊伍成員退出仍鎖週，待 03C 再檢視。
- 審查進度：Architect 回溯審查 4 項阻擋已修；Security 通過（無阻擋）；QA 2 項阻擋已補測試，`canJoin` 改為缺週 ID 時 fail closed。QA 覆核後補強封存隊伍與跨場次建隊測試，QA 確認通過（2026-10-01，雜湊見 `FSD_03B`）。三方審查完成，待產品負責人核准 Rules 發布與新場次啟用。
- 注意：Emulator 只記錄非交易寫入被拒的原因，`runTransaction` 被拒不會出現在日誌；判斷反向測試是否因 1000 上限而假通過時，需以 writeBatch 重建案例確認（QA 已對 03B 關鍵案例做過，皆為邏輯拒絕）。
- 開放退團 UI 前另需：封存隊伍狀態顯示、週鎖定時停用建隊／加入按鈕、隊友退團或自身退團時清除過期名單與步數（QA 前端行為第 1–3 點）。
- **雲端狀態（2026-10-01，產品負責人執行）**：已發布 `firestore.rules`（SHA-256 `9ed2dfd2…8676`）；`demo/current` 切換為新場次 `sessionId=yoi-2026-10-01`、`clockVersion=2`、`scenarioNow=2026-10-01T09:00:00+08:00`、`activityWeekId=2026-09-28`（舊場次 `demo-2026-09-29-01` 無隊伍／步數資料）；Firebase Hosting 已部署 `dist/` 至 https://yoxi-yoi-demo.web.app（設定見 `firebase.json`／`.firebaserc`，僅 hosting）。已確認自助註冊關閉、`membersByUid` 欄位完整。
- **雲端冒煙測試（2026-10-01，產品負責人於 Hosting 網址實測）全部通過**：兩帳號登入、今日步數／乘車／領點經伺服器確認、建隊與邀請碼加入成團、同隊互看步數、第三帳號無法讀取、手機版面無破版。同隊步數更新目測不到 1 秒；此為同一台電腦兩個瀏覽器環境加單支手機的觀察，非計時量測，也不是多人多網路實測，尚不可宣稱已達跨裝置一秒同步目標。

## 正在進行但未完成的 03B

- 03A 曾有本機 Rules Emulator 24/24 通過的安全基線。03B 要加成員自行退團、當週鎖定、隊長自動接任與手動轉讓。
- 首輪雙格式 03B 遇到 Firestore Rules 1000-expression 上限。架構決策改為新場次使用單一 canonical team/membership schema，邀請碼直接使用 teamId，移除冗餘 `teamCodes` 索引；現有雲端場次資料保持不動，新場次由產品負責人決定何時啟用。若要原地沿用既有隊伍，需另行決策遷移方案。
- `demo/current.activityWeekId` 已由產品負責人核定作為共享週 ID（台北時間週一日期）；缺少時 03B 操作應 fail closed。退出正式隊伍後當週不得建隊或入隊；招募取消可重試。隊長退出由最早加入的現存成員接任；隊長不得踢其他隊員。
- 開放退團／轉讓 UI 前須先完成：`team-service.ts` 錯誤分類與「結果未確認後重讀」、移除舊格式容錯（`parseTeam`／`parseMembership` 的預設值補齊）。
- 03C／FSD04 契約審查前：先做 daily Rules 收斂小積木（新場次單一 daily 格式、update 以 `diff` 分流），並把「Rules 預算」列為後續契約必填。

## FSD-02B 管理者工具（2026-10-01）

- 契約 `FSD/FSD_02B_管理者工具_情境時間與場次重設.md`：Architect 契約審查 → 實作 → QA／Security 審查（阻擋 C1、B1、B2 已修）→ 短版確認皆通過。產品負責人裁決：準備隊員資料延至 FSD-02C（01C 之後）；重設確認畫面以「全部展示成員（六人）」描述。
- Rules 版本 `cb733e09…c177`：`demo/current` 只允許管理者推進（不倒退、週 ID 由 Rules 以 timestamp 驗證）或重設（新 ID 固定 `s{clockVersion}`），且必須同批新建 `demoClockLog/{clockVersion}` 稽核紀錄。Rules 測試 47/47，單元測試 17/17。
- 前端：`src/admin/`（獨立管理畫面，管理者在純展示與共享模式頁首有「管理」入口）；`main.ts` 情境監看器偵測到時間或場次變更即停掉訂閱並以覆蓋層要求重新載入。
- **已上線（2026-10-01）**：產品負責人發布 Rules（`cb733e09…`）並部署 Hosting，雲端實測 6 項全部正常（含推進時間、重設場次、兩端即時提示重新載入、手機版面）。實測含重設場次，現行 `sessionId` 已變為 App 產生的 `s{clockVersion}` 格式，實際值以 Console `demo/current` 為準；之後推進時間與重設一律使用管理畫面。
- 發布後的 Console 操作前提：不刪 `demoClockLog`、不調小 `clockVersion`、不手動設定 `s` 加數字的 `sessionId`、避免直接改 `demo/current`。

## FSD-UI01 基礎樣式（2026-10-01，審查通過，已部署）

- 契約 `FSD/FSD_UI01_基礎樣式_設計規格1.24.0.md`。實作：token 化 `src/style.css`、`src/ui/`（icons／components／views／html）、預覽頁 `ui-preview.html`（開發專用，不進 dist）、`tests/ui-tokens.test.mjs`（已併入 `npm test`）。原檔備份 `.backup/ui01-2026-10-01/`。
- Security 通過；QA 兩項阻擋（單色勾號變實心塊、週曆紅色小字）已修並 QA 短版確認通過（style.css 68cd831f…、icons.ts 80434431…）。本機：tsc、npm test 26/26、build 通過；25 種預覽狀態在 360／440 寬無溢出。
- **已部署（2026-10-01，產品負責人）**，含步數滾動動畫；手機實機確認畫面正常（動畫細節未特別回報）。外觀已改變（墨藍主按鈕、字級放大、雙色圖示、寬螢幕 440 置中）。
- 2026-10-01 追加：純展示模式設定步數後，數字以「先快後慢」（ease-out quart，0.9–3 秒）滾動到目標；領點按鈕在動畫結束後才解鎖；減少動態效果時直接顯示。工具 `src/ui/count-up.ts`（共享模式併入時沿用）；單元測試 `tests/count-up.test.mjs`。已在瀏覽器以計時器取代 rAF 量測曲線（隱藏窗格會暫停 rAF）；待 QA 與手機實機確認。
- 非阻擋待辦（細修階段）：依賴圖檢查補 re-export／動態 import／.js 路徑；dist 補 MIT 全文；preset 查詢用 Object.hasOwn；共享模式步數紅數字、Progress/Trip 底板與計數列、Toast 字級與驚嘆號、theme-color 例外登記、週曆按鈕寬 36；契約「7 個」應為 9 個。

## FSD-01C 每日步數規則收斂＋昨日補同步與補領（2026-10-01，本機實作完成）

- 契約 `FSD/FSD_01C_每日步數規則收斂與昨日補同步補領.md`（第 3 版，含實作、審查紀錄與審查基準雜湊）。Architect 兩輪附條件通過（已併入）；Security 通過；QA 附條件通過，阻擋項已修並經 QA 短版確認**通過**（30 項 mutation 抽驗 28 項被抓到、1 項等價變異）。**本機審查全部完成，待產品負責人核准 Rules 發布與新場次啟用**（審查基準雜湊見契約文末）。產品負責人裁決：隊友帳號 inactive 時仍可讀其今日步數（停用帳號流程列入 FSD-02C 待辦）。
- 產品負責人裁決：昨日補同步不選時間，片段固定記為昨日 23:59:59（PRD §5.1、§8、P09、P25、D14 已修訂）；乘車只限今日；欄位收斂為 `rideCompletedAt`／`claimed`；事件子集合 `events/{seq}` 兼作步數片段與點數帳本；總餘額、鈴鐺延後。FSD-01A／01B 已標示被取代。
- 本機：`test:rules` 59/59、日誌無 1000 expressions 訊息；`npm test` 36/36、tsc、build 通過；預覽頁 375 px 正常。**未以真實 Firebase 實測**；契約列有 5 項人工驗收。
- 上線需同一時段：發布新 Rules → 管理者重設場次 → 部署 Hosting（期間展示不可用；舊場次舊格式文件新前端不讀，顯示請重設場次）。
- 開發用：`.claude/launch.json` 新增 `vite-dev-5180`（另一個工作階段占用 5173 時使用）。

## FSD-03B-UI 退團、取消招募與隊長交接介面（2026-10-01，本機實作完成）

- 契約 `FSD/FSD_03B-UI_退團與隊長交接介面.md`（第 2 版，含 R1–R10、實作紀錄與審查基準雜湊）。Architect 首輪退回後修訂、短版覆核附條件通過（條件已併入）；QA 與 Security 皆附條件通過，條件已修（含 Security 發現的 `instanceof FirestoreError` 缺陷，01C 的 `daily-service.ts` 同步修正），QA 短版確認**通過**。**本機審查完成，待產品負責人安排部署與人工驗收**。**不改 Rules**（`firestore.rules` 仍為 01C 版 `9fb63471…`）。
- 產品負責人裁決：退出文案照 PRD 並加「團隊貢獻與寶箱功能後續開放」；暫停隊伍 1 人退出仍鎖週；更換隊長入口在名單旁；Dialog-Confirm 以新樣式類別實作。
- 做了什麼：取消招募／退出／更換隊長的兩步確認 UI、週鎖定顯示與建隊加入停用、結果未確認後伺服器重讀（不自動重送）、嚴格解析移除舊格式容錯、名單 `permission-denied` 重讀防循環。新增 `src/team/team-state.ts`（純函式）、`src/team/team-panel.ts`（控制器）。
- 本機：`npm test` 55/55、`test:rules` 59/59、tsc、build 通過；R4 以 Emulator 實測（讀取階段與 commit 階段的 `permission-denied` 相同，必須以階段區分）；以探針頁驅動真實面板驗證對話框行為。**未以真實 Firebase 實測**。
- 部署順序：**01C 的 Rules 發布前，不得部署含 01C 前端的版本**。03B-UI 本身不需新 Rules、不需重設場次。

## FSD-03C-1 團隊週貢獻帳與進度（2026-10-02，本機實作完成）

- 契約 `FSD/FSD_03C-1_團隊週貢獻帳與進度.md`（第 2 版，含裁決、Architect 兩輪、實作紀錄、QA／Security 首輪審查與修正、審查基準雜湊）。QA 無阻擋、Security 附條件通過；修正後短版覆核 QA 無阻擋、**Security 通過**，覆核邊角項已修正。**待產品負責人發布 Rules（與 01C 同一次）與手動驗收**。
- 架構（產品負責人核定）：方案 A 逐筆貢獻帳，Rules 只驗每筆資格與唯一性、不加總；各裝置以純函式重播總量與試算達標時點；信任模型為自報模擬資料、無反作弊。裁決：同一情境時間以伺服端時間打破平手；乘車早於入隊仍讓之後片段享有加成；暫停回補由前端精確判定、Rules 近似（已接受風險）；已退團者的正常補記可能回補暫停期間（N1 (c)）。
- **本積木新增 Rules**（`teamContrib`），雜湊 `e688eb22…`；與 01C 同屬一次發布。本機：`test:rules` 81/81、`npm test` 73/73、tsc、build；`npm run test:rules:mutation` 37 項中 33 項被抓到、4 項為等價變異。**未以真實 Firebase 實測**。
- 發布前核對：`membersByUid.memberId` 不得含底線（Security Info-1）。03B-UI 退團文案已改為「寶箱功能後續開放」。
- 下一步：03C-2（週結果記錄、達標名單鎖定、補同步提前與補發）。03C-2 不得以「本週有帳目」判定參與者。

## FSD-03C-2 週結果記錄與寶箱資格名單（2026-10-02，本機實作完成）

- 契約 `FSD/FSD_03C-2_週結果與寶箱資格名單.md`（第 2 版，含 6 項裁決、D1 採 B、Architect 兩輪、實作紀錄、QA／Security 首輪審查與修正、審查基準雜湊）。QA 無阻擋、Security 通過；修正與 Low-1（創辦人自建隊起在隊）已完成；短版覆核 QA 無阻擋、**Security 通過**，覆核項目已修正。**待產品負責人發布 Rules（與 01C、03C-1 同一次）與手動驗收**。
- 設計：週結果保存首次達標 M₁（不可變）與目前達標 Mc（只能提前）；寶箱資格每人每週一筆，依 M₁ 或 Mc 判定在隊；由在隊成員的裝置替所有合資格者逐筆寫入；週一可結算上週、週二封存。是否達標由各裝置重播判定（信任模型，Rules 不加總）。抽獎、開箱屬寶箱積木。
- **本積木新增 Rules**（`teamWeeks`、`chestAwards`），`firestore.rules` 雜湊 `6959db5f…`，與 01C、03C-1 可同一次發布。本機：`test:rules` 102/102、`npm test` 95/95；`npm run test:rules:mutation:week` 58 項中 50 被抓到、8 等價（約 15 分鐘；執行器遇第一條失敗即停，並以基準與 canary 自我檢查）。之後 mutation 只重跑 Rules 有變動的積木。**未以真實 Firebase 實測**。

## FSD-04A 七日全勤與乘車券（2026-10-02，本機實作完成）

- 契約 `FSD/FSD_04A_七日全勤與乘車券.md`（第 2 版，含 7 項＋Q1–Q3 裁決、Architect 兩輪、實作紀錄、QA／Security 首輪審查與修正、審查基準雜湊）。QA 無阻擋、Security 附條件通過，修正完成；短版覆核 QA 通過、Security 附條件通過（L3 已修並以 mutation 驗證）。**審查完成，待產品負責人依 `發布與驗收清單_01C_03C_04A.md` 與 01C、03C 一次發布並人工驗收**。
- 設計：Rules 讀本人七份 01C 每日文件（路徑由 Rules 以 `weekId` 自行組出）驗證七日 6,000 與週日第三點，發券讀 9 份文件；券每人每週一張、只能建立，效期為入帳情境時間加 30 天；前端每天檢查本週與上週並補發（Q1-A）。
- **本積木新增 Rules**（`rideCoupons`），`firestore.rules` 雜湊 `6f5c1e4c…`（含 01C、03C-1、03C-2、04A）。**產品負責人決定：01C、03C 與 04A 審查通過後一次發布**（不先發布 01C／03C；目前前端已含 04A 畫面，舊 Rules 下會讀取失敗）。本機：`test:rules` 109/109、`npm test` 111/111；`npm run test:rules:mutation:coupon` 38 項中 32 被抓到、6 等價。

## 已發布：01C、03B-UI、03C-1、03C-2、04A（2026-10-02）

- 產品負責人依 `發布與驗收清單_01C_03C_04A.md` 完成發布（Rules `6f5c1e4c…5882`，發布後核對內容一致；Console 存檔為 CRLF，雜湊不同屬正常）、重設場次為 `s6`（起始 2026-10-05 09:00）、部署前端並人工驗收。驗收意見見 `驗收紀錄.md`。

## FSD-AC1 首輪驗收修正（2026-10-03，本機實作完成）

- 契約 `FSD/FSD_AC1_首輪驗收修正.md`（R1–R6 裁決、Architect 短版附條件通過並併入、實作紀錄、QA／Security 審查與修正、最終雜湊）。QA 無阻擋、Security 通過，修正已重新驗證。**與 06A 一起發布**（合併清單 `發布與驗收清單_AC1_06A_07A.md`）。
- R1 儲存／補同步按鈕只在步數增加時可按；R2 不改；R3 隊友名稱改讀新唯讀集合 `memberProfiles/{memberId}`（產品負責人以 Console 建立，`memberId` 不改）；R4 今日原始／今日有效／本週計入；R5 本週建立的隊伍隱藏「上週」那一行（訂閱與結算不動）；R6 車資欄位常駐外框。
- **Rules 只新增 `memberProfiles` 區塊**，雜湊 `850e594c…`；拿掉區塊即為已發布版本。**不需重設場次**。本機：`npm test` 118/118、`test:rules` 111/111、`test:rules:mutation:profiles` 7/7 被抓到。
- 發布時：先在 Console 建 6 份 `memberProfiles`，再發布 Rules、部署前端；發布清單中「除 `membersByUid` 外不得以 Console 寫入」改為「除 `membersByUid`、`memberProfiles` 外」。
- 「展示模式改接共享資料」屆時沿用 `MemberNames` 顯示隊友名稱。

## FSD-06A 寶箱開箱與點數總帳（2026-10-03，本機實作完成）

- 契約 `FSD/FSD_06A_寶箱開箱與點數總帳.md`（Q1–Q6 裁決：Q1-B 瀏覽器抽獎、接受可自選；Q2-A 即時加總；Architect 附條件通過並併入；QA 無阻擋、Security 附條件通過，修正已重新驗證；最終雜湊）。**待產品負責人依 `發布與驗收清單_AC1_06A_07A.md` 與 AC1 一起發布並人工驗收**。
- Rules：新增 `chestOpens`、01C `days` 本人 `list`、移除 `gasSpike`；雜湊 `fd6002a6…`。**與 AC1 一起發布，不需重設場次**；不可先部署前端。
- 本機：`npm test` 116/116、`test:rules` 109/109、`test:rules:mutation:chest` 32 項（30 被抓到、2 等價）。

## FSD-07A 推薦新戶（2026-10-03，本機實作完成）

- 契約 `FSD/FSD_07A_推薦新戶.md`（Q1–Q7 全照建議、M3-(a) 互推競態列為已知限制；Architect 附條件通過並併入；QA 通過、Security 附條件通過，修正已重新驗證；最終雜湊）。**待產品負責人依 `發布與驗收清單_AC1_06A_07A.md` 與 AC1、06A 一起發布並人工驗收**。
- Rules：新增 `referrals`；最終雜湊 `70acb267…`（AC1＋06A＋07A 同版）。產品負責人決定 **AC1＋06A＋07A 一起發布**，不需重設場次；先發布 Rules 再部署前端。
- 本機：`npm test` 123/123、`test:rules` 114/114、`test:rules:mutation:referral` 30 項（26 被抓到、4 等價）。

## FSD-02C 準備隊員資料與停用帳號（2026-10-03，範圍定案：不開發）

- 契約 `FSD/FSD_02C_準備隊員資料與停用帳號.md`：產品負責人裁決 **Q1-C 不做代填**（每位成員用自己的裝置操作，符合 PRD 展示情境；代填需同時重審 01C 與 03C-1）、**Q2-B 不做停用並移出隊伍**（換人用重設場次）。兩者列為後續版本。
- 不改程式、不改 Rules、不需發布。FSD-02 授權邊界已加註；PRD 第 62、206 行與 P16 已修訂（產品負責人確認）。

## FSD-08A-1 主畫面改接共享資料（2026-10-04，本機實作完成）

- 契約 `FSD/FSD_08A_展示模式改接共享資料.md`（Q1–Q7 裁決、漢堡選單、OpenStreetMap 地圖與預設地點、Architect 附條件通過並併入、QA 無阻擋、Security 附條件通過且已修正、最終雜湊）。**審查完成；產品負責人決定併入 AC1＋06A＋07A 同一次發布**（清單 `發布與驗收清單_AC1_06A_07A.md` 已加 D-08A-1）。2026-10-04 追加：平台正式名稱改為「**yoi 遊移遊戲**」並換上 yoi LOGO（登入頁、主畫面、診斷畫面、管理畫面），QA 短版覆核通過。
- 登入後直接進入四分頁主畫面（步數／團隊／獎勵／邀請），面板沿用共享功能；工程長頁面改為管理者的「診斷畫面」；純本機模擬不再可達（檔案保留）。**不改 Rules**；上線只需部署前端，但必須在 AC1＋06A＋07A 發布之後。
- **08A-2 鈴鐺通知與首頁示意**：契約 `FSD/FSD_08A-2_鈴鐺通知與首頁示意.md`（Q1–Q6、D1–D4 裁決；Architect 附條件通過並併入）；QA／Security 審查完成且已修正（含截圖個資：圖檔已裁切並塗白問候語）；**產品負責人決定併入本次發布**（清單加 D-08A-2 第 29–35 項）。開網址先看到 yoxi 首頁示意（魷魚動態按鈕進入 yoi），主畫面右上角鈴鐺。不改 Rules。

## 產品負責人核定的後續順序（2026-10-01）

1. 管理者工具（推進情境時間／活動週、重設場次另起版本、準備展示資料；PRD 第 62、206 行、P16、P26、D15）。需放寬 Rules 讓管理者切換到全新 `sessionId`，完整三方審查後再發布。
2. 基礎樣式積木：**唯一依據為 `UI-design` 設計規格 1.24.0**（含第 12 章 CSS token）；**圖示改用 Phosphor Icons（Fill，雙色）**取代 emoji。現況偏差：主按鈕紅底（規格要求墨藍）、按鈕高 43–50（規格 54）、大量 9–12px 字級（規格最小 12／13，內文 18）、圓角過大、使用綠色、未套用 token。
3. **（下一步）** ~~FSD_01C~~（本機完成）→ ~~03B 退團 UI~~（本機完成）→ 03C（03C-1、03C-2 本機完成、審查通過，待發布） 團隊週貢獻與寶箱資格 → FSD04 七日全勤與乘車券（04A）→ 以上已於 2026-10-02 發布；驗收修正 AC1 審查通過、待發布 → 寶箱開箱 06A（審查通過，與 AC1 一起發布）→ 推薦新戶 07A（審查通過；AC1＋06A＋07A 待一起發布）→ 02C 範圍定案不開發 → 08A-1 主畫面（審查通過，併入本次發布）→ 08A-2 鈴鐺與首頁示意（審查通過，併入本次發布）並逐頁細修，之後才錄製 Demo 影片。
4. **Apps Script 試驗：產品負責人決定不保留（2026-10-03）**，雲端 Apps Script 專案已由產品負責人直接移除（部署一併失效）。待辦（排入後續積木）：移除 `firestore.rules` 的 `gasSpike` 區塊與相關 Rules 測試（隨下一次 Rules 發布，不需重設場次）；本機 `gas-spike/`、`gas-spike-test.html` 封存不刪（標示已停用、移出 `npm test` 與 Vite 入口）。`src/gas-spike-test.ts` 已無可呼叫的雲端端點。

## 建議接手順序

1. 讀 `AGENTS.md`、PRD 對應章節與 FSD03A/03B，盤點目前 03B 改動；確認前端是否露出未通過 Rules 的操作入口。
2. 修復 Rules 編譯錯誤，更新 03A 既有測試資料格式與 03B 正反向／並發測試；完整跑 Emulator。不可為求通過而放寬跨帳號權限或原子交易驗證。
3. 修正 03B 契約與實作一致；Architect、QA、Security 對同一版本複審。只在全部本機驗證通過後，將待發布 Rules 與雲端操作清單交產品負責人核准。
4. 後續才做 03C 歷史團隊資格與 FSD04 週全勤／乘車券；不要宣稱這些已完成。

## 常用本機命令

在專案根目錄執行：`npx tsc --noEmit`、`npm test`、`npm run build`、`npm run test:rules`。Rules 測試使用本機 Firebase Emulator，不會發布雲端規則。
