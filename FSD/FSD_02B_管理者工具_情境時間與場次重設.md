# FSD-02B｜管理者工具：推進情境時間與重設場次

**狀態**：**已上線（2026-10-01）**。QA 與 Security 確認通過（審下表雜湊版本，含 mutation 反證）；產品負責人已發布 Rules、部署 Hosting，並以管理者與一般成員帳號實測 6 項全部正常：管理入口僅管理者可見、推進時間、兩端即時跳出重新載入提示（目測幾乎即時）、重新載入後顯示新時間、手機版面、重設場次。首輪審查：Security 阻擋 C1（既存稽核紀錄可掩護未稽核變更）已修；QA 阻擋 B1（舊場次步數讀寫測試假通過、未驗同日重新領點）與 B2（交易重試時已生效的變更被誤報未變更）已修。本機 Rules Emulator 47/47；Developer mutation 反證 6 項（週 ID、稽核必須存在、新場次 ID 格式、稽核必須本批新建、步數讀取的場次檢查、稽核 ID 與版本一致）皆使對應測試失敗；單元測試 17/17、`tsc`、`build` 通過。前端管理畫面與過期偵測尚未在瀏覽器實測（需新 Rules 發布後以管理者帳號驗證）。雲端未發布。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `cb733e09adece9c22bb3ade40065b83b2426fd1051c6e129c98bc171ce4ac177` |
| `tests/firestore-rules.test.mjs` | `058a327ca277127f41bcaefc8b3001f8ae4b57dffa1b5cdb4c6ac244c96257c6` |
| `src/admin/admin-service.ts` | `9924060e31caab97e1cb97080e83af11a9546ee11582c9e469a529c7b93cb149` |
| `src/admin/admin-panel.ts` | `fc26b8a13e109c875ffb32203c0498f7463f9f84846534c24ef9d7bf8b256399` |
| `src/admin/clock-time.ts` | `47a80a5c5efb233f0e3bd7e7bc4cf1c8659b1145ada58b84d88587e214ea6bcc` |
| `src/main.ts` | `becf93d9231ab319835c8993202f3758c9282a2db673a56acb187e742b47fbcb` |
| `src/showcase/app.ts` | `ff8d6e11fa5cd7794e5cb47024418d41d5600722253a59b8c704344436e2c3f0` |
| `tests/admin-clock.test.mjs` | `4c22dc2760195843fb5d207224159e2a9a51b6b9be428d633c359eb4d24f38c6` |

## 責任

- 負責：管理者在 App 內 (1) 把同一場次的共用情境時間向前推進，並同步更新活動週；(2) 重設展示場次，啟用保證全新的 `sessionId`，讓所有成員從「未組團、零步數」重新開始；(3) 每次變更留下只能建立的稽核紀錄；(4) 所有裝置偵測到時間或場次變更後停止共享操作並提示重新載入。
- 不負責：刪除舊場次資料（PRD 要求不刪）；帳號、`membersByUid`、Rules 發布、Hosting（產品負責人於 Console 執行）；準備隊員資料（裁決 a：延至 FSD-02C）。

## 輸入

- 操作者：FSD-02 驗證的 UID，其 `membersByUid` 為 `active=true`、`role=admin`。
- 推進時間：新的 `scenarioNow`。`activityWeekId` 不由管理者手填，由前端 `activityWeekOf(scenarioNow)` 計算，Rules 另行驗證。
- 重設場次：新場次的起始 `scenarioNow`（可早於舊場次，因為是新版本）。`sessionId` 不由管理者輸入，固定為 `s{新 clockVersion}`。
- **`scenarioNow` 格式收緊**：`^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][+]08:00$`，不收小數秒。固定長度與時區讓字串比較等同時間比較；日期是否合法由 `timestamp.date()` 判定（非法日期會拋錯而被拒）。

## 輸出

| 操作 | `demo/current` 寫入後 | 稽核紀錄 `demoClockLog/{新 clockVersion}` |
|---|---|---|
| 推進時間 | `sessionId` 不變；`scenarioNow` 不早於舊值（允許相同，等於強制全員重新載入）；`activityWeekId` 為其所在週一且不早於舊值；`clockVersion` 加 1 | `kind=advance`、操作者、前後 `sessionId`／`scenarioNow`／`activityWeekId`、`serverRecordedAt=request.time` |
| 重設場次 | `sessionId=s{新 clockVersion}` 且不等於舊值；`scenarioNow` 任意合法值；`activityWeekId` 為其所在週一；`clockVersion` 加 1 | `kind=reset`，欄位同上 |

- 重設後的新場次：`teams`、`teamMembership`、`dailySteps` 在新 `sessionId` 下皆為空，每人重新從未組團開始；舊場次資料保留但不再出現在畫面，也不影響新場次的防重鍵（P16）。純展示模式的本機資料以 `sessionId` 為鍵，也會自動從頭開始（舊鍵會留在 localStorage，影響很小）。
- 管理者自己的裝置提交成功後，同樣因本機情境過期而走下方的重新載入流程。

## 資料擁有者與讀寫權限

| 資料 | 讀 | 寫 |
|---|---|---|
| `demo/current` | active 成員 `get` | 僅 admin：推進或重設，精確 4 欄（`sessionId,scenarioNow,clockVersion,activityWeekId`），必須與同批稽核紀錄一起寫入 |
| `demoClockLog/{clockVersion}` | 僅 admin `get`（依版本號逐筆讀，不可 list） | 僅 admin `create`，文件 ID 等於新 `clockVersion`，與 `demo/current` 同批；不可改寫或刪除 |

## Rules 設計

1. **取代現有規則**：本積木以新規則取代現行 `firestore.rules` 中 `demo/current` 的 update 規則（約第 19–35 行，目前允許管理者推進且不需稽核、不驗週），新增 `demoClockLog/{clockVersion}` 的 match（目前被最後的全拒規則擋下），並改寫 `tests/firestore-rules.test.mjs` 中直接以 `setDoc` 推進時鐘的管理者測試（約第 729–741 行）。其他集合的規則不變。
2. **全新 `sessionId` 的保證**：真正的唯一性來自「`demo/current` 寫入必須讓 `demoClockLog/{新 clockVersion}` 在本批次**新建**（寫入前 `!exists`、寫入後 `existsAfter`），且稽核紀錄只能建立、不能改寫或刪除」——每個版本號只能用一次，所以 `s{N}` 必然唯一。重設分支同時要求 `sessionId != 舊值` 且 `sessionId == 's' + string(新 clockVersion)`。若 Console 把 `clockVersion` 改小到已有紀錄的版本，推進與重設都會被拒（fail closed），不會產生未稽核的變更或重用舊場次；Security 審查發現原本只檢查 `existsAfter` 時，直接呼叫 API 可借用既存紀錄，已修正並有測試。
3. **推進與重設的分流**：`sessionId` 不變 → 推進（情境時間與週 ID 不倒退）；`sessionId` 改變 → 重設（新 ID 格式固定、情境時間可重來）。兩者都要 `clockVersion == 舊值 + 1`、`role == 'admin'`、精確 4 欄、稽核紀錄存在。同一 ID 只能走推進；回到舊格式 ID 被格式擋下；回到用過的 `s{N}` 被稽核紀錄擋下；稽核紀錄的 `kind` 必須與 `sessionId` 是否改變一致。
4. **週 ID 由 Rules 驗證（Architect 已實測可行）**：以 `split` 與 `int()` 解析日期（regex 先限定為純數字，防 `+9` 之類的輸入），用 `timestamp.date(y, m, d)` 建立兩個時間點；`dayOfWeek()` 採 ISO 定義，週一為 1。要求週 ID 的 `dayOfWeek() == 1`，且 `週一 ≤ 情境日期 < 週一 + duration.value(7, 'd')`。實測 15 組案例正確，含週日 23:59、週一 00:00、跨月、閏年、跨年。此驗證同時修補 FSD-03B 指出的「管理者可寫入錯誤週 ID」缺口。
5. **稽核紀錄**：10 欄 `clockVersion,kind,actorMemberId,fromSessionId,toSessionId,fromScenarioNow,toScenarioNow,fromWeekId,toWeekId,serverRecordedAt`。`from*` 以 `get` 對照寫入前的 `demo/current`，`to*` 以 `getAfter` 對照寫入後的值，`actorMemberId` 等於操作者，`serverRecordedAt == request.time`。單獨建立紀錄會因 `demo/current` 未變動而被拒。
6. **Rules 預算**：一筆交易寫 2 份文件；文件存取約 4 次（`membersByUid`、`demo/current` 的 `get` 與 `getAfter`、`demoClockLog` 的 `existsAfter`），上限 20。運算式約 `demo/current` 55 個加稽核紀錄 35 個，遠低於 1000。

## 前端設計

- **單一情境監看器**：在 `main.ts` 層、與畫面模式無關，於 `signIn`／`restoreSession` 成功後啟動，訂閱 `demo/current`。純展示模式與共享模式都會收到變更。
- **過期時的優先順序**：偵測到 `sessionId` 或 `clockVersion` 與登入時不同 → (1) 設定過期旗標；(2) 呼叫 `stopDaily`、`stopTeam`、`stopRoster`；(3) 抑制這些訂閱之後的錯誤回呼訊息（重設後舊場次的監聽會被 Rules 拒絕，不能顯示成「連線中斷」）；(4) 統一顯示「管理者已更新共用時間／場次，請重新載入」並停用共享操作，提供重新載入按鈕。
- **管理畫面獨立**：獨立模組 `src/admin/` 與獨立畫面，不嵌在成員面板中（PRD 第 206 行「控制項與使用者介面分開」）。只有 `role=admin` 的帳號在純展示模式與共享模式的頁首都看得到「管理」入口；入口顯示與否只是介面，權限由 Rules 保證。管理畫面需支援 360 px 手機與桌機（P16）。
- **推進時間**：日期時間輸入與快速鍵（+1 小時、隔天 09:00、下週一 09:00），送出前預覽新時間與週 ID；跨週時提示「將進入新活動週，上週退團鎖定解除」。
- **重設場次**：確認畫面寫明目前場次 ID、新場次 ID、起始時間，以及受影響成員為「全部展示成員（六人）」（裁決 b），需再按一次確認。

## 操作與失敗

- 寫入以交易執行：重讀 `demo/current`，`clockVersion` 與畫面顯示不同 → 中止並提示重新載入。以畫面上的 `clockVersion` 為冪等基準：重送時基準已不同，必定失敗，不會重複推進。
- 錯誤分類：
  - `permission-denied`：明確被拒（非管理者、週 ID 錯誤、時間倒退等），顯示「情境未變更」與可能原因。
  - `aborted`、`unavailable`、`deadline-exceeded` 或回應不明：結果未確認。以伺服器讀取 `demo/current` 判斷是否已生效，不盲目重送。
  - 本機版本不符：先以伺服器讀取判斷是否正是本次寫入已生效（SDK 重試交易時會讀到自己剛提交的結果）；不是才中止並提示重新載入。
  - 目前情境時間若是 Console 寫入的舊格式，管理畫面仍可開啟並提示修正方式，重設路徑可用。
- 已知限制：稽核紀錄不可 list，只能依版本號逐筆查看；管理者看不到其他成員名單（`membersByUid` 只能讀自己）。

## 依賴與跨積木不變式

- FSD-02：`membersByUid` 角色、`demo/current`、`SessionService`。
- `src/team/activity-week.ts`：週 ID 推導，與 Rules 的驗證規則一致。
- 既有 `dailySteps`、`teams`、`teamMembership`、`events`、`gasSpike` Rules：以 `currentSession()` 與 `currentClockVersion()` 拒絕舊場次與過期情境；本積木不改它們。
- **跨積木不變式**：之後所有獎勵類資料（03C 寶箱資格、FSD04 券、寶箱開箱、推薦）都必須以 `sessionId` 作為路徑鍵並檢查 `currentSession()`，否則「重設即隔離」不及於那些資料（PRD 第 208 行）。
- **產品負責人的操作前提**（發布本積木後）：不在 Console 刪除 `demoClockLog`；不在 Console 調小 `clockVersion`（會讓管理者無法推進或重設，需再以 Console 修正）；不在 Console 手動設定符合 `^s[0-9]+$` 的 `sessionId`（保留給 App；Console 若需手動命名，一律使用非 `s` 開頭的前綴）；避免在 Console 直接修改 `demo/current`——Console 寫入不受 Rules 約束，可能寫入任意值或舊格式。發布前確認雲端 `demo/current.scenarioNow` 為 `YYYY-MM-DDTHH:MM:SS+08:00` 格式（2026-10-01 雲端值 `2026-10-01T09:00:00+08:00` 符合）。
- **管理者帳號外流**（Security 評估：中、非阻擋）：影響僅限反覆推進或重設；緩解為在 Console 將該帳號設為 `active=false` 或重設密碼，再以 Console 修正 `demo/current`。

## 驗收

| PRD／驗收 | 預計測試 |
|---|---|
| P26 只有管理者能推進時間或重設場次；前端改角色無效 | 非 admin、inactive、未登入寫入被拒；admin 缺稽核紀錄、稽核欄位不符、單獨建立紀錄被拒；一般成員讀稽核紀錄被拒 |
| D15 同一場次只可向前推進 | 推進時情境時間或週 ID 倒退被拒；`clockVersion` 非加 1 被拒；時間欄位超出範圍（例如 25 時）被拒 |
| P16 重設產生新場次、不刪帳號、不影響其他場次；重設後同日可重新領點、可換人當組長 | 重設後新 ID 為 `s{clockVersion}`；任意 ID、回到舊 ID、版本紀錄已存在時重設被拒；舊場次的步數／隊伍讀寫被拒；新場次可建立今日步數並領點、可由另一人建隊 |
| 週 ID 正確性 | 非週一、與情境日期不同週、非法日期、格式錯誤被拒；跨月、跨年、閏年正確 |
| P16 360 px／桌機 | 管理畫面手動驗證 |
| 各裝置偵測變更 | 前端：`demo/current` 變更後停用操作並提示重新載入；重設後舊場次監聽被拒時不顯示成連線錯誤（手動驗證） |

**邊界**：不刪除舊場次、不提供時間倒退或一般成員可用的任何管理操作。發布後同步修訂 FSD-03B「Rules 無法推導週一」的描述。

## 產品負責人裁決（2026-10-01）

- **a. 準備隊員資料延後**：另立 FSD-02C，排在 FSD-01C 之後（依賴步數片段，且需放寬 `dailySteps` 本人寫入規則並加稽核）。本積木只做推進時間與重設場次。
- **b. 重設前指出受影響成員**：確認畫面以「全部展示成員（六人）」描述，並列出目前場次 ID、新場次 ID 與起始時間；不新增成員名單資料或 Rules。
