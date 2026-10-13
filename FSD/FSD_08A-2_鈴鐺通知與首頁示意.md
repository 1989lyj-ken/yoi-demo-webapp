# FSD-08A-2 鈴鐺通知與首頁示意

**狀態**：契約第 2 版（2026-10-04）。產品負責人已裁決 Q1–Q6、D1–D4；Architect 附條件通過並併入；本機實作完成；QA 有條件通過、Security 附條件通過，**所有項目已修正（含 M1 截圖個資）**。**併入 AC1＋06A＋07A＋08A-1 同一次發布**，待部署前端並人工驗收（不改 Rules）。

**已定案（不需再裁決）**：鈴鐺放在主畫面**右上角**（08A-1 已預留 \`#bell-slot\`）；首頁示意底圖為 \`UI-design/yoxi 首頁截圖.PNG\`；「進入 yoi」按鈕放在 yoxi 漢堡選單**正下方**、**只用魷魚圖案**（從 \`yoi LOGO_去背.png\` 裁切）、白色圓形、**漂浮＋外圈脈動光環＋偶爾搖擺**、右上角 **NEW** 標籤、減少動態效果時停止動畫。**不改 Rules**，上線只需部署前端。

## 產品負責人裁決（2026-10-04）

| # | 裁決 |
|---|---|
| Q1 | 通知類型照 N1–N6 |
| Q2 | 開網址先看到 yoxi 首頁示意（登入前），魷魚按鈕進登入頁（已登入直接進主畫面）；漢堡選單加「回到 yoxi 首頁」 |
| Q3 | 點截圖其他地方顯示短提示 |
| Q4 | **裁掉截圖最上方的狀態列**；問候語「晚安，Ken 今天要去哪？」**改為「嗨，今天要去哪？」**（以覆蓋層蓋住原字並重寫，見第 6 節） |
| Q5 | 不加可見文字：按鈕只有魷魚圖案，動畫停用時按鈕仍在原處可點，以讀屏標籤「進入 yoi 遊移遊戲（新功能）」滿足 P27 |
| Q6 | 鈴鐺與首頁示意同一段交付 |

## 一、鈴鐺通知

### 1. 原則
- 通知**由共享資料即時推導，不另存通知資料**（不改 Rules）；資料未經伺服器確認時不產生通知（fail-closed）。
- 判斷時間一律用**情境時間**（\`scenarioNow\`），不用手機時鐘；管理者推進時間後，既有過期提示會要求重新載入，通知隨之重算。
- **各類同日最多一次**（PRD §7）：同一類通知在同一個情境日只出現一則；**已讀狀態存在這台裝置**（換裝置會再出現一次，與 04A 恭喜提示同規則）。
- 點擊通知 → 關閉通知面板、切到對應分頁並捲到對應區塊（沿用 08A-1 的「先切頁再捲動」）。
- 頁面關閉時不推播（PRD：站內通知，不承諾背景推播）。

### 2. 通知類型（建議，Q1 確認）

| # | 類型 | 出現條件（皆以伺服器確認資料為準） | 文字 | 點擊前往 |
|---|---|---|---|---|
| N1 | 該運動了 | 情境時間 ≥ 12:00 且今日原始步數 < 1,000 | 今天該運動賺點囉！ | 步數頁 |
| N2 | 可以領點 | 今日有效步數已解鎖、尚有未領點數 | 任務有效步數達標，前往領取 N 點（有乘車加成時寫「任務有效步數」，PRD §7） | 步數頁・今日里程碑 |
| N3 | 昨日補領 | 昨日仍有可補領點數（P28：與記步頁固定提醒、首次進入提示三處一致；截止後三處同時消失） | 昨日還有 N 點可補領，今日 24:00 截止 | 步數頁・昨日區 |
| N4 | 全勤券入帳 | 本人乘車券中有**今日入帳**的全勤券 | 七日全勤完成，NT$50 乘車獎勵券已入帳 | 獎勵頁・我的乘車券 |
| N5 | 獲得寶箱 | 有未開的寶箱 | 你有 N 個團隊寶箱還沒打開 | 獎勵頁・點數與寶箱 |
| N6 | 推薦獎勵 | 今日新增推薦獎勵（被推薦人：綁定當日的 NT$50 券；推薦人：對方首乘當日的 NT$100 券＋50 點） | 推薦獎勵已入帳 | 獎勵頁・我的乘車券 |

### 3. 畫面
- 右上角鈴鐺圖示（新增自繪或 Phosphor \`bell\`），有未讀時顯示紅色數字徽章（9 以上顯示「9+」）；\`aria-label\` 含未讀數。
- 點擊開啟**通知面板**（由上方展開的面板，\`role="dialog"\`），列出今日通知（未讀在前、粗體）；開啟面板即全部標為已讀；「沒有新通知」空狀態。
- 覆蓋層互斥：與漢堡選單相同規則（面板開著時昨日提示與乘車券恭喜延後、關閉後依序重評估；團隊對話框守衛選擇器加入面板；過期提示關閉面板）。

## 二、首頁示意（yoxi 首頁＋進入 yoi）

### 4. 位置與流程（Q2 確認）
- **建議**：開啟展示網址先看到 **yoxi 首頁示意**（尚未登入）；按魷魚按鈕 → 登入頁（已登入則直接進主畫面）。主畫面漢堡選單新增「**回到 yoxi 首頁**」，可返回示意頁（PRD：提供返回首頁示意的操作）。
- 示意頁只是一張截圖，除了魷魚按鈕之外不可操作；點其他地方顯示短提示「這是 yoxi 首頁示意，點左上角的 yoi 進入遊移遊戲」（Q3）。

### 5. 版面
- 截圖以原比例（1206×2622）置中顯示，寬度不超過 \`--yx-prototype-width\`（440 px），手機上滿版；按鈕以截圖的**百分比座標**定位，任何寬度都對齊漢堡選單：漢堡選單中心約在截圖 (9.5%, 10.6%)、直徑約 12.8% 寬；魷魚按鈕同尺寸，中心放在約 (9.5%, 18.5%)，與漢堡選單間距約一個按鈕高度的一半。
- 魷魚圖案以 CSS 從 \`yoi LOGO_去背.png\` 裁切（魷魚範圍約 x 205–475、y 135–470），白底圓形按鈕、與截圖右上角按鈕同等陰影規格（若 FSD-UI01 不允許陰影，改用細邊框）。
- 動畫（純 CSS）：
  - **漂浮**：上下約 4 px，2.8 秒循環。
  - **脈動光環**：按鈕外圈 \`icon-red\` 淡色圓環，向外擴散並淡出，2 秒循環。
  - **偶爾搖擺**：每 6 秒左右輕晃約 ±8 度、持續約 0.6 秒。
  - **NEW 標籤**：按鈕右上角紅底白字小標。
  - \`prefers-reduced-motion: reduce\` 時三種動畫全部停止（標籤保留）。
- 無障礙：按鈕 \`aria-label="進入 yoi 遊移遊戲（新功能）"\`、鍵盤可聚焦；截圖本身 \`alt="yoxi App 首頁示意"\`。

### 6. 其他
- **裁掉狀態列**（Q4）：截圖上方約 5.5%（原圖約 145 px 高，含時間、訊號、電量）不顯示；容器以裁切後的比例（1206 × 2478）顯示，按鈕百分比座標依裁切後高度換算（y′ = (y − 0.055) ÷ 0.945）。
- **問候語改字**（Q4）：原圖「晚安，Ken 今天要去哪？」所在位置（約 x 5–60%、y 69–72%，原圖座標）加一塊與底色相同的白色覆蓋層，上面以網頁文字寫「嗨，今天要去哪？」，字型為 `--yx-font` 粗體，字級以容器寬度比例設定（container query 單位），與原字大小相近；覆蓋層不可點、讀屏讀到新文字。
- 截圖檔 652 kB（PNG），第一次開啟會稍慢（4G 約 1 秒）；若需要更快，可提供壓縮版（例如寬 800 px 的 JPG，約 150 kB），換檔即可。

## 待裁決（已全部裁決，見上表）

## 測試（範圍定案後補細節）

- 單元：通知推導純函式（每類的出現／不出現邊界：11:59／12:00、999／1,000 步、已領完、截止後、今日入帳與前一日入帳、寶箱數量、推薦當日）、同日一次與已讀狀態、徽章數字；首頁示意按鈕座標與 view（跳脫、aria、reduced-motion 樣式存在）。
- 預覽：鈴鐺（有未讀、面板開啟、空狀態）、首頁示意（360／440 px，動畫以凍結狀態截圖）。
- 人工驗收：各類通知出現時機與點擊導向、同日只一次、換裝置再出現；首頁示意對齊漢堡選單、動畫、減少動態效果、進入登入頁與從選單返回。

## 第 2 版修訂：Architect 審查（2026-10-04，Opus）附條件通過

**M1 登入流程改寫（main.ts）**：抽出 `showLogin()`，每次渲染重新綁定表單事件；`restoreSession()` 於載入時開始但只保存為 promise、不自動進主畫面；按魷魚時：已登入 → `enterApp`；仍在檢查 → 顯示登入頁並停用（「檢查登入狀態…」），查完再決定；還原失敗 → 登入頁顯示保存的錯誤訊息。

**M2 通知生命週期**：清單只列「條件成立且資料已經伺服器確認」的類型，條件消失即移除（N3 與固定提醒同時消失，P28）。已讀鍵 `yoi:notice:{sessionId}:{memberId}:{taskDate}:{類型}`（`taskDate` 取 `taskDateOf(context)`）。開啟面板只把**當下顯示**的類型標為已讀；面板開著時新出現的也標為已讀；數字 N 變大不重新變未讀（同日一次）。localStorage 讀寫包 try/catch，失敗改用記憶體 Set。

**M3 資料來源**：推導放純函式模組 `src/app/notices.ts`（不 import Firebase）。N1／N2：`today.confirmed()`，小時取 `scenarioNow` 第 12–13 字（不經 `Date`），「有加成」＝有效步數 > 原始步數；N3：與 `showYesterdayReminder` 共用同一函式（`yesterday.confirmed()`＋`claimablePoints`）；N4：新增唯讀掛勾 `perfectWeek.confirmedCoupons(): Coupon[] | null`；N5：新增 `rewards.unopenedCount(): number | null`（只在 awardsOk 時給數字）；N6：沿用 `confirmedReferrals()`。「今日入帳」＝`issuedAt`／`boundAt`／`firstRideAt` 前 10 字等於 taskDate。重算觸發：`host.onToday`、`showYesterdayReminder`、`feed.listen`、perfectWeek 與 rewards render 後的新回呼（不用 MutationObserver）。

**M4 fail-closed**：任一來源未確認 → 面板顯示「部分資料同步中」、不顯示徽章、鈴鐺 `aria-label` 標「同步中」；不顯示「沒有新通知」。

**M5 覆蓋層整合**：面板掛在 body（`#notices`），開啟時 `.app-shell` inert；移除 `#bell-slot` 的 `aria-hidden`。加入互斥：`showYesterdayReminder` 延後條件、perfectWeek 與 rewards 的 `otherDialogOpen`（`host.drawerOpen` 一般化為 `host.overlayOpen`）、team-panel 守衛選擇器加 `#notices`、shell 的 `overlayOpen`（hash 還原）、抽屜與面板互斥、`shell.stop()` 靜默關閉面板、過期時關閉並移除按鍵攔截。點擊通知順序：關閉面板（不把焦點還給鈴鐺）→ `goto` → 捲動 → 聚焦 `tabindex=-1` 的指名錨點（新增今日里程碑錨點 `#today-milestones-anchor`；N3 聚焦昨日區標題，不聚焦可能停用的「全部領取」）→ 最後重評估延後的提示。Esc 關閉、Tab 鎖在面板內、一般關閉後焦點回鈴鐺。

**M6 樣式與 ui-tokens 測試**：脈動光環用偽元素的 border＋transform scale＋opacity（不用 box-shadow）；問候語新增延伸 token `--yx-type-home-greeting: 700 4.8cqw/1.2 var(--yx-font)`；白色覆蓋層、NEW 標籤、光環只用 token（`--yx-surface`、`--yx-brand-red`、`--yx-text-on-color`）、圓角 `--yx-radius-full`。按鈕陰影見 D2。

**M7 座標統一（以原圖像素）**：裁掉上方 144 px，容器比例 1206×2478，圖片 `object-fit: cover; object-position: 50% 100%`；漢堡中心原圖 (114, 278) → 裁切後 y 5.4%；按鈕寬度用寬度百分比（12.8%）＋`aspect-ratio: 1`；問候語覆蓋層裁切後 y 67.2–70.4%、x 6–57%；魷魚裁切範圍改為 x 200–485（右側觸手到約 478），`.yoi-logo` 改以變數指定裁切框，與工具列 LOGO 共用同一張圖。魷魚按鈕中心見 D1。

**M8 圖片載入**：`views.ts` 不 import 圖檔（`npm test` 以 node 直接 import views）；圖片 URL 由 `main.ts` 與 `ui-preview.ts` import 後當參數傳入。截圖複製為 `src/assets/yoxi-home.png`（原路徑含空白與中文）。`<img>` 加 `width`／`height`、`decoding="async"`、`fetchpriority="high"`、不 lazy。

**M9 動畫巢狀**：外層漂浮（translateY）、內層搖擺（rotate，`transform-origin` 下方中央）、光環為獨立偽元素；搖擺 6 秒一輪（前 90% 靜止、最後 10% 晃動）；`prefers-reduced-motion: reduce` 明確 `animation: none` 並隱藏光環。

**M10 回到 yoxi 首頁**：`menuItems` 加項目（同步更新測試）；回首頁時 `stopSharedSubscriptions` 並清掉 hash；情境監看器保留（在首頁也能跳出過期提示）；再次進入時若已過期不重新掛載，並以 `restoreSession()` 取得最新情境（不沿用快取 session）；首頁、登入頁、主畫面之間都用 replaceState，不留歷史紀錄。

**建議（已採納）**：首頁短提示用 `role=status`、離開首頁清掉計時器；320 px 時按鈕約 41 px，以偽元素擴大點擊範圍到 44 px（外觀不變）；新測試檔加入 `npm test`；探針頁實測面板與各覆蓋層互斥、過期關閉面板、點擊導向後焦點、登入狀態三種情況按魷魚的結果。

**Info**：徽章為類型數，最多 6（「9+」不會出現）；container query 單位支援 Chrome 105+／Safari 16+／Firefox 110+；PRD §7「達 6,000 有效步數提醒領點」與 N2 不同、P27「文字入口」與 Q5 不同——實作時同步修訂 PRD 文字；不改 Rules（通知只讀已訂閱資料＋localStorage，首頁示意不讀寫 Firestore）。

## 產品負責人裁決（第 2 版，2026-10-04：全照建議）

D1 魷魚按鈕中心在原圖 19.5%（間距約半個按鈕高）；D2 加陰影並在 ui-tokens 測試登記例外；D3 第一次開（無分頁標記）→ 首頁示意，主畫面內重新整理且仍登入 → 回主畫面；D4 首頁加「示意畫面」小字。

### 原選項

- **D1 魷魚按鈕與漢堡選單的距離**：中心放在原圖 18.5%（間距約 1/3 個按鈕高，較緊密）或 **19.5%（間距約半個按鈕高，較有「獨立新功能」的感覺，建議）**。
- **D2 魷魚按鈕的陰影**：截圖右上角按鈕有淡陰影。**建議比照登記例外**（ui-tokens 測試白名單加入首頁魷魚按鈕，與地圖浮動元素同一個陰影 token），外觀與截圖一致；或改用細邊框、不加陰影。
- **D3 重新整理的行為**：Q2 定案「開網址先看到首頁示意」。**建議**：網址沒有分頁標記（第一次開）→ 首頁示意；已在主畫面裡重新整理（網址帶 `#steps` 等）且仍登入 → 直接回到主畫面，不必每次重新經過首頁；或一律回首頁。
- **D4 首頁「示意畫面」小字**：**建議**在首頁角落加一行小字「示意畫面」，避免被誤認為正式 yoxi App（AGENTS 邊界要求）；或不加。

## 實作紀錄（2026-10-04）

- **通知** `src/app/notices.ts`（純函式）：`deriveNotices`（N1–N6；任一來源 null → 未確認）、`noticeKey`、`unreadCount`。來源由 `main.ts` 的 `noticeInputs` 組成：今日面板確認狀態與 `claimablePoints`；昨日以 `yesterdayClaimable(panel)`（昨日固定提醒、首次提示、鈴鐺共用，P28）；`perfectWeek.confirmedCoupons()`；`rewards.unopenedCount()`；推薦 feed 的 `boundAt`／`firstRideAt`。重算：`host.onToday`、`showYesterdayReminder`、`feed.listen`、perfectWeek 與 rewards 的 `onRendered`。
- **鈴鐺與面板** `app-shell.ts`：`#bell-slot` 內 `bellView`（徽章為未讀類型數；未確認時無徽章、標「同步中」）；面板 `#notices` 掛在 body、`.app-shell` inert、Tab 鎖定、Esc；開啟時把當下顯示的類型標為已讀（本次開啟仍以粗體顯示）、開著時新出現者也標為已讀；已讀存 localStorage（例外時記憶體）；點擊通知 → 靜默關閉 → 切頁 → 捲動並聚焦錨點（`#today-milestones`、`#yesterday-title`、`#coupons`、`#rewards`，皆 `tabindex=-1`）→ 重評估延後的提示。抽屜與面板互斥；`isDrawerOpen` 涵蓋兩者（昨日提示、乘車券恭喜、開箱、hash 還原都會等待）；`closeDrawer(true)` 同時靜默關閉面板（stop、過期）；團隊對話框守衛加 `#notices`。新增自繪 `bell` 圖示。
- **首頁示意**：`homeView({ screenshotUrl })`（`views.ts` 不 import 圖檔）；截圖複製為 `src/assets/yoxi-home.png`，裁掉上方 144 px（容器 1206×2478、`object-position: 50% 100%`）；問候語白色覆蓋層＋「嗨，今天要去哪？」（延伸 token `--yx-type-home-greeting: 700 4.8cqw/1.2`）；「示意畫面」小字；魷魚按鈕三層（定位 → 漂浮 → 搖擺按鈕，光環為漂浮層的偽元素 border＋scale）、NEW 標籤、陰影例外登記於 ui-tokens 測試（D2）、320 px 以偽元素擴大點擊範圍、減少動態效果時 `animation: none` 並隱藏光環；點其他地方顯示 2.5 秒提示（`role=status`）。
- **流程** `main.ts`：載入時 `restoreSession()` 只存成 promise；無分頁標記 → 首頁示意；帶 `#steps` 等且仍登入 → 直接進主畫面（D3）；按魷魚 → 先顯示「檢查登入狀態…」的登入頁，已登入則重新取得最新情境後進主畫面，未登入可登入；登入表單每次渲染重新綁定；登入頁與主畫面選單都有「回到 yoxi 首頁」（停止所有共享監聽、清除 hash、保留情境監看）；過期後不重新掛載。
- **PRD**：§7 領點提醒、P27、§9 首頁示意段加 2026-10-04 修訂註記。

**驗證**
- `npm test` 141/141（新增 `tests/notices.test.mjs` 7 條：fail-closed、N1–N6 邊界、同日一次與徽章、鈴鐺／面板 view、首頁 view）；tsc、build 通過（截圖 652 kB、LOGO 223 kB）；Rules 未變（`70acb267…`）。
- 開發伺服器實測（390 px）：首頁示意截圖裁掉狀態列、問候語改字、魷魚按鈕位於漢堡選單正下方、NEW 與光環顯示、點其他地方出現提示、按魷魚進入登入頁（未登入）；預覽 `app-bell` 通知面板版面正常。
- 未能本機實測：真實登入後的通知出現時機、面板與各提示的實機互斥順序、已登入時按魷魚直接進主畫面——列入人工驗收。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/app/notices.ts` | `84c55de785c6f8644563662f4f69a5f481d4b6bf9038eed3f61cb14e5ffba0aa` |
| `src/app/app-shell.ts` | `bae47023322bd65e21c2ecbae200bf779529f896ff45ab9cbda170fdc6b977ff` |
| `src/app/shell-state.ts` | `64a9bd947e81b9e9c1f6d749236479080d8d94a16022adff711915ce0e3c8ebd` |
| `src/main.ts` | `fdb52aa5b15968f002a924c20d3f073389ba8270a58a6946c3f86f4015fbf0c5` |
| `src/ui/views.ts` | `bbb7865f4c122919e58dfa1c98d3cb4c8a12bbfa7412b92a73c0d77d8d94eb01` |
| `src/ui/icons.ts` | `449e52df2e1f95245f57c6b21bb2fb5d004b5c0977817e5d04da16abc3bda4a1` |
| `src/style.css` | `df362b008a0a462893e2b5bfbac88e604c049377ab2b965d111c4ef69f25f96c` |
| `src/css-modules.d.ts` | `1bfe488b9ba61228751525fd85e3fda4416df66e470618dec94e5ce80b319987` |
| `src/weekly/perfect-week-panel.ts` | `779597fdbbc9b83ec69a889f6f4db4d301fa7ea389f301831952d74d45dd1452` |
| `src/rewards/rewards-panel.ts` | `47fdab9134e618b07fda7ed02a4e96938986a704513026fa30767858229a32d2` |
| `src/team/team-panel.ts` | `9727546226953ce834613f8ece84681c3c9063ce4f74a8b2a0aca84693cda4e6` |
| `src/ui-preview.ts` | `adfcf639baba0b80a5aba7d786b2cd2db065ea9079a7b8714a2fdec55b507304` |
| `src/assets/yoxi-home.png` | `52dd704d14a8bafef3b00dc12cadd2e453d60171d15bac9870f6727a579fbb01` |
| `tests/notices.test.mjs` | `1149a3308b491f6433a770b523bc019714b66b3b845f8e27dc42536a9c05348e` |
| `tests/app-shell.test.mjs` | `011e6582c5b34f048b76400bb9b0618b5f8afc5ec28d01fc90a7b88712bd48e5` |
| `tests/ui-tokens.test.mjs` | `e8a3141d4f7155e971ea22ef11fd0d482539c484164adbfe008b643d78178714` |
| `package.json` | `df562c4827382077c60bd4c7966a02a4ce0e85d1d1c7ed2135e746b36a245864` |
| `PRD/智行遊移_PRD_v0.1.md` | `84b4ad646f42582adf9fb3467e6ef27a2f6177dba4317a11062fd77495050aec` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |

## QA／Security 審查與修正（2026-10-04）

- **QA（Sonnet）：有條件通過**（npm test、tsc、build 自行通過；390 px 實測首頁示意、提示、進登入頁與返回首頁）。應修正 1：返回首頁後進行中的登入檢查或登入會把畫面搶回 → 新增 `navToken`（`showHome` 遞增，每個 await 後比對，不符即放棄；登入失敗訊息亦同；按鈕已離開畫面時不再更新）。次要：第一次進入不再重複檢查登入（`restoredUsed`，之後從首頁再進入才重取最新情境；重新整理路徑亦標記已用）；通知面板重繪時保留原本聚焦的通知；登入頁「回到 yoxi 首頁」加間距置中；新增 reduced-motion 靜態測試。
- **Security（Opus）：附條件通過**，無 Critical／High；Rules 未變；身分 fail-closed、通知只讀本人已確認資料、localStorage 鍵無敏感資料、跳脫、互斥與 inert 解除、無新增套件皆通過；問候語覆蓋層對齊實測正確。**M1（Medium）**：裁掉狀態列與問候語改字只靠 CSS，**PNG 原檔仍含「晚安，Ken」、狀態列時間與電量、上車點「信義區信義路五段」與定位標記**，公開網址下可直接開圖或另存 → **待產品負責人決定**。L1：同 QA 應修正 1（已修）。L2：過期後 `enterApp` 不再重開情境監看（已修）。
- 修正後：tsc、build 通過；`npm test` 142/142。
- **Security M1 處理（產品負責人選 A，2026-10-04）**：以暫存資料夾的 pngjs／jpeg-js（不加入專案）把修改直接做進圖檔：裁掉上方 144 px 狀態列、把問候語區域（裁切後 x 60–724、y 1660–1755 px）塗成背景白、輸出新 JPEG（不含任何中繼資料），存為 `src/assets/yoxi-home.jpg`（1206×2478、274 kB，原 652 kB）；刪除先前複製的 PNG。原始檔 `UI-design/yoxi 首頁截圖.PNG` 未修改。上車點「信義區信義路五段」與地圖標記為示意內容，產品負責人決定保留。程式改用 JPG（`homeView` 寬高 1206×2478；CSS 仍以覆蓋層寫「嗨，今天要去哪？」）；`css-modules.d.ts` 加 `*.jpg` 型別。驗證：`npm test` 142/142、tsc、build（`assets/yoxi-home-*.jpg` 274 kB）；390 px 實測截圖無狀態列、問候語為新字、無橫向捲動。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/app/notices.ts` | `84c55de785c6f8644563662f4f69a5f481d4b6bf9038eed3f61cb14e5ffba0aa` |
| `src/app/app-shell.ts` | `1f26c9fa5abc3071dab64707d37eb0fcaaf78e8dfd3526c5ac602a45876f90b9` |
| `src/app/shell-state.ts` | `64a9bd947e81b9e9c1f6d749236479080d8d94a16022adff711915ce0e3c8ebd` |
| `src/main.ts` | `a02a5d9f7128f712046db58833852f5f816b550e5164f6c0299cf9bd1762c5b9` |
| `src/ui/views.ts` | `026459fcd915f613ab5b6d28257938d71cfc6b4a6d3409712fe276eb34f1dd24` |
| `src/ui/icons.ts` | `449e52df2e1f95245f57c6b21bb2fb5d004b5c0977817e5d04da16abc3bda4a1` |
| `src/style.css` | `ab3b26e69de56723b632b46968162019571f3dd3bf07a1defd81d318d06e90a0` |
| `src/css-modules.d.ts` | `e68055831a6953c92b2c5800f9e873bf5c9bab73269eb79eed38c4dd1cbcb30a` |
| `src/weekly/perfect-week-panel.ts` | `779597fdbbc9b83ec69a889f6f4db4d301fa7ea389f301831952d74d45dd1452` |
| `src/rewards/rewards-panel.ts` | `47fdab9134e618b07fda7ed02a4e96938986a704513026fa30767858229a32d2` |
| `src/team/team-panel.ts` | `9727546226953ce834613f8ece84681c3c9063ce4f74a8b2a0aca84693cda4e6` |
| `src/ui-preview.ts` | `7db787bf2d1f013792ca4631e49bc5b4ed95264a51dace26eb0e2fbc958f554a` |
| `src/assets/yoxi-home.jpg` | `fae8bd54ca8cb705aa021446f2b660dffac54b2a08d7fcf3d617b503425052e4` |
| `src/assets/yoi-logo.png` | `59951b03aaf4de554147b03e236a238e59a4e8ba5434cfb8d659d1c97cb18fd7` |
| `tests/notices.test.mjs` | `ca7da76ff5909092a24b8c2c892a939b95ae07369f24664d5255997e63fb1889` |
| `tests/app-shell.test.mjs` | `011e6582c5b34f048b76400bb9b0618b5f8afc5ec28d01fc90a7b88712bd48e5` |
| `tests/ui-tokens.test.mjs` | `e8a3141d4f7155e971ea22ef11fd0d482539c484164adbfe008b643d78178714` |
| `package.json` | `df562c4827382077c60bd4c7966a02a4ce0e85d1d1c7ed2135e746b36a245864` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |
