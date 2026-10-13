# FSD-03B-UI｜退團、取消招募與隊長交接介面

**狀態**：契約第 2 版（2026-10-01）。Architect 兩輪附條件通過；本機實作完成；Security 附條件通過（B1 已修）、**QA 短版確認通過**（含 01C `daily-service.ts` 的針對性確認）。Rules 未改（雜湊 `9fb63471…`）。**本機審查完成，待產品負責人安排部署與人工驗收**；未部署，未以真實 Firebase 登入實測。依據：PRD §6.1、§6.1.1、§6.1.2、P11、P20、P23；FSD-03B；UI-design `Overlay/Dialog-Confirm`、§11.4。

## 範圍與前提

- **不修改 `firestore.rules`**（SHA-256 以 FSD-01C 最新版為準，03B 規則已發布並通過三方審查）。本契約只做前端與服務層：把 03B 已有的退團、取消招募、轉讓隊長開成可用的介面。若實作中發現需要改 Rules，立即停止並回報，另走審查。
- 本積木同時清掉 HANDOFF 列出的「開放退團 UI 前必須先完成」項目：(A) `team-service.ts` 的錯誤分類與「結果未確認後重讀」；(B) 移除舊格式容錯；(C) QA 前端行為第 1–3 點（封存隊伍狀態顯示、週鎖定時停用建隊／加入、成員異動時清除過期名單與步數）。
- 不負責：團隊週貢獻、歷史貢獻顯示、寶箱名單（03C）；隊長主動解散或移除他人（首版不做）；鈴鐺或站內通知；純展示模式；Rules 變更。

## 責任

讓成員在共享模式的團隊區塊完成：

1. **取消招募**（未曾成團的 1 人招募隊伍，不鎖週）。
2. **退出隊伍**（曾成團，含暫停中；當週鎖定）。
3. **更換隊長**（現任隊長轉讓給現有成員）。
4. 退出後的鎖定狀態顯示與建隊／加入按鈕的停用。
5. 隊伍異動時，名單與步數顯示即時、正確地更新，不顯示過期資料。

## 操作的對應（由伺服器確認的狀態決定，不由本機猜測）

| 目前狀態 | 顯示的操作 | 呼叫 | 結果 |
|---|---|---|---|
| 招募中、`everFormed=false`、1 人（本人為隊長） | 「取消招募」 | `leaveTeam`（Rules 判為 `cancelRecruiting`） | 隊伍封存；**不鎖週**；可立即另建隊 |
| 已成團（`active`，2–5 人）任一成員 | 「退出隊伍」 | `leaveTeam`（`leave`） | 當週鎖定；隊長退出由 `memberIds` 剩餘名單首位接任 |
| 暫停（`paused`，`everFormed=true`、剩 1 人） | 「退出隊伍」 | `leaveTeam`（`leave`） | 隊伍封存；**仍鎖週**（產品負責人 2026-09-30 裁決，待 03C 再檢視） |
| 已成團且本人為隊長、名單 ≥ 2 人 | 另加「更換隊長」 | `transferCaptain` | 只改隊長；其他不變 |
| 隊伍狀態為 `archived` | 不會出現：現任隊員的隊伍不會是封存（0 人才封存）。若讀到此狀態視為資料不一致，走格式錯誤路徑（見第 2 版修訂 R9）；`teamView` 不得再把 `archived` 顯示成「已成團」 | — | — |

「取消招募」與「退出隊伍」是兩個不同的文案與後果，按鈕標籤由 `everFormed` 決定，不由人數決定（暫停的 1 人隊伍是「退出」不是「取消」）。

## 確認流程（兩步，不自動關閉）

依 §11.4：先顯示摘要，再按動詞按鈕。使用 `Overlay/Dialog-Confirm` 樣式（寬 280、`radius/xl`、標題 20／700、說明 16、兩顆等寬按鈕：左次要、右主要；按鈕文字寫清後果，不用「確定／取消」）。對話框不自動關閉、不倒數；Esc 與「先不要」關閉；開啟時焦點移入對話框、關閉後回到觸發按鈕；對話框開啟期間背景不可操作。

| 操作 | 標題／摘要 | 左鈕（關閉） | 右鈕（主要） |
|---|---|---|---|
| 取消招募 | 「取消這次招募？」／「隊伍會封存，邀請碼失效。你可以馬上建立新隊伍。」 | 保留招募 | 取消招募 |
| 退出隊伍 | 「退出隊伍？」／「已貢獻的步數會保留、本週不能再加入或建立隊伍（下週一 YYYY-MM-DD 起可以）、尚未取得的寶箱資格可能失去。你的個人每日點數不受影響。團隊貢獻與寶箱功能後續開放。」（PRD §6.1.1 固定文案＋裁決 1 的一句說明） | 先不要 | 確認退出 |
| 隊長退出 | 同上，另加「你是隊長，退出後由 {下一位成員} 接任。」；若為最後 1 人：「退出後隊伍會封存。」 | 先不要 | 確認退出 |
| 更換隊長 | 先在清單選一位現有成員（排除自己），再顯示「把隊長交給 {成員}？」／「你會變成一般隊員，步數、週期與獎勵資格都不變。」 | 先不要 | 轉讓給 {成員} |

- 下一位接任者與下週一日期**由伺服器確認的快照計算**：接任者＝`team.memberIds` 去掉自己後的第一位；下週一＝`activityWeekId` 加 7 天（以 UTC 日期運算，與裝置時區無關）。
- 文案「已貢獻保留」是 PRD 已核定規則的告知；03C 完成前介面尚未顯示貢獻，**不得**在此畫面暗示貢獻已可查看（待產品負責人確認，見「待裁決」）。
- 確認按鈕送出後立即停用，直到結果明朗；同一時間只允許一個團隊操作（沿用 `teamBusy`）。

## 週鎖定的顯示與停用

新增伺服器確認的「成員鎖定狀態」，來源為成員索引 tombstone（`status='left'`）。`subscribeMembership` 目前遇到 `left` 只回 `null`，須改為同時回傳 tombstone，使畫面能判斷：

- **鎖定中**：`leftWeekId != null` 且（目前 `activityWeekId` 缺少，**或**等於 `leftWeekId`）。此時「建立招募隊伍」與「加入隊伍」兩個控制項停用，並顯示「你本週已退出正式隊伍，下週一（YYYY-MM-DD）才能重新組隊或加入」；缺週 ID 時顯示「管理者尚未設定活動週，暫時無法建立或加入隊伍」（與 Rules fail closed 一致）。
- **未鎖定**：`leftWeekId == null`（取消招募、從未入隊）或 `leftWeekId` 不等於目前週（時鐘只會前進，實際即為早於目前週）。可建隊／加入。
- 前端判斷只是 UX；真正保證仍是 Rules（`canJoin`）。Rules 若拒絕仍須顯示「結果未確認／不符合條件」並重讀，不得顯示成功。

## 服務層設計（`src/team/team-service.ts`）

1. **錯誤分類與未確認重讀（承 03B 契約；階段區分見 R4）**：前置檢查錯誤（如「你已退出隊伍」「只有現任隊長可轉讓」）直接顯示，未送出。**只有 commit 階段**的 `permission-denied`、`aborted`、`unavailable`、`deadline-exceeded`、`unknown`、`internal`、`cancelled` 才包成 `TeamUnconfirmedError`；交易內讀取階段被拒轉為前置錯誤；其他 SDK 錯誤轉固定中文訊息。
2. **重讀判定（純函式，可單元測試）**：以 `getDocFromServer` 讀成員索引與（若仍有）隊伍後判斷是否已生效：
   - 退出／取消生效＝索引 `status='left'` 且 `leftTeamId` 等於操作前的 `teamId`。
   - 轉讓：**以 R2 為準**（以隊伍 `revision` 單調量判定，不用「leader 等於目標」）。
   - 只有確認「未生效」時，介面才恢復一般按鈕並讓使用者**重新走確認流程**（不自動重試、不重送舊命令）；已生效或狀態已變動，直接更新畫面，不重送（見 R2）。重送已退出的操作會被前置檢查或 Rules 拒絕，不會重複寫入。
   - 並發（03B 實測）：退團與轉讓同時發生時，敗方可能收到 `permission-denied` 而非自動重試；最終只有一位有效隊長。前端一律走重讀，不依賴錯誤碼分辨。
3. **移除舊格式容錯（承 HANDOFF）**：`parseTeam` 不再補預設 `everFormed/nextJoinOrder/revision`，`parseMembership` 不再把缺 `status` 的舊五欄當 active。隊伍須剛好 11 欄、索引剛好 10 欄、事件不讀；格式不符丟出格式錯誤，畫面顯示「資料格式不符，請由管理者重設場次」，不得崩潰（與 FSD-01C 一致）。
4. **成員索引 tombstone 對外**：`subscribeMembership` 的 callback 新增第三個參數或改回傳結構，提供 `{team, joinOrder} | null` 與 `lock: {leftWeekId, leftAt} | null`；仍只在伺服器確認（非快取、無 pending）時回報 `confirmed=true`。
5. 不新增集合、不改寫入形狀；轉讓與退團的寫入 payload 沿用現有程式（已對照 03B Rules 測試）。

## 名單與步數的清除（QA 前端行為第 3 點）

- 自己退出或被索引更新為 `left`：停止名單訂閱，清空名單與步數顯示，隊伍區回到「尚無隊伍」並顯示鎖定說明；不保留退出前的隊友步數。
- 隊友退出：`memberIds` 改變時重新建立名單訂閱（現有 `changed` 判斷），已離開者不再出現，其步數條目移除。
- Rules 下已退出者與原隊友互讀今日步數會被拒。名單訂閱遇到 `permission-denied` 時，**不得**顯示永久的「團隊同步中斷」：先以伺服器重讀成員索引與隊伍，若確認自己已不在隊伍，清空並顯示新狀態；若確認仍在隊，才顯示同步錯誤。
- 暫停（剩 1 人）時，名單只剩本人；顯示「未滿兩人・暫停」，並說明補足兩人後恢復。

## 驗收對應

| PRD | 驗證 |
|---|---|
| P11（取消招募不占週資格、加入他隊前須先取消） | 單元測試：取消招募後無鎖定；前端可立即建隊；Rules 既有測試 |
| P20（退團、補員、剩一人暫停、跨週換隊） | Rules 既有 03B 測試（不重做）；前端：鎖定判斷（含缺週 ID、跨週解除）、暫停顯示、封存顯示 |
| P23（隊長退出接任、轉讓後可再轉讓） | 前端：接任者預告與伺服器快照一致；轉讓清單只含現有他人；Rules 既有測試 |
| 兩步確認（§11.4） | 人工驗收＋預覽頁檢視：不自動關閉、焦點管理、Esc、按鈕文字 |
| 結果未確認 | 純函式測試（生效判定）；人工驗收：中斷網路後重讀行為 |
| fail closed | 缺週 ID 時取消招募、退出與轉讓停用（Rules 同樣要求週 ID）；`requireActivityWeek` 週與情境日期不一致時同樣停用；缺週 ID 且 `leftWeekId != null` 時建隊／加入停用；未確認快照停用所有團隊操作 |

自動測試：新增單元測試於 `tests/`（鎖定判斷、下週一計算、接任者計算、生效判定、strict parse、錯誤分類）；`tests/ui-tokens.test.mjs` 須維持通過（新增對話框樣式須使用既有 token）。人工驗收需新 Rules／Hosting 上線後以真實帳號進行（兩台裝置：成員退出、隊長退出接任、轉讓、鎖定、並發、斷線重連）。

## 依賴與邊界

- 依賴：FSD-03A／03B 已發布的 Rules 與資料；FSD-02B 的情境時鐘與重新載入覆蓋層；FSD-01C 的今日步數文件（名單訂閱）。
- 本切片不需要新的 Rules 發布，也不改資料格式。但現行前端與 FSD-01C 的 Rules 是一組：**01C 的 Rules 發布前，不得部署含 01C 前端的版本**（舊 Rules 會拒絕新每日格式）；本切片的前端可併入 01C 同一次部署，或在 01C 之後獨立再部署一次，不需重設場次。
- 不宣稱：跨裝置一秒同步、團隊貢獻、寶箱資格；退團文案僅陳述 PRD 規則。

## 第 2 版修訂（Architect 首輪審查，2026-10-01）

審查結論：Rules 對照吻合（鎖定判斷與 `canJoin` 逐字等價、取消招募／退出與 `everFormed` 一致、現有 03B 文件欄位數 11／10 不會被嚴格解析擋掉）；阻擋項皆在前端流程與服務層，Rules 不動。以下各條**取代**前文與其衝突處。

**R1（B1）忙碌狀態與「已確認」分開。** `teamReady` 只代表伺服器已確認（`confirmed`）；操作可用性為 `canAct = teamReady && !teamBusy`，兩者分開維護。忙碌結束後（成功、失敗、重讀完成）必須重新渲染。原因：退出成功的 tombstone 快照常在交易 promise 解析前抵達，若把 `!teamBusy` 併入 `teamReady`，退出後「建立／加入」會停用到重新載入。驗收：取消招募後**立即**可另建隊（人工驗收與單元測試）。

**R2（B2）生效判定改用單調量，並取代前文的轉讓判定。**
- 退出／取消：生效＝索引 `status='left'` 且 `leftTeamId` 等於操作前 `teamId`（操作前本人必為 active，故此判定正確）。
- 轉讓：**不再用「leader 等於目標」判定**（反例：A 轉給 B 後，B 又轉回或退出，重讀時 leader 已不等於 B，會誤判未生效而讓 A 重送）。改為：索引仍 active 且隊伍 `revision` **等於操作前** ⇒ 確認未生效，才恢復一般按鈕（仍須重新確認，不自動重試）；`revision` **大於**操作前 ⇒ 一律視為「狀態已變動」，只更新畫面，不提供重試（可能是自己的操作已生效，也可能是他人操作）。
- 建隊／加入：生效＝索引 `status='active'` 且 `teamId` 等於目標隊伍（建隊為本次產生的 teamId，在交易外產生，自動重試時不變）。**若重讀看到索引 `status='left'` 且 `leftTeamId` 等於目標，視為「狀態已變動」（已生效後又退出），只更新畫面，不重送。** 建隊／加入不使用 `revision` 判定。
- 重讀確認未生效時：不放「重試」鈕，只恢復一般按鈕，讓使用者重新走確認流程（需要重新確認對話框內容，不重送舊命令）。
- 判定表做成純函式，單元測試覆蓋並發：轉讓×退團、雙裝置退團、轉讓後被對方再轉讓、轉讓後被對方退團。

**R3（B3）確認後模式不得被伺服器靜默改變。** `leaveTeam`／`transferCaptain` 新增參數 `expected`（來源為對話框開啟時的 `currentTeam` 已確認快照；快照變動時重算並**替換** expected）。**退出／取消**只比對文案實際用到的欄位：`{ teamId, everFormed, leaderMemberId, memberIds[0] }`（他人加入不改變退出的後果與預告，不應打斷）；**轉讓**比對 `{ teamId, revision }`。交易內讀到的隊伍與之不符，丟前置錯誤「隊伍剛有變動，請重新確認」，**不送出**。畫面同步依新快照重算對話框文案或關閉（例如確認「取消招募」時剛好有人加入，會變成「退出」並鎖週，文案與後果都不同）。

**R4（B4）錯誤分類補齊，避免 `permission-denied` 掩蓋邏輯拒絕。**
- 交易內**讀取階段**（`tx.get`）被拒，轉為固定前置錯誤，不進「結果未確認」：讀隊伍被拒＝「此邀請碼已失效或隊伍已封存」（Rules 對封存隊伍的非成員 `get` 為拒絕）。只有 **commit 階段**的 `permission-denied`／`aborted`／`unavailable`／`deadline-exceeded`／`unknown`／`internal`／`cancelled` 才包成 `TeamUnconfirmedError`。
- **以階段旗標區分，不靠錯誤碼**：firebase 12.19.0 的 `permission-denied` 為永久錯誤，讀取（`tx.get`）被拒與 commit 被拒都是同一個 code，單看 code 分不出階段。做法：`Promise.all([tx.get…])` 包 try/catch，讀取階段的任何 `FirestoreError`（隊伍、成員索引、`demo/current` 皆可能被拒）一律轉為前置錯誤。Rules 對照：不存在的隊伍 `get` 放行（為「找不到」，非拒絕）；已封存隊伍對非成員 `get` 拒絕。**實作首步須以 Emulator 實測**：(1) 建一隊並取消招募使其封存；(2) 另一帳號對該 `teamId` 呼叫 `joinTeam`；(3) 確認 `tx.get` 在 closure 內 reject、`code==="permission-denied"` 且不自動重試（以 closure 執行次數確認只跑一次）；(4) 另模擬 commit 階段被拒，確認兩者 code 相同。結果寫回本契約。
- 服務層前置檢查補齊與 Rules `canJoin` 同構的判斷：缺 `activityWeekId` 且 `leftWeekId != null` 時，`createTeam`／`joinTeam` 直接拒絕（目前只擋 `leftWeekId === 目前週`），訊息「管理者尚未設定活動週，暫時無法建立或加入隊伍」。
- **取消招募在 Rules 也要求 `weekOrNull() is string`**：缺活動週時，取消招募、退出、轉讓三者都停用並說明；`requireActivityWeek` 的「活動週與情境日期不一致」同樣停用並說明（比 Rules 更嚴，屬前端額外保護）。

**R5（B5）嚴格解析必須有出口。** `subscribeMembership`、名單訂閱與 `readMembership` 的整段解析包 try/catch，走 `onError`；新增 `TeamFormatError`（與 `DailyFormatError` 同型），UI 以類別區分訊息：「資料格式不符，請由管理者重設場次」。不得出現未捕捉例外使畫面凍結。

**R6（b1）純函式放進無 Firebase 依賴的模組** `src/team/team-state.ts`（比照 `daily-state.ts`，使 `tests/` 可直接 import）：`parseTeam`、`parseMembership`、`memberLock`（鎖定判斷）、`nextMonday`、`successorOf`、`leaveTookEffect`／`transferTookEffect`／`joinTookEffect`、`classifyTeamError`（以 error code 字串為輸入，並區分讀取階段與 commit 階段）。`team-service.ts` 只保留 Firestore 呼叫。

**R7（b7）嚴格解析補一致性，不只數欄位。**
- 成員索引：`active` ⇒ `teamId` 為字串、`joinedAt` 為字串、`left*` 全 null；`left` ⇒ `teamId` 為 null、`leftTeamId` 與 `leftAt` 為字串；`leftWeekId` 為 null 或 `YYYY-MM-DD`。
- 隊伍：`paused` ⇒ `everFormed=true`；`recruiting` ⇒ 1 人（0 人只可能 `archived`）；`archived` ⇒ 0 人且 `leaderMemberId=null`；`leaderMemberId` 必為名單成員；`inviteCode==teamId` 且為 16 碼大寫十六進位。

**R8（b2–b5、c）對話框 DOM、焦點與堆疊。**
- **單例**：同一時間只有一個確認對話框，由 `closeTeamDialog()` 統一關閉；在 `stopSharedSubscriptions`、`markContextStale`、登出、切換畫面時呼叫。`markContextStale` 同時**停掉待送出的操作並清除對話框**（不得與 stale 覆蓋層疊兩個 `aria-modal`）。
- **堆疊優先序**：stale 覆蓋層 > 團隊確認對話框 > 昨日首次提示。對話框 z-index 低於 `.stale-overlay`；對話框開啟時，昨日首次提示**延後顯示**（保留待顯示，對話框關閉後再評估），不丟棄、不搶焦點。
- **背景不可操作**：對話框開啟時對 `#app` 設 `inert`，所有關閉路徑（含例外路徑）都必須還原；只靠 `aria-modal` 不夠。
- **焦點**：初始焦點放安全鈕（左鈕「先不要」「保留招募」），不放破壞性的右鈕；Esc 關閉，監聽於關閉時移除；關閉後焦點回到觸發鈕。`renderTeam` 每次快照以 `innerHTML` 重寫，觸發鈕會被銷毀，因此以 `data-` 屬性重新查找，找不到（例如已退出）退到 `#team-title`（加 `tabindex="-1"`）。
- **掛載位置**：確認對話框掛在 `document.body`（與 stale、昨日提示相同），**不得掛在 `#team-content`**（`renderTeam` 的 `innerHTML` 會把它清掉）；`#app` 設 `inert` 不影響 body 層覆蓋層。`markContextStale` 之後 `#app` 的 `inert` 保留不還原（只能重新載入）。
- **與昨日首次提示的協調**：`yesterdayPromptEvaluated` 在對話框開啟時**不設旗標、不 claim**（直接返回）；`closeTeamDialog()` 結束時主動呼叫 `showYesterdayReminder(session, yesterday, true)` 補評估（需把 `session`、`yesterday` 傳給關閉鉤子）。反向：存在 `#yesterday-prompt` 或 stale 覆蓋層時，團隊操作不開啟對話框。
- **送出後**：對話框留著顯示「處理中」，Esc 與左鈕同時停用；結果明朗後才關閉（成功、失敗、未確認皆關閉並以團隊區塊的狀態列顯示結果）。
- **更換隊長**：第一步（選成員的清單）與第二步（確認）**都放在同一個對話框內**，與兩步確認一致；「更換隊長」入口鈕在成員名單旁（裁決 3）。
- **對話框開啟期間若快照變動**：`revision` 變動、`!confirmed`、本人已非隊長或已退出時，關閉或重算文案並以狀態列提示（對應 R3）。
- 隊長退出時預告的接任者與轉讓清單，只讀得到 `memberId`（無 displayName），因此顯示 `memberId`。

**R9（b8）`archived` 為死碼，改寫。** 現行 `parseTeam` 在 `memberIds` 不含本人時會丟「名單不一致」，封存隊伍（0 人）必走此路。契約改為：視為資料不一致，走格式錯誤路徑；`teamView` 同時修正 `archived` 被顯示成「已成團」的問題（防禦性標籤「已封存」，但不提供任何操作）。

**R10（b6）名單 `permission-denied` 重讀防循環。** 重讀流程：`getDocFromServer` 讀成員索引與隊伍，經 `syncDialog` 與 `ensureRoster` 套用（與快照的 `applyMembership` 共用這兩個函式；以實作為準）。
- 單飛：每個 (teamId, revision) 最多重讀一次。
- **重讀結果的 `revision` 小於目前 `currentTeam.revision` 時丟棄**（非同步結果晚於較新快照，不得覆蓋新資料）。
- 每個 (teamId, revision) 最多重讀一次；但**下一個伺服器確認的快照可再允許一次重讀**（避免第一次重讀遇到伺服器尚未收斂而永久顯示同步錯誤）。
- 只有 `memberIds` 與目前訂閱不同才重新訂閱；相同且仍被拒，才顯示同步錯誤，不再重讀。
- 非同步回來時檢查訂閱世代與 `contextStale`，避免回寫已關閉的畫面。
- tombstone（`lock`）與隊伍資料走同一個狀態入口；`!confirmed` 分支同時清除 `lock`。
- 本人退出時，名單 listener 可能比索引快照更早收到 `permission-denied`；現況由後到的索引快照收回錯誤並自癒，新流程維持此順序假設，並列入人工驗收。

**補充驗收（取代原人工驗收範圍並擴充）**：
- 單元測試：鎖定判斷真值表（與 Rules `canJoin` 對照：缺週 ID、`leftWeekId=null`、同週、跨週）；R2 並發判定表；R4 錯誤分類（讀取階段 vs commit 階段）；R7 一致性；下週一與接任者計算。
- 人工驗收：取消招募後立即另建隊（B1）；對話框開啟時推進時鐘（stale 疊加）；對話框開啟時另一人加入或退出；對話框開啟時昨日首次提示出現；斷網後重讀；輸入已取消招募的邀請碼；缺活動週時全部團隊操作停用；本人退出時名單錯誤自癒；兩台裝置退團×轉讓並發。

**對照首輪建議 b9**：b9 為文案與顯示的落差，已併入：退出文案補「團隊貢獻與寶箱功能後續開放」（確認流程表）、隊長與轉讓對象顯示 `memberId`（R8 末條）。

**第 2 版覆核（Architect 短版）**：B1、B3、B5 已解決；B2、B4 的殘留舊描述已就地改寫（服務層設計第 1–2 點、驗收表 fail closed 列）；覆核提出的 8 項條件（含 R2 的 `left` 判定、R3 expected 收窄、R4 階段旗標與實測、R8 掛載位置與昨日提示協調、R10 revision 丟棄與重讀再開）已併入上列各條，不另開新版本。

## 產品負責人裁決（2026-10-01，皆採建議）

1. 退出確認照 PRD 固定文案顯示，並加一句「團隊貢獻與寶箱功能後續開放」，不暗示貢獻與寶箱已可查看。
2. 暫停隊伍的 1 人退出維持鎖週（沿用 2026-09-30 裁決，待 03C 再檢視）；確認視窗須清楚告知。
3. 「更換隊長」放在團隊區塊成員名單旁，只有隊長可見。
4. 以新增樣式類別實作 `Dialog-Confirm`，沿用既有 token，不引入新依賴。

## 待 Architect 審查的重點

1. `subscribeMembership` 新增 tombstone 對外後，鎖定判斷與 Rules `canJoin` 是否一致（含缺週 ID、`leftWeekId=null`、跨週解除）。
2. 重讀判定在並發（退團×轉讓、雙裝置退團）下是否會誤判為「未生效」而重送。
3. 嚴格解析會不會讓現有雲端場次（`yoi-2026-10-01` 及其後 `s{N}`）的隊伍文件被拒；這些文件是由 03B 規則建立，應為合法單一格式，請確認。
4. 名單訂閱遇到 `permission-denied` 時的重讀流程是否可能與成員索引快照互相觸發而循環。
5. 對話框的焦點管理與 `stale-overlay`、`yesterday-prompt` 並存時的堆疊與清除（切換畫面或情境過期時不得殘留）。

## 實作紀錄（2026-10-01，本機）

- **R4 Emulator 實測（實作首步，已完成）**：以暫時探針（已刪除）對現行 Rules 實測 `runTransaction`：(1) 非成員在交易內 `tx.get` 已封存隊伍 → closure 內 reject，`code=permission-denied`，**closure 只執行 1 次**（不自動重試），為 `FirebaseError`；(2) 讀不存在的隊伍 → 成功，`exists()=false`；(3) 讀取成功但 commit 被 Rules 拒絕 → 同樣 `permission-denied`、只執行 1 次。**結論：兩階段錯誤碼相同，必須以階段區分**，已實作為 `team-service.ts` 的 `readPhase()`（讀取階段的 `permission-denied` 轉前置錯誤「此邀請碼已失效或隊伍已封存」等）與 `run()`（只有 commit 階段才包成 `TeamUnconfirmedError`）。
- **新增／變更**：
  - `src/team/team-state.ts`（新，無 Firebase 依賴）：嚴格 `parseTeam`／`parseMembership`（11／10 欄＋R7 一致性）、`memberLock`、`weekStateOf`、`nextMonday`、`successorOf`、`leaveMode`、`LeaveExpectation`／`TransferExpectation`、`leaveOutcome`／`transferOutcome`／`joinOutcome`、`classifyTeamError`、`teamControls`、確認視窗文案。
  - `src/team/team-service.ts`：嚴格解析、`readPhase`／`run`、`TeamUnconfirmedError`／`TeamChangedError`、`leaveTeam(session, expected)`／`transferCaptain(session, target, expected)`、`readState`（伺服器重讀）、`createTeam`／`joinTeam` 以 `memberLock` 同構前置檢查（含缺週 ID）、`subscribeMembership` 對外 tombstone 並把解析錯誤導向 `onError`。
  - `src/team/team-panel.ts`（新）：團隊區塊控制器（訂閱、建隊／加入、確認對話框、結果未確認重讀、名單 `permission-denied` 重讀防循環）。契約原寫在 `main.ts`，為縮小 `main.ts` 而拆出；行為不變。
  - `src/main.ts`：以 `mountTeamPanel` 取代內嵌團隊程式；`stopSharedSubscriptions` 關閉對話框；`markContextStale` 保留 `#app` 的 `inert`；昨日首次提示在團隊對話框開啟時延後，對話框關閉時補評估。
  - `src/ui/views.ts`、`src/style.css`、`src/ui-preview.ts`：`teamView` 加操作列與「已封存」標籤、`teamEmptyView` 加鎖定說明、`teamDialogView`、`.confirm-scrim`（z-index 40，低於 `.stale-overlay` 50）、`.confirm-dialog`、預覽頁新增 10 個團隊畫面。
  - `tests/team-state.test.mjs`（新，16 條）並併入 `npm test`。
- **驗證**：`npm test` 52/52（含 `team-state` 16、`ui-tokens` 9）；`tsc`、`build` 通過；`npm run test:rules` 59/59（Rules 未改）。以暫時探針頁（已刪除）搭配假服務驅動**真實的** `mountTeamPanel`，於瀏覽器驗證：對話框掛 `body`、開啟時 `#app` `inert`、初始焦點在安全鈕、Esc／先不要還原 `inert` 與焦點、Tab／Shift+Tab 迴圈、處理中兩鈕停用、快照使 leader 或名單變動時更新文案並提示、轉讓選人→確認兩步（未選人提示、目標離隊退回選人）、`TeamChangedError` 不送出並關閉、未確認後重讀且**不自動重送**（呼叫次數 1）、退出後鎖定說明與建隊／加入停用、未確認快照停用並關閉閒置對話框、昨日提示或 stale 覆蓋層存在時不開對話框。預覽頁 375 px 無水平溢出。
- **仍屬人工驗收（需真實帳號與新 Rules／Hosting）**：契約「補充驗收」所列全部人工項目；尤其雙裝置退團×轉讓並發、對話框開啟時推進時鐘、斷網後重讀、輸入已取消招募的邀請碼、取消招募後立即另建隊、本人退出時名單 `permission-denied` 自癒。
- **已知取捨**：(1) 退出後 `teamView` 的名單步數仍只訂閱「今日」文件（沿用 01C）；(2) 隊長與轉讓對象僅顯示 `memberId`（讀不到 displayName）；(3) 結果未確認時，建隊的重讀判定只看「索引是否 active」（建隊的 teamId 為交易外隨機產生，沒有可比對的目標）。

## QA／Security 第一輪（2026-10-01）與修正

- **Security：附條件通過**。無前端繞過 Rules 的路徑、無 XSS、無機密。**B1（真實缺陷，已修）**：Security 以真實 `TeamService` 打 Emulator 實測，SDK 丟出的是 `FirebaseError`，`e instanceof FirestoreError === false`（`code` 仍為 `permission-denied`），使 R4 的階段分類與「結果未確認→重讀」整條路徑變成死碼，且 SDK 內部訊息（規則行號）會顯示在畫面。單元測試與假服務探針都不會觸發此差異。修正：新增 `src/firebase/error-kind.ts` 的 `isFirebaseError`（以 `name==='FirebaseError'` 加字串 `code` 辨識），`team-service.ts` 三處與 **`daily-service.ts` 兩處**（01C 同一缺陷）都改用；`errorText` 對 SDK 錯誤一律回固定中文，不再顯示 `message`；新增 `tests/firebase-error.test.mjs`。**注意：瀏覽器建置的錯誤類別仍未實測**，改為鴨子型別後不再依賴類別身分。
- **QA：附條件通過**，32 項 mutation 中 28 項被抓到、1 項等價變異、5 項缺口，已補測試並重驗：`parseTeam` 的 paused／active／recruiting 與 `everFormed` 一致性（M08–M10）、`teamControls` 對封存隊伍與非成員的負向案例（M16、M19），5 項皆被抓到。
- **QA 阻擋項已修**：A1 轉讓「下一步」後焦點留在主要鈕，連點或按住 Enter 會跳過摘要直接送出 → 步驟切換與提示更新後焦點一律移到「先不要」；A2 `#team-title` 缺 `tabindex="-1"`（退出後焦點掉到 body）→ 已加；A3 送出中情境過期使 `confirmDialog` 內 `state.dialog!` 拋 TypeError → 改用區域變數，面板停止後不再寫狀態。
- **其他修正**：名單重讀改為嚴格單飛（同時多個 listener 失敗只重讀一次，期間不顯示同步錯誤）；已失效的名單 listener 在下一個確認快照以相同名單時會重新訂閱；重讀結果套用後同步更新對話框；未確認重讀後清除上方殘留的錯誤框；選擇器改用 `CSS.escape`。
- **契約 R10 字面更新**：重讀結果經 `syncDialog` 同步對話框（與 `applyMembership` 並列的第二個入口，二者共用 `ensureRoster`／`syncDialog`）。
- **已知取捨（補記）**：(1) 持邀請碼者能分辨「不存在」（找不到）與「已封存」（已失效）：這是 Rules 的 `get` 規則本身造成（不存在放行、封存對非成員拒絕），前端未增加洩漏，邀請碼為 64 位元隨機且不可列舉；(2) 「邀請碼已失效」文案在 `activeMember` 失效等情況下不精確，僅影響訊息；(3) 對話框更新 `expected` 時以提示行說明，焦點移到安全鈕，避免連按確認到新文案。
- **補入人工驗收**：本人退出時 team 文件 listener 與索引 listener 的暫態錯誤（「名單不含本人」「隊伍讀取被拒」）是否由 tombstone 快照自癒；鍵盤與讀屏下轉讓兩步的焦點、Esc、Tab 迴圈與關閉後焦點落點。
- **驗證**：`npm test` 55/55（`team-state` 18、`firebase-error` 1）、tsc、build 通過；`test:rules` 59/59；以探針頁（已刪除）重驗 A1／A2／A3、SDK 錯誤不顯示內部訊息、名單單飛與重新訂閱。

**審查基準版本（SHA-256，QA／Security 第一輪修正後）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules`（未改） | `9fb634715c473a1a85b8233d58e42a9b070c70509b0df166da78fab430e38a2d` |
| `src/firebase/error-kind.ts`（新） | `7166b61028b47383a7897753b27e39159248802ced3650e4f31e3e737a5271f1` |
| `src/team/team-state.ts`（未變） | `f47da3cba5d6b574d24733c7610e9aec8fda587cf20e769b9b74105a581e7024` |
| `src/team/team-service.ts` | `63bce2c5a60c4bf33ebbe91ecab6852a28002d068302a1b49f5db0a60b0117e0` |
| `src/team/team-panel.ts` | `e56dfd38c0afb1c851f3ae8c49b94a720b059abeb7f759291a4c31aece71215a` |
| `src/daily/daily-service.ts`（01C 檔，僅錯誤辨識改鴨子型別） | `ffc940c4815417af3145f935173b71173e76081bef66349b7cad0daff1362701` |
| `src/main.ts`（未變） | `107c497103cf59f0b81f95df68e4fa29ee1f698a25dc99f997d769d24d016515` |
| `src/ui/views.ts` | `39634f81480f2cfeaf08dedf97327e07cf4e44258a7b69cacae29e3edf27312d` |
| `src/ui-preview.ts`、`src/style.css`（未變） | `137d87e0…8d64`、`3e2c7a5f…2d61` |
| `tests/team-state.test.mjs` | `24093833ea4db96acc67d548c72522d5202b8ee475a83f1ee3d573929f030234` |
| `tests/firebase-error.test.mjs`（新） | `75aea3ccc2275cdf238cdae0418d07bc6094822c40d31640d3f2e8b0e36d3115` |
| `package.json` | `1b07991ad7e8f0923ed801422b56243a5cf8dad46c2801b21e69e0f3c332e744` |

以下為第一輪實作時的基準（已被上表取代，保留供對照）：

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules`（未改） | `9fb634715c473a1a85b8233d58e42a9b070c70509b0df166da78fab430e38a2d` |
| `src/team/team-state.ts` | `f47da3cba5d6b574d24733c7610e9aec8fda587cf20e769b9b74105a581e7024` |
| `src/team/team-service.ts` | `0400641201ac3afc4a72d5677ea571aae5a09826067f756322061fb8588b7427` |
| `src/team/team-panel.ts` | `7d1b4358833c291128a8e090c618e7e0577a7ecd3fba91cc1d0708ea19759231` |
| `src/team/activity-week.ts` | `a1427303f94aed7df05c6c676f71d42eac50d8b9bc3c5bf8cb5f8b336a87757b` |
| `src/main.ts` | `107c497103cf59f0b81f95df68e4fa29ee1f698a25dc99f997d769d24d016515` |
| `src/ui/views.ts` | `12d7787d409dcf1d883227c27ab3f1cfeb33bfbeb0ca073fde2978a421ef84b5` |
| `src/ui-preview.ts` | `137d87e0c251e7f218a7dcfd5a54b97984a88a2c6c457cb840f251a428948d64` |
| `src/style.css` | `3e2c7a5fa156eb9bccf5e49a73de9c5bead25bbf7dde2756997487cc2a242d61` |
| `tests/team-state.test.mjs` | `222de445f2f3ac968c625ce8039fd006c4189f95773de6554631d8b58f10ee09` |
| `package.json` | `686df22762970b09ab577fd716d0ed8046ecb7388d0e4068cee555f299c6e08f` |

**QA 短版確認（2026-10-01）：通過。** A1、A2、A3、五個存活 mutation、R10、B1 皆已解決；11 項 mutation（team-state 5 項＋error-kind 6 項）全被抓到；`daily-service.ts` 除錯誤辨識改為 `isFirebaseError` 與移除 `FirestoreError` import 外無其他行為變更；`npm test` 55/55、`test:rules` 59/59、tsc、build 通過。QA 的 4 項非阻擋建議留待細修階段：(1) radio 無 id，轉讓選人步驟被重繪時焦點回到「先不要」；(2) 面板已停止後 `confirmDialog` 的 finally 仍會 `render()`（無功能後果）；(3) `subscribeRoster` 若同步丟錯（僅登入身分已變更時），名單會停在空白直到名單變動，可包 try/catch 並設 `rosterFailed`；(4) 上述 R10 字面已就地改寫。
