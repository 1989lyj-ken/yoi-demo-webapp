# FSD-03E 隊伍命名

**狀態**：契約第 4 版（2026-10-05）。Q1–Q5 已裁決；Architect 兩輪附條件通過（第 3 版修訂＋短版確認），文字矛盾已修正；與 FSD-04B 合併為同一次 Rules 審查與發布。**需新增 Rules 區塊、不需重設場次**；發布 Rules 由產品負責人執行。可交 Developer 實作。

## 需求

隊伍可以設定自己的名稱，顯示在團隊頁橫幅／進度卡標題（08A-3、08A-6）並即時同步給所有隊員。未命名時顯示「（目前隊長名稱）的步行小隊」（未確認時「我的步行小隊」）。

## 產品負責人裁決（2026-10-04：Q1–Q5 全部照建議）

| # | 裁決 |
|---|---|
| Q1 | 只有**現任隊長**可以改隊名；隊長交接後由新隊長管理 |
| Q2 | 隨時可改、不限次數 |
| Q3 | 1–12 個字、不可全空白；不檢查重複、不做敏感字過濾 |
| Q4 | 招募中（1 人）也可取名 |
| Q5 | 08A-3 先上線；03E 審查通過後另一次發布 Rules＋前端 |

## 資料（新集合，不改 `teams` 文件）

`teamNames/{sessionId}/items/{teamId}`：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `sessionId` | string | 必須等於路徑 |
| `teamId` | string | 必須等於路徑，`^[A-F0-9]{16}$` |
| `name` | string | 去除首尾空白後 1–12 字；Rules 以 B2 正規式驗證（首尾不可為空白／分隔字元、不可含控制字元）＋`size() <= 12`（計數單位依 B3 實測） |
| `updatedBy` | string | 必須等於寫入者的 `memberId` |
| `updatedAt` | timestamp | `== request.time` |
| `clockVersion` | int | 必須等於 `demo/current.clockVersion` |

- 一隊一份文件；命名＝建立，改名＝更新（覆寫同欄位）。不允許刪除；隊伍封存後保留但不可再改。
- **為什麼不放在 `teams` 文件**：隊伍規則接近 1000-expression 上限（03B 經驗），`teamShape`／`teamUpdateBase` 不加欄位。

## Rules（新增獨立區塊，以 `FSD-03E >>> / <<<` 標記；移除區塊即回到 `70acb267…`）

```
match /teamNames/{sessionId}/items/{teamId} {
  allow get: if activeMember() && currentSession(sessionId) && teamMemberNow(sessionId, teamId);
  allow list, delete: if false;
  allow create, update: if activeMember() && currentSession(sessionId)
    && teamLeaderNow(sessionId, teamId)          // 隊伍存在、status in [recruiting, active, paused]、leaderMemberId == actorMemberId()
    && teamNameShape(request.resource.data, sessionId, teamId);
}
```

- `teamMemberNow`：`teams/{sessionId}/items/{teamId}` 存在且 `memberIds.hasAll([actorMemberId()])`。
- `teamLeaderNow`：同上文件存在、`status in ['recruiting','active','paused']`（條件 2）、`leaderMemberId == actorMemberId()`。
- `teamNameShape`：`keys().hasOnly([...6 欄])` 且 `size() == 6`；路徑一致；`name is string && name.size() <= 12 && name.matches(<B2 正規式>)`；`updatedBy == actorMemberId()`；`updatedAt == request.time`；`clockVersion == currentClockVersion()`。
- 不需跨文件原子交易（隊名不影響獎勵與資格）。
- **字數**：見 B3（Emulator 實測釘住計數單位，前端用同一單位）。
- **Rules 預算**：見條件 9（寫入只評估 `teamLeaderNow`、讀取只評估 `teamMemberNow`；讀 3 份文件）。

## 前端

- `src/team/team-name-service.ts`：`subscribe(session, teamId, cb)`（只採 `exists && !fromCache && !hasPendingWrites`）與 `save(session, teamId, name)`（見 B1：`runTransaction`，讀取階段失敗＝前置條件不符，提交階段可能已生效才算未確認並以 `getDocFromServer` 比對，不自動重送）。
- `team-panel.ts`：隊伍存在時訂閱隊名；換隊／退隊時取消訂閱。標題＝已確認隊名 ?? `teamTitleOf(...)`（C5 規則不變）。
- **編輯**：只有現任隊長看到標題旁的「編輯」按鈕 → 沿用團隊對話框樣式的小視窗（輸入框、字數提示「1–12 個字」、「儲存」「取消」）。儲存中停用；成功關閉；失敗留在視窗並顯示原因（不是隊長、隊伍已封存、名稱不符、連線問題「結果未確認，請勿重送」）。前端檢查：去除前後空白後 1–12 字、不可全空白。
- 對話框併入既有覆蓋層互斥（團隊對話框守衛、外殼 `overlayOpen`、昨日提示與恭喜延後）。
- 名稱一律跳脫，只放元素內容，不進屬性。

## 測試

- Rules Emulator（`tests/firestore-rules.test.mjs` 新增）：隊長可建立／改名；隊員不可寫；非隊員不可讀；封存隊伍不可寫；他場次、clockVersion 不符、多欄位、缺欄位、0 字、13 字、前後空白、全空白、`updatedBy` 冒名、`updatedAt` 非 request.time 皆拒；`list`、`delete` 拒；隊長交接後原隊長不可寫、新隊長可寫。
- mutation：新增 `scripts/mutate-team-name-rules.mjs`，只對 03E 區塊做變異（依「只重跑有變動的積木」）。
- 單元：名稱檢查純函式（trim、1–12、全空白）、標題選擇（已確認隊名優先）。
- `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run test:rules`；確認移除 03E 區塊後 Rules 與 `70acb267…` 一致。

## 發布

1. 產品負責人在 Console 發布新 Rules（雜湊以審查結果為準）。
2. 再部署前端（舊前端在新 Rules 下不受影響；新前端在舊 Rules 下讀不到隊名，退回替代標題，不會出錯）。
3. **不需重設場次**；回復時先回前端、再回 Rules。

## 驗收

1. 隊長在團隊頁看到「編輯」，輸入隊名儲存後，橫幅標題變成隊名；另一隊員裝置自動更新。
2. 隊員看不到「編輯」。
3. 0 字、全空白、13 字被擋並提示。
4. 更換隊長後，新隊長可改名，原隊長的「編輯」消失。
5. 未命名隊伍顯示「（隊長名稱）的步行小隊」。

## 第 3 版修訂：Architect 審查（2026-10-05，Opus）附條件通過，已併入

### 阻擋項修訂
- **B1 寫入方式**：`save` 沿用 `TeamService.run()` 模式改用 `runTransaction`：交易內先讀 `demo/current`（`assertCurrent`）與 `teams/{s}/items/{teamId}`，確認仍是隊長、隊伍未封存，再寫 `teamNames`（`updatedAt: serverTimestamp()`）。讀取階段失敗＝前置條件不符（顯示「不是隊長／隊伍已封存」）；只有提交階段可能已生效的失敗才算「結果未確認」，以 `getDocFromServer(teamNames…)` 比對 `name` 與 `updatedBy` 判斷已生效或未送達，不自動重送。（`setDoc` 離線時掛起並於恢復後自動重送，違反不重送原則。）
- **B2 全空白**：Rules 以 `name is string && name.size() <= 12 && name.matches('^[^\s\p{Z}\p{Cc}]([^\p{Cc}]*[^\s\p{Z}\p{Cc}])?$')` 驗證（首尾不可為空白／分隔字元、全文不可有控制字元含換行）。前端用等價 `u` 旗標正規式，先去除首尾 `[\s\p{Z}]`；單元測試與 Rules 測試共用案例表。
- **B3 字數單位**：Rules 測試含 12／13 個非 BMP emoji，以 Emulator 結果釘住 `string.size()` 單位；前端計數用同一單位（UTF-16 用 `length`、碼點用 `Array.from`），保證前端放行者 Rules 必接受；輸入框不用 `maxlength`。結果記入實作紀錄。

### 條件項
1. **雜湊核對**：新增快照 `tests/fixtures/published-rules-70acb267.rules`（驗 SHA-256）與測試「剝掉 `// ===== FSD-03E >>>`…`<<<` 後與快照相同」；既有剝除測試同步加剝 03E。區塊放在 07A 之後；輔助函式全在區塊內且不與既有同名。
2. **封存**：改正面列舉 `status in ['recruiting','active','paused']`。交接與改名同時發生各依當下 teams 文件判斷，不需跨文件原子。
3. **讀取**：get 不引用 `resource`；teams 不存在＝拒絕。剛退出者讀不到屬正確；前端換隊／退隊時主動取消訂閱。
4. **訂閱**：鍵 `${sessionId}|${teamId}`；未確認、無隊伍、換隊、`stop()` 時停止（併入 `clearRoster`／`clearContrib` 路徑）；失敗視為失效，每次成員快照最多重訂一次；隊名失敗靜默退回 `teamTitleOf`（不 `showError`）；只採 `exists && !fromCache && !hasPendingWrites`。
5. **對話框**：`data-team-action` 分流改明確（避免「編輯」開成退隊）；改名為 `DialogState` 新 kind（沿用 `isDialogOpen`／守衛）；`syncDialog` 在不是隊長、封存、未確認且非處理中時關閉；草稿存狀態不被重繪清除；預填以 `input.value` 設定不進屬性；Enter 送出排除 `isComposing`；焦點退路 `#team-title` 需存在；對話框 `role="dialog"`、輸入框有 `<label>`。
6. **與 08A-6 協調**：先做 08A-6，03E 前端接在新版團隊卡。介面：`TeamViewInput.title` 外加 `canRename: boolean`；按鈕 `id="team-rename"`、`data-team-action="rename"`，放在隊名標題 `#team-name` 旁（`teamWeekView` 有週資料與無週資料兩個分支都要放）；焦點退路 `#team-title`（頁面標題）。03E Rules 可先在本機實作驗證。
7. **Rules 測試補案例**：讀（隊員讀不存在／存在成功；剛退出、停用、他場次、子集合、collection group 拒）；寫（招募中 1 人隊長可建、暫停隊長可寫；退隊自動接任與轉讓兩種交接後舊隊長拒、新隊長可；teams 不存在拒；停用隊長拒）；名稱（非字串、含換行、只有 U+3000、首尾 U+3000 拒；12／13 emoji）。
8. **Mutation**：變異清單至少含拿掉 `currentSession`／`activeMember`、隊員判斷改任何人、隊長判斷改隊員、拿掉封存判斷、`updatedBy`／`updatedAt`／`clockVersion` 各一、欄位數或 `hasOnly`、正規式、`size() <= 12` 改 13、開放 list 或 delete、路徑改 `{teamId=**}`；`testPattern` 前綴 `03E team name`，寫明 `expectedTests`；新增 `npm run test:rules:mutation:teamname`，只重跑 03E 區塊。
9. **預算更正**：寫入只評估 `teamLeaderNow`、讀取只評估 `teamMemberNow`；實際讀 3 份文件（`membersByUid`、`demo/current`、`teams`），遠低於上限。

### 建議項（採納）
- 未確認期間保留同隊上次確認的隊名，換隊才退回替代標題。
- 驗收補：360 寬 12 個中文字標題換行不破版；同時「轉讓」與「改名」結果符合 Rules；不宣稱一秒同步。
- 回復說明：回退 Rules 後已寫入的 `teamNames` 被萬用拒絕擋住、不刪除，重新發布時舊名稱再出現（可接受）；發布後 HANDOFF 的 Rules 基準更新為新雜湊。

### 待產品負責人確認（Architect 建議）
1. 只有零寬字元（如 U+200B）的名稱是否要擋？建議**不擋**（只擋控制字元，避免誤傷 emoji）。
2. 持邀請碼的非隊員是否可看隊名（加入前預覽）？建議首版**只有隊員可讀**。
3. 先做 08A-6、03E 前端接在新版標題列；03E Rules 先在本機實作驗證（建議採納）。

## 隊名規則與輸入提示（2026-10-05，草案，待產品負責人確認措辭）

輸入框下方顯示（小字）：
- 1～12 個字，中文、英文、數字、符號或表情符號都可以
- 前後的空白會自動去掉，不能只有空白
- 只有隊長可以取名或改名，隨時都能改
- 隊名會顯示給所有隊員看，請取個友善的名字

即時回饋：提示上方顯示字數「N／12」，超過時字數變紅、「儲存」停用。送出不符時顯示：空白「請輸入隊名」、超過「隊名最多 12 個字」、換行／控制字元「隊名不能換行」；權限或封存「只有隊長可以改隊名」／「隊伍已封存，無法改名」。

判斷依據（與 B2、B3 一致）：去除首尾 `[\s\p{Z}]` 後計數；全形空白視為空白；表情符號的計數單位依 Rules Emulator 實測（若以 UTF-16 計，第一行改為「1～12 個字（表情符號算 2 個字）」，前端計數同步改用 UTF-16）。不檢查重複、不做敏感字過濾（Q3），第四行僅為提醒。

## 產品負責人裁決（2026-10-05，第二批）

- 只有**隊員**可讀隊名（Architect 建議 2 採納）。
- **不加入隊名重複檢查**（維持 Q3）。
- 先做 08A-6，03E 前端接在新版團隊卡標題：08A-6 已將隊名標題設為 `<h2 id="team-name">`（頁面標題 `#team-title` 保留為焦點退路），03E 的「編輯」按鈕放在其旁（`id="team-rename"`、`data-team-action="rename"`、`canRename`）。
- 零寬字元：未另行裁決，依 Architect 建議**不擋**（只擋控制字元）。
- 與 **FSD-04B（全勤規則調整，改 `rideCoupons`）合併為同一次 Rules 審查與發布**。

## Architect 短版確認（2026-10-05）：附條件通過，已併入

- 正文矛盾已修正：寫入方式（B1 交易）、名稱規則（B2 正規式＋`size() <= 12`）、封存判斷（正面列舉）、隊名標題 `#team-name`、狀態列版本。
- **條件 1（雜湊核對）改為與 04B 共用**：實作第 0 步存 `tests/fixtures/published-rules-70acb267.rules`（LF，驗 SHA-256）；新增測試「目前 Rules 剝掉 03E 區塊並套用 04B 替換表後＝70acb267 快照」（見 FSD-04B B1）。
- **正規式跳脫實測**：以 Emulator 確認 `'\\s'`／`'\\p{Z}'` 在 Rules 字串中的寫法可編譯，並以前導空格、U+3000、換行三案例證明有效，記入實作紀錄。前端原則改為「前端去除與拒絕的字元集合必須包含 Rules 的（較嚴或相同）」，取代「等價」。
- **介面**：`TeamViewInput.canRename`；`#team-rename` 在 `#team-content` 內，點擊分流必須明確區分 rename（`team-panel.ts` 的 `data-team-action` 分流）；對話框關閉焦點先回 `[data-team-action="rename"]`，找不到退回 `#team-title`。
- **合併發布**：先 Rules 後前端；回復先前端後 Rules（回到 70acb267 會同時撤掉 03E 與 04B）。03E mutation（`test:rules:mutation:teamname`，pattern `03E team name`）與 04B 的 coupon mutation 分開執行、各自列結果；其他積木不重跑。
- 發布後 HANDOFF 的 Rules 基準改為新雜湊，並記錄 70acb267 快照位置作為回復檔。

## 實作紀錄（2026-10-05，QA 附條件通過、Security 通過，建議項已修）

- **Rules**：區塊放在 07A 之後（`// ===== FSD-03E >>>`…`<<<`），輔助函式 `teamNameTeam`／`teamNameMemberNow`／`teamNameLeaderNow`／`teamNameShape` 皆在區塊內。與 04B 合併後的候選雜湊 `ffc851d07d033003a2c12f4b65a07f3bd5295bc2acc332892c0509cb661b1b90`（LF）；測試「04B/03E」確認剝掉 03E、還原 04B 後等於 `70acb267` 快照。
- **B3 字數單位（Emulator 1.22.0 實測）**：`string.size()` 以 **UTF-16 單位**計數——6 個非 BMP 表情符號（12 單位）通過、7 個拒絕；12 個 BMP 字元（中文、★）通過。因此隊名規則提示第一行定為「1～12 個字（表情符號算 2 個字），中文、英文、數字、符號或表情符號都可以」，前端以 `.length` 計數。
- **正規式跳脫實測**：Rules 原始碼寫成 `'^[^\\s\\p{Z}\\p{Cc}]([^\\p{Cc}]*[^\\s\\p{Z}\\p{Cc}])?$'`，可編譯；前導空格、前導／結尾 U+3000、結尾 U+00A0、換行、Tab 皆被拒，內部空格與 U+3000 可通過（`tests/fixtures/team-name-cases.mjs` 共用案例表，Rules 與前端單元測試都跑）。
- **前端**：`src/team/team-name.ts`（去除首尾 `[\s\p{Z}]`、拒控制字元、UTF-16 ≤ 12；比 Rules 嚴或相同）、`src/team/team-name-service.ts`（`runTransaction` 讀 `demo/current`＋`teams`，未確認時 `getDocFromServer` 比對 `name`／`updatedBy`，不重送）、`team-panel.ts`（隊名訂閱併入 `clearContrib` 路徑；`DialogState` 新增 `rename`；`data-team-action` 明確分流）、`views.ts`（`canRename`、`#team-rename`、`teamRenameDialogView`）。
- **驗證**：`npm test` 177/177、`npx tsc --noEmit`、`npm run build`、`npm run test:rules` 121/121；`npm run test:rules:mutation:teamname` 29 個變異：26 殺、3 等價（t11 欄位數／t12 hasOnly 互保、t17 `is string` 由 size/matches 對非字串報錯拒絕），0 意外。
- **審查後修正（2026-10-05）**：改名對話框開著時不因隊友名稱讀到而重繪（QA S1）；Escape 組字中不關窗（S2）；儲存失敗後重新同步對話框（S3）；隊名訂閱確認前不顯示「編輯」（S4）；訂閱失敗保留同隊上次確認的隊名（S5，依 Architect 建議「未確認期間保留上次確認隊名」）；標題選擇抽成 `pickTeamTitle` 並補單元測試（S7）；未確認比對文案改「目前伺服器上尚未看到新隊名」（S8）；隊名標題加 `unicode-bidi: isolate`（Security S1）；合併比對測試加 03E 區塊結構斷言（Security S2）。Rules 未變（雜湊同上），mutation 不重跑。
