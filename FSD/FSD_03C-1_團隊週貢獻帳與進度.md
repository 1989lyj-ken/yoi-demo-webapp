# FSD-03C-1｜團隊週貢獻帳與進度顯示

**狀態**：契約第 2 版（2026-10-02）。Architect 兩輪通過；QA／Security 首輪審查與修正完成，**短版覆核：QA 無阻擋、Security 通過**，覆核提出的邊角項已修正（見文末）。**本機完成，待產品負責人發布 Rules 與手動驗收**；Rules 有新增（雜湊見文末），未發布、未部署，未以真實 Firebase 登入實測。依據：PRD §5.1、§5.3、§6.1、§6.1.1、§6.2（僅資格交接）與 P12、P13、P17、P18、P20、P25；FSD-01C、FSD-03B、FSD-03 總契約。

## 已核定前提（產品負責人，2026-10-01）

1. **架構方案 A「逐筆貢獻帳」**：不依賴伺服器計算。成員每次步數或乘車事件寫入後，另寫一筆建立後不可改的「貢獻帳」；Rules 只驗證每一筆，**不加總**；隊伍總量與達標時點由各裝置用同一個純函式重播算出。
2. **歷史精確度接受近似**：Rules 以寫入當下的狀態與片段時間做**近似**判定；前端在寫入前做**精確**判定（見「資格判定」）。
3. **信任模型**：步數與乘車本來就是成員自報的模擬資料，展示版不做反作弊；Rules 把關每筆貢獻的資格、金額與唯一性，**但無法驗證總量真的 ≥ 300,000**，也擋不住不誠實的客戶端繞過前端的精確判定（見「已接受風險」）。
4. **切成兩個積木**：本契約只做貢獻帳、重播函式與進度顯示，**不寫達標記錄、不鎖名單、不發寶箱資格**（03C-2）。
5. 畫面放在現有「團隊共享」區塊，不新增分頁。

## 範圍

- 負責：貢獻帳資料格式與 Rules、寫入與補記流程、重播函式、隊伍週總量與個別貢獻顯示、上週補同步期間的並行顯示、歷史成員標示。
- 不負責：週結果記錄與達標名單鎖定（03C-2）、寶箱抽獎與開箱、七日全勤（FSD04）、推薦新戶、隊長主動解散、純展示模式、鈴鐺通知。
- 設計稿的「每人每天約需 N 步」提示與「週中就達標」文案**刻意延後**（屬達標與結算體驗，隨 03C-2 處理）。

## 責任與資料流

```
成員同步步數／完成乘車（FSD-01C，不改）
        │ 寫入 dailySteps 文件＋events/{seq}
        ▼
貢獻帳寫入（本契約，另一個寫入，不阻擋個人步數）
        │ 前端精確判定資格 → Rules 近似複核
        ▼
teamContrib/{sessionId}/teams/{teamId}/entries/{entryId}   ← 建立後不可改
        │ 各裝置訂閱本週（及上週，補同步期間）的貢獻帳
        ▼
重播純函式 → 個別貢獻、隊伍總量、（試算）達標時點 → 畫面
```

**個人步數優先**：貢獻帳是第二個寫入，獨立於 01C 的步數寫入。貢獻帳失敗、被拒或延後，**不影響個人步數與領點**（PRD §5.1：個人任務不受團隊暫停影響）。

## 資料格式

### 貢獻帳 `teamContrib/{sessionId}/teams/{teamId}/entries/{entryId}`（固定 12 欄，只能建立）

| 欄位 | 規則 |
|---|---|
| `sessionId`、`teamId` | 等於路徑 |
| `weekId` | 該 `taskDate` 所在週的週一日期；以 `weekMatches` 同法驗證 |
| `memberId` | 等於操作者的 `memberId` 與對應的步數事件路徑 |
| `taskDate`、`seq` | 指向 `dailySteps/{sessionId}/members/{memberId}/days/{taskDate}/events/{seq}`；`taskDate` 先驗格式，`seq` 為整數且 ≥ 1 |
| `kind` | `steps` 或 `ride`，且等於該事件的 `kind`（領點 `claim` 不入帳） |
| `eligibleRawDelta` | `steps`：等於該事件的 `rawDelta`；`ride`：0。整段片段**全有或全無**合資格 |
| `occurredAt` | 等於事件的 `occurredAt` |
| `syncedAt` | 等於事件的 `syncedAt`（伺服端稽核時間，用於同一情境時間內的先後判定，見 B1；也供 03C-2 使用） |
| `joinRevision` | `steps`：成員**最近一次入隊**事件在 `teams/.../events/` 的 revision；`0` 表示創辦人（無 `join` 事件，索引 `joinOrder=0` 且 `joinedAt == 隊伍 createdAt`）。`ride`：必為 `0`（乘車不要求入隊起算，見 b1） |
| `recordedAt` | 等於 `request.time`（寫入時間，補記時會偏晚，不得代替 `occurredAt`／`syncedAt`） |

- **文件 ID＝`{memberId}_{taskDate}_{seq}`**：同一事件最多入帳一次。Rules 比對 `entryId == memberId + '_' + taskDate + '_' + string(seq)`；`memberId` **不含底線 `_`**（現有 `YOI-M01`、`YOI-P01` 皆符合，前提寫入契約）、`taskDate` 有正規式、`string(int)` 無前導零，因此從右邊解析唯一，跨成員不會碰撞。
- 乘車加成**不存成額外帳目**，由重播依 `ride` 帳目的 `occurredAt` 推算。

### 讀取權限

| 讀者 | `get`／`list` |
|---|---|
| 現任隊員（成員索引 `active` 且 `teamId` 相同、目前場次、帳號 active） | 可，含**已退團成員**在該隊寫下的帳目（歷史貢獻保留） |
| 本人（任何狀態，含已退團）讀**自己**的帳目 | 僅 `get`（以路徑 `entryId` 前綴等於本人 `memberId` 判定，不引用 `resource`，文件不存在也能求值），供補記前確認「是否已入帳」 |
| 已退團者讀隊友帳目、非隊員、其他場次、未登入、inactive | 不可（已讀過的離線資料無法遠端抹除） |
| 任何人 | 不可更新、刪除 |

`list` 只驗讀者身分，不依賴查詢內容；前端以 `where("weekId", "in", [...])` 查詢（最多 30 個值，只用單欄位自動索引），**不使用 `orderBy`**（避免複合索引，索引部署屬雲端操作），排序在前端。

## 資格判定

令事件的 `occurredAt` 為 `t`、事件的 `syncedAt` 為 `s`。`formed` 為該隊 `events/1`（第一筆 `join`，即第二位成員加入）的 `{effectiveAt, serverRecordedAt}`。時間字串為固定長度 `YYYY-MM-DDTHH:MM:SS+08:00`，字串比較等同時間比較。

### 同一情境時間的先後（B1，已裁決採 A）

情境時鐘是靜態值，只能由管理者推進；因此同一情境時間內，步數的 `occurredAt`、成員索引 `joinedAt`、隊伍事件 `effectiveAt` 都相等，單看情境時間分不出先後。**例：同一情境時間內，A 先同步步數，B 才加入使隊伍成團——A 的步數是「成團前」，不應入帳。**

| 選項 | 做法 | 代價 |
|---|---|---|
| **A（建議）** | 以伺服端時間打破平手：事件 `syncedAt`（＝`request.time`）與隊伍事件 `serverRecordedAt` 比較。定義 `after(t, s, ref) = t > ref.effectiveAt ‖ (t == ref.effectiveAt ∧ s > ref.serverRecordedAt)`。成團邊界用 `events/1`，成員入隊邊界用其 `join` 事件（由 `joinRevision` 指向，Rules 驗證 `type=='join'`、`targetMemberId` 為本人、`effectiveAt == 索引.joinedAt`） | 帳目多 `syncedAt`、`joinRevision` 兩欄；Rules 多 1 次 `get`（成員的 `join` 事件） |
| B | 平手一律算入（`≥`） | 較簡單，但「先同步、後入隊或成團」於同一情境時間內會被計入，違反 PRD §6.1.1；展示腳本須規定入隊或成團前先推進情境時間 |

### 前端精確判定（`contributionEligibility`，`src/team/contrib-state.ts`）

寫入前逐筆讀隊伍事件 `1…revision`（現任隊員可 `get`），重建該隊的「**有效區間**」：成團（`events/1`）起至暫停（`leave` 使名單剩 1 人）止，補員（`join` 使名單回到 ≥ 2 人）後再開始，依此類推。精確判定：

- **steps**：片段屬某個有效區間，且成員在該時點在隊（`after(join)` 且在 `leave` 之前）。**暫停期間的片段不入帳，即使之後補員恢復**（PRD §6.1.1「暫停期間的步數不回補團隊」；反例：10:00 B 退團使隊伍暫停、11:00 A 同步、12:00 C 加入後補記，4,000 步不得回補）。
- **ride**：**寫入時**成員在隊（或已退團且 `t < leftAt`），隊伍**目前**已成團，且 `t` 不落在本隊於該成員在隊期間的暫停區間；**乘車日不得早於入隊日**（`taskDate ≥ joinedAt` 的日期，2026-10-02 依 Security Low-1 裁決 (b) 新增）；同一天內 `t` 早於入隊或成團**不影響**（裁決 b1：例如 08:00 乘車、09:00 入隊，之後的合資格片段享有加成）。完成時若成員已退隊或隊伍暫停，則不入帳。
- **前端判定的正式定義**：前端判定 ＝ PRD 精確判定 ∧ Rules 的已知保守限制（今日／昨日窗口、以**最近一次**入隊為起算、`leftAt` 平手拒絕、隊伍**目前**已成團）。屬性測試「前端合資格 ⇒ Rules 接受」以此定義為準（否則以下皆為反例：同成員跨週重新加入同一隊後補記舊段落、`t == leftAt`、情境時間推進後窗口已過）。
- 已退團成員的補記：成員索引只保留其最近一次墓碑；已退團者不能讀 `events/1` 與隊友帳目，因此**已退團分支只直接嘗試一次，Rules 拒絕即為終局**，不顯示「待補記」，不重試（見「寫入流程」）。

### Rules 近似判定（`contribCreate`；前端精確 ⊆ Rules 接受）

| 分支 | 條件（皆為 `steps`；`ride` 見下） |
|---|---|
| **在隊** | 成員索引 `status='active'` 且 `teamId` 相同；起算：`after(join) ∧ after(formed)`（創辦人 `joinRevision=0` 只要求 `after(formed)`）；隊伍 `status='active'`，**或** `status='paused'` 且 `t` 早於造成暫停的那筆 `leave`（B3：暫停時 `events/{隊伍 revision}` 必為造成暫停的 `leave`——暫停中的隊伍不可能再有其他操作：轉讓需要另一位成員、退團會封存、加入會恢復——Rules 讀它並驗證 `type=='leave'`，`t < effectiveAt ∨ (t == effectiveAt ∧ s < serverRecordedAt)`） |
| **已退團** | 成員索引 `status='left'` 且 `leftTeamId` 相同；`joinRevision` 同上；`t < leftAt`（平手時保守拒絕）；`after(formed)`。退團前產生的片段仍可補記（PRD §6.1.1） |
| **ride** | `kind='ride'`、`joinRevision=0`；成員屬於該隊（在隊且隊伍 `active`，或 `paused` 且 `t` 早於暫停事件，或已退團且 `t < leftAt`）；`taskDate >= joinedAt.split('T')[0]`（乘車日不早於入隊日，Low-1）；**不檢查**同日內的 `joinedAt`／`formed` 起算 |

- 縱深防禦：另驗 `隊伍.everFormed == true` 與 `events/1.type == 'join'`；`recruiting`（未成團）因 `events/1` 不存在而被拒；`archived` 只能走已退團分支。
- **補記窗口**：只接受 `taskDate` 為情境「今日或昨日」的事件（沿用 01C 的 `dailyWindow`），與 D+1 24:00 補同步截止一致。
- Rules 無法共用前端程式碼，因此**前端精確、Rules 近似是刻意的不同**；以一份共用的情境表（`tests/fixtures/contrib-scenarios.json`）同時驅動單元測試與 Emulator 測試，並以屬性測試驗證「前端判定合資格 ⇒ Rules 接受」。

### 已接受風險（信任模型範圍，須列入驗收與審查）

1. 自報的 `rawDelta`（每日上限 1,000,000）可灌水；步數與乘車皆為自報模擬資料，不做反作弊。
2. **不誠實的客戶端可繞過前端精確判定**：Rules 只做近似，因此「暫停期間的片段在補員後或再次暫停後被回補」「同一情境時間內成團前的片段」（若採選項 B）等，由 Rules 擋不住。
3. 成員索引只保留最近一次入退隊：成員退出甲隊後又加入乙隊，甲隊的補記因墓碑被覆蓋而遺失；同成員在不同週重新加入同一隊，先前那段的補記亦遺失。皆為保守方向（少入帳）。
4. 已退團分支在平手時點保守拒絕。
5. 昨日才入隊者的 23:59:59 補同步會被計入（01C 已接受）。
6. **已退團者的正常補記也可能回補暫停期間**（裁決 N1 (c)）：已退團者讀不到原隊伍事件，前端無法精確判定，只要 `t < leftAt` 就嘗試入帳。P20「補員後不回補暫停期間」只對**在隊成員**保證。
7. **同一天跨兩隊的乘車**（Security 短版覆核 Info-A）：成員在招募中的甲隊乘車、甲隊成團前退出（不鎖週），之後甲隊由他人成團、該成員同日又入乙隊，同一筆乘車可分別記入兩隊。成員在甲隊沒有合資格步數，加成增量為 0，畫面也不列出貢獻為 0 的歷史成員；維持現狀。03C-2 不得以「有帳目」判定參與者。

**Rules 擋下的**：跨隊重複入帳（單一成員索引加週鎖定加今日／昨日窗口，週日退甲隊、週一入乙隊的週日片段，`t` 早於乙隊 `joinedAt` 且晚於甲隊 `leftAt`，兩邊皆不入帳；**乘車**另以「乘車日不早於入隊日」擋下週日在甲隊乘車、週一入乙隊後再記入乙隊）、為他人或他隊入帳、以 `claim` 事件入帳、重複 ID、窗口外事件、金額與事件不符。

## Rules（`firestore.rules`，新增一個 match 與少量函式；不改 `dailySteps`、`teams`、`teamMembership`）

```
match /teamContrib/{sessionId}/teams/{teamId}/entries/{entryId} {
  allow get: if teamContribReader(sessionId, teamId) || ownContribPath(entryId);
  allow list: if teamContribReader(sessionId, teamId);
  allow create: if activeMember() && currentSession(sessionId) && contribCreate(sessionId, teamId, entryId);
  allow update, delete: if false;
}
```

`contribCreate` 驗證順序（先便宜、後昂貴，以三元式分流避免兩個分支都求值，比照 01C）：欄位精確與型別 → `taskDate` 格式、`dailyWindow`、`seq is int ≥ 1` → `entryId`、`weekId`、`memberId == actorMemberId()` → 讀事件（`get`，必須已存在，`kind`／`occurredAt`／`syncedAt`／`rawDelta` 吻合）→ 依 `kind` 分流的資格判定 → `recordedAt == request.time`。`teamContribReader` 驗帳號 active、場次、本人索引 `active` 且 `teamId` 相同。

### Rules 預算（必填；單一寫入的文件存取上限為 10，批次／交易為 20）

| 操作 | 寫入文件 | 存取文件（去重估計） | 最壞情況 | 接受路徑測試 |
|---|---|---|---|---|
| 貢獻帳建立 | 1 | `membersByUid`、`demo/current`、事件、成員索引、隊伍、`events/1`、成員 `join` 事件、（暫停時）暫停事件＝**最多 8**（<10） | 暫停中且 `t` 早於暫停事件、非創辦人、已退團跨週；`steps` 與 `ride` 各一 | 必備，並以 `writeBatch` 重建反向測試 |
| 貢獻帳 `get`／`list` | 0 | `membersByUid`、成員索引＝約 2–3（含 `demo/current`） | 已退團者讀隊友帳目（應拒） | 必備 |

- 運算式目標每條規則 < 300；`weekMatches`、`dailyWindow`、`validScenarioNow` 在同一規則內以 `let` 綁定避免重複呼叫。驗收時 `firestore-debug.log` 不得出現 1000 expressions 訊息；關鍵反向測試以 `writeBatch` 重建（交易被拒時 Emulator 不記錄原因）。
- 設計取向：貢獻帳是**獨立寫入**，01C 的步數寫入規則與預算完全不受影響。

**實作首步須以 Emulator 實測**（結果寫回本契約）：(1) 最壞路徑的運算式數與日誌；(2) 同一文件重複 `get` 是否只計一次存取，並故意做超過 10 份的規則確認 Emulator 是否強制上限（若不強制則以人工計數為準）；(3) 對不存在的事件或 `events/1` 做 `get().data` 是求值錯誤而非 null，且置於 `||` 分支時不會意外放行；(4) 帶 `where('weekId','in',[a,b])` 的訂閱不需索引、已退團者與不帶 `where` 的查詢行為；(5) 路徑判斷的本人 `get`（不引用 `resource`）對不存在文件也能求值；(6) B1 的 timestamp 比較（`syncedAt` 與 `serverRecordedAt`）與「先同步後入隊被拒、先入隊後同步被准」；(7) 已存在帳目上 `setDoc` 與交易內 `get` 後再建立的錯誤碼與階段。

## 寫入流程（`src/team/contrib-service.ts`）

1. **即時入帳**：`DailyService.execute` 成功，且 `eventSeq` **增加**（同值重送不產生事件，不入帳）時，對新事件呼叫 `credit`。入帳不得 `await` 阻擋個人畫面。遇到 `DailyUnconfirmedError` 不即時入帳，之後的 `refresh` 確認新事件後再觸發一次補記。
2. `credit` 先以伺服器重讀成員索引、隊伍與隊伍事件，用**前端精確判定**；合資格才寫入。**一律以 `runTransaction`：先 `get` 帳目，不存在才 `set`**（文件已存在時 `setDoc` 會被當成 update 而被拒，錯誤碼同為 `permission-denied`，分不出是已入帳還是不合資格）。
3. **補記（reconcile）**：進入共享畫面時，逐筆 `get` 本人今日與昨日的事件（`seq` 以**數值**遍歷 1…`eventSeq`），跳過 `claim`，對照訂閱到的帳目集合，未入帳者逐筆走第 2 步。資格不成立就是不入帳（非錯誤），下次載入重新判定，無副作用。
4. **失敗語意（防循環；2026-10-02 依 QA S2／S5 修正後的實作見文末）**：交易前以重讀判定「不合資格」即**停止，不重試，不顯示待補記**；Rules 確定拒絕（`permission-denied`，且重讀後狀態與前端判定一致）視為終局；只有網路類無法確認的結果（`unavailable`、`deadline-exceeded`、`aborted`、`unknown`、`internal`、`cancelled`）才顯示「團隊貢獻待補記」，並於下次載入或下一個事件補記。**前端判定合資格但 Rules 拒絕**（狀態競爭或前後端不一致）只重讀一次，仍拒絕即視為終局並記為除錯狀態。**終局的記憶方式：每次載入頁面最多嘗試一次，不顯示錯誤**（窗口只有今日與昨日，成本有限；不使用 localStorage）。
5. 只寫本人的帳目；不為隊友代寫。已退團者不能 `list` 帳目，補記時以本人 `get`（路徑判斷）逐筆對照是否已入帳；每次載入只嘗試一次，拒絕即終局。
6. 退團或換隊後，帳目訂閱會收到 `permission-denied`：沿用 03B-UI 的做法（停訂、清空顯示、重讀成員索引確認、不顯示永久錯誤）。

## 重播純函式（`src/team/contrib-state.ts`，無 Firebase 依賴）

`replayTeamWeek(entries, weekId)` 輸入該週全部貢獻帳（任意順序；先依文件 ID 去重並嚴格解析），輸出：

- **排序**：以 `(occurredAt, syncedAt, memberId, taskDate, seq)` 嚴格排序（與 B1 的先後判定一致，也供 03C-2 使用），`seq` 以**數值**比較（字串比較 `"10" < "9"`），作為最後的平手鍵；所有裝置得到相同結果。
- **不變式（須有測試）**：同一成員同一日內，今日片段的 `occurredAt` 等於情境當下、情境時間不倒退，昨日片段固定 23:59:59、乘車只能記在今日，因此 `occurredAt` 的順序等於 `seq` 的順序；晚補記的片段不會改變重播結果。
- 每個「成員＋日期」維護：合資格原始步數累計 `raw`、是否已乘車 `bonus`；有效貢獻 `eff = floor(raw × (bonus ? 1.5 : 1))`。**步數帳目**：`raw += eligibleRawDelta`，增量為 `eff` 的變化；**乘車帳目**：`bonus = true`（每成員每日只生效一次，後續乘車帳目不疊乘），增量為 `floor(raw × 1.5) − raw`。乘車增量從 `occurredAt`（完成時刻）起生效，**不回溯**到搭乘前（PRD §5.1）；搭乘後新增的合資格片段按已生效加成計入。
- 輸出：每位成員本週有效貢獻、隊伍總量、**試算達標時點**（排序後累計首次 ≥ 300,000 的帳目時點；未達標為 `null`）。不同 `weekId` 互不混入（P13）。
- 試算達標時點**僅供顯示**，不是結算結果；名單鎖定與結算記錄屬 03C-2。

**手算驗證**（須成為單元測試）：隊伍 280,000，成員 raw 100,000，12:00 乘車，增量 +50,000，總量 330,000，達標時點為 12:00 而非先前任何時點；raw 1 乘車增量 0，之後 +1 則 raw 2、eff 3，增量 +2，逐筆增量加總等於最終取整值。

## 畫面（共享模式「團隊共享」區塊）

- `Progress/Team`：右上累計值（紅字）與 300,000 目標、`Progress/Trip` 軌道（沿用 `progressTrip`）；只有 1 人時依設計稿不畫軌道，改寫「N 萬 步 已累計」。
- 成員列沿用 `Row/Member`：名字（本人標示）、說明行「本週 N 步」、尾隨今日步數（沿用現有訂閱）；已退團成員列出並標示「歷史成員」，數字保留。
- 同步狀態：貢獻帳訂閱非伺服器確認（快取／pending）時，貢獻數字顯示「—」與「同步中」；貢獻待補記時顯示「團隊貢獻待補記」（P18）。
- **上週並行顯示**：情境日期為本週一（上週補同步截止前）時，在本週進度下方另列一行「上週（補同步至今日 24:00）N／300,000」；其他日子不顯示。
- 試算達標時點顯示為「已達標（試算）：月日 時:分」，並註明「結算與寶箱資格後續開放」，不暗示已發獎。
- 文案不評價；360 px 無水平溢出；`ui-tokens` 測試須維持通過。

## 驗收對應

| PRD | 驗證 |
|---|---|
| P12 | 重播邊界：299,999 未達標、300,000 試算達標 |
| P13 | `weekId` 由 `taskDate` 決定：週日片段帶上週 `weekId`，週一補記不計入本週；週一補記上週仍在窗口內（Rules＋重播） |
| P17 | 兩裝置：A 同步後 B 的團隊貢獻自動更新（人工，跨裝置） |
| P18 | 斷線／快取時貢獻顯示未確認；重連後以伺服器為準（前端狀態單元測試＋人工） |
| P20 | 退團前貢獻保留且標示歷史成員；退團後不再增加；剩一人暫停不入帳；**在隊成員**於補員恢復後補記，不得回補暫停期間（新增案例，前端精確判定；已退團者不在此保證內，裁決 N1 (c)） |
| P25（部分，03C-2 完成達標名單） | 乘車增量從完成時刻生效、不回溯；昨日補同步固定 23:59:59 歸屬；入隊前後、退隊前後、乘車時點的資格；入帳與重播一致 |

**Rules 測試（Emulator）必備案例**：在隊且成團後可入帳；招募中（未成團）拒；成團前拒（含**同一情境時間內先同步、後成團**）；入隊前拒（含同一情境時間內先同步、後入隊）；入隊後同一情境時間同步被准；暫停中拒；暫停前的片段於暫停後補記被准（B3）；補員恢復後暫停期間片段（Rules 近似會准，列為已接受風險並以測試記錄行為）；他隊或他人名義拒；已退團者退團前片段可補記、退團後拒；乘車：成員在隊時可入帳且不要求入隊起算、暫停中拒、已退團且 `t ≥ leftAt` 拒；`joinRevision` 錯誤（指向他人的 join、`effectiveAt` 與索引不符、創辦人謊報——含**同一情境時間內加入的成員以 `joinRevision=0` 冒用創辦人**，其 `joinedAt` 等於隊伍 `createdAt`，須靠 `joinOrder==0` 擋下）拒；**同一批次內入隊加同步**（共用同一個 `request.time`）被拒（保守）；非本人事件、事件不存在、`kind`／`occurredAt`／`syncedAt`／`rawDelta` 與事件不符、`weekId` 與 `taskDate` 不符、窗口外、重複 ID、`update`／`delete`、多餘欄位拒；讀取：現任隊員（含讀歷史成員帳目）可、已退團者讀隊友拒、已退團者讀自己的帳目 `get` 可、非隊員與其他場次與 inactive 拒；`list` 在隊員可、其他拒。**每條規則以 mutation 反證**（移除該條件測試會失敗）。

**單元測試**：`replayTeamWeek`（邊界、乘車時點不回溯、單日只加成一次、取整、跨週分離、輸入順序無關、`seq` 數值排序、同時點確定性排序、歷史成員保留、手算案例）、`contributionEligibility`（有效區間重建、暫停不回補、已退團、共用情境表）、補記差集與數值 `seq` 遍歷、前端狀態文字、錯誤分類（終局 vs 待補記）。

**人工驗收**（需新 Rules 發布後以真實帳號）：雙裝置步數同步後貢獻更新；先同步步數再入隊不入帳；同一情境時間內先同步後入隊；暫停期間同步、補員後不回補；退團後隊友仍看到其歷史貢獻、退團者看不到隊友；週日補同步歸上週；斷線補記；退團或換隊時帳目訂閱自癒。

## 依賴、部署與邊界

- 依賴：01C（事件、`dailyWindow`、`syncedAt`）、03A／03B／03B-UI（隊伍、成員索引、隊伍事件、訂閱模式）、`activity-week.ts`、`error-kind.ts`。
- **本契約修改 `firestore.rules`**（新增一個 match 與少量函式）；需 Architect、QA、Security 完整審查。`firestore.rules` 是單一檔案，**發布時一併帶上 01C 與本契約的 Rules**，產品負責人發布前須核對最終雜湊；重設場次與 01C 的啟用流程併同一個時段。
- 新場次內不得以 Console 或 Admin SDK 手動寫入 `teamContrib`（資格只在建立時驗證）。
- **後續小項**：03B-UI 退團確認文案「團隊貢獻與寶箱功能後續開放」，在本積木上線後貢獻已可查看、寶箱仍未開放，須改為「寶箱功能後續開放」；HANDOFF 待辦「暫停隊伍成員退出是否仍鎖週」在有貢獻資料後可再請產品負責人檢視（本契約不更動）。
- **模型建議**：Rules 設計與測試屬高風險，實作 Rules 時建議使用 Opus。
- 不宣稱：伺服器端驗證總量、反作弊、跨裝置一秒同步、寶箱資格已完成。

## 產品負責人裁決（2026-10-02，三項皆採建議方案）

1. **B1 同一情境時間內的先後**：建議選項 A（以伺服端時間 `syncedAt`／`serverRecordedAt` 打破平手，帳目多 `syncedAt`、`joinRevision`）。選項 B（平手一律算入）較簡單，但展示腳本須規定「入隊或成團前先推進情境時間」，否則「先同步、後入隊」的步數會被計入。
2. **b1 乘車早於入隊或成團時，當日加成是否適用於之後合資格的片段**：例如 08:00 乘車、09:00 入隊、10:00 同步 +2,000。建議採 D04／§5.1 的解讀：當日乘車加成適用於**搭乘後**新增的合資格片段（團隊貢獻 +3,000，於 10:00 生效）。這與 FSD-03 字面「首趟**合資格**乘車」可能不同（若乘車須在合資格時才算，則只 +2,000），屬獎勵結果，須你決定。
3. **暫停期間的回補**：前端精確判定不回補；Rules 近似，不誠實的客戶端仍可回補（已接受風險）。請確認。

## Architect 短版覆核（2026-10-02，Opus）：附條件通過

- B1、B3 已解決（`after()` 兩邊皆為 `request.time` 可比較；`joinRevision` 驗證足以排除舊入隊事件，因正式退團鎖週且週 ID 與情境時間不倒退；創辦人判定須含 `joinOrder==0`；暫停中隊伍的最新事件必為造成暫停的 `leave`，多次暫停循環亦成立）。Rules 內 `get()` 不受讀取規則限制，已退團者的帳目仍可由 Rules 讀 `events/1` 驗證。預算估計成立（創辦人約 6、非創辦人 7、暫停分支 8 份）。
- 已併入：乘車前端措辭（N2）、前端判定的正式定義、重播排序加入 `syncedAt`（N3）、`memberId` 前提改為不含底線、終局記憶方式（每次載入一次）、已退團者以本人 `get` 對照、已接受風險 2 擴寫、兩個新 Rules 測試。
- **新阻擋 N1（待產品負責人裁決，見下）**：正常的已退團補記也會回補暫停期間。例：B 10:00 退團使隊伍暫停、A 為唯一成員；A 11:00 同步（不入帳）；C 11:30 加入使隊伍恢復；A 12:00 退團；A 載入時已退團流程補記 11:00 片段，Rules 檢查 `11:00 < leftAt` 而接受。結果隊伍總量含暫停期間步數，違反 P20「不得回補暫停期間」，而且是**誠實的客戶端**也會發生。

## 產品負責人裁決（第 2 輪，2026-10-02）：N1 採 (c)；乘車一致性維持現狀

1. **N1 已退團補記與暫停回補**（擇一）：
   - **(c)（建議）**：明文接受「已退團者的正常補記也可能回補暫停期間」，改寫已接受風險 6 與 P20 驗收（P20 的「補員後不回補」只對**在隊成員**保證）。理由：需要「唯一成員在暫停期間同步、之後有人補員、該成員再退團、之後才補記」四步同時發生，屬邊角；且 PRD 同時要求「退團後補同步仍可更新退團前的合資格片段」，(c) 保住這項功能。
   - (a)：讓已退團者可讀原隊伍的事件，前端就能精確判定。要改 03B 已發布的讀取矩陣，須 Security 審查。
   - (b)：已退團分支只補記「退團前最後一段有效期間」內的片段，前端需另外的資料來源，實作較複雜。
2. **乘車加成的一致性（非阻擋，請確認）**：依 b1 裁決，「未入隊時乘車」之後的合資格片段**享有**加成；但「隊伍暫停期間乘車」因當下不入帳，恢復後的片段**沒有**加成。兩者不一致。建議**維持現狀**：要讓暫停期間的乘車也生效，重播必須知道暫停區間並把加成增量延到恢復時刻，複雜度高，且暫停期間乘車屬邊角。

## 待 Architect 短版覆核的重點（第 1 輪，已處理）

1. 選項 A 的 `after()` 與 `joinRevision` 驗證是否正確且在預算內（最多 8 份文件）；創辦人（`joinRevision=0`）、第三位以後成員、重新入隊成員的各分支。
2. B3 的暫停分支：`events/{team.revision}` 必為造成暫停的 `leave` 的推論是否成立；暫停事件讀取在 `||` 分支中的求值行為。
3. 乘車分支不檢查入隊起算的 Rules 與重播是否一致（增量為 0 的情形、同日多筆乘車）。
4. 讀取矩陣：本人 `get` 以路徑前綴判斷的 Rules 寫法與 `memberId` 格式前提。
5. 前端精確 ⊆ Rules 近似的屬性測試與共用情境表是否足以抓出不一致；補記終局與待補記的界線是否避免循環。

## 實作紀錄（2026-10-02，本機）

- **實作時的調整（與契約不同處，須審查）**：已退團者讀不到隊伍事件，前端無法提供 `joinRevision`。Rules 改為：已退團的**非創辦人**可傳 `joinRevision=0`，此時以情境時間嚴格 `t > joinedAt` 判定起算（平手保守拒絕）；在隊成員傳 `0` 仍只限創辦人。已退團者的前端不檢查 `after(formed)`（讀不到 `events/1`），成團前的片段會被 Rules 拒絕並視為終局（符合「已退團者只嘗試一次」）。
- **新增**：`firestore.rules` 的 `teamContrib` match 與 `contribCreate`／`contribEligible`／`contribEvent`／`contribJoinStart`／`contribJoinEvent`／`contribBeforePause`／`contribAfter`／`contribBefore`／`teamContribReader`／`ownContribPath`／`teamEventDoc`；`src/team/contrib-state.ts`（嚴格解析、有效區間重建、前端精確判定、重播、補記差集、週 ID）；`src/team/contrib-service.ts`（訂閱、即時入帳、補記、終局記憶）；`team-panel.ts`（訂閱與進度、即時入帳與補記、已退團者補記）；`main.ts`（新事件觸發入帳、未確認重讀後補記）；`views.ts`／`style.css`（`Progress/Team`、成員本週貢獻、歷史成員列、試算達標、上週並行、待補記）；`ui-preview.ts` 新增 3 個畫面。
- **Emulator 實測項目（契約列 7 項）**：(1) 最壞路徑運算式：全套 `test:rules` 與 22 個 mutation 的日誌皆**無** expressions 訊息；(2) 存取次數（2026-10-02 補測）：同一文件重複 `get` 只計一次（同文件讀 12 次仍允許），單一寫入**最多 10 份不同文件、第 11 份被拒**（Emulator 會強制）；本規則最壞 8 份（創辦人約 6、非創辦人 7、暫停分支 8）；(3) 不存在的 `events/1` 或事件 `get().data` 求值錯誤而拒絕（招募中、窗口外事件的測試）；(4) `where('weekId','in',[...])` 查詢不需索引即成功；(5) 本人路徑 `get` 對不存在的帳目可求值；(6) `syncedAt` 與 `serverRecordedAt` 的 timestamp 比較與同一情境時間的先後（含同一請求共用 `request.time` 被保守拒絕）；(7) 已存在帳目上建立被拒（重複 ID 測試）；交易內先 `get` 再建立的流程屬服務層，未在 Emulator 單獨實測。
- **驗證**：`npm run test:rules` 70/70（03C-1 共 11 條）；`npm test` 64/64（新增 `contrib-state` 9 條，含 400 組隨機隊伍歷史的屬性測試：前端判定合資格 ⇒ Rules 的 JavaScript 鏡像接受；鏡像是 Rules 的模型，非 Rules 本身）；tsc、build 通過；預覽頁 375 px 無水平溢出。
- **Mutation 反證**：22 項（每次移除一條 Rules 條件、只跑 03C-1 測試），**20 項被抓到**；2 項為等價變異：`teamContribReader` 的 `status=='active'`（已退團索引的 `teamId` 必為 null，03B 規則保證）、暫停事件 `type=='leave'`（暫停中隊伍的最新事件必為 leave，非 Console 寫入無法違反）。首輪存活的 3 項（偽造較晚的 `syncedAt`、在隊成員稍晚以 `joinRevision=0` 冒用、寫入**另一支隊伍**——同一情境時間建立的兩隊，創辦人判定只靠 `teamId` 比對擋下）已補測試並重驗被抓到。Rules 已還原（雜湊比對一致）。
- **畫面互動（2026-10-02 補測）**：以暫時探針頁（已刪除）搭配假服務驅動真實的 `mountTeamPanel`：快取快照顯示「同步中」且不補記；第一個伺服器確認快照只補記一次（帶已入帳 ID）；總量與成員本週貢獻、歷史成員列正確；即時入帳結果未確認時顯示「待補記」，之後成功即清除；`reconcileContrib` 帶目前帳目 ID；退團時停止帳目訂閱，墓碑快照重複到達只補記一次（`null`、原隊伍 ID）；`visibleWeeks` 週一含上週、其他日不含。`main.ts` 的每日面板觸發點（需 Firebase）未在瀏覽器驅動。
- **未完成或未驗證**：真實 Firebase 雙裝置。（03B-UI 退團文案已於審查修正中改為「寶箱功能後續開放」。）

## QA／Security 首輪審查與修正（2026-10-02）

**審查結論**：QA（Sonnet）無阻擋項，列 6 項應修正（S1–S6）與數項次要；Security（Opus）附條件通過，無 Critical／High／Medium，1 項 Low（Low-1）與 4 項 Info。兩者皆以上一版雜湊為基準；Security 確認拿掉 03C-1 區塊後的 Rules 雜湊等於 01C／03B-UI 基準（無回歸）。

**產品負責人裁決（2026-10-02，三項皆採建議）**
1. S1 招募中提示改依 PRD：「成團後的步數才會累計」（暫停中另顯示「暫停期間的步數不計入團隊」）。
2. S3 退團確認改為「寶箱功能後續開放」（「已貢獻的步數會保留」「本週不能再加入或建立隊伍」原本已在文案中，未另加句）。
3. Low-1 採 (b)：**乘車日不得早於入隊日**。Rules 加 `v.taskDate >= ms.joinedAt.split('T')[0]`（在隊與已退團皆適用；多 1 個運算式、不增加文件存取），前端 `contributionEligibility` 同步。同一天先乘車後入隊仍享加成（b1 不變）；入隊前一天的乘車本來就沒有隊伍步數可加成，數值不受影響。

**修正內容**
- **Low-1**：見上。週日在甲隊乘車、週一入乙隊後再記入乙隊，現在 Rules 拒絕；「Rules 擋下的」已補乘車。
- **S2 待補記**：文案改為「下次同步或重新載入頁面時會補上」（不承諾偵測連線恢復）；面板改以**逐筆**追蹤未確認的帳目 ID（結果為 `unconfirmed` 加入、其他結果或訂閱帳目出現即移除；補記整體失敗另記一旗標），不再用單一布林互相覆蓋。
- **S4 訂閱自癒**：帳目訂閱出錯後標記失效，同一次成員快照內立即重訂一次；之後的成員快照也會重訂（比照名單的 `rosterFailed`）。格式錯誤只顯示錯誤、不重訂。
- **S5 錯誤處理**：前端判定合資格但 Rules 拒絕時，**重讀一次**成員索引、隊伍與事件再判定：判定改變就以新判定再寫一次，仍拒絕或判定相同即終局；確認「是否已入帳」的讀取遇網路錯誤改回傳 `unconfirmed`（原為終局）。同一筆帳目同時只跑一次（並行呼叫共用同一個 Promise），終局集合在讀取前檢查（Info-3）。
- **補記時機（QA 次要）**：補記改以「隊伍＋是否成團」為鍵，同頁換隊或隊伍成團（招募期間的乘車此時才可入帳）都會再補記一次；成團不會產生新的帳目快照，因此成員快照到達時也檢查。補記一次讀取 context 後重用（Info-3）。
- **畫面次要**：帳目未確認時成員列顯示「本週 —」；只有乘車、貢獻為 0 的已退團成員不再列出；貢獻對照表改用無原型物件（Info-4）。
- **S6 測試**：
  - 新增 `tests/fixtures/contrib-scenarios.json` 共用情境表（6 個情境、22 個檢查點，涵蓋成團平手、創辦人傳非 0、暫停邊界與暫停前乘車補記、補員後近似、已退團者步數與乘車、創辦人退團、Low-1、昨日 23:59:59 補同步）；`contrib-state.test.mjs` 以模擬器跑前端判定，`firestore-rules.test.mjs` 以 Emulator 跑同一份，兩邊並檢查「前端合資格 ⇒ Rules 接受」。
  - 屬性測試擴大為 600 組、兩天、含已退團者（含創辦人退團）與乘車；已知缺口「已退團創辦人在成團前的片段」（讀不到 `events/1`，嘗試一次即終局）明列並略過。
  - 單元測試新增：乘車入隊日界線（在隊、已退團）、暫停邊界的伺服器時間平手、暫停前乘車、已退團創辦人、`visibleWeeks`、`classifyFailure`（錯誤分類）、進度文案（招募中、暫停、待補記、「本週 —」）。為此 `visibleWeeks` 與錯誤分類移到 `contrib-state.ts`（純函式），`views.ts`／`components.ts`／`icons.ts` 的相對匯入加上 `.ts` 副檔名，以便 Node 直接載入。
  - Rules 測試新增：指向不存在事件、他隊隊員讀取本隊帳目、偽造較晚 `occurredAt`、步數事件改報乘車、以隊長轉讓事件冒充入隊、跨週重新入隊後以舊入隊事件回補、已退團者寫入他隊、招募中乘車後取消招募。
  - **Mutation 反證可重跑**：`npm run test:rules:mutation`（`scripts/mutate-contrib-rules.mjs`，經 `test-firestore-rules.ps1 -TestCommand` 在同一個釘選 Emulator 內執行）。每項把弱化後的 Rules 寫到系統暫存資料夾並以 `YOXI_RULES_FILE` 載入，**不修改 `firestore.rules`**；執行前先檢查每個比對樣式恰好出現一次。
- **Info-1 發布核對**：發布清單加入「`membersByUid.memberId` 不得含底線」（`ownContribPath` 以 `_` 切分的前提）。Info-2（新隊員可讀全部歷史帳目）符合讀取矩陣，維持。

**驗證（修正後）**
- `npm test` 73/73（`contrib-state` 18 條）；`npm run test:rules` **81/81**（03C-1 共 22 條：16 條個別測試加 6 個共用情境）；tsc、build 通過；`firestore-debug.log` 無 expressions 訊息。
- **Mutation：37 項，33 項被抓到，4 項為等價變異，0 項意外存活**。等價變異與理由：m03 讀取者索引 `status`（已退團索引的 `teamId` 必為 null）；m13 暫停事件 `type`（暫停中隊伍的最新事件必為造成暫停的 leave）；m15 `everFormed` 與 m16 `events/1.type=='join'` 互為保護（成團由 join 設定、未成團隊伍只會有取消招募且 `everFormed` 為 false；兩者同時拿掉才會放行，已以「招募中乘車後取消招募」測試記錄）。修正過程中首輪新寫的腳本找到 7 項存活（m04、m09、m11、m19、m24、m25 為測試缺口，已補測試；m15、m16 判定為等價）。
- 預覽頁 375 px：進度三個畫面與退團確認無水平溢出，新文案正確顯示。

**審查基準版本（SHA-256，短版覆核用）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `e688eb22a21815da4447d8354ad0d712ca854dc2312643004c3681db5c19a81b` |
| `tests/firestore-rules.test.mjs` | `02683345d76de54d7f742e4af1a3c5005f486590f18f5f0e6d02ac9cdb3e07d6` |
| `tests/fixtures/contrib-scenarios.json` | `4c67b1183b3879e9c3cbf7b3e5080e582916aa730daee47caad680ac7b536ac6` |
| `scripts/mutate-contrib-rules.mjs` | `9b0104e7064b557dc31876c7e1ec15b227ccb0beeb0b8c8258ecf9bac79e503b` |
| `scripts/test-firestore-rules.ps1` | `5ec549741aa6cb350b67ca396c964e8ce41d9d8f1f525e0905e49a8eb589a5ed` |
| `src/team/contrib-state.ts` | `48d1bdc26d5693e1eb821dfa2cd5f70f8f47d67f0bc6321ab98134ba19dc8a97` |
| `src/team/contrib-service.ts` | `43ce34a4f21efa4914a0e9e7f67cd1747578c843828ecd439fcf824f5d92c5e7` |
| `src/team/team-panel.ts` | `f840909c47d430a693cf4fa1f6dd7e6a5d68731ed93911fef617c52ecb0e08c2` |
| `src/team/team-state.ts` | `6a4e055e49304a2a05e37395b5ef199b4883b686d33686d4aed3a8c4fad0f288` |
| `src/main.ts` | `fbeb82bf24339120f5e862e931a0b74b76d6eb8951dc4bda714b8399b7484be9` |
| `src/ui/views.ts` | `eca10edf60f94e142fe28ac416c0541ed8baea691388ccaf9c706a9ecc652ddf` |
| `src/ui/components.ts` | `9e5b730200fdd98aacd5c016344a35c6757b331677d832d5792d93f3b32ff6e0` |
| `src/ui/icons.ts` | `1b4a95f9da2ff7eeea1e1e670876703c190e08fd23c940843a09c5b2e9c18f46` |
| `src/ui-preview.ts` | `802f28f7178bfea9b0b3edcc7fcd89077b877a627a5f48f02089b7c46128b0c7` |
| `src/style.css` | `7d4df42c8c36a266a26a25acf47750d656f4a0ace0f8f6a26591d651544147d5` |
| `tests/contrib-state.test.mjs` | `5bd56d02616759a1178b04da267528a1beeac3e2e8d62dd990429bfd5895d301` |
| `tests/team-state.test.mjs` | `d212d21baf9a37c42239c8c454acc85fe122c0c323ebfe9b31659cd5c923552d` |
| `package.json` | `0ff8ad76707713bc9e4455039157025c007c4860b2d7c46b716e7624137ebd07` |

## 短版覆核（2026-10-02）與後續修正

- **QA（Sonnet）**：S1–S6 與次要項皆判定已修正；乘車日規則 Rules 與前端一致；`npm test` 73/73、`test:rules` 81/81、tsc、build 通過；mutation 腳本不改 `firestore.rules`，4 項等價變異理由成立。**無阻擋**，提出 3 項邊角應修正與 1 項次要。
- **Security（Opus）**：**通過**，無 Critical／High／Medium／Low。以暫存副本（127.0.0.1:8098）跑 85/85（含其新增 4 條 Low-1 測試：週日甲隊乘車、週一入乙隊在隊與已退團皆拒；同日先乘車後入隊仍准；`joinedAt` 為 null 時 fail closed；跨月日期比較）；Rules 與上一版只差新增條件與其註解，拿掉 03C-1 區塊後雜湊等於 01C／03B-UI 基準 `9fb63471…`；最壞路徑仍 8 份文件。2 項 Info。
- **已修正（只改前端與測試腳本，不改 Rules）**：
  - QA A：讀取階段被拒（例如入帳途中剛好退團、讀隊伍事件被拒）不再列為本頁終局，改回 `unconfirmed`，之後以已退團身分補記仍可入帳；只有「寫入被 Rules 拒絕且重讀一次後判定不變」才是終局，格式錯誤仍為終局。
  - QA B：補記整體失敗時，允許下一次觸發（帳目快照、墓碑快照或每日同步）再跑一次（已退團者重設 `leftReconciled`，在隊者重設補記鍵）。
  - QA C：即時入帳改以 `Promise.resolve().then(...)` 呼叫，身分變更時的同步例外也走待補記路徑。
  - QA 次要：停止帳目訂閱時清除補記鍵，同頁重新進入同一隊伍會再補記。
  - Security Info-A：列入已接受風險 7。
  - Security Info-B：`test-firestore-rules.ps1` 跑一般測試前清除 `YOXI_RULES_FILE`；測試檔在使用該變數時印出實際載入的 Rules 路徑。
- **驗證**：tsc、build、`npm test` 73/73、`npm run test:rules` 81/81。Rules 未變（雜湊同上一版 `e688eb22…`），mutation 結果沿用 37 項 33 被抓到、4 項等價。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `e688eb22a21815da4447d8354ad0d712ca854dc2312643004c3681db5c19a81b` |
| `tests/firestore-rules.test.mjs` | `32fbaacc7013415c18c5dfe8f18bf3718644c1c64f6e4ab75b694b33b18ae5b3` |
| `tests/fixtures/contrib-scenarios.json` | `4c67b1183b3879e9c3cbf7b3e5080e582916aa730daee47caad680ac7b536ac6` |
| `scripts/mutate-contrib-rules.mjs` | `9b0104e7064b557dc31876c7e1ec15b227ccb0beeb0b8c8258ecf9bac79e503b` |
| `scripts/test-firestore-rules.ps1` | `f852f7564f2734e08f6cd692b24d9b9683ac279cc0262c9e17433d62da4825d1` |
| `src/team/contrib-state.ts` | `48d1bdc26d5693e1eb821dfa2cd5f70f8f47d67f0bc6321ab98134ba19dc8a97` |
| `src/team/contrib-service.ts` | `b11f91c503b338dc86707dc049f5b1b292a0b4d06c31d409ae692f1009a858aa` |
| `src/team/team-panel.ts` | `9fe3a6622315a0aa7b9bbad4f5d29d109e6feddd9f3aa422d6f3982edc226db3` |
| `src/team/team-state.ts` | `6a4e055e49304a2a05e37395b5ef199b4883b686d33686d4aed3a8c4fad0f288` |
| `src/main.ts` | `fbeb82bf24339120f5e862e931a0b74b76d6eb8951dc4bda714b8399b7484be9` |
| `src/ui/views.ts` | `eca10edf60f94e142fe28ac416c0541ed8baea691388ccaf9c706a9ecc652ddf` |
| `src/ui/components.ts` | `9e5b730200fdd98aacd5c016344a35c6757b331677d832d5792d93f3b32ff6e0` |
| `src/ui/icons.ts` | `1b4a95f9da2ff7eeea1e1e670876703c190e08fd23c940843a09c5b2e9c18f46` |
| `src/ui-preview.ts` | `802f28f7178bfea9b0b3edcc7fcd89077b877a627a5f48f02089b7c46128b0c7` |
| `src/style.css` | `7d4df42c8c36a266a26a25acf47750d656f4a0ace0f8f6a26591d651544147d5` |
| `tests/contrib-state.test.mjs` | `5bd56d02616759a1178b04da267528a1beeac3e2e8d62dd990429bfd5895d301` |
| `tests/team-state.test.mjs` | `d212d21baf9a37c42239c8c454acc85fe122c0c323ebfe9b31659cd5c923552d` |
| `package.json` | `0ff8ad76707713bc9e4455039157025c007c4860b2d7c46b716e7624137ebd07` |
