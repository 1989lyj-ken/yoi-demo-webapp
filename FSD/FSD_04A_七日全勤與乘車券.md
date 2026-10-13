# FSD-04A｜七日全勤與乘車券

> **FSD-04B 修訂（2026-10-05）**：全勤改為七日有效步數皆達 6,000，**取消「週日第三點」條件**。本文件中前提 1、3、7、「週日第三點」「全勤成立」定義、P21／P22 對照與人工驗收裡關於第三點的敘述，自 04B 起不適用，以 `FSD_04B_全勤規則調整.md` 為準；其餘（券面額、效期、最低車資、每人每週一張、防重複、只結算本週與上週）不變。

**狀態**：契約第 2 版（2026-10-02）。Architect 兩輪附條件通過並併入；Q1–Q3 全照建議。本機實作完成；QA／Security 首輪審查與修正完成；**短版覆核：QA 通過、Security 附條件通過**，條件（L3）與覆核提出的項目已修正並以 mutation 驗證（見文末）。**本機完成，待產品負責人依 `發布與驗收清單_01C_03C_04A.md` 與 01C、03C 一次發布並人工驗收**；未部署，未以真實 Firebase 登入實測。依據：PRD §5.1、§5.2、§5.3、§7、§8 與 P05、P07–P10、P19、P21、P22、D02、D03、D07、D16；FSD-04 總契約；FSD-01C、FSD-02。

## 已核定前提（產品負責人，2026-10-02）

1. **「成員不能自行寫入券紀錄」的解讀**：展示版沒有伺服器，券由成員本人的裝置寫入；但 **Rules 逐日驗證七日全勤與週日第三點**，不合資格寫不進去，等同成員無法自行偽造。唯一的信任前提仍是步數為自報模擬資料（01C 已接受）。
2. **到期時間**：存固定欄位 `expiresAt`，由 Rules 驗證恰為 `issuedAt` 加 30 天（同一時分秒）；入帳後不可改。
3. **發券不另設截止**：七日步數（D+1 24:00）與週日第三點（下週一 24:00）已各有截止，資料過期即凍結；當下沒發成，之後開啟仍可補發（範圍見前提 8）。逾期才領第三點者本來就領不到，不會發券。
4. **恭喜提示**：每張券在每台裝置只顯示一次（本機記錄），含補發的券；文案依 PRD，附「查看乘車券」捲動到券區塊；只在伺服器確認入帳後顯示。
5. **車資試算（P21）**：券卡片提供「輸入模擬車資試算」，顯示可用／不可用，並註明僅為試算、不實際核銷。
6. **畫面位置**：只做共享模式（每日面板下方的「本週全勤」與「我的乘車券」）；純展示模式不變，留給「展示模式改接共享資料」積木。
7. **領點與發券分開寫入**：發券驗證要讀 9 份文件，與領點合併會逼近上限；領完第三點後「已入帳」約晚一秒顯示，期間顯示「發券中」。
8. **Q1（採 A）補發範圍**：**每天**都在背景檢查本週與上週（14 份每日文件），合格且無券就補發；上週的七格只在週一顯示，其他日子靜默補發、照常顯示恭喜。兩週以前漏發的券（例如斷線兩週以上，或管理者一次推進超過一週）列為已接受風險。
9. **Q2（採建議）券存 `clockVersion`**：欄位等於 `currentClockVersion()`（同一份 `demo/current`，不增加讀取），使「核對權威時鐘版本」字面成立。
10. **Q3（採建議）補發不另註明**：補發的券與即時發的券畫面相同（只列入帳與到期時間），恭喜提示照常；效期自補發當下的情境時間起算（已接受風險 3）。

## 範圍

- 負責：每人每週的七日全勤判定與進度顯示；週全勤乘車券的建立（每人每週一張）、效期、可用／過期狀態與車資試算；發券的觸發、待發券與補發（本週與上週）；恭喜提示；週一的上週結算狀態。
- 不負責：正式 yoxi 券庫、核銷與車資；點數總餘額（寶箱積木）；鈴鐺通知；純展示模式；隊伍相關（全勤是個人任務）。
- 受影響檔案：`firestore.rules`（新增 `rideCoupons` match 與少量函式）、`src/weekly/perfect-week-state.ts`（新）、`src/weekly/perfect-week-service.ts`（新）、`src/weekly/perfect-week-settler.ts`（新）、`src/main.ts`、`src/ui/views.ts`、`src/style.css`（如需）、`src/ui-preview.ts`、`tests/firestore-rules.test.mjs`、`tests/perfect-week-state.test.mjs`（新）、`tests/perfect-week-settler.test.mjs`（新）、`scripts/mutate-perfect-week-rules.mjs`（新）、`scripts/test-firestore-rules.ps1`（`ValidateSet` 加指令）、`package.json`。

## 名詞

- **活動週 W**：Asia/Taipei 週一 00:00 至週日 24:00；`weekId` 為該週週一的日期（沿用 `weekOfTaskDate`）。
- **達標日**：該任務日 01C 每日文件的 `effectiveSteps >= 6000`（加成由 01C 計算）。
- **週日第三點**：該週週日每日文件的 `claimed == 3`（逐點或「全部領取」皆同）。
- **全勤成立**：W 的七個任務日皆為達標日，且週日第三點已領。

## 01C 資料足以判定（Architect 已驗證）

- 週日第三點只能在週日或週一提高（`dailyUpdate` 要求今日／昨日窗口），下週二 00:00 起任何更新都被拒。
- 每日文件過期即凍結：create／update 受窗口限制，list／delete 一律拒；新場次內不得以 Console 寫入（01C 操作清單）。
- `effectiveSteps` 不會下修：步數分支要求原始步數嚴格增加並依同一係數重算；乘車分支係數只升不降；領取分支不得改 `effectiveSteps`。發券當下讀到的達標不會之後被推翻。

## 資料格式

### 乘車券 `rideCoupons/{sessionId}/members/{memberId}/weeks/{weekId}`（只能建立）

| 欄位 | 說明 |
|---|---|
| `sessionId`、`memberId`、`weekId` | 與路徑相同；文件 ID 保證**每人每週一張** |
| `faceValue` | 固定 `50`（NT$） |
| `minFare` | 固定 `150`（NT$，含） |
| `issuedAt` | 入帳當下的共用情境時間（等於 `demo/current.scenarioNow`） |
| `expiresAt` | `issuedAt` 加 30 天，同一時分秒，同一格式 |
| `clockVersion` | 等於 `demo/current.clockVersion`（Q2） |
| `recordedAt` | `request.time`（真實伺服器時間，僅稽核，不參與效期） |
| `kind` | 固定 `'weeklyPerfect'` |
| `days`（**僅備案**） | 見下方「每日文件路徑的兩種做法」；首選做法不需要此欄位 |

首選做法共 **10 欄**；若退回備案則加 `days` 共 **11 欄**（第 2 版原寫 9／10 欄，漏算 `kind`，實作時更正）。

### 每日文件路徑的兩種做法（Architect S2）

- **首選：Rules 自行組出日期字串**。以 `dayStr(t) = string(t.year()) + '-' + (t.month() < 10 ? '0' : '') + string(t.month()) + '-' + (t.day() < 10 ? '0' : '') + string(t.day())`，對 `monday + duration.value(i, 'd')`（i = 0…6）組出七個 `taskDate`，直接用於 `get(dailyPath(sessionId, memberId, dayStr(...)))`。券不需要 `days` 欄位，也不需要每格的格式、往返核對與別名測試。
- **實作第一步（前置實測）**，以下**任一項不成立即退回備案**（不在 Rules 裡另想變通寫法），並在實作紀錄寫明：
  1. `$(...)` 路徑插值內放函式呼叫加三元式加串接，能編譯並在 Emulator 載入；
  2. `string(int)` 輸出 `'9'`（不帶 `'9.0'` 之類的小數）；
  3. 跨月週（週一 `2026-09-28`，週四 `2026-10-01`）、跨年週（`2026-12-28` 至 `2027-01-03`）、閏年 2 月週（含 `2028-02-29`）的發券接受路徑皆通過；
  4. 發券接受路徑的 Emulator 日誌沒有 expressions 訊息。
- **備案：客戶端提供 `days`**（第 1 版做法）：長度 7 的字串陣列，Rules 逐一驗證：符合 `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`、split 後以三參數 `timestamp.date` 解析並做月／日往返核對、等於 `monday + i 天`。

### 進度

不另存「七日達標狀態」文件：進度由本人的每日文件即時推算；「待發券」＝全勤成立且無券，完全由共享端的持久資料決定，任何一次重新載入都能重算（滿足總契約的「持久待結算」與「唯一發券鍵」）。

## 讀取權限

| 資料 | 可讀者 |
|---|---|
| 乘車券 | 本人 `get` 與 `list`（路徑限本人；`activeMember`、`currentSession`、`actorMemberId == memberId`）；他人、其他場次、inactive、未登入皆拒 |
| 每日文件 | 沿用 01C（本人任何一天；隊友只讀今日） |

## Rules（新增一個 match；不改既有規則）

所有日期解析皆為「`split('-')` 後以三參數 `timestamp.date(int, int, int)`」，與 `weekBefore` 相同（UTC 日曆運算，無日光節約問題）。

**create 條件**（全部以 `&&` 串接，任何求值錯誤即拒）
- `activeMember() && currentSession(sessionId) && actorMemberId() == memberId`。
- 欄位固定（首選 10 欄）；`faceValue == 50`、`minFare == 150`、`kind == 'weeklyPerfect'`、`recordedAt == request.time`、`clockVersion == currentClockVersion()`。
- `weekId` 符合 `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`，解析後 `dayOfWeek() == 1`，並做月／日往返核對（每週只有一個合法 ID）。
- 七份每日文件皆存在，`effectiveSteps >= 6000`，且週日那份 `claimed == 3`。七組固定比較（Rules 無迴圈）。
- `issuedAt == currentScenarioNow()`。
- `expiresAt`：`validScenarioNow(expiresAt)`；`expiresAt.split('T')[1] == issuedAt.split('T')[1]`（時分秒與 `+08:00`）；兩邊日期部分解析後 `到期日 == 入帳日 + duration.value(30, 'd')`。
- **不設發券截止**（前提 3）。

**update／delete**：拒。

**時鐘版本核對的等價論證（M4）**：總契約要求「發券受控提交須核對最新 `sessionId` 與權威情境時鐘版本」。Rules 以 `currentSession` 核對場次（重設場次會換 `sessionId`），以 `issuedAt == currentScenarioNow()` 與 `clockVersion == currentClockVersion()` 把券綁在權威時鐘的當下狀態；前端交易另核對 `sessionId`、`clockVersion`、`scenarioNow` 皆等於頁面 context（見前端流程 5）。

### Rules 預算（必填；單一寫入操作上限 10 次 get／exists，交易整體 20）

| 操作 | 讀取的文件 | 最壞份數 |
|---|---|---:|
| 發券（create） | `membersByUid`、`demo/current`、七份每日文件 | **9** |
| 交易內先讀券（get） | `membersByUid`、`demo/current` | 2 |
| 讀自己的券（list） | `membersByUid`、`demo/current` | 2 |

- 同一文件的重複 `get`／`exists` 去重：若不去重，發券接受路徑為 3＋3＋7＝13 次必超限被拒，因此**「發券讀 9 份的接受路徑測試通過」本身即證明去重**（03C-2 最多約 8 份，不足以證明，故此測試必要）。
- 最壞 9 份距上限只差 1：**本積木之後不得在發券規則再加任何 `get`**；週日 `claimed == 3` 雖隱含週日達標，週日文件仍須讀取，份數無法再減。
- 運算式估計約 200–250（首選做法更少），以 Emulator 日誌確認無 expressions 訊息。

## 前端流程（`src/weekly/`）

1. **訂閱**：本人本週與上週共 **14 份**每日文件（每天都訂，Q1-A），加本人乘車券的 `list`。只有**伺服器確認**（非 `fromCache`、非 pending）的快照可用於判定、觸發與顯示「已入帳」。今日與昨日兩份與每日面板重複訂閱，SDK 會合併同一目標，不強行共用面板狀態。
2. **每日狀態**（純函式 `dayStatus(taskDate, doc, today)`，只用 `scenarioNow` 的日期部分做 UTC 運算，不使用本機時區）：
   - `achieved`：已確認且 `effectiveSteps >= 6000`。
   - `syncable`（待同步）：該日為今日或昨日（週一時上週週日也算），且未達標或無文件。
   - `missed`：已過補同步截止且未達標或無文件。
   - `future`：晚於今日。
3. **週判定**（純函式 `weekVerdict`）：`achievedCount`（X／7）；`sundayThirdClaimed`；`eligible`（全勤成立）；`closed`＝任一日 `missed`，或「今日 > 週日 + 1 天」且週日 `claimed < 3`（本週不可能發券）。
4. **結算器**（`perfect-week-settler.ts`，比照 03C-2 `WeekSettler`）：以 `weekId` 為單位，本週與上週各一個實例；`latest`／`needRerun`／`while (needRerun)` 單一執行；`cancel()` 後不再寫入或通知；以 `SettlerPort` 介面隔離 Firestore 以便單元測試。觸發：每次 14 份每日文件或券 list 的確認快照到達且該週 `eligible` 且無券。
5. **交易（M4）**：交易內讀 `demo/current`、`membersByUid` 與該週的券；核對 `sessionId`、`clockVersion`、`scenarioNow` 皆等於頁面 context，不同即拋「請重新載入」（同 `DailyService.run`）；券已存在即「已入帳」；否則建立，`issuedAt` 取**交易讀到且已核對**的 `scenarioNow`，`expiresAt = plusDays(issuedAt, 30)`。
6. **失敗語意（M3、S8）**：交易內發現 `sessionId`／`clockVersion`／`scenarioNow` 與頁面 context 不符時拋出**獨立的「過時」錯誤**：不重試、不寫終局鍵、不改畫面，等 `main.ts` 的 `contextStale` 處理（覆蓋層與取消結算器）。其餘沿用 `contrib-state.ts` 的 `classifyFailure`（網路類＝「待發券」，其餘＝拒絕）。任何拒絕先以 `getDocFromServer` **重讀券本身**，存在即「已入帳」（雙裝置同時發券時敗方可能收到 `permission-denied`）；不存在再重讀七份每日文件、重新判定後重試一次；仍拒絕則以 `weekId` 加七份每日文件 `eventSeq` 為鍵在本頁不再嘗試（之後合法補同步產生新的 `eventSeq` 時可再試）。網路失敗本身不觸發重跑，只有新快照可以。
7. **`plusDays`（M5）**：只對日期部分以 `Date.UTC` 加減，時分秒與 `+08:00` 原樣接回（同 `previousTaskDate`）；**禁止**以 `new Date(issuedAt).getTime()` 加毫秒再 `toISOString()`（會變 `Z` 格式且 23:00 後差一天）。
8. **`canUse(coupon, fareInput, now)`（M5）**：車資只接受非負整數（`NaN`、小數、負數顯示「請輸入金額」）；未過期以固定格式字串比較 `now < expiresAt`（與 `validScenarioNow` 一致）且 `fare >= minFare`。
9. **恭喜提示（前提 4、S5）**：券的確認快照首次出現且本機未記錄 `seen:{sessionId}:{memberId}:{weekId}` 時顯示；`localStorage` 不可用（讀寫以 try/catch 包住）時以本頁記憶體集合避免每次快照重彈；一次出現多張未看過的券時只彈一次（列最新一張），其餘靜默標記。關閉或點「查看乘車券」後記錄並捲動到 `#coupons`。
10. **與 `main.ts` 的整合（M6、N2）**：
    - 掛載於 `showSharedSession`、每日面板之後；所有回呼開頭檢查 `contextStale`；服務層的訂閱帶 `includeMetadataChanges`（從快取轉回伺服器確認時再交給結算器，重連後自動重試待發券）。
    - **移除點**：恭喜對話框（`#coupon-prompt`，掛在 `document.body`）在 `stopSharedSubscriptions()` 內移除，涵蓋純展示、管理頁、登出與過時（`markContextStale` 會經過它）；同處一併移除 `#yesterday-prompt`（01C QA 留下的事項）。`stopSharedSubscriptions()` 同時取消本積木的訂閱並呼叫兩個結算器的 `cancel()`。
    - **覆蓋層互斥**：`showYesterdayReminder` 的延後條件改為「團隊對話框**或**恭喜對話框任一開著」；恭喜對話框遇到團隊對話框或昨日提示開著時延後。任一對話框關閉後依固定順序重新評估：**先昨日提示、後恭喜**。stale 覆蓋層永遠在最上層（上述移除點保證不會並存）。
    - 本積木會修改 01C 既有的 `showYesterdayReminder` 與 `stopSharedSubscriptions`（`src/main.ts`）。

## 畫面（共享模式，每日面板下方）

- **本週全勤**：標題「本週已達標 X／7 天」；週一到週日七格（已達標、待同步、未達標、尚未到，**不只靠顏色**，格內有文字或圖示）；週日格下方「週日第三點：已領／未領（截止 下週一 24:00）」。
- 狀態列：全勤成立且券未確認時「發券中…」；待發券時「乘車券待發，下次同步或重新載入頁面時會補上」；本週不可能全勤時「本週全勤已無法達成，每日點數不受影響」。
- **週一**：另顯示「上週」同一組七格與結算狀態。其他日子不顯示上週，但結算器仍在背景補發（Q1-A）。
- **我的乘車券**（`#coupons`）：每張券顯示「NT$50 乘車獎勵券（模擬）」、最低車資 NT$150、入帳時間與到期時間（情境時間）、可用／已過期；車資試算欄位與結果；註明「僅展示模擬獎勵，不能在正式 yoxi 使用」。補發的券不另註明（Q3）。
- **恭喜提示**：「恭喜完成本週七日挑戰！NT$50 乘車獎勵券已入帳。每天為自己多走一點，也別忘了適時休息，下一段路讓 yoxi 陪你。」＋「查看乘車券」（Dialog 樣式）。
- 未確認的資料不顯示為已達標或已入帳（fail-closed）；`ui-preview` 新增對應畫面（進度各狀態、週一含上週、發券中、待發券、不可能全勤、券可用／過期、車資試算、恭喜提示）；375 px 無水平溢出。

## 已接受風險

1. 步數為自報模擬資料（01C 已接受）：自報足量步數即可「合法」全勤。
2. 恭喜提示以本機記錄去重：換裝置或清除瀏覽器資料會再顯示一次（不影響入帳）。
3. 發券不設截止：同一週的券可能晚於全勤成立數天才入帳，`issuedAt` 為實際入帳時的情境時間，效期由此起算（PRD：自成功入帳起算）；畫面不另註明補發（Q3）。
4. **只有本人裝置會發券**：本人不再開啟 app 就不會入帳。
5. **補發範圍限本週與上週**（Q1-A）：兩週以前漏發的券（斷線兩週以上、或管理者一次推進超過一週）不會補發。

## 驗收對應

| 驗收 | 本積木驗證內容 |
|---|---|
| P07 | 加成後有效步數達 6,000 即為達標日（由 01C 計算，本積木只讀） |
| P10 | 週一至週日七日皆達標才發券；週三至下週二不合併；新週獨立；週日補同步可補算上週 |
| P21 | 七日達標＋週日第三點（逐點或全部領取）發一張 NT$50／30 天券並顯示恭喜；普通單日領第三點不發；車資 149 不可用、150 可用 |
| P22 | 重試、刷新、雙裝置同時只一張；週日第三點已領、之後補同步才全勤時自動補發；週一 24:00 後才領第三點不發（01C 擋）；效期自入帳情境時間起算 30 天，推進時間只改狀態不改到期時間；週二才開 app 仍補發上週 |
| P05、P19（部分） | 發券不重複（文件 ID） |

**Rules 測試（Emulator）必備案例（含 M2 補充）**
- **准**：七日皆 6,000、週日 `claimed == 3`、欄位正確（`expiresAt` 恰 30 天：跨月、跨年、閏年 2 月、`00:00:00` 與 `23:59:59`）；**週中跨月（`2026-09-28` 週）、跨年（`2026-12-28` 週）、閏年 2 月（含 `2028-02-29` 的週）的七份每日文件皆讀到並發券成功**（N1，首選做法的 `dayStr` 證據）；交易內先讀不存在的券後建立；**三週後的情境時間仍能為已凍結的合格週發券，`issuedAt` 等於當時情境時間**（不設截止）。
- **發券讀 9 份的接受路徑**：同時作為 get 去重的證據；Emulator 日誌無 expressions 訊息。
- **拒**：任一日 5,999；任一日每日文件不存在（含本週週日尚未到）；週日 `claimed` 為 2；`weekId` 非週一、別名格式（`2026-9-28`）或不存在的日期；`issuedAt` 不等於情境當下或格式錯誤；`expiresAt` 為 29 或 31 天、時分秒不同、缺 `+08:00`、時為 `24`；`faceValue`／`minFare`／`kind`／`clockVersion` 錯；`recordedAt` 不等於 `request.time`；多欄或少欄；替他人建立；舊場次路徑；inactive；重複建立；update；delete。
- **備案（若採 `days`）另拒**：`days` 元素非字串、七格相同（重複日期）、別名格式（`2026-9-29`）、不連續、順序錯、長度不是 7。
- **讀取**：本人 get／list 准；他人 get／list、未登入、其他場次、inactive 拒。
- **Mutation 反證**：新增 `scripts/mutate-perfect-week-rules.mjs`（沿用 `rules-mutation-runner.mjs`，含基準與 canary），涵蓋每一條 create 條件、讀取規則的 `currentSession`／`actorMemberId`／`activeMember`，以及 update／delete 一律拒；首選做法另加「拿掉 `dayStr` 的補零」，跨月週的接受測試必須變紅（N1）；等價變異列明理由。依核定規則，之後只重跑 Rules 有變動的積木。

**單元測試**：`dayStatus`（今日、昨日、週一看上週週日、截止後、未來、無文件）；`weekVerdict`（X／7、全勤、週日未領、不可能全勤、跨週）；`plusDays`（`2026-12-02T23:30:00+08:00` → `2027-01-01T23:30:00+08:00`、`2028-01-30` → `2028-02-29`、`2027-01-30` → `2027-03-01`、`2026-01-31` → `2026-03-02`、`00:00:00` 與 `23:59:59`）；`canUse`（149／150、過期前後、非法輸入）；結算器（以假 port：每天都結算上週、拒絕後先查券存在即已入帳、時鐘或場次變更時交易拋出要求重新載入、單一執行與 `needRerun`、網路失敗不自行重跑、`cancel` 後不寫入、以 `eventSeq` 為鍵的終局在新補同步後可再試）；恭喜提示去重（`localStorage` 拋例外、多張未看過只彈一次、遇其他對話框延後且關閉後只補彈一次）；結算器遇「過時」錯誤不重試、不終局；畫面文字。

**人工驗收（需新 Rules 發布後以真實帳號）**：發券與恭喜提示；雙裝置同時領週日第三點只一張券；週二才開 app 補發上週；**恭喜對話框開著時推進時鐘，只剩 stale 覆蓋層**；恭喜對話框與昨日補領提示不同時出現（先昨日提示、後恭喜）；切到純展示模式或登出時對話框不殘留。

## 依賴、部署與邊界

- 依賴 01C 的每日文件格式與領點規則；Rules 新增 `rideCoupons` 一個 match，可與 01C、03C 同一次或之後發布（發布與場次重設由產品負責人執行；發布清單須加入此 match）。
- 不改 `dailySteps` 與其他既有規則。
- **與日後積木的交接（S7）**：獎勵頁與點數總帳只讀 `rideCoupons`（券不是 Points，不進點數總帳）；鈴鐺通知可用新券的 `issuedAt` 為來源；「展示模式改接共享資料」沿用 `perfect-week-state.ts` 的純函式；場次重設不刪券，舊場次的券因 `currentSession` 不可讀。

## Architect 審查（第 1 輪，2026-10-02，Opus）：附條件通過，已併入

- 無阻擋。確認：Rules 可寫出 `days` 驗證且無法繞過；讀 9 份可信（同文件去重，接受路徑即證據）；`expiresAt` 驗證可行；「不設截止」「進度不另存文件」符合總契約與 PRD 本意；01C 資料足以判定（週日第三點截止、過期凍結、`effectiveSteps` 不下修）。
- 應修正 M1（每天檢查上週）、M2（Rules 必備案例補充）、M3（拒絕後先重讀券、`eventSeq` 終局鍵、沿用 `classifyFailure`）、M4（交易讀與時鐘核對、等價論證）、M5（`plusDays` 約束與案例、`canUse` 輸入）、M6（`main.ts` 整合點與受影響檔案）——皆已併入上文。
- 建議 S1（用詞更正）、S2（Rules 自行組日期字串，首選、前置實測，不可行退回 `days`）、S3（存 `clockVersion`，即 Q2）、S4（結算器以週為單位、確認快照）、S5（恭喜提示去重）、S6（`dayStatus`／`closed` 定義）、S7（交接）——皆已併入。
- 裁決 Q1（採 A）、Q2（加 `clockVersion`）、Q3（不另註明補發）：產品負責人全照建議。

## 待 Architect 短版覆核的重點

1. 首選做法「Rules 自行組日期字串」的 `dayStr` 寫法與前置實測條件；退回備案的判準。
2. Q1-A 每天訂閱 14 份每日文件加券 list 的成本與觸發，與每日面板重複訂閱的處理。
3. M3 的失敗語意（先查券、`eventSeq` 終局鍵）與 M4 的交易核對是否完整、無循環。
4. 第 2 版有無新增的遺漏或與既有積木（01C、03C 的覆蓋層與停止流程）衝突之處。

## Architect 短版覆核（2026-10-02，Opus）：附條件通過，已併入，不需再覆核

- 第 1 輪 13 項中 12 項已修正，M6 部分修正（本次以 N2 補足）。
- **N1**：首選做法須證明週中跨月、跨年、閏年 2 月的七份每日文件皆可讀到並發券（加入必備「准」案例與前置實測判準）；mutation 加「拿掉 `dayStr` 補零」。
- **N2**：恭喜對話框的移除點（`stopSharedSubscriptions()`，同時移除 `#yesterday-prompt`）與覆蓋層互斥（昨日提示延後條件擴大、固定順序先昨日後恭喜）寫到可落實；新增人工驗收「恭喜對話框開著時推進時鐘只剩 stale 覆蓋層」。
- **S8**：交易內 context 不符獨立為「過時」錯誤，不重試、不終局、不改畫面。
- **S9**：受影響範圍註明 01C 的 `showYesterdayReminder`／`stopSharedSubscriptions`；單元測試加「遇其他對話框延後、關閉後只補彈一次」。
- 覆核確認：`dayStr` 寫法正確；14 份訂閱成本可接受、與每日面板重複訂閱共用監聽目標；M3／M4 不會循環；與 03C `WeekSettler` 無衝突。無新的產品裁決事項（對話框先後順序屬畫面細節，可依產品負責人偏好調整）。

## 實作紀錄（2026-10-02，本機）

- **前置實測（首選做法）全部通過，採首選**：Rules 以 `pad2`／`dayStr` 自行組出七個每日文件路徑；(1) 路徑插值內放函式加三元式加串接可編譯並載入；(2) `string(int)` 不帶小數（否則跨月週的路徑錯誤、接受測試失敗）；(3) 跨月（`2026-09-28` 週）、跨年（`2026-12-28` 週）、閏年 2 月（`2028-02-28` 週，含 2/29）的發券接受路徑皆通過；(4) Emulator 日誌無 expressions 訊息。券不存 `days`。
- **與契約的差異**：欄位數為 **10**（契約第 2 版寫 9，漏算 `kind`，已更正）。`weekId` 的標準寫法改以 `dayStr(monday) == weekId` 驗證，取代月／日往返核對（同時排除別名與非標準寫法）。
- **新增**：`firestore.rules` 的 `rideCoupons` match 與 `pad2`／`dayStr`／`couponDay`／`couponExpiry`／`couponCreate`；`src/weekly/perfect-week-state.ts`（`plusDays`、`weekDays`、`dayStatus`、`weekVerdict`、`settledWeeks`、`finalKey`、`parseCoupon`、`canUse`、`promptPlan`）、`perfect-week-settler.ts`（`CouponSettler`，以 `CouponPort` 隔離 Firestore）、`perfect-week-service.ts`（14 份每日文件與券的訂閱、交易發券並核對 context，「過時」獨立分類）、`perfect-week-panel.ts`（本週全勤、週一另顯示上週、我的乘車券與車資試算、恭喜提示）；`main.ts`（掛載、`stopSharedSubscriptions` 一併移除 `#yesterday-prompt` 與 `#coupon-prompt`、覆蓋層互斥與「先昨日提示、後恭喜」）；`views.ts`／`style.css`（`perfectWeekView`、`couponsView`、`couponPromptView`）；`ui-preview.ts` 新增 7 個畫面；`scripts/mutate-perfect-week-rules.mjs` 與 `npm run test:rules:mutation:coupon`。
- **實作中發現並修正**：單元測試抓到「券發出後，被拒鎖定狀態未清除，畫面仍顯示待發券」，已於發券成功時清除。375 px 時七格的日期被截斷、「待同步」換行：格內改為日期數字與兩字短標籤（達標／待補／未達／未到），完整文字作為無障礙名稱，並加一行「待補：今日或昨日，仍可補同步」。
- **測試自身的缺陷（mutation 揭露，已修）**：「偽造欄位」測試為測非週一週 ID 另種了一週週二起算的資料，覆蓋了正確那一週的週日，使該測試所有寫入其實都因「週日第三點未領」而被拒；已移除該種植並在測試末尾加「正確寫入必須成功」的對照。另補：完整的週二起算週（他人資料）只被週一檢查擋下、舊場次的完整一週只被目前場次檢查擋下、欄位 `sessionId` 與路徑不符、`expiresAt` 別名格式、七天逐日 5,999。
- **驗證**：`npm test` 110/110（新增 `perfect-week-state` 9 條、`perfect-week-settler` 6 條）；`npm run test:rules` **109/109**（04A 共 7 條）；tsc、build 通過；預覽頁 375 px 的 7 個畫面無水平溢出、格內無截斷。
- **Mutation**（`npm run test:rules:mutation:coupon`）：37 項，**32 項被抓到、5 項等價、0 項意外存活**（約 4 分鐘；基準 7 條與 canary 通過）。等價：p07／p08（欄位數與允許欄位互相保護）、p17／p19（日期格式與標準寫法互相保護）、p25（週日 `claimed == 3` 已隱含週日 6,000）。依核定規則，03C-1、03C-2 的 Rules 未變動，未重跑。
- **未完成或未驗證**：真實 Firebase 雙裝置；恭喜提示與其他覆蓋層的互斥只以程式審閱與預覽驗證，需人工驗收。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `3d739b81f47c7b18401398fb607df80779281470eb12e995723ecc4b5ce0e140` |
| `tests/firestore-rules.test.mjs` | `a588b2f8b8176026a400e8b98a5b70503cfbf10c26fd203ad1e9efd18e5003f9` |
| `tests/perfect-week-state.test.mjs` | `29a677b51945845c78e31fd2f904051e1e8a0c87ade1487445b7bf8139609032` |
| `tests/perfect-week-settler.test.mjs` | `54e2a9cf168486c7ddb43969301612714d17a2a2230d75862f6a9f309cfab24d` |
| `scripts/mutate-perfect-week-rules.mjs` | `01c64e82f7d0bcf2f3133ba13e2a1c230442157edfab17c81c7cd66418b8bf46` |
| `scripts/rules-mutation-runner.mjs` | `12322739ac6e796593c8f3a516b5313e27eb3cb2300e957f3ac7f389740b0858` |
| `scripts/test-firestore-rules.ps1` | `0acce1119a32b082a34dd8db4624f8cc4dc0e555b93ef13165653a72e6426da4` |
| `src/weekly/perfect-week-state.ts` | `2ba2fffcc7573718fdb39f3b4d8162190d380ec65737248e4631689975efd48e` |
| `src/weekly/perfect-week-settler.ts` | `95fde9b6476d93a9dce4790737207cdf6d5fd00726acf37db5967266594ffd05` |
| `src/weekly/perfect-week-service.ts` | `652d1f1638d29fb6450c09fc48f7b086f8fe18cbda03094a8a51425aabca6c27` |
| `src/weekly/perfect-week-panel.ts` | `f10ecfda14e846bc96aa364b06e5eb9d8b41f50b1867ffe209c3f03785861f29` |
| `src/main.ts` | `3acee952de7897fce25f32b23c768616ce29a82d63d0943c4d00e1e3a57605fb` |
| `src/ui/views.ts` | `379bff02f61527d5d2651b5ce890e8f8a654e26ae1304a53d4fbee0f94a2e948` |
| `src/style.css` | `6ecd75b66b2b38c749afe9142c70d3e3ca26d90c623039fb8f24dedc455633e6` |
| `src/ui-preview.ts` | `3b485d98dd880285be690258c6eb1485ccb12071f75c6e2bb2f51cf43f558b52` |
| `package.json` | `8d1ea2f0cf52b5050aad3ccd6608d300aa6f99bbf30ae78fa579e096b4b5a234` |

## QA／Security 首輪審查與修正（2026-10-02）

**審查結論**：QA（Sonnet）無阻擋，應修正 2 項、次要 7 項；Security（Opus）**附條件通過**，無 Critical／High／Medium，Low 2 項、Info 4 項，並確認拿掉 04A 區塊後 Rules 等於 03C-2 通過版本 `6959db5f…`（無回歸）；兩者皆重跑 04A mutation（Security 於 8098 副本，QA 於 8088）。兩位審查者首次派出時因額度中斷，額度恢復後以原脈絡續審。

**修正內容**
- **QA 應修正 1（恭喜提示）**：顯示時不再把該券記為已看；只有成員按「關閉」或「查看乘車券」才記錄。其餘同時出現的舊券仍靜默記錄。對話框開著時推進時鐘或重新載入，之後會再顯示一次。
- **QA 應修正 2（身分變更）**：交易內發現帳號停用或對應改變時回傳獨立結果 `identity`（不再誤當 `stale`）：結算器停止本頁所有嘗試、不顯示待發券，畫面顯示「展示身分已變更，請重新登入。」。
- **Security L1（mutation 執行器在連續執行時不穩定）**：每次變異前稍候讓 Emulator 穩定；結果為「前置步驟失敗」時等 3 秒自動重跑一次（Rules 載入失敗者重跑仍為 ERROR，不會誤判為抓到）。
- **Security L2（發布清單）**：新增 `發布與驗收清單_01C_03C_04A.md`（取代舊版）：Rules 雜湊開頭、新場次內不得以 Console 寫入相關集合的提醒、D5「04A」人工驗收 9 項。
- **Security I1**：p17 的等價理由改為「在可達狀態下等價」（1000 年以前的年份不補零，但 01C 不允許這種每日文件）。
- **Security I2**：`couponExpiry` 加 `dayStr(到期日) == 日期部分` 往返核對（縱深防禦，不增加讀取）；新增 mutation p38；p04（格式檢查）與 p38 互相保護，皆列為等價。
- **QA 次要**：恭喜文案改為完整字串比對；資料未確認時週日第三點顯示「同步中」；「待補」說明只在有待補格子時顯示；昨日提示與恭喜提示關閉時先移動焦點再開下一個；本機記憶的「已看過」改為整頁共用；Rules 測試補讀取的 get（inactive、其他場次）與未登入 list，以及「不存在日期滾動」的到期日拒絕；單元測試補身分變更。
- **未處理（記錄）**：`PerfectWeekService.issue` 與恭喜提示的 DOM 互斥沒有自動化單元測試（需 Firebase／DOM），以人工驗收 D5 覆蓋；交易冗餘（發券成功後下一輪以 `exists` 結束）無害，維持。

**驗證（修正後）**
- `npm test` 111/111；`npm run test:rules` 109/109（04A 7 條）；tsc、build 通過。
- **Mutation**（`npm run test:rules:mutation:coupon`）：38 項，**31 項被抓到、7 項等價、0 項意外存活**（約 8 分鐘，基準與 canary 通過）。等價：p04／p38、p07／p08、p17／p19（各組互相保護）、p25。依核定規則，03C-1、03C-2 未重跑。

**審查基準版本（SHA-256，短版覆核用）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882` |
| `tests/firestore-rules.test.mjs` | `5a3de35c7a93e2993757483bbdacad2be19aa6edc738a6fdf2af8ad236d11b09` |
| `tests/perfect-week-state.test.mjs` | `6d4816984de412d24df944c4e4947a9f02e61fe63b5fd4be0b456209e8054820` |
| `tests/perfect-week-settler.test.mjs` | `51ad853c1bbda96a44ff7c2e97d8737eb282e394420686b613c31522acf4a39e` |
| `scripts/mutate-perfect-week-rules.mjs` | `ebb86867366d39ec3c5f3237f62d32f10aa5b07a6357bd6d58dc2e6e2f208773` |
| `scripts/rules-mutation-runner.mjs` | `509b8d7b10da72fa315ddcea361dba59bb488a0431ea4ba154583330f36cc3b9` |
| `scripts/test-firestore-rules.ps1` | `0acce1119a32b082a34dd8db4624f8cc4dc0e555b93ef13165653a72e6426da4` |
| `src/weekly/perfect-week-state.ts` | `2ba2fffcc7573718fdb39f3b4d8162190d380ec65737248e4631689975efd48e` |
| `src/weekly/perfect-week-settler.ts` | `eeee2c2a6fc0705b545112cfc00490b1394ba6f0849936cbbdeb4faeaee6e74f` |
| `src/weekly/perfect-week-service.ts` | `191d0da04440be40a7e5e0ca2a10bfb5716fa138023c47cffa14264ea9eae69f` |
| `src/weekly/perfect-week-panel.ts` | `461956708aed7eaca56ff19a6d7dbbf817835c8f64b2faaaaca5996d7c1c0c9e` |
| `src/main.ts` | `d76705fce601fb83f43b9259bb223dd9aa435652a4180983e09e96e4cc2031b0` |
| `src/ui/views.ts` | `8a123c91c9932cf2b7dc8f023c44297b547dfc44860e8913bb1fb57272ef12d4` |
| `src/style.css` | `6ecd75b66b2b38c749afe9142c70d3e3ca26d90c623039fb8f24dedc455633e6` |
| `src/ui-preview.ts` | `3b485d98dd880285be690258c6eb1485ccb12071f75c6e2bb2f51cf43f558b52` |
| `package.json` | `8d1ea2f0cf52b5050aad3ccd6608d300aa6f99bbf30ae78fa579e096b4b5a234` |
| `發布與驗收清單_01C_03C_04A.md` | `628f4c4790e7ecbb547a7150ccb38b6a7be1fe8ac911d063534a55ca69ecbc96` |

## 短版覆核（2026-10-02）與後續修正

- **QA（Sonnet）：通過**。上一輪 2 項應修正與 7 項次要皆已修正或如實記錄；`npm test` 111/111、`test:rules` 109/109、tsc、build 通過；發布清單步驟可行、D5 覆蓋完整。次要 3 項：身分變更時週卡仍顯示「待發」、`card()` 內呼叫 `showError`、執行器內同名 `settle` 遮蔽；D5 第 6 項（斷網領點）不可行。
- **Security（Opus）：附條件通過**，無 Critical／High／Medium。I2 正確（不增加讀取、不誤拒跨月／跨年／閏年到期日）；拿掉 04A 區塊後 Rules 仍為 `6959db5f…`；L1 重跑不誤判，38 項無 ERROR。條件 **L3**：p04 標為等價不成立（拿掉格式檢查後，結尾多接 `T…` 的 `expiresAt` 會被接受；正式 Rules 會拒，非可利用漏洞）。Info：I3 不得 Console 寫入的集合列表不完整、I4 雜湊只比開頭且未核對貼上內容、I5 停用帳號實際走不到 `identity`（讀 `demo/current` 即被拒，屬 fail-closed）。
- **已修正（Rules 未變）**：L3 新增「正確到期日加結尾 `T…`」拒絕測試，p04 改回必須被抓到、p38 理由改為「有 p04 時屬縱深防禦」；新增週卡狀態 `identity`（「展示身分已變更，請重新登入後再確認乘車券。」，不再顯示待發），錯誤訊息改在 `render()` 開頭處理；執行器內函式改名 `finishFailure`；發布清單改為：除 `membersByUid` 外任何集合都不得以 Console 寫入、完整 64 碼雜湊逐字比對、發布後把 Console 規則複製回本機再算雜湊、停用帳號的描述更正、D5 第 6 項改為「領點後立刻關閉分頁、推進到週二再開，確認補發」。
- **驗證**：`npm test` 111/111；`npm run test:rules` 109/109；tsc、build 通過；**Mutation 38 項：32 項被抓到、6 項等價、0 項意外存活**（p04 由「forged」測試抓到；基準與 canary 通過）。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882` |
| `tests/firestore-rules.test.mjs` | `8c37e1520407789243abf9a98f662e4a3deeb64a6d1e1a89c9979705b1380603` |
| `tests/perfect-week-state.test.mjs` | `bf4fea12b24e5ad9136a7fa07b98fd294c50e4a61a1a0922b026516bb72a85b5` |
| `tests/perfect-week-settler.test.mjs` | `51ad853c1bbda96a44ff7c2e97d8737eb282e394420686b613c31522acf4a39e` |
| `scripts/mutate-perfect-week-rules.mjs` | `9d01cab9f133ad7b9dc89c35cc2ed75aa1d705c43a6b802739712966a9caa073` |
| `scripts/rules-mutation-runner.mjs` | `74efb44745ad72f3247ce8d75c46433e03391dceea9726c62a064db2f83b3214` |
| `scripts/test-firestore-rules.ps1` | `0acce1119a32b082a34dd8db4624f8cc4dc0e555b93ef13165653a72e6426da4` |
| `src/weekly/perfect-week-state.ts` | `2ba2fffcc7573718fdb39f3b4d8162190d380ec65737248e4631689975efd48e` |
| `src/weekly/perfect-week-settler.ts` | `eeee2c2a6fc0705b545112cfc00490b1394ba6f0849936cbbdeb4faeaee6e74f` |
| `src/weekly/perfect-week-service.ts` | `191d0da04440be40a7e5e0ca2a10bfb5716fa138023c47cffa14264ea9eae69f` |
| `src/weekly/perfect-week-panel.ts` | `5eaae647054337fc9b407d98a7917a2bfdbf10b4d8fdab13af37e59ec5a09e61` |
| `src/main.ts` | `d76705fce601fb83f43b9259bb223dd9aa435652a4180983e09e96e4cc2031b0` |
| `src/ui/views.ts` | `3cb3c64282107626a4b368bb3399b5104399b1f308b897dffc1058fd2478b74e` |
| `src/style.css` | `6ecd75b66b2b38c749afe9142c70d3e3ca26d90c623039fb8f24dedc455633e6` |
| `src/ui-preview.ts` | `3b485d98dd880285be690258c6eb1485ccb12071f75c6e2bb2f51cf43f558b52` |
| `package.json` | `8d1ea2f0cf52b5050aad3ccd6608d300aa6f99bbf30ae78fa579e096b4b5a234` |
| `發布與驗收清單_01C_03C_04A.md` | `d9ca4590c6b8983558c72abfa5bdb2587df6976f7d96ca96495ef51dae3ddc23` |
