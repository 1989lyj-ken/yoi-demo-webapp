# FSD-08A 展示模式改接共享資料（含鈴鐺通知）

**狀態**：契約第 2 版（2026-10-04）。產品負責人已裁決 Q1–Q7 與補充裁決；Architect 附條件通過並併入；**08A-1 本機實作完成，QA 無阻擋、Security 附條件通過，條件與建議已修正**（見文末）。**待 AC1＋06A＋07A 發布後，部署前端並人工驗收**（不改 Rules）。08A-2（鈴鐺、首頁示意）另寫。

## 產品負責人裁決（2026-10-03）

| # | 裁決 |
|---|---|
| Q1 | A：設計稿四分頁成為唯一主畫面；工程長頁面改為「診斷畫面」只供管理者。**新增：四個分頁左上角常駐「漢堡選單」**（仿官方 yoxi app），內容：個人帳戶資料（名稱、成員編號、身分、場次、登出）、和泰 Points 點數（餘額，點擊到「獎勵」）、管理（僅管理者：推進時間、重設場次、診斷畫面）、**即將推出**（YOI AI Bot、人生願望清單、外籍人士社交平台；灰色、點擊只提示「後續版本開放」；項目之後由產品負責人調整） |
| Q2 | 移除純本機模擬與本機捷徑 |
| Q3 | 四分頁內容照建議。**步數頁大步數背景改為真實地圖並顯示自己的位置**（瀏覽器定位、需使用者允許；位置只在本機顯示，不存檔、不傳給他人、不改 Rules；拒絕或失敗時退回目前的示意地圖）。**地圖來源：OpenStreetMap**（產品負責人 2026-10-03 確認；免金鑰、免帳單） |
| Q4 | 鈴鐺放畫面**右上角** |
| Q5 | A：本積木（08A-2）一併做首頁示意；需產品負責人提供 yoxi 首頁截圖（GIF 若無先用靜態圖） |
| Q6 | 照建議：有資料就接上，沒有的以名稱首字代替，不新增 Rules |
| Q7 | **分兩段**：08A-1（四分頁接共享資料、漢堡選單、地圖定位、移除本機模擬、診斷畫面）；08A-2（鈴鐺通知、首頁示意）。兩段都不改 Rules，發布只需部署前端 |

**後續版本備忘**：以定位移動距離估算模擬步數——產品負責人決定先不做、列為後續版本，是否開發待團隊討論（限制：網頁需保持開啟、背景不計、GPS 飄移與搭車需過濾、耗電；估算結果可走現有「設定今日步數」寫入，不需改 Rules）。

## 現況

| | 純展示模式（`src/showcase/app.ts`） | 共享模式（`main.ts` 的 `showSharedSession`） |
|---|---|---|
| 畫面 | 依設計稿製作：上方工具列、四個分頁（步數／團隊／獎勵／邀請）、底部導覽、地圖大步數、週曆、寶箱動畫 | 工程用「長頁面」：今日、昨日、本週全勤、乘車券、點數與寶箱、團隊、推薦依序排列 |
| 資料 | 只存在這台裝置（localStorage），不跨裝置、不經 Rules | 共享資料（Firestore＋Rules），已審查並上線（AC1／06A／07A 待發布） |
| 規則 | 簡化模擬（例如按鈕直接「模擬團隊達標」） | 完整規則：補同步、週鎖定、貢獻帳、寶箱資格、全勤券、推薦 |

本積木的目標：讓**設計稿畫面**讀寫**共享資料**，兩者合一，成為錄 Demo 的版本。

## 待裁決

### Q1 合併後的畫面結構

| 做法 | 內容 |
|---|---|
| **A（建議）設計稿畫面成為唯一主畫面** | 登入後直接進入四分頁的設計稿畫面，資料全部來自共享端；目前的工程長頁面改名「診斷畫面」，**只有管理者**可從「管理」旁的入口進入（排錯用）；一般成員看不到 |
| B 兩者並存 | 保留「純展示／共享」切換，兩種畫面都讀共享資料 |
| C 只保留工程長頁面 | 放棄設計稿畫面，只把長頁面套上設計樣式 |

**建議 A**：Demo 只需要一個畫面；長頁面的 fail-closed 邏輯（同步中、錯誤重讀）照樣保留在新畫面，診斷畫面留給排錯。

### Q2 純本機模擬要不要保留

**建議：移除**。合併後所有資料來自共享端；「此為單機模擬體驗」橫幅、「重新開始本機展示情境」、「模擬團隊達標」「模擬一位隊友加入」「模擬下一步」等本機捷徑一併移除（這些捷徑會讓展示結果與共享規則不一致）。本機舊資料（localStorage）不再讀取、不刪除。

### Q3 四個分頁各放什麼

**建議**（沿用設計稿版面，內容換成共享功能）：

| 分頁 | 內容（來源積木） |
|---|---|
| **步數** | 地圖大步數（今日原始／有效步數）、三個里程碑與「全部領取」、模擬乘車、設定今日步數（原「設定」面板移到這裡）、昨日補同步與補領（固定提醒＋區塊）、本週全勤週曆（01C、04A、AC1 R1） |
| **團隊** | 建隊／加入、隊員名單（名稱）、本週團隊進度與上週、退團／更換隊長、週結果與寶箱資格（03A–03C、AC1） |
| **獎勵** | 點數總餘額、未開寶箱（沿用設計稿的開箱動畫）、我的乘車券（全勤券＋推薦券、車資試算）、點數紀錄（04A、06A、07A） |
| **邀請** | 隊伍邀請碼（邀請入隊）、推薦新戶（推薦碼、綁定、首乘、我推薦的人）（03A、07A） |

各分頁的彈出提示（昨日補領、全勤恭喜、團隊確認、開箱）沿用現有互斥順序；過期提示仍最上層。

### Q4 鈴鐺通知（PRD §7、P28、D09）

**建議**：工具列加鈴鐺圖示與未讀數，清單內容**由共享資料即時推導，不另存通知資料**（不改 Rules）：
- 「今天該運動賺點囉！」：情境時間 12:00 後、今日原始步數 < 1,000。
- 「任務有效步數達標，前往領點」：今日有效步數達 2,000／4,000／6,000 且有未領點數（有乘車加成時寫「任務有效步數」）。
- 「昨日還有 N 點可補領，今日 24:00 截止」（P28：與記步頁固定提醒、首次進入提示三處一致）。
- 「七日全勤完成，NT$50 乘車券已入帳」「你獲得本週團隊寶箱」「推薦獎勵已入帳」。
- 各類**同日最多一次**；點擊導向對應分頁與最新狀態；已讀狀態存在本機（換裝置會再出現一次，與 04A 恭喜提示同規則）；頁面關閉時不推播。

### Q5 首頁示意（PRD §9 第 2 項、P27）

PRD 要求以 yoxi 首頁截圖做可點擊示意（地圖、既有圖示、「嘿！今天要去哪？」與目的地欄位），在表單上緣加入步行動態入口與「智行遊移」文字標籤，點擊進入 web app，並可返回。**目前專案裡沒有這張截圖與動態素材**。

| 做法 | 內容 |
|---|---|
| **A（建議）本積木一併做** | 你提供首頁截圖（與 GIF，若沒有先用靜態圖）；我做示意頁與入口、返回、停用動態時的文字入口 |
| B 另立積木 | 先做 Q1–Q4，首頁示意之後再做 |

### Q6 純展示模式原有、共享端尚未有的內容

設計稿畫面目前有幾項是共享端沒有的：週曆顯示「點數」、團隊頁「家人／隊友頭像」、獎勵頁「堅持一週」卡片。**建議**：有共享資料可對應的就接上；沒有資料來源的裝飾（例如頭像）以名稱第一個字代替；不新增 Rules。

### Q7 交付順序

**建議**分兩段交付（各自審查、各自發布）：
1. **08A-1**：Q1–Q3（四分頁接共享資料、移除本機模擬、診斷畫面）。
2. **08A-2**：Q4 鈴鐺通知（＋Q5 首頁示意，若選 A）。

第一段完成即可錄製主要流程；第二段補齊提醒與首頁。

## 不做

- AI 情境推薦（PRD §4，首版不開發）；管理者代填與停用移出（02C 裁決）；背景推播。


## 08A-1 詳細設計

### 1. 架構：一個 App 外殼掛載現有面板（不重寫邏輯）

- 新增 `src/app/app-shell.ts`（外殼與分頁切換）與 `appShellView()`（`src/ui/views.ts`）。外殼包含：上方工具列（左：漢堡按鈕；中：yoxi 智行遊移標誌；右：08A-2 的鈴鐺預留位置）、四個分頁容器 `<section data-page="steps|team|rewards|invite">`、底部導覽（沿用純展示模式的四項）。
- **現有面板原封不動地掛進分頁**：每日（今日、昨日）、本週全勤、點數與寶箱、乘車券、團隊、推薦，沿用目前的元素 ID 與 `mount*Panel` 函式，所以 fail-closed、錯誤重讀、覆蓋層互斥、過期處理全部沿用，**不改任何服務、狀態函式或 Rules**。
- 四個分頁同時掛載（訂閱只建立一次），切換分頁只切換 `hidden`；目前分頁存在網址 hash（`#steps` 等），重新載入時回到同一頁；無效 hash 回到步數頁。
- 外觀：以 `.yo-app` 為範圍的 CSS，把現有面板改成設計稿樣式（`yo-panel` 卡片、里程碑列、週曆格子等），只用 token（UI-tokens 測試照跑）。

### 2. 分頁內容

| 分頁 | 掛載的面板與元件 |
|---|---|
| 步數 | **地圖大步數**（第 4 節）→ 今日面板（里程碑、全部領取、模擬乘車、設定今日步數）→ 昨日固定提醒與昨日面板 → 本週全勤（週曆） |
| 團隊 | 團隊面板（含週進度、上週、週結果、退團／更換隊長對話框） |
| 獎勵 | 點數與寶箱（含開箱動畫）→ 我的乘車券 |
| 邀請 | 隊伍邀請碼（團隊面板的邀請碼區另顯示一份唯讀卡片；無隊伍時引導到團隊頁）→ 推薦新戶 |

- 寶箱開箱動畫改用純展示模式的 `yo-chest-overlay` 外觀（06A 已沿用同一樣式）。
- 目前共享長頁面上的「本共享薄片含…」說明移到漢堡選單的「關於展示版」。

### 3. 漢堡選單（四分頁常駐於左上角）

- 點擊開啟左側抽屜（`role="dialog"`、`aria-modal`、Tab 鎖在抽屜內、Esc 或點遮罩關閉，關閉後焦點回到漢堡按鈕）。
- 項目：**個人帳戶資料**（名稱、成員編號、身分、目前場次、登出）；**和泰 Points 點數**（顯示 06A 的點數總餘額，未確認時「—」；點擊關閉抽屜並切到獎勵頁）；**管理**（僅 `role=admin` 顯示：推進時間／重設場次 → 現有管理畫面；「診斷畫面」→ 現有共享長頁面）；**即將推出**（YOI AI Bot、人生願望清單、外籍人士社交平台：灰色＋「即將推出」標籤，點擊在抽屜內顯示「後續版本開放」，不跳頁）；**關於展示版**（模擬資料說明）。
- 覆蓋層互斥：抽屜開著時，昨日提示與乘車券恭喜延後（納入各面板的 `otherDialogOpen`），開箱按鈕停用；抽屜不在其他對話框開著時開啟。過期提示仍最上層並關閉抽屜。

### 4. 步數頁地圖（OpenStreetMap＋瀏覽器定位）

- 使用 **Leaflet**（npm 套件，與網站一起打包；地圖圖磚來自 `tile.openstreetmap.org`），地圖右下角顯示「© OpenStreetMap contributors」（OSM 授權要求）。展示用量遠低於 OSM 圖磚使用政策的限制；不做大量預載。
- 定位：進入步數頁且頁面可見時呼叫 `navigator.geolocation.watchPosition`（`enableHighAccuracy`）；離開步數頁、頁面隱藏、登出、切換畫面或過期時 `clearWatch`。地圖以目前位置為中心（縮放 16），顯示位置點與精度圈。
- **隱私**：位置只在這台裝置的畫面上使用，**不寫入 Firestore、localStorage 或任何記錄**，不傳給隊友。第一次使用時說明「只在你的手機上顯示，不會儲存或分享」。
- 狀態文字（取代原「模擬定位」標籤）：「定位中…」「已定位（精度約 N 公尺）」「未開啟定位，顯示示意地圖」（使用者拒絕）、「無法取得位置，顯示示意地圖」（逾時、不支援）。拒絕或失敗時退回目前的示意地圖畫法（不載入圖磚）。
- 地圖上疊加大步數：今日原始步數（紅色大字）與「今日有效 N 步」，資料來自今日面板的伺服器確認狀態（未確認時顯示「—」），沿用 `count-up` 動畫。
- 地圖只作顯示：關閉拖曳以外的手勢干擾（捲動頁面時不攔截），不提供搜尋或路線。

### 5. 移除與保留

- **移除路由**：登入後不再進入純展示模式；`main.ts` 不再匯入 `showShowcaseApp`。「切換共享模式」按鈕、「此為單機模擬體驗」橫幅、本機捷徑一併消失。
- **檔案保留**：`src/showcase/app.ts` 依專案規定不刪除，檔頭標示「已停用（08A-1）」；預覽頁的舊純展示樣本改為新外殼樣本。本機舊資料（localStorage）不讀不刪。
- **診斷畫面**：現有共享長頁面（`sharedShellView` 與其掛載流程）保留為管理者的診斷入口；一般成員無入口。
- 管理畫面返回時回到新外殼（原本回到純展示或共享長頁面）。

### 6. 測試與驗證

- **單元**（純函式）：分頁 hash 解析、漢堡選單項目依身分、定位狀態文字（成功／拒絕／逾時／不支援、精度取整）、大步數輸入（未確認顯示「—」）、外殼 HTML 跳脫與「即將推出」不可導航。
- **回歸**：所有既有單元測試與 Rules 測試照跑；Rules 不變（快照核對照舊）。
- **預覽**：新外殼四分頁、抽屜開啟、地圖三種狀態（以假定位資料呈現，不在預覽頁呼叫真實定位）的 360／440 px 截圖。
- **人工驗收**（摘要）：登入直接進入四分頁；四頁功能與目前共享畫面一致（領點、補同步、組隊、退團、開箱、乘車券、推薦）；兩台裝置同步；漢堡選單項目與管理者限定項目；允許與拒絕定位兩種情況；切換分頁後定位停止（瀏覽器定位圖示消失）。

### 7. 發布

不改 Rules、不重設場次；只需建置並部署前端（`npx.cmd firebase deploy --only hosting`）。若 AC1＋06A＋07A 尚未發布，須先完成其發布（本積木前端依賴它們的 Rules）。

## 第 2 版修訂：Architect 審查（2026-10-03，Opus）附條件通過，已併入

**M1 面板只新增掛勾（服務、狀態純函式、Rules 都不改）**：`PerfectWeekPanel` 加「查看乘車券」前的導覽掛勾 `beforeGoCoupons`；`RewardsPanel` 加 `balance(): number | null`；`TeamPanel` 加唯讀 `teamSummary()`（邀請碼、狀態、人數、是否已確認、週鎖定）；今日 `DailyPanel` 的 `onChange` 同時餵給地圖大步數。

**M2 隱藏分頁的捲動與焦點**：外殼先切分頁並同步解除 `hidden`，再做原本的捲動與聚焦。昨日提示「前往補領」→ 先切步數頁；乘車券恭喜「查看乘車券」→ 先切獎勵頁。人工驗收加這兩項。

**M3 抽屜互斥**：抽屜放在 `#app` **外**（掛在 body，`#drawer`），開啟時把 `#app` 設為 inert。(a) 昨日提示的延後條件（`main.ts` 的 `showYesterdayReminder`）加「抽屜開著」；(b) team-panel 開對話框的守衛選擇器加 `#drawer`；(c) 抽屜關閉後依 `onDialogClosed` 順序重新評估：`showYesterdayReminder(…, true)` → `perfectWeek.evaluatePrompt()` → `rewards.refresh()`；開、關抽屜都呼叫 `rewards.refresh()`；(d) 明文：`#coupon-prompt` 屬於「其他對話框」；(e) 抽屜的 keydown 攔截在關閉、`stopSharedSubscriptions`（管理、診斷、登出）與 `markContextStale` 時移除——`stopSharedSubscriptions` 一律「靜默關閉抽屜」。抽屜不在其他對話框開著時開啟；過期提示出現時關閉抽屜。

**M4 分頁網址與返回鍵**：分頁以 `history.replaceState` 寫入 hash（不留歷史紀錄）；仍收到 hashchange 時，若任何覆蓋層開著就還原 hash 不切頁。hashchange 監聽隨外殼停止而移除；進入管理、診斷畫面不改 hash，返回外殼回到原分頁。

**M5 隱私文案與禁止事項**：首次說明改為「位置只在你的手機上顯示，不會存檔或傳給隊友；地圖圖片由 OpenStreetMap 提供，下載時會依地圖範圍向其伺服器取圖。」禁止：反向地理編碼（街名膠囊改為顯示定位狀態，不顯示真實地址）、以 `console` 或錯誤訊息輸出座標或帶座標的物件、把座標放進 URL 或 hash。

**M6 地圖設定**：`dragging`、`touchZoom`、`scrollWheelZoom`、`doubleClickZoom`、`boxZoom`、`keyboard`、`zoomControl` 全部關閉，只依定位自動置中（取代正文「保留拖曳」）；地圖容器 `aria-hidden` 並移除 Leaflet 的 `tabindex`，大步數文字另提供給讀屏；地圖於步數頁第一次顯示時建立，之後切回步數頁呼叫 `invalidateSize()`；用 `circleMarker`＋`circle`，不用預設 marker 圖檔。

**M7 定位為可測試的純函式**：開始監看條件＝步數頁顯示中、頁面可見、未停止、未過期、在外殼內；任一不成立即 `clearWatch`，監看 ID 與代號（generation）一起清除，回呼檢查代號。成功後再逾時：保留最後位置並標示「位置可能過時」（不退回示意圖、不閃動）。使用者拒絕後停止監看，本頁不再自動要求。不支援包含非安全來源（例如手機以 http 連區網 IP）。

**建議（已採納）**
1. **第一次定位由按鈕觸發**：地圖上顯示「顯示我的位置」按鈕，按下才詢問定位權限（避免登入就跳出系統權限框、與昨日提示疊在一起）；同一裝置允許過後，之後進入步數頁自動定位。未按之前顯示示意地圖。
2. Leaflet 與 `leaflet/dist/leaflet.css` 以動態 `import()` 載入（拒絕或失敗時完全不載入），build 後確認拆成獨立 chunk 與主包大小。
3. 圖磚 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`（不用子網域）；不設 `referrerpolicy=no-referrer`；保留 Leaflet 版權列並加「© OpenStreetMap contributors」連結；不預載、不離線快取。覆寫 `.leaflet-*` 的樣式寫在 `style.css` 且只用 token，不把 `leaflet.css` 複製進 `src/`。
4. 預覽頁改用新外殼後，`tests/ui-tokens.test.mjs` 檢查預覽依賴圖的那條改為檢查新外殼 view；預覽頁地圖一律用示意畫法（不取圖磚、不定位）；外殼 view 與地圖狀態純函式放在不依賴服務的模組。
5. **邀請頁唯讀邀請碼卡片**：資料來自 `teamSummary()`；狀態：未確認「—」、無隊伍（引導到團隊頁）、招募中或已成團才顯示可分享、5/5 已滿、暫停、已封存、週鎖定；元素 ID 不與團隊面板重複（`#team-invite-code` 已是加入表單輸入框，卡片用 `#invite-card-code`）；複製失敗時直接顯示文字。
6. **Q6 對應**：週曆點數取本人每日文件的 `claimed`；頭像用名稱第一個字；「堅持一週」卡對應本週全勤卡；「移動模擬位置」按鈕與街名膠囊移除或改寫為定位狀態。
7. **診斷畫面**：`#showcase-button` 改為「回到主畫面」；從診斷畫面進管理，返回診斷畫面；從抽屜進管理，返回外殼。註明：診斷畫面只是隱藏入口，資料權限與一般成員相同，不構成安全邊界。
8. **無障礙**：底部導覽 `aria-current="page"`；漢堡按鈕 `aria-expanded`、`aria-controls`；切換分頁時焦點移到該頁標題（`tabindex=-1`）；隱藏分頁內的錯誤以導覽小紅點提示列為後續。
9. **地圖大步數**：第一次取得確認數值時直接顯示，不播動畫，不延後或擋住今日面板操作（隱藏分頁中的 count-up 照跑可接受）。
10. **測試補充**：以探針頁實測覆蓋層互斥（開抽屜時昨日提示延後、關閉後依序出現、過期提示關閉抽屜並解除攔截）；返回鍵加對話框開著的情境；定位停止條件純函式；原始碼檢查地圖模組沒有 `localStorage`、`console`、firebase 匯入；build 主包大小與 Leaflet chunk。

**Info**：Hosting 無 CSP，圖磚可正常載入（日後加 CSP 須允許 `img-src https://tile.openstreetmap.org`）；Leaflet 為 BSD-2 授權，授權聲明併入 dist 列為待辦（同 UI01）；`yesterdayPromptEvaluated` 為模組層級，診斷畫面與外殼互切不會重跳昨日提示；不改 Rules、不重設場次、不跑 mutation（Rules 測試照跑）。

## 產品負責人補充裁決（2026-10-04）

- **沒同意定位時顯示真實地圖**（OpenStreetMap），中心固定在**緯育 TibaMe 附設台北職訓中心**（臺北市中山區南京東路三段 219 號，約 25.0517, 121.5428，南京復興站西側），標示「示意位置」；按「顯示我的位置」並允許後改以本人位置為中心。地圖程式與圖磚只在步數頁載入，首次約 0.3–1 秒（4G），之後由瀏覽器快取；載入失敗退回示意插畫（不寫街名）。
- **膠囊文字**：尚未開啟定位／定位中…／已定位・精度約 N 公尺／位置可能過時／未允許定位（下方小字「可在瀏覽器設定中開啟定位」）／暫時無法取得位置／此裝置無法定位。

## 08A-1 實作紀錄（2026-10-04）

- **外殼** `src/app/`：`shell-state.ts`（純函式：`parsePage`、`menuItems`、定位狀態機 `nextLocation`／`locationLabel`／`shouldWatch`、`DEFAULT_CENTER`、`inviteCard`）；`app-shell.ts`（分頁切換只改 `hidden`、`history.replaceState` 寫 hash、覆蓋層開著時還原 hash；抽屜掛在 body（`#drawer`）並讓 `.app-shell` inert、Tab 鎖定、Esc、關閉後回報；邀請卡；以 MutationObserver 跟隨團隊與點數區塊更新邀請卡與抽屜餘額）；`map-hero.ts`（Leaflet 動態載入、只顯示不互動、`circleMarker`＋`circle`、權限已允許時自動定位、代號防晚到回呼、連續 4 張圖磚失敗且無成功時退回插畫）。
- **views**：共享面板 markup 抽成 `perfectWeekSection` 等五個函式，外殼與診斷畫面共用（不會同時存在）；新增 `appShellView`、`navButtonView`、`drawerView`、`mapHeroView`／`mapStatusView`／`mapStepsView`、`inviteCardView`；診斷畫面按鈕改為「回到主畫面」。新增自繪 `menu` 圖示。
- **main.ts**：`showApp`（外殼）／`showDiagnostics`（管理者）／`mountSharedPanels(session, host)`（兩者共用）；登入後進 `showApp`；`stopSharedSubscriptions` 先停外殼（靜默關閉抽屜、移除 hashchange 與觀察器、停止定位）；昨日提示延後條件加抽屜、「前往補領」先切步數頁；乘車券「查看乘車券」先切獎勵頁；抽屜關閉後依序重新評估昨日提示→乘車券恭喜並刷新點數。移除 `openShowcase`。
- **面板掛勾（M1）**：`TeamPanel.teamSummary()`、`RewardsPanel.balance()`、`PerfectWeekPanel` 的 `beforeGoCoupons`；團隊對話框守衛選擇器加 `#drawer`。服務、狀態函式、Rules 未改。
- **保留**：`src/showcase/app.ts` 檔頭標示「已停用（08A-1）」，只剩預覽頁使用。
- **相依**：新增 `leaflet@1.9.4`、`@types/leaflet`；`src/css-modules.d.ts` 宣告 CSS 模組型別。Leaflet 拆為獨立 chunk（`leaflet-src` 約 150 kB／gzip 44 kB、CSS 約 16 kB）；主包 842 kB（與先前同級，500 kB 警告非阻斷）。Leaflet（BSD-2）授權聲明併入 dist 列為待辦（同 UI01）。
- **預覽**：新增 `app-steps`、`app-team`、`app-rewards`、`app-invite`、`app-drawer`、`app-drawer-upcoming`（地圖用示意插畫，不取圖磚、不定位）。

**驗證**
- `npm test` 133/133（新增 `tests/app-shell.test.mjs` 10 條：分頁、選單、定位狀態與停止條件、預設地點、邀請卡、外殼元素 ID 唯一、抽屜、地圖 view、地圖模組原始碼隱私檢查）；`npm run test:rules` 114/114（Rules 未變，`70acb267…`）；tsc、build 通過。
- 預覽 360 px：步數頁（地圖大步數）、邀請頁、抽屜（管理者、即將推出提示）正常、無橫向捲動。以開發伺服器實際掛載地圖：OSM 圖磚載入、版權列「Leaflet | © OpenStreetMap contributors」、容器無 `tabindex`、中心為南京東路三段南京復興站西側。
- 未能在本機實測：真實登入後的四分頁互動、定位權限流程（需真實帳號與手機）——列入人工驗收。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/app/shell-state.ts` | `cc02100b660963cf1df3fd8a5b665b327c2ce13a231b308912ac240e91d3c3b8` |
| `src/app/app-shell.ts` | `f5297df7c9d7778a80a7c7b3f7147474c0c342c11866303decd5dd0aea61f4f6` |
| `src/app/map-hero.ts` | `5ab77589737c1a1e040ecd1d78664529ec451edde68a6f6a37320653ce07b2ac` |
| `src/css-modules.d.ts` | `101e3902a86291dc640f20c6a821fd0ccd60d4fd90f5e6971d34937c85e8fd8d` |
| `src/main.ts` | `9b7b038c782fd0b41b30480d1a473ee17e0d7df2835670e0f2966ef93939478f` |
| `src/ui/views.ts` | `863d10a77167e0ab95240d791f709868f3223904243aed3d83385188d6d15ec4` |
| `src/ui/icons.ts` | `1aff1d8ab5c599fbbf5fbcc293087cd6fa8548caca68a56f77de3e97fd53a3d2` |
| `src/style.css` | `ed01516f99eae9e9ea2653fe3e8ab0ede540b809bdc938fd565f568a1ad28333` |
| `src/team/team-panel.ts` | `09618af13bce110d9508ea60784da9179e5bace51e7ff7a3aadb7db5682f09df` |
| `src/rewards/rewards-panel.ts` | `5ab3fa23da452a931e2cf31e6ef793e49a34188b6ccd0214e5eb7abe07948587` |
| `src/weekly/perfect-week-panel.ts` | `96adcc1f1dc2c4c1e555a9765f27c35317cae07fcbb6b2f1e8bd33f377c4e640` |
| `src/showcase/app.ts` | `50628335fd2b9b798c8b7556ea7efd6b62500899534dd1eeeb711926f162caf1` |
| `src/ui-preview.ts` | `4e6c635226d008eba7307c77da9f14680f631fe08648a6c78d70aa89d82fe9c7` |
| `tests/app-shell.test.mjs` | `0b6018dcf2339723bbe67c832251159a2471b993eb472c0990a862116874bbfc` |
| `package.json` | `10cbdba09d0f2c40d4200ecf796105269d570dbb21b3b4810323ad0900c97eb4` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |

## 08A-1 QA／Security 審查與修正（2026-10-04）

- **QA（Sonnet）：無阻擋**（`npm test`、tsc、build（Leaflet 獨立 chunk）、`test:rules` 114/114、預覽 360–390 px 自行通過；未登入，互動以讀程式判斷）。應修正 1：地圖載入前收到定位會被丟棄 → 最後一筆位置暫存在記憶體，地圖建立後補放。應修正 2：無 `navigator.clipboard` 時複製無回饋 → 走失敗分支直接顯示文字（邀請卡與推薦碼皆同）；複製回饋 2.5 秒後還原。次要：「和泰 Points」先切頁再關抽屜；「暫時無法取得位置」再按時重新開始監看；定位按鈕重建時焦點移到膠囊；拒絕後移除位置點並回到預設地點；版權列連結 `tabindex=-1`；使用者切頁時捲回頂端；無效 hash 正規化；抽屜登出防重複、失敗訊息捲到可見處。測試缺口（DOM 行為無自動化）列入人工驗收。
- **Security（Opus）：附條件通過**，無 Critical／High；Rules 未變（`70acb267…`）；隱私（座標只在記憶體、無存檔／console／URL、無反向地理編碼、錯誤物件不記錄）、權限入口、XSS、依賴（Leaflet BSD-2、@types MIT，`npm audit` 無新增相關弱點）、fail-closed 皆通過。**M-1**：隱私說明只在「關於」中 → 改為地圖下方常駐說明（提供定位按鈕時顯示，按鈕以 `aria-describedby` 關聯）。L-1：同 QA 應修正 1。L-2：抽屜登出改為一般關閉（失敗時會重新評估提示）。L-3：同 QA 應修正 2。**L-4**：新增 `public/third-party-licenses.txt`（Leaflet BSD-2、Phosphor MIT 全文與 OSM 版權說明），建置時複製到 `dist/`（同時完成 UI01 的授權待辦）。
- `tests/ui-tokens.test.mjs` 預覽依賴圖的健全性檢查改為新外殼（`src/app/shell-state.ts`）。
- **修正後驗證**：tsc、build 通過；`npm test` 134/134（新增隱私說明與授權檔測試）；Rules 未變。預覽確認地圖下方顯示隱私說明、無橫向捲動。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/app/shell-state.ts` | `cc02100b660963cf1df3fd8a5b665b327c2ce13a231b308912ac240e91d3c3b8` |
| `src/app/app-shell.ts` | `40f6250663d49fbbe467c46d315377f4990653592d0fee5243928939addb6273` |
| `src/app/map-hero.ts` | `94d6848763710ed783712900c9825cf71fe3cb45ff6dab7a1782d3a5110d5b25` |
| `src/css-modules.d.ts` | `101e3902a86291dc640f20c6a821fd0ccd60d4fd90f5e6971d34937c85e8fd8d` |
| `src/main.ts` | `c325dcac52024e46c8fc8dc1847e9a3e45ed65807378202901d0041b9171f862` |
| `src/ui/views.ts` | `b5bd0c2f626ed34259a44c314476b04654bdf166bd1f28dec07fd633c0fced93` |
| `src/ui/icons.ts` | `1aff1d8ab5c599fbbf5fbcc293087cd6fa8548caca68a56f77de3e97fd53a3d2` |
| `src/style.css` | `ed01516f99eae9e9ea2653fe3e8ab0ede540b809bdc938fd565f568a1ad28333` |
| `src/team/team-panel.ts` | `09618af13bce110d9508ea60784da9179e5bace51e7ff7a3aadb7db5682f09df` |
| `src/rewards/rewards-panel.ts` | `5ab3fa23da452a931e2cf31e6ef793e49a34188b6ccd0214e5eb7abe07948587` |
| `src/weekly/perfect-week-panel.ts` | `96adcc1f1dc2c4c1e555a9765f27c35317cae07fcbb6b2f1e8bd33f377c4e640` |
| `src/referral/referral-panel.ts` | `572c1a7408d23db5cc49ef4daafe748fa81141584d2b93712f66529f4d8b1a05` |
| `src/showcase/app.ts` | `50628335fd2b9b798c8b7556ea7efd6b62500899534dd1eeeb711926f162caf1` |
| `src/ui-preview.ts` | `4e6c635226d008eba7307c77da9f14680f631fe08648a6c78d70aa89d82fe9c7` |
| `tests/app-shell.test.mjs` | `4b09de13a20da3105a57179c9f0b62e6f2b24559bfb741116eb0c7010e9ee075` |
| `tests/ui-tokens.test.mjs` | `08bea0ce466bdbcefd89ae2046c515ad32eb46bf2f485f06fed7a99a597eac21` |
| `public/third-party-licenses.txt` | `d941de48f23a84b1c5fbc1b9deb0f9ce9644ac909c09268f234b5ce423c28de8` |
| `package.json` | `10cbdba09d0f2c40d4200ecf796105269d570dbb21b3b4810323ad0900c97eb4` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |

## 產品負責人裁決（2026-10-04，第二批）

- **08A-1 併入 AC1＋06A＋07A 同一次發布**（清單已加 D-08A-1 共 7 項）。
- **平台正式名稱「yoi 遊移遊戲」**，畫面文字全面改稱；LOGO 換成 yoi LOGO（`UI-design/yoi LOGO.JPG`，原複製為 `src/assets/yoi-logo.jpg`，2026-10-04 改用去背版 `src/assets/yoi-logo.png`），**三處**：登入頁、主畫面工具列、診斷畫面（管理畫面一併）。PRD 開頭加註正式名稱；過去 FSD 契約維持原文。**併入 08A-1**（只改文字、圖片、樣式）。
- **08A-2 首頁示意**：底圖用 `UI-design/yoxi 首頁截圖.PNG`；在 yoxi 漢堡選單**正下方**加「進入 yoi」按鈕（**只用魷魚圖案**，從同一張 LOGO 裁切；白色圓形按鈕，與截圖右上角按鈕同風格），要有「獨立新功能」的感覺；動態效果**全部**：輕輕上下漂浮、外圈脈動光環、偶爾左右搖擺；加 **NEW** 小標籤；減少動態效果時停止動畫。原 PRD「下方表單上緣入口＋文字標籤」改為此左上角按鈕。

## 08A-1 追加：名稱與 LOGO（2026-10-04）

- `views.ts`：`PLATFORM_NAME`、`yoiBrand(text)`（LOGO＋副標「遊移遊戲」／「管理工具」）；登入頁、診斷畫面、主畫面工具列、管理畫面改用；登入說明、關於文字改名；`index.html`、`ui-preview.html` 標題改為「yoi 遊移遊戲｜…」。
- LOGO 以 CSS 從原圖裁切（原圖 1200×600，圖樣範圍 x 205–1000、y 135–470；`background-size`／`background-position` 依 `--logo-w` 計算），不另做圖檔處理；建置後為 `assets/yoi-logo-*.jpg`（57 kB）。
- `tests/ui-tokens.test.mjs`：來源掃描排除二進位圖檔。
- 驗證：`npm test` 134/134、tsc、build 通過；預覽確認登入頁與主畫面工具列 LOGO 顯示正確。
- **QA 短版覆核（Sonnet）：通過**（npm test、tsc、build 自行通過；360 px 登入頁與主畫面工具列 LOGO 裁切正確、無變形、無橫向捲動；CSS 裁切數學與無障礙標示正確）。次要已修：`.brand-name span` 誤套到 LOGO 造成左偏 6 px → 改為只套副標；移除無用的 `.yo-brand b`；合併重複的 display 宣告；發布清單第 22、28 項補「主畫面、診斷、管理畫面也是 yoi LOGO」；HANDOFF 標題改名。
- **產品負責人追加（2026-10-04）**：LOGO 改用去背版 `UI-design/yoi LOGO_去背.png`（1200×600，裁切範圍相同；複製為 `src/assets/yoi-logo.png`，刪除本積木先前複製的 JPG）；LOGO 右側副標（「遊移遊戲」「管理工具」）字級與粗細改為與登入頁標題「登入展示版」相同（`--yx-type-nav-title`，700 20px）。四處（登入頁、主畫面工具列、診斷畫面、管理畫面）共用 `yoiBrand`。驗證：npm test 134/134、build 通過（PNG 223 kB）；360 px 登入頁與主畫面工具列無橫向捲動，副標與標題字型實測一致。
