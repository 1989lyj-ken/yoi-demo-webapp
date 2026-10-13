# FSD-03B｜退團、週鎖定與隊長交接

**狀態**：Architect 回溯審查阻擋項已修；Security 審查通過（無阻擋項）；QA 的 2 項阻擋（封存隊伍加入假通過、P11 缺測試）已補，並依 QA／Security 共同建議將 `canJoin` 改為缺週 ID 時 fail closed。本機 Rules Emulator 43/43 通過（連續兩次），`tsc`、`npm test`、`build` 通過。**QA 確認通過（2026-10-01，審下表雜湊版本，含 mutation 反證）**；三方審查完成。**2026-10-01 產品負責人已發布本版 Rules、啟用新場次 `yoi-2026-10-01` 並部署 Hosting；雲端冒煙測試通過**（03A 建隊／加入／同隊互看與權限隔離；退團／轉讓無 UI 入口，雲端未實測，僅有 Emulator 驗證）。UI 尚未開放退團／轉讓入口；雲端 Rules 未發布、雲端資料未變更，真實跨裝置未驗證。

**審查基準版本（SHA-256，2026-09-30 修正後）**：專案非 git repo，覆核以此確認審同一版本。Security 審的前一版 Rules（`d5f8eaf8…74ab`）與本版的差異僅 `canJoin` 一處（缺 `activityWeekId` 時，已鎖週的 tombstone 不可建隊／加入）。

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `9ed2dfd265806a8bee2c322d93d3fae5838a150754419ff65d98cbc9fb718676` |
| `src/team/team-service.ts` | `37873cbdada83971b65e7dbfb07b6590770f49443f91bc73ec63623132194ff7` |
| `tests/firestore-rules.test.mjs` | `5d31aed61158d304cf635ebdda510590deb25d133a69cd507252bea8b8da3beb` |

QA 覆核（2026-10-01）後補強：封存隊伍測試改以「名單非空的 archived 隊伍」單獨驗證 status 檢查；跨場次建隊改為完整建隊批次，只剩場次檢查能擋。兩者皆以 mutation 反證（移除對應 Rules 條件時該測試失敗）。Rules 未再變動。

## 產品負責人裁決紀錄（2026-09-30）

1. `demo/current.activityWeekId` 為共享活動週 ID（Asia/Taipei 週一日期）。
2. 隊伍與成員索引採「新場次才啟用」單一 canonical schema，不遷移舊場次資料。
3. 已成團後暫停（剩 1 人）的隊伍，其成員退出仍鎖週；是否放寬待 03C 有當週貢獻資料後再檢視。
4. 每日步數資料同樣採「新場次才啟用」單一格式；實作屬後續 daily Rules 收斂積木，不在本切片。

## 責任

- 負責：成員本人退團、唯一招募者取消招募、正式隊伍退團後的當週鎖定、隊長退出自動接任、現任隊長轉讓，以及退團後撤銷與原隊友互讀今日步數。
- 不負責：歷史貢獻、當週貢獻保留、寶箱名單與補同步（03C）；退團／轉讓 UI 入口（另一切片）；隊長主動解散或移除他人（首版不做）。

## 輸入

- 由 FSD-02 驗證的 UID 對應固定 `memberId`；`demo/current` 的 `sessionId`、`scenarioNow`、`clockVersion`、`activityWeekId`。
- 操作：本人退團／取消招募（無參數）；轉讓的目標 `memberId`，只能取自伺服器確認後的 `team.memberIds`。
- `activityWeekId` 由管理者隨情境時間同時維護；前端以 `requireActivityWeek`（`src/team/activity-week.ts`）核對其為 `scenarioNow` 所在週一，不一致或缺少時拒絕 03B 操作。Rules 以 `demo/current` 的值作權威週鎖定，但無法從 ISO 字串推導星期一，不可宣稱能防止管理者輸入錯誤週 ID。管理者以單一寫入更新 `scenarioNow`、`activityWeekId`、`clockVersion`：僅 `role=admin`、欄位精確、時鐘加一、情境時間與週 ID 不倒退、不可改 `sessionId`。

## 輸出

每個操作成功只代表交易已提交；畫面須等 `subscribeMembership` 收到伺服器快照（非快取、無 pending）才顯示成功。

| 操作 | 隊伍文件 | 成員索引 | 事件 `events/{revision}` |
|---|---|---|---|
| 建隊（03A） | 新建 `recruiting`、`memberIds=[本人]`、`revision=0`、`nextJoinOrder=1` | `active`、`joinOrder=0` | 無 |
| 加入（03A） | 名單末端加本人、`active`、`everFormed=true`、`nextJoinOrder+1`、`revision+1` | `active`、`joinOrder`=原 `nextJoinOrder` | `join` |
| 正式隊伍退團 | 移除本人；剩 2–5 人 `active`、1 人 `paused`、0 人 `archived`（隊長 null）；`revision+1` | `left`、`teamId=null`、`leftTeamId`、`leftWeekId`=當週、`leftAt` | `leave` |
| 取消招募 | `archived`、隊長 null、`revision+1` | `left`、`leftWeekId=null` | `cancelRecruiting` |
| 轉讓隊長 | 只改 `leaderMemberId`、`revision+1` | 不變 | `transferCaptain`（target=新隊長） |

UI 可見狀態：招募中、已成團、未滿兩人・暫停、封存；隊長標示；「結果未確認，請重新讀取」。

## 資料擁有者

| 資料 | 擁有者／寫入者 | 寫入路徑 |
|---|---|---|
| `membersByUid/{uid}` | 產品負責人（Console） | App 不可寫 |
| `demo/current` | 管理者；換場次由產品負責人在 Console 執行 | App 僅允許管理者推進時鐘與週 ID |
| `teams/{sessionId}/items/{teamId}` | 共享端 | 只能經建隊、加入、退團、轉讓四條 Rules 路徑 |
| `teamMembership/{sessionId}/members/{memberId}` | 成員本人 | 只能與上述隊伍操作同交易寫入 |
| `teams/.../events/{revision}` | 操作者 | 只能新增，與隊伍 `revision+1` 同交易 |
| `dailySteps/.../days/{taskDate}` | 成員本人（FSD-01） | 隊友只能 `get` |

## 資料格式

- **單一 schema**：Rules 只承認下列格式；03A 舊五欄索引、缺 `everFormed/nextJoinOrder/revision` 的隊伍及 `teamCodes` 不被承認。
- 成員索引固定 10 欄：`sessionId,memberId,teamId,joinOrder,clockVersion,status,joinedAt,leftTeamId,leftWeekId,leftAt`。在隊為 `active`；退出為 tombstone（`left`、`teamId=null`），不刪除；之後建隊或加入以同路徑原子更新。
- 隊伍固定 11 欄：`sessionId,teamId,leaderMemberId,memberIds,inviteCode,status,clockVersion,createdAt,everFormed,nextJoinOrder,revision`，`inviteCode==teamId`（16 碼大寫十六進位）。`memberIds` 始終維持加入先後，退出只移除本人、不重排其餘成員。
- 事件固定 9 欄：`sessionId,teamId,revision,type,actorMemberId,targetMemberId,effectiveAt,serverRecordedAt,activityWeekId`；`effectiveAt`=目前情境時間，`serverRecordedAt`=`request.time`。只能建立，不可改寫、刪除或列舉；同一隊伍依 `revision` 穩定排序。03B 不宣稱跨團隊及步數事件已有全場次順序（03C 補足）。
- `clockVersion` 表示最後寫入時的時鐘，不代表資料是否有效：既存值可早於目前時鐘（管理者推進時鐘後仍可退團／回隊），新寫入值必須等於目前時鐘；讀取端不可因數值較舊視為無效。

## 驗證責任分工（Rules 預算）

為避開 Firestore Rules 單次請求 1000 運算式上限：

- 每份文件只在自己的 match 驗完整形狀。成員索引與事件各自驗證全部欄位；隊伍完整形狀只在建立時驗證，更新以 `diff().affectedKeys()` 限定只能變動 `leaderMemberId,memberIds,status,clockVersion,everFormed,nextJoinOrder,revision`，其餘 4 欄不可增刪改，`revision` 每次加一。
- 隊伍規則只核對同交易的連結欄位：建隊／加入核對索引 `teamId`；退團核對索引 `status/leftTeamId/leftWeekId` 與事件 `type/targetMemberId`；轉讓核對事件 `type/targetMemberId`。
- 交易規模：加入、退團各寫 3 份文件（隊伍、索引、事件），轉讓寫 2 份；讀取不重複文件約 7 份（上限 20）。最壞情況（5 人名單）已有接受路徑測試。
- **前提（歸納條件）**：隊伍文件的形狀只由建立時驗證保證，因此新場次必須從空集合開始，且新場次內禁止以 Console 或 Admin SDK 手動寫入 `teams`、`teamMembership`、`events`；若曾手動寫入，視為資料污染並換場次。

## 讀取權限矩陣（皆需 active 成員且為目前場次）

| 讀取者 | 隊伍文件 `get` | 成員索引 | 事件 `get` | 隊友今日 `dailySteps` |
|---|---|---|---|---|
| 現任隊員 | 可 | 只可讀自己的 | 可（本隊） | 可（雙方皆 active 且同隊） |
| 已退團者 | **可，隊伍未封存時**（邀請碼即 teamId，看得到名單與隊長） | 只可讀自己的 | 不可 | 不可（雙向） |
| 持有邀請碼的非隊員 | 可，未封存時 | 只可讀自己的 | 不可 | 不可 |
| 封存隊伍 | 非成員不可讀（成員已為 0） | — | — | — |

所有集合皆不可 `list`；非目前場次、未登入、inactive 一律拒絕。已讀過的離線資料無法遠端抹除。「已退團者仍可讀未封存隊伍」請 Security 判定是否可接受。

## 操作與失敗

- 取消招募：只限唯一招募者本人；隊伍封存，索引無週鎖定；可立即另建新碼隊伍。封存隊伍不可再加入，不重用原邀請碼。
- 本人退團：若原隊已成團（含暫停中），記錄本週鎖定；當週不得建立招募或加入任何隊伍，下週一 `activityWeekId` 更新後解除。退團前確認「已貢獻保留、當週不能換隊、未取得的寶箱資格可能失去」。
- 隊長退出：由退出後名單首位（最早加入且仍在隊）接任。加入序號由 `nextJoinOrder` 嚴格遞增，不會出現同時加入，因此不需另設平手規則。現任隊長可轉讓給其他現有成員，原隊長留隊；新隊長可再轉讓。隊長不可移出其他成員。
- **錯誤分類與重試**：
  - 前端前置檢查拋出的錯誤（如「你已退出隊伍」「只有現任隊長可轉讓」）：未送出寫入，直接顯示。
  - `permission-denied`、`aborted`、`unavailable`、`deadline-exceeded` 或回應不明：一律視為「結果未確認」，以 `getDocFromServer` 重讀成員索引與隊伍後判斷是否已生效。只有確認未生效且前置條件仍成立時才可重送。
  - Emulator 實測：並發退團與轉讓時，敗方可能收到 `permission-denied`（以勝方新狀態評估其舊資料寫入）而非自動重試；最終狀態仍只有一位有效隊長。正式環境可能改回 `aborted` 並自動重試，上述處理不依賴環境。
  - 冪等：成功後重送會因索引已為 `left` 或已不在名單而被拒，屬預期。
  - **開放退團／轉讓 UI 前**，`team-service.ts` 必須先實作上述錯誤轉換與重讀（目前錯誤原樣拋出）。
- `activityWeekId` 不存在、情境時間或場次變動時操作失敗，不顯示成功。缺週 ID 時 Rules 拒絕退團、轉讓，以及所有 `leftWeekId` 有值的成員（含上週鎖定、本週本應解鎖者，因無法判斷週別）的建隊／加入；從未入隊或招募取消（`leftWeekId=null`）的成員仍可建隊／加入，不阻斷 03A 體驗。
- 前端停止已退出隊伍的隊友步數訂閱並清除顯示。

## 依賴

- FSD-02：`membersByUid` 身分對應、`demo/current` 場次與時鐘。
- FSD-03A：建隊／加入使用同一 schema，加入時同交易寫 `join` 事件。
- FSD-01B：`dailySteps` 今日文件與同隊讀取規則（`sameTeamTodayReader`）。
- `src/team/activity-week.ts`：週 ID 推導與核對。
- 管理者推進時鐘：`src/` 尚無管理工具，目前只能由管理者或產品負責人在 Console 手動更新 `demo/current`。
- 新場次啟用流程（下節），由產品負責人執行。

## 新場次啟用檢查清單（產品負責人執行）

1. QA／Security 審查通過、產品負責人核准 Rules 發布。
2. 選一個從未使用過的新 `sessionId`，確認 `teams/{新 sessionId}`、`teamMembership/{新 sessionId}`、`dailySteps/{新 sessionId}` 皆為空。
3. 同一時段內：發布 `firestore.rules`；在 Console 將 `demo/current` 改為新 `sessionId`、`clockVersion` 加一、補上 `activityWeekId`（當週週一）。期間不讓成員操作。
4. 舊場次資料保留不刪。新場次內不得手動寫入隊伍、成員索引或事件。

## 驗收對應

| PRD／驗收 | 測試（`tests/firestore-rules.test.mjs`） |
|---|---|
| P11 一人招募、兩人成團、第六人拒絕、加入他隊前須先取消 | `team: create…`、`team: join by exact code…`、`team: sixth member…`、`team: concurrent claims for the fifth seat…`、`P11: a member already in a team or holding an open recruiting team cannot join another team` |
| P20 退團、補員、剩一人暫停、跨週保留、跨週換隊（本切片部分） | `03B: formed-team leave hands over captain…`、`03B: a paused team resumes…`、`03B: cancelling a recruiting team…`、`03B: week lock survives a mid-week clock advance…`、`03B: next Monday also unlocks creating a new team`、`03B: formed-team leave cannot forge the tombstone…`、`03B: a tombstone cannot be rewritten…`、`team: an archived team rejects a direct join write…` |
| P23 隊長退出接任、轉讓後新隊長可再轉讓 | `03B: only the current captain transfers…`、`03B: worst-case five-member team…`、`03B: concurrent transfer and leave…` |
| P26 A 不能改 B、同隊互看、只有管理者推進時間 | `daily: only active same-team members…`、`03B: formed-team leave hands over captain…`（退團後雙向不可讀）、`03B: only an admin advances demo clock…`；重設場次只能由 Console 換 `sessionId`，Rules 不允許 App 改 `sessionId` |
| 讀取權限矩陣、跨場次 | `03B: read matrix — former members read only unarchived teams, events stay team-private, other sessions are closed` |
| fail closed | `03B: leave and transfer fail closed without demo/current.activityWeekId`、`03B: a week-locked member stays locked when activityWeekId is missing…`、`03B: team events are create-only…` |

歷史步數、當週貢獻保留、寶箱名單與補同步由 03C 處理，本切片不可宣稱完整通過 P20。

**邊界**：首版不加入隊長主動解散或移除其他成員的操作。券、寶箱、邀請獎勵不在本切片。
