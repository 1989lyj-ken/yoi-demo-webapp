# FSD-01C｜每日步數規則收斂＋昨日補同步與補領

**狀態**：契約第 3 版（2026-10-01）。Architect 兩輪附條件通過（已併入）；Security 通過；QA 第二輪（短版確認）通過。**本機審查完成，待產品負責人核准 Rules 發布與新場次啟用**；雲端 Rules 未發布、未部署。實作與審查紀錄見文末。

## 已核定前提（產品負責人，2026-10-01）

1. 每日步數只採「新場次才啟用」的單一格式，不遷移舊資料；前後端移除舊七欄與十欄過渡格式的相容。
2. Rules 預算為契約必填（見「Rules 預算」）。
3. 收斂 `dailySteps` 更新規則，使被拒路徑不再觸及 1000 運算式上限。
4. 步數片段與點數帳本在 01C 一併實作。
5. 今日步數發生時間＝情境當下；昨日補同步發生時間由系統固定為昨日 23:59:59（Asia/Taipei），成員不選、管理者不預設；乘車只能在今日、等於情境當下，不可補到昨日。
6. 欄位收斂為 `rideCompletedAt`、`claimed`。
7. 本人可讀目前場次任何一天（唯讀），寫入只限今日與昨日。
8. 點數總餘額延到獎勵總帳積木；補領提醒只做記步頁固定提醒＋首次進入提示（本機、各裝置一次），鈴鐺通知延後。
9. 準備隊員資料（FSD-02C）、隊友昨日步數與團隊重播（03C）、全勤券（FSD04）、純展示模式不在本契約範圍。

## 責任

對每個 `sessionId＋memberId＋任務日`，其中任務日只能是情境「今日」或「昨日」：同步步數、今日乘車、逐點／全部領取；每次變更在同一原子寫入中留下不可改寫的事件（步數片段與點數帳本）。

## 任務日窗口與截止

- 允許的任務日 D＝`scenarioNow` 的日期（今日）或其前一日（昨日）。D+2 00:00 起 D 不再是昨日，同步與領取全被拒，因此「D+1 24:00 截止」由窗口自然成立，不另算期限。
- Rules 判斷昨日：`let p = taskDate.split('-'); let dts = timestamp.date(int(p[0]), int(p[1]), int(p[2])); dts + duration.value(1,'d') == 今日日期`（今日日期同樣以 `scenarioNow` 的日期三段建立；`timestamp.date` 為三參數寫法）（沿用 02B `weekMatches` 的做法），不以字串運算推算前一日。先判今日（`scenarioNow` 以 `taskDate` 開頭），不成立才評估昨日；昨日分支先以 `validScenarioNow(scenarioNow)` 確保 `split` 解析可靠。
- **非法日期防禦（A3）**：`timestamp.date` 對不存在日期（如 `2026-09-31`）是拋錯或正規化為次月，尚未證實。因此昨日判定須加 `dts.month()==int(p[1]) && dts.day()==int(p[2])`，並以測試證明 `2026-09-31`、`2026-02-29`（非閏年）、`2026-04-31` 在昨日窗口內被拒；**實作第一步**須以 Emulator 實測 `timestamp.date(2026,9,31)` 是拋錯或正規化，以及 `.month()/.day()` 是否可用，若不可用須改用等價防禦（如以 `string()` 反推比對）並回報 Architect；
- **`taskDate` 格式（N1）**：所有寫入路徑（每日文件建立／更新、事件路徑）一律先要求 `taskDate.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`，擋住 `2026-9-30`、`2026-09-030` 等非補零別名（否則 `int()` 會把它們解析為同一天，形成第二份「昨日」文件而重複領點）；測試須含 `2026-9-30` 被拒；否則成員可多建一份「別名昨日」文件而重複領點。
- 前端昨日日期由 `scenarioNow` 的日期以 `Date.UTC` 運算，不使用本機時區。
- 昨日補同步與補領不占今日額度；昨日與今日是兩份獨立文件。

## 資料格式（單一 canonical schema）

### 每日文件 `dailySteps/{sessionId}/members/{memberId}/days/{taskDate}`（固定 10 欄）

| 欄位 | 規則 |
|---|---|
| `sessionId`、`memberId`、`taskDate` | 建立時寫入，之後不可改 |
| `clockVersion` | 每次寫入須等於目前時鐘版本 |
| `rawSteps` | 整數 0–1,000,000，只增不減 |
| `effectiveSteps` | `floor(raw × (rideCompletedAt != null ? 1.5 : 1))`；Rules 以整數式 `eff*2 <= raw*3 < eff*2+2` 驗證，不用浮點 |
| `rideCompletedAt` | `null` 或 `taskDate` 當日 +08:00 時間字串；只能由 `null` 變為情境當下，且只在 `taskDate` 為今日時 |
| `claimed` | 整數 0–3，已領連續點數；只增不減；`claimed×2000 <= effectiveSteps`。取代 `claimedMilestones` 與 `points` |
| `eventSeq` | 最後一筆事件序號，建立時 0，每次變更加 1 |
| `lastSyncedAt` | 等於 `request.time`（前端讀取 pending 快照時為伺服器時間戳佔位：以 `data({serverTimestamps:'estimate'})` 讀取，或接受 `Timestamp｜null`，不得因此誤報格式錯誤）|

完整形狀只在建立時驗證；更新以 `diff().affectedKeys()` 限定可改欄位，並以**明確的 ternary 分流**而非 `||`（B1）：`diff.hasAny(['claimed']) ? 領取 : diff.hasAny(['rideCompletedAt']) ? 乘車 : 步數`，每個分支內 `hasOnly` 自己的欄位集合，對被改欄位驗 `is int` 與範圍；`eventSeq == 舊+1` 三分支共用。`||` 會讓被拒路徑評估全部分支，正是舊規則撞 1000 上限的成因。更新缺欄位會拋錯而拒絕，不另加 `keys().size()==10`。`current`、`membersByUid` 以 `let` 綁一次，不重複 `get`（歸納條件：新場次內禁止以 Console／Admin SDK 手動寫入 `dailySteps`，否則視為資料污染並換場次；同 03B）。

### 事件 `dailySteps/{sessionId}/members/{memberId}/days/{taskDate}/events/{seq}`（固定 11 欄，只能建立）

`sessionId, memberId, taskDate, seq, kind('steps'|'ride'|'claim'), rawDelta, pointsDelta, claimedAfter, occurredAt, syncedAt, clockVersion`

- 文件 ID＝`string(seq)`；`seq >= 1` 且 `seq == getAfter(每日).eventSeq == get(每日).eventSeq + 1`（A1：事件只能與「每日文件恰好前進一格」的寫入同批存在，避免單獨建立孤兒事件，例如對零文件建立事件 0）。
- **驗證責任矩陣（A2）**：
  - 事件規則負責：11 欄固定形狀與型別（`keys().size()==11`＋`hasOnly`、`occurredAt is string`、`rawDelta is int` 等）；`sessionId/memberId/taskDate` 等於路徑；`syncedAt == request.time`；`clockVersion == currentClockVersion()`；各 `kind` 的固定值組合；`exists(每日)`。事件規則不重做視窗與擁有者判斷，因 A1 保證同批每日文件必然變動，每日規則已驗過（此為預算本錢）。
  - 每日規則負責：由 `diff` 決定 `kind` 並與事件一致；`rawDelta == 新rawSteps − 舊`；`pointsDelta == 新claimed − 舊`；各 `kind` 的 `claimedAfter == 新claimed`；`occurredAt`（steps 今日＝情境當下；steps 昨日＝`taskDate+'T23:59:59+08:00'`；ride、claim＝情境當下）。事件不存在時 `getAfter` 評估失敗而拒絕（漏寫事件被擋）。
- `steps`：`rawDelta>0`，`pointsDelta=0`。`ride`：兩者皆 0。`claim`：`rawDelta=0`，`pointsDelta` 1–3，`claimedAfter` 為領後 `claimed`；以「任務日＋第幾點」為唯一入帳鍵由 `claimed` 單調性保證。
- `occurredAt`：steps 今日＝情境當下；steps 昨日＝`D昨日T23:59:59+08:00`（固定）；ride、claim＝情境當下（claim 即「實際領取時間」）。`syncedAt == request.time`（伺服端稽核時間，不得代替 `occurredAt`）。
- 同值重送不產生事件（前端比較後不送；Rules 要求 `rawDelta>0`）。
- 可讀性：僅本人 `get`（依 ID），不 `list`；隊友讀取事件屬 03C。

## 操作與寫入規則

每個操作＝同一交易寫「每日文件＋事件」，文件 Rules 以 `getAfter` 核對事件的 `kind/rawDelta/pointsDelta/claimedAfter/occurredAt`；事件 Rules 驗自身形狀、`seq>=1` 且 `seq == getAfter(每日文件).eventSeq == get(每日文件).eventSeq + 1`（詳下節事件責任矩陣）。更新先以 `diff` 分流：

| 操作 | 任務日 | 可改欄位 | 規則重點 |
|---|---|---|---|
| 建立零文件 | 今日／昨日 | 全 10 欄 | 精確形狀；`rawSteps=effectiveSteps=claimed=eventSeq=0`、`rideCompletedAt=null`；無事件 |
| 同步步數 | 今日／昨日 | `rawSteps, effectiveSteps, eventSeq, lastSyncedAt, clockVersion` | `rawSteps` 嚴格增加；`rawDelta=新−舊`；效步數重算 |
| 乘車 | 僅今日 | `rideCompletedAt, effectiveSteps, eventSeq, lastSyncedAt, clockVersion` | `null→情境當下`；一次性；`effectiveSteps` 依新係數重算；`claimed` 不動 |
| 領取（逐點或全部） | 今日／昨日 | `claimed, eventSeq, lastSyncedAt, clockVersion` | `claimed` 增 1–3 且 `≤ min(3, floor(effectiveSteps/2000))`；增 1＝逐點，增多點＝全部領取；不可跳點、不可回退、不可與步數混合。Rules 不區分逐點與全部領取（「三點皆解鎖卻只 +2」等價於兩次逐點，無安全問題），由前端保證「全部領取」送出完整解鎖數；FSD04 以 `claimedAfter==3 && claimedAfter−pointsDelta<3` 判定第三點觸發，不依賴事件種類。帳本入帳鍵由 `claimed` 單調性推導，非實體鍵 |

並發：兩裝置同時操作時，事件 ID 相同，後者建立失敗，交易重試後再評估；因此重複領點、舊值覆蓋皆被擋下。

## 讀取權限

| 讀者 | 每日文件 | 事件 |
|---|---|---|
| 本人（active、目前場次） | 目前場次任何一天，`get` | `get`，不可 list |
| 同隊且雙方 active（03A／03B 既有 `sameTeamTodayReader`） | 僅今日 `get` | 不可 |
| 其他人、跨場次、未登入 | 不可 | 不可 |

所有集合不可 `list`、不可刪除。Rules 實作上，讀取以獨立 helper `ownerRead`（active、場次、`memberId`、`taskDate` 格式）處理，寫入另用含視窗的 helper，不沿用現行含今日條件的 `dailyOwner`（B3）。同隊隊友可見 `claimed/eventSeq/rideCompletedAt`，屬可接受揭露。

## Rules 預算（必填）

單次請求上限：1000 運算式、讀取文件 20（交易／批次）。以下為設計估計，**實作後以 Emulator 實測（含被拒路徑）確認**，運算式目標每條規則 <300。

| 操作 | 寫入文件 | 存取文件（去重） | 最壞情況 | 接受路徑測試 |
|---|---|---|---|---|
| 建立零文件 | 1 | `membersByUid`、`demo/current`＝2 | 昨日；跨月、跨年（`timestamp.date` 日期運算） | 必備 |
| 同步步數 | 2（每日＋事件） | `membersByUid`、`demo/current`、事件（getAfter）、每日（getAfter）＝約 4 | 昨日、已乘車（×1.5 取整、單數步數）、`rawSteps` 達 1,000,000 | 必備 |
| 乘車 | 2 | 同上，約 4 | 已有步數、已領 1–2 點後乘車 | 必備 |
| 逐點／全部領取 | 2 | 同上，約 4 | 昨日、已乘車、`claimed` 0→3 | 必備 |

- 前提：重用 `let` 綁定 `demo/current` 與 `membersByUid`，避免同一文件反覆展開。
- 驗收時 `firestore-debug.log` 不得出現與這四個操作相關的 1000 expressions 訊息；交易被拒不會出現在日誌，關鍵反向測試須以 `writeBatch` 重建，確認為邏輯拒絕而非撞上限（承 03B 做法）。
- 舊 `gasSpike` 規則不變。

## 前端

- `DailyService`：操作加入 `taskDate`（`today｜yesterday`）；`stateRef` 以任務日定址；`execute` 在同一交易寫文件與事件；錯誤分類比照 03B（前置檢查錯誤直接顯示；`permission-denied/aborted/unavailable/deadline-exceeded`／不明視為「結果未確認」，以 `getDocFromServer` 重讀後才可重送）。
- 零文件建立：維持兩段式（先建零文件再同步，B4 取捨）。前端**不得**進頁自動建立昨日零文件，只在成員按下「補同步昨日」時建立；今日零文件可沿用進頁建立。
- 移除 `parseDaily` 的舊格式容錯；改為嚴格解析新 10 欄格式，**拒絕**舊七欄與十欄文件（含現有雲端場次內的冒煙測試文件）並顯示「資料格式不符，請由管理者重設場次」，不得使畫面崩潰（B5）。`dailyStateDominates` 改用 `rideCompletedAt`、`claimed`、`eventSeq`；`team-service.ts` 的隊友今日步數同步改用新解析。
- 記步頁：「今日」與「昨日」分區。昨日區顯示昨日原始／有效步數、三里程碑（沿用既有領點元件）、「補同步昨日步數」（輸入昨日總步數，不低於目前值；不顯示時間選擇）與截止時間「今日 24:00」。固定提醒在昨日有可領點數時顯示；次日首次進入彈一次提示，以 `localStorage`（鍵含場次、成員、任務日，各裝置各一次，try/catch，無儲存時仍正常）。昨日無資料時顯示「尚無昨日步數，可補同步」。
- 乘車入口僅今日；昨日區不出現乘車。
- 今日與昨日兩份文件各自 `onSnapshot`，各自維護 fail-closed 與 `serverConfirmed`；昨日區獨立 ready。`execute` 的時鐘變更檢查改為「今日與昨日兩個任務日皆不變」。
- 首次進入提示條件：昨日文件經伺服器確認（非 `fromCache`）且 `claimed < min(3, floor(effectiveSteps/2000))`；顯示後即寫入 `localStorage`；儲存不可用時每次進入都顯示（寧可多提示、不漏提示）。
- 冪等：操作為語意冪等（步數同值或較低、已領、已乘車皆不產生事件），因此「結果未確認」重讀後重送安全；`permission-denied` 可能為邏輯拒絕，一律先重讀再判斷。
- 「已逾期」里程碑狀態由前端依截止時間推導，不入庫。
- 受影響檔案（範圍）：`src/daily/*`、`src/team/team-service.ts`、`src/main.ts`（約 119、144–153 行）、`src/ui/views.ts`、`src/ui-preview.ts`、`tests/daily-state.test.mjs`、`tests/firestore-rules.test.mjs`（含 `dailyInitial`）、`firestore.rules`。
- 維持共享畫面 fail-closed：`fromCache`、`hasPendingWrites` 或文件不存在時停用操作並顯示「同步中／未確認」；寫入失敗提示不要盲目重送。
- 純展示模式不改。

## 驗收對應

| PRD | 驗證 |
|---|---|
| P03、P04 | 1,999／2,000／3,999／4,000／5,999／6,000 邊界；未領前點不可領後點；全部領取依序、已領一點只增兩點（`claimed` 計數） |
| P05 | 下修、跨裝置舊值、重複領點、並發雙裝置只入帳一次（事件 ID 衝突）；今日昨日全部領取各限本日 |
| P06 | 昨日可補領至 D+1 24:00；D+2 00:00 拒絕；今日仍有自己三點 |
| P07、P08 | 4,000＋乘車＝6,000；第二次乘車不疊；乘車不可在昨日；今日乘車不影響昨日 |
| P09、§5.3 | 昨日 3,000→4,000 補同步，有效 6,000 並可補領剩餘點數；事件發生時間固定昨日 23:59:59；成員無法指定；同值重送不增事件；單純補領不改步數 |
| P19 | 兩裝置同時領同一點只入帳一次 |
| P26 | 他人不能寫入或讀取；跨場次、錯 `memberId`、錯 `clockVersion` 被拒；同隊隊友僅可讀今日文件 |
| P28（鈴鐺除外，已延後） | 昨日有可補領點數時，固定提醒與首次提示出現；關閉後固定提醒仍在；截止後（D+2）兩處同步消失 |
| Rules 預算 | 上節四個操作的接受路徑與最壞情況測試；`test:rules` 全綠；日誌無相關 1000 訊息 |

### 補充必備測試（Architect 審查）

- **事件反向（皆以 `writeBatch` 重建確認為邏輯拒絕）**：單獨建立事件 0；只更新每日不寫事件；只寫事件不更新每日；`seq` 跳號、ID≠`string(seq)`；`kind` 與 diff 不符；`rawDelta/pointsDelta/claimedAfter` 錯值；重複事件 ID；`syncedAt≠request.time`、`clockVersion` 錯、路徑欄位錯、寫到他人路徑；各 `occurredAt` 錯值（今日≠情境當下、昨日≠23:59:59）。
- **昨日窗口矩陣**：跨月、跨年、閏年／非閏年、`00:00:00` 與 `23:59:59`、D+2 00:00 拒、明日拒、非法日期別名（A3）、`08`／`09` 的 `int()` 解析。
- **時鐘推進**：今日文件推進後成為昨日，乘車拒、同步與領取成功且 `clockVersion` 更新；推進兩日後全拒。
- **領取**：+0、+4、超過解鎖數、移除 `claimed`、與步數混合；昨日已乘車領取；0→3。
- **步數**：昨日已乘車單數取整；浮點被拒；1,000,000 上限；`rawDelta` 錯；`effectiveSteps` ±1。
- **讀取**：本人讀任一天；隊友讀今日可、昨日拒、事件拒；非隊友拒；`list` 拒；舊七欄與十欄文件更新被拒。
- **前端單元測試**：`previousDay`（跨月、跨年、閏年）、嚴格 `parseDaily`（pending、舊格式拒絕）、`dailyStateDominates` 含 `eventSeq`、首次提示（localStorage 不可用）、結果未確認後重讀再重送。

## 交接 03C／FSD04（不在本契約實作）

- 步數片段＝`kind='steps'` 事件，欄位 `occurredAt/syncedAt/rawDelta/seq`。03C 須以 `occurredAt`（再以同一文件的 `seq`）排序重播，**不可用寫入順序**。01C 不提供跨成員、跨團隊的全場次 `eventOrder`，由 03C 定義。
- 乘車生效時點＝每日文件 `rideCompletedAt`（亦有 `ride` 事件）。
- 昨日補同步片段固定 23:59:59，故昨日才入團者補同步的步數會計入團隊（產品負責人已接受此邊角誤差；展示版不提供反作弊）。
- 第三點狀態＝`claimed == 3`，FSD04 可讀；第三點領取**時間**只存在事件，需逐筆 `get` 本人事件。
- **03C 必須擴充 Rules**：隊友可 `get` 本隊成員的事件與本週過往文件（事件 ID 為連續整數，逐筆 `get`，無需 `list`）。01C 不可假設事件可被隊友讀。
- P25 展示重現（草案，03C 定稿）：管理者推進到下一日後，由成員補同步昨日步數，團隊貢獻以昨日 23:59:59 計入；週日資料於週一補同步時歸上一週。

## 啟用與邊界

- 與 FSD-02B 管理者「重設場次」同一時段由產品負責人執行：發布新 `firestore.rules` → 重設場次（新 `s{N}`）→ 部署 Hosting，三步緊接完成。**此段時間展示不可用**（Rules 發布後、Hosting 更新前，舊前端寫入會被拒；現場舊格式文件也讀不進新前端）。舊場次資料保留，新場次內不得手動寫入 `dailySteps`。
- 不執行任何雲端操作；本機驗證後交付 Rules 與操作清單。
- 不宣稱：跨裝置一秒同步、點數總餘額、鈴鐺通知、團隊貢獻已完成。

## 待 Architect 審查的重點

1. 以 `claimed` 單一計數取代 `claimedMilestones`＋`points`，逐點與全部領取合併為同一規則，是否足以保證防重與連續性。
2. 事件 ID＝`seq` 的並發序列化（事件 `create` 與每日文件 `getAfter` 互相核對）是否可靠，以及事件規則只驗形狀與 `eventSeq` 連結是否足夠。
3. 昨日判定（`timestamp.date` 加減 1 日）、跨月／跨年、情境時間剛好 00:00:00 的行為。
4. 預算估計（約 4 文件、每條 <300 運算式）是否合理，需否改以其他分流。
5. 建立零文件允許昨日，是否有被濫用建立無步數文件的風險（只限本人、零值、單一路徑）。

## 實作紀錄（2026-10-01，本機）

- **前置實測（A3）**：Emulator 1.22.0 實測 `timestamp.date(y,m,d)` 對 2026-09-31、2026-02-29（非閏年）、2026-04-31、月 13／0、2026-02-30 皆**拋錯而拒絕**（不正規化），2028-02-29 成立；`.month()/.day()` 可用。`int()` 接受 `'+9'`、`'030'`、`'09'`，證實 N1 正規式為必要。Rules 仍保留月日往返檢查作縱深防禦。
- **驗證結果**：`npm run test:rules` 52/52（01C 13 條新測試＋既有 39 條；03A／03B／02B 測試改用新每日格式）；`firestore-debug.log` 本輪無任何 expressions 上限訊息（舊規則每次被拒皆有）；`npm test` 34/34；`npx tsc --noEmit`、`npm run build` 通過。
- **Mutation 反證**（每次只削弱一條規則、只跑 01C 測試）：移除事件與每日文件連結（A1）、移除 `taskDate` 正規式（N1）、移除乘車限今日、移除領取門檻、放寬昨日 `occurredAt`、移除 `claimedAfter` 核對，6 項皆使對應測試失敗；Rules 已還原（雜湊比對一致）。
- **與契約的差異**：事件規則額外驗 `actorMemberId()==memberId`（比契約更嚴，成本為已快取的同一文件讀取）；`claimAllTx` 並發測試以交易模擬兩裝置，Emulator 下敗方可能收到 `permission-denied`，前端一律視為「結果未確認」並重讀。
- **前端**：`src/daily/daily-state.ts`（嚴格解析、昨日日期 UTC 運算、以 `eventSeq` 判定新舊，不再比較 `clockVersion`）、`src/daily/daily-service.ts`（任務日定址、文件＋事件同交易、未確認錯誤分類與 `refresh`）、`src/main.ts`（今日／昨日兩個獨立面板、昨日固定提醒與本機一次性首次提示）、`src/ui/views.ts`、`src/ui-preview.ts`（新增「昨日補領首次提示」預覽）。`team-service.ts` 未改動（沿用新解析）。預覽頁 375 px 無水平溢出、無主控台錯誤；**未以真實 Firebase 登入實測**（需新 Rules 發布與重設場次後由產品負責人驗證）。

## QA／Security 第一輪（2026-10-01）與決定

- **Security：通過**（53 個直接呼叫 API 的攻擊案例皆符合預期；日誌無運算式上限訊息）。**QA：附條件通過**：12 項 mutation 中 10 項存活，代表規則存在但無測試證明；已補反向測試並重跑 mutation（結果見下）。
- **產品負責人裁決（2026-10-01）**：隊友帳號 `membersByUid.active=false` 時，同隊成員**仍可讀**其今日步數，維持 03A／03B 語意（「雙方 active」指隊伍狀態）。理由：App 內無停用帳號流程，僅產品負責人可於 Console 設定；被讀內容為隊友今日模擬步數，敏感度低；擋讀會讓隊伍名單整體訂閱失敗，使同隊其他人團隊畫面中斷；並需改動已發布的 03B 規則。若日後支援停用帳號，應設計為管理者操作並同時移出隊伍，列入 **FSD-02C 待辦**。
- **歸納前提納入操作清單（Security 建議）**：新場次內不得以 Console／Admin SDK 寫入 `dailySteps` 或其 `events`；若預先放入事件，每日文件可前進一格而不新增帳本紀錄。若曾手動寫入，視為資料污染並重設場次。
- **縱深防禦說明**：事件建立規則本身也要求 `activeMember()`、`currentSession`、本人，因此只移除每日更新規則的身分條件時，寫入仍會被事件規則擋下；mutation 驗證時兩處一併移除。
- **人工驗收（無自動測試，需於新 Rules 發布後以真實帳號驗證）**：(1) 今日進頁自動建立零文件、昨日只在按下補同步時建立；(2) 寫入結果未確認時顯示訊息並以伺服器重讀更新畫面，重送不重複入帳；(3) 首次提示只在昨日第一次伺服器確認時評估，補同步後不會才跳出；(4) 時鐘推進時固定提醒與首次提示隨重新載入覆蓋層一起消失；(5) 舊格式文件顯示「請由管理者重設場次」。首次提示的判斷（鍵、一次、儲存不可用）已抽成純函式並有單元測試。
- **前端修正**：同值、已領、已乘車的操作顯示「沒有變更，未寫入」；昨日步數輸入無效或下修時在前端直接擋下，不建立零文件；非「結果未確認」的 SDK 錯誤與訂閱錯誤改為固定中文訊息；訂閱回呼只在解析時捕捉錯誤，渲染錯誤不再被誤報為資料格式錯誤。

- **第一輪修正後驗證**：`npm run test:rules` 59/59（01C 20 條）；`npm test` 36/36；`tsc`、`build` 通過。Mutation 18 項（QA 存活的 10 項：`claimed<=3`、每日 `clockVersion`、乘車一次、`lastSyncedAt`、更新身分〔每日與事件兩處一併移除〕、讀取 active、讀取場次、事件 `sessionId`、乘車事件 `occurredAt`、步數事件 `pointsDelta`，另加乘車事件 `rawDelta`／`pointsDelta`，以及原 6 項）**全部被測試抓到**；Rules 未改動，雜湊與第一輪相同。

- **QA 第二輪（短版確認）：通過**。第一輪 7 項阻擋皆已解決；QA 另做 30 項 mutation，28 項被測試抓到，1 項為產生腳本錯誤（修正後重跑變紅），1 項存活為**等價變異**（每日規則的 `eventSeq == 舊+1` 放寬為 `>`，因事件規則已強制 `getAfter == get + 1`，屬冗餘縱深防禦）。`test:rules` 59/59、`npm test` 36/36、tsc、build 通過，日誌無運算式上限訊息。
- **補入人工驗收（QA 非阻擋建議）**：(6) 首次提示在每次載入頁面只評估一次；若首次評估時昨日文件不存在或無可領點數，該頁面生命週期內不再提示（仍有固定提醒），屬已接受的產品語意；(7) 提示遮罩未關閉就切換到純展示模式再回來時，確認遮罩不殘留（後續細修可在 `stopSharedSubscriptions` 一併移除 `#yesterday-prompt`）。

**審查基準版本（SHA-256，QA 第一輪修正後）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `9fb634715c473a1a85b8233d58e42a9b070c70509b0df166da78fab430e38a2d`（未變） |
| `tests/firestore-rules.test.mjs` | `beb025ec4af7a76c5755af001afb329028e99be965e4067377462eebd88b6720` |
| `src/daily/daily-service.ts` | `219c8cc54b696da5a64e724b7f8028998166b8a12c2b95b318f37e20fd35c0dd` |
| `src/daily/daily-state.ts` | `4e5c43bb5fdd1a98840e1bd1be6c86a24f66522227e5c89c57ea3807d0b8c987`（未變） |
| `src/daily/yesterday-prompt.ts` | `187c93d5dda57c35b02ff0076d6de4abee0be1d11283e2ac938196f61fed166e`（新增） |
| `src/main.ts` | `051dd2e2c9ef4289d1051a2793b209d051d45ae0e40f1edaa8aab220d629610f` |
| `src/ui/views.ts` | `33c15129c1723a6258b7c3cb66070e7d6f5e1122636630a13d04389600ad9ee9`（未變） |
| `src/ui-preview.ts` | `6e0e3573349cfc8e7c5cd970e51eec124a805c6692d445dda99f959fde359a5d`（未變） |
| `tests/daily-state.test.mjs` | `5082b83953edb5a7b32fe936943d6e567ced2c96d693cfbf701628bf9a747e36` |

**2026-10-01 追記（03B-UI 審查發現）**：`src/daily/daily-service.ts` 的錯誤辨識原用 `instanceof FirestoreError`，在實測的 SDK 建置下不成立，會使「結果未確認→重讀」與固定中文錯誤訊息失效。已改用 `src/firebase/error-kind.ts` 的 `isFirebaseError`（鴨子型別）。**該檔雜湊因此變為** `ffc940c4815417af3145f935173b71173e76081bef66349b7cad0daff1362701`，與上表（QA 第一輪修正後）不同；Rules 與其他 01C 檔未動。此為小幅強化，建議 QA 做一次針對該檔的短版確認。
