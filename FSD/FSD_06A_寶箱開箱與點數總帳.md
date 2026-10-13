# FSD-06A 寶箱開箱與點數總帳

**狀態**：契約第 2 版（2026-10-03）。產品負責人已裁決 Q1–Q6；Architect 附條件通過並併入；本機實作完成；**QA 無阻擋、Security 附條件通過**，條件與建議已修正並重新驗證（見文末）。**本機完成，待產品負責人依 `發布與驗收清單_AC1_06A_07A.md` 與 AC1、06A、07A 一起發布並人工驗收（Rules 最終雜湊以合併清單為準；本檔文末的 `firestore.rules` 雜湊為當時審查版本）**。

**Rules 基準**：疊在 AC1 之上（本機 `850e594c…`，雲端仍為 `6f5c1e4c…`）；AC1 尚未發布，**本積木與 AC1 一起發布**。

## 產品負責人裁決（2026-10-03）

| # | 裁決 |
|---|---|
| Q1 | **B：開箱時由瀏覽器亂數抽**（「目前僅展示用」）。Rules 只核對點數與級別合法且一致、每箱只能開一次；**接受成員可改寫請求自選點數**（與步數自行輸入同一信任模型）。與 PRD「預先抽取並保存」的差異：結果在開箱當下才決定，但開過即鎖定，刷新、跳過動畫、多裝置重試都不會重抽（P24 的「不重複入帳」仍由 Rules 保證）。A（雜湊決定）保留在下方作為日後強化選項 |
| Q2 | A：即時加總，不存餘額；本人可 `list` 自己的每日文件 |
| Q3 | 共享模式「我的乘車券」下方新增「我的點數與寶箱」 |
| Q4 | 點數紀錄：每日彙總＋開箱；乘車券不列 |
| Q5 | 本人、同場次任何時間、退團換隊不影響、停用不可開、重設後不顯示 |
| Q6 | 一起移除 `gasSpike` Rules；本機試驗檔封存不刪 |

## PRD 已定的規則（不需再裁決）

- 團隊首次合資格達標時，每位合資格成員各得一箱（03C-2 的 `chestAwards` 即寶箱資格）；每人每週至多一箱。
- **結果在得箱時就固定**（「預先抽取並保存」）：刷新、跳過動畫、重開頁面、多裝置重試都不得重抽；**開箱時才入帳**，動畫只揭示結果；跳過或中斷動畫不影響入帳；重開不再發點（P24）。
- 未開的寶箱跨週保留，展示版不設開箱期限（D07）。
- 獎項全部是和泰 Points（模擬）：

| 級別 | 點數 | 機率 |
|---|---|---|
| 基本獎 | 1、2、3 等機率 | 70% |
| 小獎 | 5 | 20% |
| 大獎 | 10–20 整數等機率 | 9% |
| 超級獎 | 50 | 1% |

- 達標只解鎖、主動領取才增加餘額（§5.2）；乘車券不是 Points，不進點數總帳（04A S7）。

## 待裁決

### Q1 結果由誰「抽」（已裁決 B；以下保留比較紀錄）

本專案沒有後端（Apps Script 已移除），寫入都由成員自己的瀏覽器送出、Rules 把關。Rules 沒有亂數，所以有兩種做法：

| 做法 | 內容 | 優點 | 缺點 |
|---|---|---|---|
| **A（建議）雜湊決定** | 結果由「場次＋週＋成員」算 SHA-256 雜湊後對照機率表決定。前端照同一公式算出結果寫入，**Rules 以 `hashing.sha256` 重算並核對**，算錯或自選一律拒絕 | 結果在得箱當下就唯一確定（等同預先抽取），任何人都改不了；不需要後端；Rules 可完整驗證 | 結果「可預先算出」（知道公式的人能提前知道自己會開到什麼），但無法改變；重設場次後 `sessionId` 不同，同一人會得到不同結果。機率為近似值（以 65,536 分之一為單位，誤差 < 0.01%） |
| B 前端亂數 | 開箱時瀏覽器用亂數抽，Rules 只檢查點數在合法範圍 | 最簡單 | **成員可自選 50 點**（改寫請求即可），違反「不能重抽／自選」的精神；只能靠信任 |

A 需要先在 Emulator 做**前置驗證**（`hashing.sha256(string).toHexString()` 可用、輸出為小寫 64 碼、字串比較符合預期），類似 04A 的日期路徑驗證；不可行時退回 B 並回報。

**A 的公式**（前端與 Rules 一致）：
- `h1 = sha256("chest|" + sessionId + "|" + weekId + "|" + memberId)` 的小寫 16 進位字串；`h2` 同上但前綴為 `"chestValue|"`。
- 級別：`h1 < "b333"` 基本獎；`< "e666"` 小獎；`< "fd70"` 大獎；其餘超級獎（整串字串比較等同比較前 4 碼的數值）。
- 點數：基本獎依 `h2` 落在 `"5555"`、`"aaaa"` 切出的三段得 1／2／3；大獎依 `h2` 落在 10 個切點切出的 11 段得 10–20；小獎 5、超級獎 50。

### Q2 點數總餘額怎麼算

| 做法 | 內容 | 影響 |
|---|---|---|
| **A（建議）即時加總** | 不另存餘額。畫面讀取本人本場次的所有每日文件（`claimed` 加總）＋所有已開寶箱（`points` 加總），即時算出餘額 | 每日領點規則完全不動；需在 Rules **允許本人 `list` 自己的每日文件**（目前只能逐日 `get`）。01C 規則有改，依核定規則要重跑 01C 的 mutation |
| B 存一份餘額文件 | 每次領點、開箱時，同一筆交易更新餘額文件，Rules 核對增量 | 要改 01C 領點規則加入跨文件核對，01C 已接近 Rules 運算上限，風險高、要重審 01C |

### Q3 開箱入口放哪裡（共享模式）

**建議**：在共享模式「我的乘車券」下方新增「**我的點數與寶箱**」區塊：
- 上方大字顯示**點數總餘額**（同步中顯示「—」）。
- 下方列出未開寶箱（依週，最舊在前）：「YYYY-MM-DD 週 團隊寶箱・打開寶箱」。
- 打開時顯示開箱動畫（沿用純展示模式的寶箱動畫樣式），可按「跳過」；入帳由寫入成功決定，動畫只揭示結果。
- 開箱結果：「你抽中了 N 和泰 Points（模擬）」，並列入獎勵紀錄。

### Q4 獎勵紀錄要列什麼

**建議**：同一區塊下方「點數紀錄」，最新在前：
- 每日領點：每個任務日一列「YYYY-MM-DD 每日任務 +N 點」（N＝該日 `claimed`）。逐筆領取時間不列（事件子集合目前不允許列出，要列需再改 01C 規則；首版以每日彙總為準）。
- 開箱：「YYYY-MM-DD 週團隊寶箱 +N 點（開箱時間）」。
- 乘車券不列（不是 Points，已在「我的乘車券」）。

### Q5 誰可以開、什麼時候能開

**建議**：
- 只有寶箱主人本人能開；**同一場次內任何時間**都能開（跨週保留、不設期限）。
- 開箱時已退團、隊伍已解散、帳號在別隊，都不影響（寶箱屬於個人）。
- 帳號停用（`active=false`）不能開（與其他共享操作一致）。
- 重設場次後，舊場次的寶箱與紀錄不再顯示（與其他資料一致）。

### Q6 順便清理 Apps Script 試驗

**建議**：本積木一起移除 `firestore.rules` 的 `gasSpike` 區塊與其 Rules 測試；`gas-spike/`、`gas-spike-test.html`、`src/gas-spike-test.ts` 封存不刪，但移出 `npm test` 與 Vite 入口。因為會改到既有區塊，AC1 的「拿掉區塊即等於已發布版本」自動核對要改為新的基準（說明見下方「Rules」）。

## 資料格式（Q1-B、Q2-A）

### 開箱紀錄 `chestOpens/{sessionId}/members/{memberId}/weeks/{weekId}`（只能建立）

| 欄位 | 規則 |
|---|---|
| `sessionId`、`memberId`、`weekId` | 與路徑相同 |
| `tier` | `'basic'`／`'small'`／`'big'`／`'super'` |
| `points` | 整數，且與 `tier` 一致：`basic` 為 1–3、`small` 為 5、`big` 為 10–20、`super` 為 50 |
| `openedAt` | 等於目前情境時間（`demo/current.scenarioNow`） |
| `clockVersion` | 等於目前 `clockVersion` |
| `recordedAt` | `request.time` |

建立條件：本人、目前場次、帳號有效；**本人的 `chestAwards/{sessionId}/weeks/{weekId}/awards/{memberId}` 存在**；欄位剛好 8 個；`tier` 與 `points` 合法且一致。讀取：本人 `get`／`list`。更新、刪除一律拒絕（「重開不再發點」由「只能建立一次」保證）。

### 每日文件讀取（Q2-A）

`dailySteps/{sessionId}/members/{memberId}/days/{taskDate}`：新增 `allow list`：本人、目前場次、帳號有效（只能列自己的；隊友仍只能 `get` 今日）。其他規則不變。

## Rules

- 新增 `// ===== FSD-06A` 區塊（`chestOpens` 與抽獎函式）；01C 區塊只加一行 `list`；移除 `gasSpike` 區塊（Q6）。
- **Rules 預算**：開箱建立一次寫入的文件存取：`membersByUid`（active、memberId，同文件去重）、`demo/current`（場次、時間、版本）、`chestAwards` 本人寶箱（`exists`）＝ 3 份，遠低於 10。點數與級別核對約 10 個運算式。
- **自動核對改版**：AC1 測試目前核對「拿掉 AC1 區塊＝已發布版本」。改為核對「拿掉 AC1、06A 區塊、01C 新增的 `list` 那一行，並補回 `gasSpike` 區塊」後等於已發布版本——實作上改為保存一份「已發布版本」快照（`tests/fixtures/published-rules-6f5c1e4c.rules`），測試以逐行差異確認只有上述三處不同。

## 前端（`src/rewards/`）

- `chest-state.ts`（純函式，可單元測試）：`drawChest(random: () => number)`（依機率表抽級別與點數；亂數來源可注入以便測試，正式使用 `crypto.getRandomValues`）、`parseChestOpen`、`balance(days, opens)`、`ledgerRows(days, opens)`、`unopenedChests(awards, opens)`。
- `chest-service.ts`：訂閱本人每日文件清單（`list`）、本人寶箱資格（各週 `get`：路徑以週為層級，需先知道有哪些週。建議取「本人最早一份每日文件所在的週」到本週的**每一週**——得寶箱只要求達標時在隊，不要求當週有步數，所以不能只取有每日文件的週；但進入共享畫面就會建立當天的每日文件，入隊前必定已有，因此從最早那週起逐週讀取即可涵蓋，不需改 `chestAwards` 規則；**請 Architect 確認此推論**）、本人開箱紀錄（`list`）；`open(weekId)` 以交易「讀資格、讀開箱紀錄（已存在即回傳 `exists`）、算結果、建立」。開箱前先抽好結果；交易若因「已存在」結束，顯示已存在的結果（不是剛抽的），確保多裝置看到同一個點數。
- `rewards-panel.ts`：區塊、開箱動畫（可跳過）、只用伺服器確認的快照（fail-closed），沿用 04A 的過期提示與覆蓋層互斥規則。
- 純展示模式不改（留給「展示模式改接共享資料」）。

## 測試

- **Rules**：本人有寶箱可開一次、第二次拒絕；沒有寶箱、別人的寶箱、級別與點數不一致或超出範圍（0、4、9、21、49、51、小數、字串）、錯的時間或版本、多欄位、停用帳號、舊場次皆拒；本人可 `list` 自己的每日文件，不能列別人的；`gasSpike` 移除後一律拒絕；快照逐行差異核對。
- **Mutation**：06A 區塊全條件（約 20 項）＋ 01C 的 `list` 一行；**01C 規則有改，依核定規則重跑 01C 的 mutation**。
- **單元**：`drawChest` 以注入的亂數覆蓋每個機率門檻兩側（0.6999／0.7、0.8999／0.9、0.9899／0.99）與各級點數範圍；以 100,000 次抽樣估計機率分布落在容許誤差內；`balance`、`ledgerRows`、`unopenedChests`；views 跳脫與文字。
- 全套 `npm test`、`npm run test:rules`、tsc、build、預覽截圖（360 px）。

## 不做

- 推薦新戶的 50 Points（屬「推薦新戶」積木）；點數兌換或使用；鈴鐺通知（延後）；純展示模式。

## 人工驗收（摘要）

1. 團隊達標後，合資格成員看到「未開寶箱」；餘額不變。
2. 開箱 → 動畫 → 顯示點數；餘額增加；紀錄出現一列。跳過動畫結果相同。
3. 重新整理、兩台裝置同時開 → 只入帳一次、點數相同。
4. 推進到下週、退團後再開 → 仍可開。
5. 每日領點後餘額即時增加；紀錄每日彙總正確。
6. 重設場次 → 舊寶箱與紀錄不再顯示。

## 第 2 版修訂：Architect 審查（2026-10-03，Opus）附條件通過，已併入

**M1 每日文件 `list`**：不用 `dailyReader`（含 `taskDate` 檢查，list 時無單一文件）。新增函式 `dailyOwnerList(sessionId, memberId)` = `activeMember() && currentSession(sessionId) && actorMemberId() == memberId`（不引用 `taskDate`、`resource`）。原 `allow list, delete: if false;` 不動，另加一行 `allow list: if dailyOwnerList(sessionId, memberId);`，以 `// ===== FSD-06A daily-list >>>`／`<<<` 標記包住。Rules 測試：本人目前場次可列；別人、舊場次、停用帳號、collection group `days` 查詢皆拒。

**M2 找出可能有寶箱的週**：本人路徑讀 `chestAwards`（存在與否）已允許（`memberId == actorMemberId()` 先成立），不改 `chestAwards` 規則。範圍為「本人最早一份每日文件的週」到本週逐週 `get`。為保證成立，採 (a) **新增不變量**：團隊面板的「建立隊伍」「加入隊伍」須等**今日每日文件經伺服器確認存在**（`DailyPanel.confirmed() !== null`）才可按；未確認時按鈕停用並說明「今日步數同步中」。每日清單未確認或為空時，寶箱區塊 fail-closed（顯示同步中，不退回只查本週）。週 ID 一律用既有週工具（`weekOfTaskDate`／`requireActivityWeek`）產生。
- s6 現有成員皆已有每日文件（已使用過 app），不受影響。

**M3 開箱交易**：抽中值只是提案，畫面只揭示伺服器確認的值。
- 交易：重讀 `demo/current`（`sessionId`、`clockVersion`、`scenarioNow` 須與畫面一致，否則 stale）與 `membersByUid`（停用或對應改變 → identity），讀本人寶箱資格（不存在 → 拒絕）、讀開箱紀錄（存在 → 回傳既有值，不寫入）、建立。
- 任何錯誤或未確認（含 `permission-denied`、`aborted`、網路）一律以 `getDocFromServer` 重讀開箱紀錄：存在 → 顯示伺服器值；不存在 → 「未入帳，可再試」。**不依錯誤碼推論「已存在」**（建立既有文件時 Rules 以 update 評估，同樣回傳 permission-denied）。
- 動畫：寫入確認前「跳過」只顯示「確認中…」，不顯示點數；重新整理不重用未提交的抽中值（下次重新抽）。
- 情境時間或場次變更：關閉動畫；`stopSharedSubscriptions` 加入 `rewardsPanel?.stop()`（每日清單、各週資格、開箱清單的監聽全部停止）。

**M4 覆蓋層互斥**：寶箱面板提供 `isOverlayOpen()`；`showYesterdayReminder` 與 `perfectWeek.otherDialogOpen` 納入它，開箱動畫關閉時重新評估延後的昨日提示與乘車券祝賀；開箱按鈕在 `#yesterday-prompt`、乘車券祝賀、團隊對話框開啟時停用。開箱動畫使用**獨立容器 `#chest-overlay`**（不用 `.stale-overlay` 類別）；過期提示仍在最上層。順序：昨日提示 → 乘車券祝賀 → 開箱（開箱由使用者主動觸發，不自動彈出）。

**M5 Mutation 範圍**：01C 沒有 mutation 腳本，且其 get／create／update 未變，依核定規則不重跑 01C 全套；只對 M1 新增那一行做 4 項（拿掉 `activeMember`、`currentSession`、本人檢查、改為 `true`）。06A 區塊約 20 項。新增 `scripts/mutate-chest-rules.mjs`（兩個標記區塊）與 npm script `test:rules:mutation:chest`，`test-firestore-rules.ps1` 的 `ValidateSet` 同步加入。

**建議（已採納）**
1. **雜湊核對**：新增 `tests/fixtures/published-rules-6f5c1e4c.rules`（已發布版本快照），測試先核對快照 SHA-256 為 `6f5c1e4c…5882`；再核對「目前版本剝掉 AC1、06A、06A daily-list 三組標記區塊」等於「快照刪掉 gasSpike 段」（以 `function ownsSpikeState` 起至 gasSpike `match` 結尾為錨點；不動第 97–107 行的共用函式），純字串比較。取代 AC1 原本的核對。發布後基準改為新版本快照。
2. **`chestOpens` 規則**：`get`／`list` 只檢查本人、場次、active（不引用 `weekId`、`resource`）；`create` 用 `points is int` 搭配依 `tier` 的三元判斷；本人寶箱存在即隱含 `weekId` 合法，不另驗日期。文件存取 3 份。
3. **餘額與紀錄**：只加總目前場次；任一份每日文件或開箱紀錄解析失敗 → 餘額顯示「—」（不略過繼續加）；每日清單與開箱清單**都經伺服器確認**才顯示數字。
4. **單元測試**：`unopenedChests` 遇「開箱紀錄存在、但資格文件暫不可讀」不得顯示為可開。
5. **預覽**：360 px 與 440 px 截圖。

**Info**
- **不需重設場次**：`chestOpens` 為新集合、`list` 只放寬讀取、移除 `gasSpike` 不影響現有資料；s6 已存在的寶箱可直接開。
- **發布順序**：Console 建 `memberProfiles`（AC1）→ 發布 Rules（AC1＋06A 同一版）→ 部署前端。**不可先部署前端**（舊 Rules 下 `list` 會被拒）。
- **gas-spike 清理**：`gas-spike/Code.test.mjs` 移出 `npm test`、`gas-spike-test.html` 移出 Vite 入口；Rules 測試的 gasSpike 正向案例改為一律拒絕。

## 實作紀錄（2026-10-03）

- **Rules**：移除 `gasSpike`（`ownsSpikeState` 至其 match）；01C `days` 加 `allow list: if dailyOwnerList(...)`（`// ===== FSD-06A daily-list` 標記）；`// ===== FSD-06A >>>` 區塊放在萬用拒絕規則之後（Rules 不看順序，且不影響 04A mutation p34 的比對字串）：`dailyOwnerList`、`chestPoints`（三元判斷）、`chestOpenCreate`（8 欄、路徑欄、點數級別、`openedAt`／`clockVersion`／`recordedAt`、本人寶箱 `exists`）、`chestOpens` match（get／list 本人、create、update／delete 拒絕）。
- **雜湊核對**：新增快照 `tests/fixtures/published-rules-6f5c1e4c.rules`（測試核對其 SHA-256）；「目前版本剝掉 AC1、06A、06A daily-list 三組標記」須等於「快照刪掉 gasSpike 段」。取代 AC1 原核對。
- **前端** `src/rewards/`：`chest-state.ts`（`drawChest`、`secureRandom`、`legalChest`、`parseChestOpen`、`chestWeeks`、`balance`、`ledgerRows`、`unopenedChests`）；`chest-service.ts`（每日清單、各週本人寶箱、開箱清單的監聽；`open()` 交易＋失敗時伺服器重讀）；`rewards-panel.ts`（區塊、開箱對話框 `#chest-overlay`（沿用 `.yo-chest-overlay` 樣式，z-index 低於過期提示）、最短揭示 1.6 秒、跳過只顯示「確認中…」）。
- **M2**：`team-panel.ts` 的 `controls()` 在 `hooks.todayReady()` 為否時停用建隊／入隊並提示「今日步數同步中…」；`main.ts` 在今日面板確認狀態改變時 `teamPanel.refresh()`。
- **M4**：`main.ts` 的昨日提示、乘車券祝賀、團隊對話框互相納入 `rewards.isOverlayOpen()`；各對話框關閉後 `rewards.refresh()`；團隊對話框開啟條件加入 `#chest-overlay`；`stopSharedSubscriptions` 呼叫 `rewards.stop()`。
- **Q6**：`gas-spike/Code.test.mjs` 移出 `npm test`；`gas-spike-test.html` 不在產品建置（Vite 只建 `index.html`），檔案原地封存；`CLAUDE.md` 同步更新。
- **畫面**：共享模式「我的乘車券」下方「我的點數與寶箱」；預覽新增 `rewards-chests`、`rewards-syncing`、`chest-opening`、`chest-result`。

**驗證**
- `npm test` 116/116（新增 `tests/chest-state.test.mjs` 8 條；移出 gas-spike 10 條）；`npm run test:rules` 109/109（gasSpike 7 條改為 1 條「一律拒絕」，新增 06A 4 條）；tsc、build 通過。
- **Mutation**（`npm run test:rules:mutation:chest`）：06A 25 項：23 被抓到、2 等價（c06／c07 互相保護）；daily-list 3 項全被抓到；0 意外存活。依核定規則，01C、03C、04A、AC1 的 mutation 未重跑（其區塊未變）。
- 預覽 360 px：區塊、寶箱列、點數紀錄、開箱結果對話框正常，無 console 錯誤，無橫向捲動。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `fd6002a6d58da4fb15362224e6678ad17f46c75cf48376f5e7ada5ff40b44e5c` |
| `tests/fixtures/published-rules-6f5c1e4c.rules` | `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882` |
| `tests/firestore-rules.test.mjs` | `cdded02b54c1ce326f7c68af10243cb32be053ca5c5e01862f2740fdc91d3727` |
| `tests/chest-state.test.mjs` | `69e230a1c4d3af86418ede047573b5294b68e49d42bf8f834008e646fabe0165` |
| `scripts/mutate-chest-rules.mjs` | `b1f77b6d768728dc6a9ea8f0d0590d8de96d8ef06c99eaa3304dba378d75a943` |
| `scripts/test-firestore-rules.ps1` | `1a1ebbd49737160b26bd9459a319f95d7f1a64997c9ab71e81b06ad42558ea75` |
| `package.json` | `cd1fbd8b3ea616b8c456ad9000d43921d3f07815b3091a113f28b0a8c72e1547` |
| `src/rewards/chest-state.ts` | `4be5ae6c58ac8dc034197c09c2976786dfe91bbeb148c90fc770e0c01683e2cb` |
| `src/rewards/chest-service.ts` | `c5ccb954a3807f0425c800486ccb5cc827ae221886767344e349c91abd58baca` |
| `src/rewards/rewards-panel.ts` | `57a584027b2f957e5c96a846e9ca3773e36f521c60d2273142cd6c00320458c6` |
| `src/team/team-panel.ts` | `9138a7be40cb20722070b48f4c96d00379dba28cd1e16af740570a62659de507` |
| `src/main.ts` | `a86e9790eca29a1c8dbf7f30fbfbf88a285d7be5d867ab0c3d744b9701d97fb8` |
| `src/ui/views.ts` | `3616ace29b90546d4e103ba76427d155b96e9e9c312474a54ec18507ce1544ee` |
| `src/style.css` | `5df42d29d1a87882173ec04cc1fa4a3a74ed1dc3666fac2e3e05cc3c7c9c2946` |
| `src/ui-preview.ts` | `3236ac0e208036d50137d23b1bcf0d1b898cb04d4e78d69894dfb0e1f5b81bcd` |
| `CLAUDE.md` | `ba63feea6f151e2f3ba851d780f16d91d1db39f40f5c9a828ad5c82f62669e97` |

## QA／Security 審查與修正（2026-10-03）

- **QA（Sonnet）：無阻擋**（`npm test`、tsc、build、`test:rules` 109/109 皆自行通過）。應修正 1：開箱對話框無焦點陷阱、不處理 Esc、按「跳過」後焦點落到 body → 新增 Tab 循環與 Esc（結果或失敗階段才可關閉；開啟中按 Esc 不中斷入帳），跳過後焦點移到標題（`tabindex="-1"`）。應修正 2：其他對話框「開啟」時開箱按鈕未即時停用 → 面板以 `MutationObserver` 觀察 `body` 子節點（所有對話框都掛在 body），一有變動即重繪；停止時解除。次要：寶箱監聽失敗不再讓餘額與紀錄也變「—」（只關閉寶箱清單）；點數紀錄每列只顯示一個日期（每日列為任務日、寶箱列為週，開箱時間另列）。
- **Security（Opus）：附條件通過**，無 Critical／High／Medium；自行驗證快照差異只有 gasSpike 段、共用函式未誤刪；8098 副本 `test:rules` 109/109。Low 1：級別與點數不一致的情況測試不足 → 補 `['mega',2]`、`[null,2]`、`['small',50]`、`['basic',5]`、`['big',50]`、`['super',5]`，mutation 新增 c26（小獎 5 或 50）、c27（基本獎改為「非其他三級」）。Low 2：match 路徑萬用化未被抓 → 新增「寫到 `.../members/YOI-M01/other/{week}` 被拒」測試與 c28。Low 3：`service.open()` 拋例外時對話框卡住 → 以 try/catch 轉為失敗狀態（登入身分變更顯示 identity），可關閉。Info：daily-list 補 d04（拿掉 `currentSession`）；`chestWeeks` 上限 520 → **60**，且改為保留最新 60 週（遠期時鐘不會漏掉本週）；回復順序「先前端、再 Rules」寫入發布清單。
- **修正後驗證**：tsc、build 通過；`npm test` 116/116；`npm run test:rules` 109/109；**mutation 32 項（06A 28：26 被抓到、2 等價；daily-list 4：全數被抓到）**。Rules 本身未變（`fd6002a6…`）。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `fd6002a6d58da4fb15362224e6678ad17f46c75cf48376f5e7ada5ff40b44e5c` |
| `tests/fixtures/published-rules-6f5c1e4c.rules` | `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882` |
| `tests/firestore-rules.test.mjs` | `b47f387fbc8d1528330c986ae895eac39d415204d9cb37ec8da896d93928b41c` |
| `tests/chest-state.test.mjs` | `2840a71c22170f6bda83be4b1209bf95093591301e8ef2cfd09a67e449f9e5fd` |
| `scripts/mutate-chest-rules.mjs` | `ca0ea532e2137b3c8e512997f53e5b89f8434bd76c3863f1a89eb178817d64a6` |
| `scripts/test-firestore-rules.ps1` | `1a1ebbd49737160b26bd9459a319f95d7f1a64997c9ab71e81b06ad42558ea75` |
| `package.json` | `cd1fbd8b3ea616b8c456ad9000d43921d3f07815b3091a113f28b0a8c72e1547` |
| `src/rewards/chest-state.ts` | `3299de992428a44591a39b587cb6ddcec7d119daa0ece187db37a7302b1cdd1f` |
| `src/rewards/chest-service.ts` | `c5ccb954a3807f0425c800486ccb5cc827ae221886767344e349c91abd58baca` |
| `src/rewards/rewards-panel.ts` | `d184786e48215654e0d01aacb0d1d5380ef40c78192ab1307cc990753c28b370` |
| `src/team/team-panel.ts` | `9138a7be40cb20722070b48f4c96d00379dba28cd1e16af740570a62659de507` |
| `src/main.ts` | `a86e9790eca29a1c8dbf7f30fbfbf88a285d7be5d867ab0c3d744b9701d97fb8` |
| `src/ui/views.ts` | `6e14ab7fdc70f25b2c3944c674024e07b09e364cb659d9a5850a34ffe0e16e32` |
| `src/style.css` | `5df42d29d1a87882173ec04cc1fa4a3a74ed1dc3666fac2e3e05cc3c7c9c2946` |
| `src/ui-preview.ts` | `3236ac0e208036d50137d23b1bcf0d1b898cb04d4e78d69894dfb0e1f5b81bcd` |
| `CLAUDE.md` | `ba63feea6f151e2f3ba851d780f16d91d1db39f40f5c9a828ad5c82f62669e97` |
| `發布與驗收清單_AC1_06A.md` | `531701f395504cc04062d5e7b6ac3624c99680540d92d31e657589d0f6d4c17d` |
