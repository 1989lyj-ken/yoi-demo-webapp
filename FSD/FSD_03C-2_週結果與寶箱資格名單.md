# FSD-03C-2｜週結果記錄與寶箱資格名單

**狀態**：契約第 2 版（2026-10-02）。Architect 兩輪附條件通過並併入；D1 採 B。本機實作完成；QA／Security 首輪審查與修正完成（含 Low-1）；**短版覆核：QA 無阻擋、Security 通過**，覆核提出的項目已修正（見文末）。**本機完成，待產品負責人發布 Rules（與 01C、03C-1 同一次）與手動驗收**；未部署，未以真實 Firebase 登入實測。依據：PRD §5.1（D17 乘車時點）、§6.1.1（達標名單）、§6.2（寶箱資格、跨週補同步 D05、歷史修正補發）與 P12、P13、P20、P24、P25；FSD-03 總契約「結算交接」；FSD-03C-1（貢獻帳與重播）。

## 已核定前提（產品負責人，2026-10-02）

1. **範圍**：本積木只記錄「週達標結果」與「寶箱資格名單」；抽獎內容、開箱、Points 入帳屬寶箱積木（FSD-03 總契約：「交寶箱積木發資格；本積木不抽獎」）。寶箱積木在首次開箱時抽一次並固定（另存文件，不改本積木的資格），重開不重抽，對使用者的效果等同 PRD「預先抽取並保存」。
2. **誰寫入名單**：在隊成員的裝置替**所有**合資格者寫入（含達標後才退團者）。已退團者讀不到隊伍帳目，無法自行判定；退團後只讀自己的資格。
3. **信任模型（已接受風險）**：Rules 不加總步數，無法驗證總量真的達 300,000，也無法驗證引用的帳目真的是達標那一筆。是否達標由各裝置以 03C-1 的確定性重播判定；Rules 只把關結構：每人每週一筆、寫入者為在隊成員、資格者於引用時點在隊、時點只能提前、引用的帳目確實存在於該隊該週。理由：步數是自報模擬資料，作弊者直接自報高步數即可「合法」達標，Rules 加總不增加實際保護，卻會讓帳目寫入逼近 10 份文件上限並產生寫入競爭。
4. **補發邊角**：補同步讓達標提前，但到該週補同步期限結束前（週日資料為週一 24:00）都沒有在隊成員開啟 app 時，不會補發；任何在隊成員開啟即自動補齊。期限後封存。
5. **畫面**：有正式記錄後，進度區「已達標（試算）」改為「本週已達標：月/日 時:分・寶箱資格 N 人」；本人資格狀態（見「畫面」）；已退團成員在「目前沒有隊伍」畫面也看得到自己的資格；鈴鐺通知延後。
6. **兩個小加項**：(a) 「本週剩餘每人每天約需 N 步」（03C-1 延後項）；(b) 退團確認：本人已取得本週資格時，以「你已取得本週寶箱資格，退團後仍保留」取代「尚未取得的寶箱資格可能失去」。
7. **D1（2026-10-02，採 B）首次名單不因寫入時機而失去**：週結果保存不可變的「首次達標時點 M₁」與可提前的「目前達標時點 Mc」；資格可依 M₁ 或 Mc 判定。最終名單 ＝「於 M₁ 在隊」∪「於 Mc 在隊」，與寫入先後無關。例：週日 10:00 建立週結果（M₁＝週日 10:00）；A 週六 20:00 入隊，在 M₁ 名單上，但其資格因寫入裝置離線尚未寫入；同日有成員補記週六 15:00 的片段，Mc 提前到週六 15:00（A 當時未入隊）——A 仍可依 M₁ 取得資格。只在「中間某次提前的時點」合資格、且始終未寫入者不涵蓋（極少見，見已接受風險 5）。

## 範圍

- 負責：週結果記錄（M₁ 不可變、Mc 只能提前）；寶箱資格名單（每人每週最多一筆，建立後不可改）；達標提前時的補發；上週在週一的結算；畫面上的正式達標、本人資格、每人每天所需步數提示與退團文案調整；03C-1 重播函式的輸出擴充。
- 不負責：抽獎、開箱、Points 入帳（寶箱積木）；七日全勤（FSD04）；推薦新戶；鈴鐺通知；隊長主動解散；純展示模式。

## 名詞與不變式

- **達標時點 M**：重播中累計首次 ≥ 300,000 的那筆帳目的 `(occurredAt, syncedAt)`。比較同 03C-1 B1：先比情境時間，相同再比伺服器時間（`contribAfter`／`contribBefore`）。
- **在隊於 M**：已開始（創辦人自建隊起；非創辦人自本次 `join` 事件起，M 嚴格晚於該事件）且尚未離開（仍在隊，或造成離開的 `leave` 事件嚴格晚於 M）。
- **M 只會提前**（須有屬性測試）：帳目只能建立、增量皆 ≥ 0，各「成員＋日」的 `floor(raw × 係數)` 隨帳目增加只增不減。情境時鐘不可倒退、帳目只收今日／昨日事件且 `occurredAt` 不晚於當下，因此一次提前最多回到前一天。
- **參與者不以帳目判定**：名單只由隊伍事件與成員索引決定；「本週有帳目」不代表合資格（03C-1 已接受風險 7）。

## 03C-1 純函式的擴充（不改既有行為）

- `replayTeamWeek` 另回傳 `reaching: { entryId, occurredAt, syncedAt } | null`（達標那一筆），既有 `reachedAt` 保留，既有測試不變。
- 寫入 `reachedSyncedAt`／`firstReachedSyncedAt` 時以 `new Timestamp(seconds, nanoseconds)` 精確還原，不經浮點數或 `Date`（Rules 以相等比對）。

## 資料格式

### 週結果 `teamWeeks/{sessionId}/teams/{teamId}/weeks/{weekId}`（固定 12 欄）

| 欄位 | 說明 |
|---|---|
| `sessionId`、`teamId`、`weekId` | 與路徑相同 |
| `firstReachedAt`、`firstReachedSyncedAt` | M₁；建立時等於 Mc，**之後不可變** |
| `reachedAt`、`reachedSyncedAt` | Mc；等於達標帳目的 `occurredAt`／`syncedAt` |
| `reachingEntryId` | Mc 的帳目在 `teamContrib/.../entries/` 的 ID |
| `revision` | 建立為 `0`；每次提前 +1 |
| `firstRecordedAt` | 建立時的 `request.time`，之後不變 |
| `updatedAt` | 每次寫入的 `request.time` |
| `updatedBy` | 寫入者 `memberId` |

- 建立：第一位看到「伺服器確認的帳目重播已達標」的在隊成員；以交易**先讀後建**。
- 更新：只能把 Mc 改成**嚴格更早**、引用另一筆存在的帳目、`revision` +1；M₁ 與其他欄位不變。不可刪除。

### 寶箱資格 `chestAwards/{sessionId}/weeks/{weekId}/awards/{memberId}`（固定 11 欄，只能建立）

| 欄位 | 說明 |
|---|---|
| `sessionId`、`weekId`、`memberId` | 與路徑相同；文件 ID 保證**每人每週一筆**（跨隊亦然） |
| `teamId` | 取得資格的隊伍 |
| `reachedAt`、`reachedSyncedAt` | 判定依據的 M：等於週結果**目前**的 M₁ 或 Mc 之一 |
| `joinRevision` | 資格者本段入隊的 `join` 事件 revision；創辦人為 `0` |
| `leaveRevision` | 資格者已退團時，造成離開的 `leave` 事件 revision；仍在隊為 `0` |
| `basis` | 引用 M₁ 時為 `first`，引用 Mc（且 Mc ≠ M₁）時為 `reissue` |
| `grantedBy` | 寫入者 `memberId` |
| `grantedAt` | `request.time` |

- 子集合名稱用 `awards`（不與 `teamMembership`／`dailySteps` 的 `members` 撞名，保留寶箱積木日後以 collection group 查詢本人各週資格的空間）。
- 寫入者是在隊成員，替合資格者**逐筆**建立（每筆一次寫入，不批次），已存在即跳過；漏掉的由任何在隊成員下次開啟時補齊（冪等、可重跑）。
- 成員於 M₁ 與 Mc 都合資格時，前端固定引用 M₁（確定性）。

## 讀取權限

| 資料 | 可讀者 |
|---|---|
| 週結果 | 該隊在隊成員（03C-1 `teamContribReader`）`get`／`list` |
| 寶箱資格 `get` | 本人路徑（`memberId == actorMemberId()`，含已退團、文件不存在）；否則以三元式分流：`resource == null ? 讀者為本場次在隊成員 : resource.data.teamId == 讀者目前隊伍`（不依賴 `||` 遇求值錯誤的行為；此分支只用於 `get`，不放進 `list`） |
| 寶箱資格 `list` | 在隊成員以 `where('teamId','==',本隊)` 查詢（Rules 以 `resource.data.teamId == 讀者索引.teamId` 判定；單欄位索引即可） |
| 其他 | 拒絕；其他場次、inactive、未登入皆拒 |

- **為何開放「不存在」的 `get`（Architect B1）**：隊友在交易內 `tx.get` 一份尚不存在的資格時，`resource` 為 null，若規則只看 `resource.data.teamId` 會求值錯誤而拒絕整筆交易，替他人寫資格將永遠失敗。代價是在隊成員可得知「他隊某人本週是否已有資格文件」，影響可忽略。

## Rules（新增兩個 match；不改既有規則）

**共同前置（格式先驗，再組路徑；Architect S7）**
- `weekId` 符合 `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`；資格的 `v.teamId` 符合 `^[A-F0-9]{16}$` 後才用來組週結果與事件路徑。週結果路徑為 `teamWeeks/{sessionId}/teams/{v.teamId}/weeks/{weekId}`。
- `joinRevision`、`leaveRevision` 為 `int` 且 `>= 0`；時間欄位型別檢查（`reachedSyncedAt` 等為 timestamp，`reachedAt` 等為字串）。
- **補同步窗口**（Architect S5）：以 `demo/current.activityWeekId`（`validClockChange` 已保證與 `scenarioNow` 一致；缺少即拒絕）判定：

  ```
  let W = weekOrNull(); let today = currentScenarioNow().split('T')[0];
  W is string && weekId.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    && (weekId == W || (today == W
      && timestamp.date(int(wk[0]), int(wk[1]), int(wk[2])) + duration.value(7, 'd')
         == timestamp.date(int(w[0]), int(w[1]), int(w[2]))))   // wk = weekId.split('-'), w = W.split('-')
  ```

  比較兩個 timestamp（Rules 沒有把日期格式化成字串的函式；覆核更正）。W 本身是週一，等式成立即代表 `weekId` 也是週一；不存在的日期（如 `2026-09-31`）使 `timestamp.date` 求值錯誤而拒絕（01C 已驗證）。語意等同前端 `visibleWeeks`：週一可寫上週，週二起上週封存，週中只寫本週。

**週結果 create／update 共同條件**
- `activeMember() && currentSession(sessionId)`；寫入者為該隊在隊成員；隊伍 `everFormed == true`；窗口如上。
- 引用帳目 `teamContrib/{sessionId}/teams/{teamId}/entries/{reachingEntryId}` 存在，且 `weekId` 相同、`occurredAt == reachedAt`、`syncedAt == reachedSyncedAt`。
- 欄位固定 12 個；`updatedAt == request.time`、`updatedBy == 寫入者`。

**create**：`revision == 0`、`firstRecordedAt == request.time`、`firstReachedAt == reachedAt`、`firstReachedSyncedAt == reachedSyncedAt`。
**update**：`diff().affectedKeys()` 只含 `reachedAt, reachedSyncedAt, reachingEntryId, revision, updatedAt, updatedBy`（M₁ 自然不可改）；新 Mc 嚴格早於舊 Mc；`revision == 舊值 + 1`。**delete** 拒。

**寶箱資格 create**
- 寫入者為 `v.teamId` 的在隊成員；`grantedBy == 寫入者`、`grantedAt == request.time`；欄位固定 11 個；窗口如上。
- 週結果存在（`wr`），且 `(reachedAt, reachedSyncedAt)` 等於 `(wr.firstReachedAt, wr.firstReachedSyncedAt)`（此時 `basis == 'first'`）或等於 `(wr.reachedAt, wr.reachedSyncedAt)` 且不等於 M₁（此時 `basis == 'reissue'`）。
- **資格者於 M 在隊**（`ms` 為資格者的成員索引；以三元式分流在隊／已退團 × 創辦人／非創辦人，避免求值所有分支）：
  - 開始：創辦人（`ms.joinOrder == 0 && ms.joinedAt == 隊伍.createdAt`，`joinRevision == 0`），或 `events/{joinRevision}` 為 `join`、`targetMemberId == 資格者`、`effectiveAt == ms.joinedAt`，且 `contribAfter(M, join)`。
  - 未離開：`ms.status == 'active' && ms.teamId == v.teamId && leaveRevision == 0`；或 `ms.status == 'left' && ms.leftTeamId == v.teamId`，且 `events/{leaveRevision}` 為 `leave`、`targetMemberId == 資格者`、`effectiveAt == ms.leftAt`，且 `contribBefore(M, leave)`。
- **update／delete 拒**。

### Rules 預算（必填；單一寫入上限 10 份不同文件，實作時以 Emulator 實測）

| 操作 | 讀取的文件 | 最壞份數 |
|---|---|---:|
| 週結果建立 | `membersByUid`、`demo/current`、寫入者索引、隊伍、引用帳目 | 5 |
| 週結果提前 | 同上（舊值為 `resource`，不計 `get`） | 5 |
| 寶箱資格（替已退團的非創辦人建立） | `membersByUid`、`demo/current`、寫入者索引、週結果、資格者索引、隊伍、`join` 事件、`leave` 事件 | 8 |
| 寶箱資格（替自己建立） | 寫入者必在隊，走在隊分支，不讀 `leave` 事件；兩個索引為同一份 | 6 |
| 寶箱資格 `get`（交易內先讀） | `membersByUid`、`demo/current`、讀者索引 | 3 |

- 採 D1-B 不增加文件讀取，只多約 4–6 個比較運算式。
- 寫入次數：週結果一次寫 1 份；寶箱資格每人一次寫 1 份。不批次：6 人展示每週最多 5 筆、可各自重試；原子批次最壞約 15–16 份已接近 20 份上限，且只涵蓋首次建立、涵蓋不到提前後的補發，D1-B 已解決寫入時間差。
- 最壞運算式：寶箱資格的已退團非創辦人分支；以 Emulator 日誌確認無 expressions 訊息。
- **接受路徑測試**：上表五列各一條。

## 前端流程（`src/team/week-result-state.ts` 純函式、`week-result-service.ts` 服務；沿用 03C-1 的失敗語意）

1. **訂閱**：在隊時訂閱可見週（`visibleWeeks`）的週結果與本隊寶箱資格（`where('teamId','==',本隊)`）；已退團或無隊伍時，以本人路徑 `get` 讀取可見週的自己資格。只有**伺服器確認**的快照可用於規劃。
2. **`membersAt(events, team, M)` 演算法（Architect S6）**：
   - 事件不能 `list`，沿用 `readTeamEvents` 逐一 `get` 1…revision。
   - 前端讀不到他人索引，創辦人不以 `joinOrder` 判定：以 `team.memberIds` 為起點**反向重播**事件——遇 `join` 移除該成員，遇 `leave` 加回，`transferCaptain` 略過；`cancelRecruiting` 只出現在未成團隊伍（不會有週結果）。回到 revision 0 時剩下的一人即創辦人。
   - 每位成員只看**最近一段**在隊期間（最後一次 `join` 起；創辦人自建隊起，且之後沒有再 `join`），結束於其後第一筆以他為對象的 `leave`。M 落在較早一段者判為不可寫（與 Rules 的保守限制一致）。
   - 回傳 `{ memberId, joinRevision, leaveRevision }[]`；同一時點以伺服器時間判定。
   - **快照一致性**（覆核補充）：`memberIds` 與事件 1…revision 必須取自同一個隊伍 revision；讀事件期間隊伍又變動（重讀隊伍的 revision 不同）即重讀。
   - **資料不符 fail closed**：反向重播任一步不成立——`join` 要移除的人不在名單、`leave` 要加回的人已在名單、出現 `cancelRecruiting`、回到 revision 0 時名單人數不是 1——即判定事件不完整，本次不寫，等下一次觸發。
   - 前端判定 ＝ PRD 精確判定 ∧ Rules 已知保守限制（最近一段、索引只保留最近一次）；以共用情境表做「前端合資格 ⇒ Rules 接受」的屬性測試。前端無法得知已退團者之後是否已加入別隊（索引被覆蓋），該筆會被 Rules 拒絕，本頁只失敗一次（已接受風險 3）。
3. **`settlementPlan(record, replay, awards, eventsCtx)`**：
   - 無週結果且重播已達標 → 建立（M₁ = Mc = 重播 M）。
   - 週結果 Mc 晚於重播 M → 提前。
   - 週結果 Mc 早於或等於重播 → 不寫週結果（他人已提前；或本機帳目尚未同步）。
   - 待補資格 ＝ (`membersAt(M₁)` ∪ `membersAt(Mc)`) − 已有資格；同時合資格者引用 M₁。
4. **交易與防循環（Architect S3）**：
   - (a) 週結果：交易內先讀，不存在才建；存在則比較，仍較晚才提前。兩台同時建立時，輸家重試讀到已存在而進入比較；建立與提前交錯時，最終 Mc 為兩者中較早者。
   - (b) 資格：交易內**重讀週結果與該資格**；週結果的 M₁／Mc 與規劃時不同即放棄這筆並重新規劃，不用舊 M 寫入（交易讀取前置條件保證提交時週結果若變動會中止重試）。
   - (c) **單一執行**：同一週的結算與補發同時只跑一個；執行中收到的新快照只設旗標 `needRerun`，以 `while (needRerun) { needRerun = false; run(最新的已確認快照) }` 迴圈處理（覆核更正：「最多再跑一次」會漏掉第二輪期間的變化）。迴圈會停：沒有新寫入就沒有新快照；`runTransaction` 的寫入不帶本機延遲補償。網路類失敗（`unconfirmed`）本身**不**觸發重跑，只有新快照可以。停止訂閱、換隊、換場次或換帳號時取消執行中的工作，清除旗標與該週的終局鍵。
   - (d) 「本頁不再嘗試」以 `(weekId, memberId, M)` 為鍵；M 改變後可重新嘗試。
   - (e) 規劃須等週結果、資格與貢獻帳三者的快照皆由伺服器確認。
   - (f) 資格者索引在寫入途中變動（例如對方剛好退團）而被拒時，重讀事件一次後帶 `leaveRevision` 重試（須有測試）；仍拒絕則本頁不再嘗試。
5. **失敗語意**：網路類錯誤為「待結算」，下一次快照或重新載入時再跑；Rules 拒絕時依 (f) 重讀一次。不自動重送未確認的寫入；不顯示 SDK 內部訊息。
6. `dailyNeed(total, target, today, memberCount, status)`：`ceil(max(0, target − total) ÷ 本週剩餘天數（依情境今日，含今日）÷ 目前人數)`；已達標、暫停、未成團、上週皆不顯示。

## 畫面（共享模式「團隊共享」區塊）

- 有週結果時：「本週已達標：月/日 時:分・寶箱資格 N 人」（時間為 **M₁**，即首次達標；N 為已建立的資格數），取代「已達標（試算）」；週結果尚未建立但重播已達標時，仍顯示試算並加註「結算中」。Mc 早於 M₁ 時另加一行「補同步後達標時間提前至 月/日 時:分」。
- 本人（Architect S4）：
  - 有資格文件：「你已取得本週寶箱資格（開箱功能後續開放）」。
  - `membersAt(M₁) ∪ membersAt(Mc)` 含本人但尚無資格文件：「寶箱資格處理中」。
  - 已有週結果、名單確定不含本人：「本週寶箱資格：達標時不在隊上」。
- 週一：上週的同一組文字前加「上週」。
- 無隊伍／已退團畫面：可見週內本人有資格時顯示「你已取得（上）週寶箱資格（開箱功能後續開放）」；無資格不顯示。
- 每人每天所需步數：「本週剩餘每人每天約需 N 步」（條件見 `dailyNeed`）。
- 退團確認：本人本週已有資格文件時，以「你已取得本週寶箱資格，退團後仍保留」取代「尚未取得的寶箱資格可能失去」。
- 未確認的週結果或資格不顯示為已取得（fail-closed）；`ui-preview` 新增對應畫面（正式達標、提前、處理中、不在隊上、上週、已退團者、每人每天）。

## 已接受風險

1. 信任模型（前提 3）：不誠實的客戶端可寫入不實的週結果、把 Mc 提前到任一存在的帳目，或在 M 落在暫停期間時（03C-1 風險 2／6 的回補）仍記錄；Rules 只驗結構與在隊狀態，名單依事件判定，方向保守。
2. 補發邊角（前提 4）。
3. **索引只保留最近一次**（覆核更正第 1 輪推論）：資格者於上週退團、本週已加入新隊（或隔週重回同一隊開始新的一段）時，索引已被覆蓋，週一無法替他補寫上週資格。會發生於兩種情況：(a) 其資格原本就該寫入卻寫入失敗；(b) **達標帳目本身晚補記**（03C-1 入帳延遲：週日的今日事件到週一才入帳，`occurredAt` 可為週日任何時點）——例：週一晚補記週日 10:00 的帳目使上週於週日 10:00 達標，B 週日 12:00 退團、週一加入乙隊，B 於 M 在隊但資格被拒。需多步同時發生，方向保守（少發），維持接受；以 Rules 測試記錄此行為。
4. 名單由客戶端重建；同一份事件在任何裝置結果相同。
5. 只在「中間某次提前的時點」合資格、且始終未寫入者不涵蓋（D1 選項 C 的範圍，極少見）。

## 驗收對應

| 驗收 | 本積木驗證內容 |
|---|---|
| P12 | 300,000 建立週結果，資格逐人一筆（「299,999 不建」依信任模型只能由前端單元測試驗證，Rules 不驗總量） |
| P13 | 週日補同步於週一計入上週，可在週一結算或提前上週；週二起封存 |
| P20 | 達標時已退出者無資格、達標後退出者保留、達標後加入者無資格、名單鎖定（不撤銷） |
| P24（部分） | 資格每人每週一筆、重試與多裝置不重複（開箱屬寶箱積木） |
| P25 | 補同步使 Mc 提前：既有資格保留、M₁ 名單上未寫入者仍可取得、Mc 時點新增的合資格者補發；乘車造成的達標不早於乘車完成；重算與重送不重複 |
| P16（部分） | 場次重設後看不到舊場次的週結果與資格 |

**Rules 測試（Emulator）必備案例**
- 週結果：在隊成員建立（引用帳目相符、M₁ = Mc）被准；非隊員、已退團者、他隊、引用不存在或欄位不符的帳目、未成團隊伍、M₁ ≠ Mc 的建立被拒；提前到更早帳目被准；延後、相同時點、改 M₁、`revision` 跳號、改其他欄位、刪除被拒；同一情境時間以伺服器時間判定更早。
- 窗口：週一 00:00 與週一 23:59:59 可寫上週；週二 00:00 拒；週一寫兩週前拒；`weekId` 不是週一或不存在的日期（如 `2026-09-31`）拒；週日可寫本週；跨月、跨年；`activityWeekId` 缺少時拒；`weekId` 格式錯誤拒。
- 已接受風險 3(b) 的行為記錄：達標帳目晚補記、資格者已於退團後加入他隊時，替他寫上週資格被拒。
- 寶箱資格：創辦人、在隊非創辦人、達標後退團者（帶 `leaveRevision`）被准；達標前退團、達標後加入、同一情境時間平手的入隊或退團（依伺服器時間）、`joinRevision`／`leaveRevision` 指向他人或錯誤類型、M 不等於 M₁ 也不等於 Mc、`basis` 與引用的 M 不符、重複建立、替他隊成員、非隊員寫入、`teamId` 格式錯誤被拒；**提前後仍可依 M₁ 為 M₁ 名單上的人建立**（D1-B）；提前後以 Mc 補發被准、舊資格仍在且不可改；**交易內 `tx.get` 不存在的資格後建立**被准；資格者寫入途中退團、重讀後帶 `leaveRevision` 被准。
- 讀取：本人讀自己（含已退團、不存在）可；在隊隊友 `get` 不存在的資格可；隊友讀他隊已存在的資格拒；已退團者讀隊友資格與週結果拒；在隊成員 `list`（帶 `teamId` 條件）可、不帶條件或他隊條件拒；其他場次、inactive、未登入拒。
- 預算：上表五列接受路徑各一條。
- **Mutation 反證**：新增 `scripts/mutate-week-result-rules.mjs`（沿用 03C-1 腳本的作法：暫存副本、`YOXI_RULES_FILE`、先驗樣式唯一、列明等價變異理由；`test-firestore-rules.ps1` 的 `ValidateSet` 增加此指令），涵蓋窗口、M₁ 不可變與只能提前、創辦人與退團分支、`basis`、讀取的 `resource == null` 分支。

**單元測試**：`replayTeamWeek` 的 `reaching` 輸出；`membersAt`（反向重播找創辦人、創辦人退團、退團後重入同隊只取最近一段、`transferCaptain` 略過、同時點、暫停期間退團）；`settlementPlan`（建立、提前、他人已提前、M₁∪Mc 待補清單與引用 M₁ 的優先）；M 單調只提前（隨機加入帳目的屬性測試）；`dailyNeed`（週日、已達標、暫停、上週）；畫面文字（正式達標、提前、處理中、不在隊上、上週、已退團者、退團文案）；共用情境表的「前端合資格 ⇒ Rules 接受」。

## 依賴、部署與邊界

- 依賴 03C-1 的貢獻帳、重播（擴充 `reaching`）與 `visibleWeeks`；Rules 新增 `teamWeeks`、`chestAwards` 兩個 match，與 01C、03C-1 可同一次發布（發布與場次重設由產品負責人執行）。
- 不改 `dailySteps`、`teams`、`teamMembership`、`teamContrib` 的既有規則。
- 寶箱積木：只讀本積木的資格，開箱結果另存文件；未開寶箱跨週保留時，以逐週本人 `get` 或 `awards` 的 collection group 查詢取得本人各週資格。

## Architect 審查（第 1 輪，2026-10-02，Opus）：附條件通過，已併入

- **阻擋 B1**：資格讀取規則讓「交易內先讀不存在的文件」被拒 → 開放 `resource == null` 且讀者為在隊成員的 `get`（見「讀取權限」）。
- **應修正**：S1 範例更正並採 D1-B（M₁＋Mc、`basis` 依引用的 M）；S2 重播輸出 `reaching` 與 Timestamp 精確還原；S3 交易重讀、單一執行、終局鍵含 M、快照皆確認、寫入途中退團的重試；S4 「處理中」與「不在隊上」的區分；S5 以 `activityWeekId` 實作窗口與測試；S6 `membersAt` 演算法與屬性測試；S7 組路徑前驗格式；S8 預算「替自己」為 6 份、P12 的 299,999 屬前端測試、補 Rules 必測。
- **建議（已採納）**：子集合改名 `awards`；寶箱積木另存開箱結果；改寫已接受風險 3、明寫參與者不以帳目判定；`dailyNeed` 條件；場次重設驗收；本積木的 mutation 變異清單。
- Architect 確認：M 只會提前的單調性成立；「於 M 在隊」的 Rules 判定與 03B 事件／索引行為一致；預算最壞 8 份可信。

## 待 Architect 短版覆核的重點

1. D1-B 的 Rules 寫法（資格的 M 等於 M₁ 或 Mc、`basis` 依引用判定）與前端「同時合資格引用 M₁」是否一致且無漏洞。
2. `resource == null` 的讀取分支是否只在交易先讀時需要、有無其他洩漏面。
3. 窗口寫法（`activityWeekId`、`duration` 減 7 天）在 Rules 語言中的可行性與測試案例是否足夠。
4. 單一執行與「需再跑一次」的防循環設計是否完整。

## Architect 短版覆核（2026-10-02，Opus）：附條件通過，已併入

- 第 1 輪 B1、S1、S2、S4、S6–S8 與建議判定已修正；S3、S5、風險 3 部分修正，本次併入：
  - **窗口型別**：`上週一(W) == weekId` 為 timestamp 與字串比較、永不相等 → 改為兩個 timestamp 比較（見 Rules）；補「週一寫兩週前」「非週一或不存在日期」測試。
  - **防循環**：「最多再跑一次」改為 `while (needRerun)` 迴圈；網路失敗不觸發重跑；停止／換隊／換場次／換帳號時取消並清除。
  - **`membersAt` 防護**：同一 revision 的快照一致性；反向重播不符時 fail closed。
  - **讀取分支**：以三元式分流 `resource == null`，只用於 `get`。
  - **風險 3 更正**：範圍含「達標帳目晚補記」，維持接受並以測試記錄。
- 覆核確認：D1-B 的 Rules 寫法與前端一致、無漏洞（M 相等需兩欄皆相等）；`resource == null` 的洩漏面（在隊成員可探測他人資格文件是否存在）六人展示可接受；`membersAt` 反向重播找創辦人正確。
- 畫面主行顯示 M₁（首次達標）、副行顯示提前後時間：維持本契約寫法，產品負責人可再調整文案。

## 實作紀錄（2026-10-02，本機）

- **新增**：
  - `firestore.rules` 的 `teamWeeks`、`chestAwards` 兩個 match 與 `weekResultPath`／`weekBefore`／`weekResultWindow`／`momentBefore`／`weekResultBase`／`weekResultCreate`／`weekResultUpdate`／`awardMoment`／`awardJoin`／`awardLeave`／`awardInTeam`／`awardCreate`／`awardTeamReader`（不改既有規則）。
  - `src/team/week-result-state.ts`（嚴格解析、`latestStints` 反向重播、`membersAt`、`settlementPlan`、`ownAwardStatus`、`dailyNeed`）。
  - `src/team/week-result-service.ts`（訂閱、同一 revision 一致讀取事件、交易寫入週結果與資格、`WeekSettler` 單一執行迴圈）。
  - `contrib-state.ts` 的 `replayTeamWeek` 增加 `reaching`（不改既有行為）。
  - `team-panel.ts`（可見週的週結果與資格訂閱、結算觸發、本人狀態、每人每天、無隊伍時讀本人資格、退團文案）；`main.ts` 接上服務；`views.ts`（正式達標、提前、處理中、不在隊上、上週、每人每天、無隊伍畫面的資格）；`team-state.ts` 的 `leaveDialogCopy` 加 `hasAward`；`ui-preview.ts` 新增 6 個畫面。
  - Mutation：抽出共用執行器 `scripts/rules-mutation-runner.mjs`（比對範圍限該積木區塊，到下一個 `// ===== FSD-` 為止）；新增 `scripts/mutate-week-result-rules.mjs` 與 `npm run test:rules:mutation:week`；03C-1 腳本改用共用執行器。
- **實作細節**：週結果寫入被 Rules 拒絕時，同一 M 在本頁不再嘗試；資格寫入被拒時重讀事件一次（帶新的 `leaveRevision`）再試，仍拒絕則以 `(memberId, M)` 為鍵終局；寫入未確認時顯示「寶箱資格結算中」；週結果或資格訂閱出錯時，下一個成員快照重新訂閱。
- **驗證**：`npm test` 81/81（新增 `week-result-state` 8 條，含 M 只提前的屬性測試）；`npm run test:rules` 93/93（03C-2 共 12 條）；tsc、build 通過；預覽頁 375 px 的 8 個畫面無水平溢出。
- **Mutation**：03C-2 共 54 項（以舊版執行器完成；之後執行器改為遇到第一條失敗即停並加入基準檢查，判定邏輯不變，下次執行時與本輪結果對照驗證），**47 項被抓到、7 項為等價變異、0 項意外存活**（等價理由見腳本：窗口缺 `activityWeekId`、`everFormed`、帳目 ID 格式、同人第二筆 leave、他隊的 leave、`teamId` 格式、`basis` 值域）。首輪找到 4 項（a01、a05、a08 為測試缺口，已補測試；w07 為替換字串語法錯誤，已更正）。03C-1 改用共用執行器後重跑：37 項中 33 項被抓到、4 項等價，與先前一致。
- **未完成或未驗證**：真實 Firebase 雙裝置；寶箱積木（抽獎、開箱）。

## QA／Security 首輪審查與修正（2026-10-02）

**審查結論**：QA（Sonnet）無阻擋，應修正 5 項（S1–S5）、次要 8 項（M1–M8），並對新 mutation 執行器提出 4 點；Security（Opus，首次因額度中斷後重派）**通過**，Low 2 項、Info 2 項，並以新版執行器重跑 03C-2 mutation 得到與舊版相同結果（47／7／0），確認拿掉 03C-2 區塊後 Rules 等於 03C-1 通過版本 `e688eb22…`（無回歸）。

**產品負責人裁決（2026-10-02）**：Security Low-1 照建議修正——創辦人只自建隊起在隊。

**修正內容**
- **Low-1**：Rules 創辦人分支加 `v.reachedAt >= ts.createdAt`（不增加文件讀取）；前端 `latestStints` 以隊伍 `createdAt` 作為創辦人在隊起點。新增 Rules 測試（建隊前的乘車帳目作為 M 時，創辦人與入隊者皆拒）與 mutation a32。
- **Security Info-1**：`weekBefore` 加日期往返核對（縱深防禦；mutation w26 列為等價）。
- **S1**：新增「同一情境時間以伺服器時間判定更早」的 Rules 測試（提前到同時點較早者准、較晚者拒）與 mutation w24（刪除平手分支）、w25（平手方向反轉）。
- **S2**：窗口測試補「週一 00:00 可寫上週」的成功案例、非週一與不存在日期的拒絕。非週一／不存在日期也會被「帳目週別相符」擋下，**無法單獨隔離**窗口的日期檢查；以 mutation 清單與日期往返核對補強。
- **S3**：新增 `tests/fixtures/week-scenarios.json` 共用情境表（4 個情境、16 個檢查點：成團與晚入隊、同時點入退隊、隊長轉讓不是入退隊、達標前退團），`week-result-state.test.mjs` 以 `latestStints`／`membersAt` 跑、`firestore-rules.test.mjs` 以 Emulator 跑，並檢查「前端合資格 ⇒ Rules 接受」。
- **S4**：`WeekSettler` 移到 `src/team/week-settler.ts`，以 `SettlerPort` 介面隔離 Firestore（`WeekResultService.portFor(session)`）；新增 `tests/week-settler.test.mjs` 8 條（未確認快照不跑、建立後下一快照補資格、執行中的新快照只多跑一次且用最新輸入、網路失敗不自行重跑、被拒重讀一次帶新 `leaveRevision` 重試後終局、提前被拒仍補發既有記錄、cancel 後不再寫入與通知、他隊已有資格與格式錯誤）。
- **S5**：每個 `await` 寫入或重讀之後檢查 `cancelled`，cancel 後不再多寫。
- **M1**：提前被拒時不再提早結束，仍補發既有記錄的資格。**M2**：週結果／資格訂閱出錯後，每個成員快照重訂一次（比照 03C-1）。**M3／Security Low-2**：以隊伍 revision 快取 `latestStints`，同一 revision 不重讀事件。**M4**：本人狀態只使用與目前記錄 revision 相符的名單。**M5**：資格已存在於他隊時記入 `existing`，本人顯示已取得而非一直「處理中」。**M6**：格式錯誤顯示錯誤訊息，不視為結算中。**M7**：資格快照到達時同步退團對話框文案。**M8**：成員索引訂閱出錯時一併停止貢獻帳與週結果（取消 settler）。
- **Mutation 執行器（QA 4 點）**：只有測試回報 `not ok` 才算被抓到，並記錄是哪一條；沒有失敗測試卻非零結束（Rules 語法或載入錯誤）、測試數不符或逾時（5 分鐘）一律標為 ERROR，不計為被抓到；基準必須恰好跑到預期的測試數（03C-1 為 22、03C-2 為 18），避免測試改名後全部「存活」。

**驗證（修正後）**
- `npm test` 93/93（新增 `week-settler` 8 條、`week-result-state` 共用情境 4 條）；`npm run test:rules` **99/99**（03C-2 共 18 條：14 條個別測試加 4 個共用情境）；tsc、build 通過。
- **Mutation（新版執行器）**：03C-2 共 58 項，**50 項被抓到、8 項等價、0 項意外存活**，約 15 分鐘；03C-1 共 37 項，33 項被抓到、4 項等價，約 7 分鐘（舊版約 50–60 分鐘）。

**審查基準版本（SHA-256，短版覆核用）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `6959db5f774e7c89288eede7acf82ee72813935db74b837472e7b3c7deed0623` |
| `tests/firestore-rules.test.mjs` | `ed89c94bb2baa5614bc5831896d0e5785fc99843a19522dd80a062160cc7d80a` |
| `tests/week-result-state.test.mjs` | `0a8dad0f6a9e7bfe82048ba63436512e1db1dd66f998045d3d7688472dc1d0dc` |
| `tests/week-settler.test.mjs` | `8eb01433d277323fd7b8a76dfafebd591b7174d13368d78eca0625debfc8831d` |
| `tests/fixtures/week-scenarios.json` | `3be3c61050e904acdbfcd7a2dc5d802c22e49cc06f86e20c7269495b2e647836` |
| `tests/contrib-state.test.mjs` | `4ccf2397eb3cb8ee7843a6f327c8eb7a26ab51fcb09267471834701cf67347be` |
| `scripts/rules-mutation-runner.mjs` | `1e92bde52c316163d8bc38428c140cc830fcfe5a3b3fbea0809d87da260ba705` |
| `scripts/mutate-week-result-rules.mjs` | `e6a509f4f931ff66aa80861ad2dd261aa49c80eec99e249a2d46d131249452c5` |
| `scripts/mutate-contrib-rules.mjs` | `86e62be4b997f3f56dec02656e01a1ed56bf8107ec795f18d19cc6c706a4b2e5` |
| `scripts/test-firestore-rules.ps1` | `15b6cd675da70f33ba3e4b4980f0205ba0e5956119b9c612f66fa8e78b8f3aea` |
| `src/team/week-result-state.ts` | `ca262a6027d48d963c460a72f213279e3d641ac2f2b9f6fbaf5a60ef6b492c5f` |
| `src/team/week-result-service.ts` | `a60d09f92c80b6401ed414d2beece03c3d6f6f7b559ca4d22253c6fc14a0c2ab` |
| `src/team/week-settler.ts` | `f770bac60e2d77c58148fa2664d079a9c318b841449aaa70d16ebc631544f7af` |
| `src/team/contrib-state.ts` | `e8d9a90769f2564ddec44df50bd7d104d165d62e2c35833836c6d907040584ba` |
| `src/team/team-panel.ts` | `37407a2f153d94290d83a988aaf7399d2dc30f9d84fb47e7b6b778e9ed923932` |
| `src/team/team-state.ts` | `95a2bb1f56a6599eb7478822b6b48e261f10628e0042beaa11f0e5d20a7fca31` |
| `src/main.ts` | `af26f346bf7ea30a98e4eb634e3880c005de93e4adf123ee8d2e6ba88c591397` |
| `src/ui/views.ts` | `06346a520fb4d9ecf8bb87babab6a11030c049ef964f9bdd8cae15c7b8d18cc0` |
| `src/ui-preview.ts` | `fd189542cae9ddcd78351476a66a5caeee96931232f188109029af7a13fbc335` |
| `package.json` | `51bd718014e7a0fcab95617dc5ebe1b21cb899b214e49cde78bed852aa6de658` |

## 短版覆核（2026-10-02）與後續修正

- **QA（Sonnet）**：S1、S3–S5、M1–M8 已修正，S2 部分修正（窗口日期檢查無法單獨隔離，契約已註明，可接受）；Low-1 前後端一致；`npm test` 93/93、`test:rules` 99/99、tsc、build 通過。**無阻擋**；1 項應修正：mutation 執行器會把「Rules 載入失敗」誤判為被抓到（頂層 `before` 失敗時 Node 將每條測試回報為 `not ok`、`failureType: 'hookFailed'`）；次要：缺快取命中／失效的單元測試、`formatError` 不清除等。
- **Security（Opus）**：**通過**，無 Low 以上發現。以暫存副本（127.0.0.1:8098）跑 107/107（含其新增 8 條）；Low-1 修正完整（建隊前一秒創辦人拒、建隊同一秒創辦人准、創辦人退團重入走 join 分支）；`weekBefore` 往返核對不誤拒閏年、跨月、跨年的週一；Rules 只有這兩處變動，拿掉 03C-2 區塊後等於 03C-1 通過版本 `e688eb22…`。Info 3 項（建隊同一秒創辦人一律在隊、他隊已有資格每次重讀、執行器終止後 RPC 晚到）。暫存資料夾已自行刪除（先解除 junction）。
- **已修正（不改 Rules）**：
  - 執行器：讀取失敗測試的 YAML，`failureType: 'hookFailed'` 判為 ERROR（不是被抓到）；新增 **canary 自我檢查**——每次執行先以一份無法載入的 Rules 確認會被判為 ERROR，否則中止。
  - `WeekSettler`：每輪開始清除 `formatError`；資格已存在（他隊）時記為終局，不再重讀（Security Info-2）。
  - 測試：`week-settler.test.mjs` 補「同一 revision 用快取、revision 改變重讀」「已存在的資格不再查看」2 條；Rules 測試併入 Security 的加測 3 條（建隊前一秒與同一秒的創辦人、創辦人退團重入、閏年月底的週一結算）。
- **驗證**：`npm test` 95/95；`npm run test:rules` **102/102**（03C-2 共 21 條：17 條個別測試加 4 個共用情境）；tsc、build 通過。**Mutation**：03C-2 共 58 項，50 項被抓到、8 項等價、0 項意外存活（約 15 分鐘）；03C-1 共 37 項，33／4／0（約 11 分鐘）；兩份的基準與 canary 皆通過。
- **之後的 mutation 規則**（產品負責人 2026-10-02 核定）：只重跑 Rules 有變動的積木；執行器本身的修改由基準與 canary 驗證。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `6959db5f774e7c89288eede7acf82ee72813935db74b837472e7b3c7deed0623` |
| `tests/firestore-rules.test.mjs` | `d1444fc59abf33c90f80f91eb6e491bdc7e86920b7849f354b7dcf534fcdcb29` |
| `tests/week-result-state.test.mjs` | `0a8dad0f6a9e7bfe82048ba63436512e1db1dd66f998045d3d7688472dc1d0dc` |
| `tests/week-settler.test.mjs` | `9a5191adc4c39183be50f3f4347c9e6b071e42e95491dbd106cd8910297e3172` |
| `tests/fixtures/week-scenarios.json` | `3be3c61050e904acdbfcd7a2dc5d802c22e49cc06f86e20c7269495b2e647836` |
| `tests/contrib-state.test.mjs` | `4ccf2397eb3cb8ee7843a6f327c8eb7a26ab51fcb09267471834701cf67347be` |
| `scripts/rules-mutation-runner.mjs` | `12322739ac6e796593c8f3a516b5313e27eb3cb2300e957f3ac7f389740b0858` |
| `scripts/mutate-week-result-rules.mjs` | `de958113f7fd78651b6aa27ad3fb4bca32b551893371b8fca15e17241567940d` |
| `scripts/mutate-contrib-rules.mjs` | `86e62be4b997f3f56dec02656e01a1ed56bf8107ec795f18d19cc6c706a4b2e5` |
| `scripts/test-firestore-rules.ps1` | `15b6cd675da70f33ba3e4b4980f0205ba0e5956119b9c612f66fa8e78b8f3aea` |
| `src/team/week-result-state.ts` | `ca262a6027d48d963c460a72f213279e3d641ac2f2b9f6fbaf5a60ef6b492c5f` |
| `src/team/week-result-service.ts` | `a60d09f92c80b6401ed414d2beece03c3d6f6f7b559ca4d22253c6fc14a0c2ab` |
| `src/team/week-settler.ts` | `f691350568489a6188e4c9e200e62a4df475c248d619b4678e20d3b1683d8519` |
| `src/team/contrib-state.ts` | `e8d9a90769f2564ddec44df50bd7d104d165d62e2c35833836c6d907040584ba` |
| `src/team/team-panel.ts` | `37407a2f153d94290d83a988aaf7399d2dc30f9d84fb47e7b6b778e9ed923932` |
| `src/team/team-state.ts` | `95a2bb1f56a6599eb7478822b6b48e261f10628e0042beaa11f0e5d20a7fca31` |
| `src/main.ts` | `af26f346bf7ea30a98e4eb634e3880c005de93e4adf123ee8d2e6ba88c591397` |
| `src/ui/views.ts` | `06346a520fb4d9ecf8bb87babab6a11030c049ef964f9bdd8cae15c7b8d18cc0` |
| `src/ui-preview.ts` | `fd189542cae9ddcd78351476a66a5caeee96931232f188109029af7a13fbc335` |
| `package.json` | `51bd718014e7a0fcab95617dc5ebe1b21cb899b214e49cde78bed852aa6de658` |
