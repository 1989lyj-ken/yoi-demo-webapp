# FSD-AC1 首輪驗收修正（01C／03B-UI／03C-1／04A）

**狀態**：契約第 2 版（2026-10-03）。Architect 短版附條件通過並併入；本機實作完成；**QA 無阻擋、Security 通過**，審查意見已修正並重新驗證。**本機完成，待產品負責人依 `發布與驗收清單_AC1_06A_07A.md` 與 AC1、06A、07A 一起發布並人工驗收（Rules 最終雜湊以合併清單為準；本檔文末的 `firestore.rules` 雜湊為當時審查版本）**。未發布、未部署。

**發布基準**：雲端已發布 `firestore.rules` SHA-256 `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882`（場次 `s6`，起始 2026-10-05 09:00）。本積木**只新增**一段 Rules；拿掉新增區塊後雜湊必須回到上述值。**不重設場次**。

## 產品負責人裁決（2026-10-03）

| # | 驗收意見 | 裁決 |
|---|---|---|
| R1 | D1-1 補同步按鈕可重複點 | 不限次數（PRD P09 不變）；按鈕只在「輸入值大於伺服器已確認的步數」時可按。**今日「儲存步數」同一規則** |
| R2 | D1-2 補同步後全勤格仍顯示「待補」 | **維持現狀**：補完未達標且仍在期限內顯示「待補」（還能再補），不改 |
| R3 | D2 隊員顯示 `memberId` | 改顯示 `displayName`，採**名稱表**：新增唯讀集合 `memberProfiles/{memberId}`，由產品負責人以 Console 建立；`memberId` 不改（含中文會使 03C-2 `reachingEntryId` 格式檢查失敗，且 `memberId` 是所有資料路徑的鍵） |
| R4 | D3-1 文字 | 「原始」→「今日原始」、「有效」→「今日有效」、「本週 N 步」→「本週計入 N 步」 |
| R5 | D3-2 本週 290,000／上週 0 | **計算正確**（10/4 屬上週，且早於成團不計入團隊，FSD-03C-1）；改為：隊伍在本週一（含）以後建立時**不顯示「上週」那一行** |
| R6 | D5-1 車資輸入框只在點選後顯示外框 | 外框常駐 |

## 1. 範圍

### 1.1 每日面板按鈕（R1）— `src/main.ts`
- 新增純函式 `canSubmitSteps(value: string, confirmed: number)`（`src/daily/daily-state.ts`）：回傳 `{ ok, hint }`。`value` trim 後須符合 `^d+$`（空字串、小數、負數、科學記號皆不可）、≤ 1,000,000（與 `perform` 的驗證一致）、且 **大於** `confirmed` 才 `ok`。
- **`render()` 與輸入框 `input` 事件共用**同一判斷：送出按鈕 `disabled = !canAct || !canSubmitSteps(input.value, current.rawSteps).ok`（取代原本只看 `!canAct`）。輸入框有焦點、`render()` 不回填時，別台裝置推高 rawSteps 也會重算。`input` 事件只更新按鈕與提示，不重繪面板。
- 提示放在**新元素** `#${day}-steps-hint`（`role="status"`，不用錯誤樣式；不沿用 `#${day}-status`，避免與快照／送出訊息互相覆蓋）：
  - 輸入值等於已確認值（剛同步完的預設狀態）：不顯示。
  - 合法整數但小於已確認值：「步數只能增加，請輸入大於 N 的數字。」
  - 非整數、空白或超過上限：「請輸入 0 到 1,000,000 的整數。」
- 送出中（`busy`）維持反灰（輸入框停用而失焦，完成後 `render()` 回填伺服器值，按鈕因「未增加」而反灰）。昨日文件不存在時 rawSteps 視為 0，輸入 0 反灰屬預期。`perform` 內「等於目前值」的分支保留為防禦。
- 伺服器端行為不變（Rules 仍允許任何合法的增加；同值重送原本即不新增片段）。這是 UX 限制，不是安全保障。

### 1.2 成員名稱表（R3）
**資料**：`memberProfiles/{memberId}`，欄位**只有** `displayName`（string，1–40 字，trim 後非空）。由產品負責人在 Console 建立 6 份，與 `membersByUid` 的 `memberId`／`displayName` 一致。

**Rules（新增，不改既有規則）**：插入在 `membersByUid` match 之後，前後以 `// ===== FSD-AC1 >>>`、`// ===== FSD-AC1 <<<` 標記註解包住（沿用 mutation 執行器的區塊標記格式）、行尾與原檔相同（LF）。
```
// FSD-AC1: read-only display names for teammates; written only by the product owner in the Console.
match /memberProfiles/{memberId} {
  allow get: if activeMember();
  allow list, create, update, delete: if false;
}
```
- 讀取不限同隊：6 位展示成員彼此本來就互見於團隊流程，名稱非機密；限同隊需多讀索引且隊員退隊後歷史成員仍需顯示名稱。
- 不允許 `list`：前端只依已知 `memberId` 逐筆 `get`。

**前端** — 新增 `src/identity/member-names.ts`
- `MemberNames`：`name(memberId): string | null`（已確認的名稱）、`request(ids, onChange)`（未知者以 `getDocFromServer` 讀取，同一 `memberId` 單飛、成功後快取；有新名稱時呼叫 `onChange`，由 team-panel 觸發 `render()`，交接對話框開著時再 `renderDialog()`；`dialog.chosen` 以 memberId 保存，不受影響）。
- **世代防護**：`clear()` 遞增 generation；回應的 generation 與目前不符即丟棄（登出／切換後，進行中的讀取不得把舊結果寫回）。
- **格式**：`Object.keys(data).length === 1`、`displayName` 為字串、trim 後非空、以 code point 計 ≤ 40 字（`[...s].length`）；trim 只用於驗證，顯示用原值。
- **失敗**：讀取失敗、文件不存在、格式不符 → 顯示 `memberId`（可辨識的後備值）；該 `memberId` 記為「本名單已失敗」，在同一份隊伍成員名單（`rosterKey`）期間**不再重讀**（避免每個快照讀一次），名單變動、重新登入或重新載入時才重讀。
- 顯示一律經 `escapeHtml`；`displayName` 不參與任何判斷、寫入或 DOM 屬性值（radio 的 `value` 仍為 `memberId`）。
- 登出／切換展示模式時清空快取（`stopSharedSubscriptions`）。

**套用位置**（`src/ui/views.ts`，由 `team-panel.ts` 傳入 `nameOf(memberId)`）
- 隊員列、歷史成員列、更換隊長的選人清單（標籤顯示名稱，`value` 為 `memberId`）。
- 隊長標示「・隊長」、歷史成員「・歷史成員」維持。
- 自己那列可直接用 `session.member.displayName`（已由 `membersByUid` 驗證）。

### 1.3 團隊文字（R4、R5）— `src/ui/views.ts`、`src/team/team-panel.ts`
- 隊員列：`今日原始 N 步／今日有效 N 步`（未初始化時的「步數 —」維持）；`本週計入 N 步`、`本週計入 —`。
- 歷史成員：`本週計入 N 步（退團前的貢獻保留）`。
- 「上週（補同步至今日 24:00）」整段（含上週達標結果）**只隱藏顯示，訂閱與結算一律不動**：`weekIds`、`ensureContrib`、`ensureWeeks`、`offerWeek`、`loadOwnAwards` 維持現狀，上週的 `WeekSettler` 照常在週一執行（週一是上週唯一能結算的日子，不能冒漏寫的風險）。只在組 `weekInput` 時依條件把 `previous` 設為 `null`。
- 新增純函式 `teamCreatedBefore(createdAt, weekId)`（`src/team/contrib-state.ts`）：`createdAt` 須符合 `^d{4}-d{2}-d{2}Td{2}:d{2}:d{2}+08:00$`，回傳 `createdAt.slice(0, 10) < weekId`；格式不符回傳 `true`（退回原行為：顯示）。
- **隱藏條件**：`!teamCreatedBefore(team.createdAt, weeks.current)` **且**上週合計為 0 **且**上週沒有正式結果。
  - 依 01C／03C-1，本週建立的隊伍上週合計必為 0（昨日補同步片段固定記為昨日 23:59:59，早於建立；乘車另有入隊日限制）；後兩個條件是防禦：萬一有上週貢獻或結果，照常顯示，避免已取得的上週寶箱資格看不到。
  - 判斷用 `createdAt`（建立即存在，招募中也算），不用成團時間：上週已建立但未成團的隊伍顯示 0 屬實。

### 1.4 車資輸入框（R6）— `src/style.css`
- `.coupon-card input`：常駐 `border-color: var(--yx-action-navy)`（沿用全域 1px 框）、`background: var(--yx-surface)`（只用 token，不寫色名；卡片本身為灰底，原輸入框與卡片同色而看不見）；`:focus-visible` 維持全域規則。只改此處，不改全域 `input`。
- 偏離 FSD-UI01 8.5（Field 無框、灰底）：在 FSD-UI01 偏離表登記「AC1 R6 裁決，僅限 `.coupon-card input`」，並註明 `style.css`／`main.ts`／`views.ts` 以 AC1 文末雜湊為新基準。

## 2. 不做
- 不改 01C、03B、03C、04A 的任何既有 Rules 或資料格式；不重設場次。
- R2 不改。
- 純展示模式不改（留給「展示模式改接共享資料」，屆時沿用 `MemberNames`）。

## 3. 測試
- **Rules（`tests/firestore-rules.test.mjs` 新增「AC1 memberProfiles」）**：有效成員可 `get` 任一成員名稱；有效成員 `get` 不存在的 ID 成功並得到「不存在」；未登入、`active=false`、無 `membersByUid` 者拒絕；一般成員與管理者 `list`、`create`、`update`、`delete` 皆拒絕。
- **雜湊自動核對**（同一測試檔）：讀 `firestore.rules`，移除 `// ===== FSD-AC1 >>>` 到 `// ===== FSD-AC1 <<<`（含兩行標記與區塊前的空行），CRLF 正規化為 LF 後 SHA-256 必須等於 `6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882`。
- **Mutation**：新增 `scripts/mutate-member-profiles-rules.mjs`（共用執行器），項目約 5：`activeMember()`→`signedIn()`、→`true`，`list`／`create`／`update`／`delete` 各改為 `activeMember()`。全數須被抓到。入口：`scripts/test-firestore-rules.ps1` 的 `ValidateSet` 加入此命令、`package.json` 新增 `test:rules:mutation:profiles`。依核定規則，其他積木不重跑。
- **單元**：
  - `MemberNames`：格式（多欄位、空白、41 個 code point、非字串）回後備值；世代防護（clear 後舊回應丟棄）；同一名單內失敗不重讀、名單變動才重讀；單飛。
  - `canSubmitSteps`：等於、小於、大於、空字串、小數、`1e3`、上限與上限 +1，及對應提示。
  - `teamCreatedBefore`：週一建立 → false；上週日建立 → true；格式錯誤 → true；隱藏條件三者組合。
  - views：今日原始／今日有效／本週計入；displayName 含 `<img onerror>` 已跳脫；radio `value` 為 `memberId` 且不含 displayName。
- 全套 `npm test`（含 `ui-tokens`）、`npm run test:rules`、tsc、build。

## 4. 發布（產品負責人）
1. Console 建立 `memberProfiles` 6 份文件（文件 ID＝`memberId`，欄位只有 `displayName`，與 `membersByUid` 一致）。**先建資料再發布 Rules**：發布後前端立即可讀。
2. 發布 Rules（含發布後核對，CRLF 視為通過）→ 部署前端 → 所有裝置重新整理。**不重設場次**。
3. 發布清單更新：「除 `membersByUid` 外不得以 Console 寫入」改為「除 `membersByUid`、`memberProfiles` 外」。

## 5. 人工驗收（只驗本次修改）
1. 今日：輸入框等於目前步數時「儲存步數」反灰；改大後可按；改小時顯示提示且反灰；儲存成功後再次反灰。昨日補同步同樣。
2. 團隊：隊員、歷史成員、更換隊長選單都顯示名稱；名稱表刪掉其中一份時該成員顯示 `memberId`（可選測）。
3. 文字：今日原始／今日有效／本週計入。
4. 本週一建立的隊伍，週一不顯示「上週」；上週已建立的隊伍，週一照常顯示。
5. 車資輸入框未點選時即可看到深藍外框。

## Architect 短版審查（2026-10-03）與修訂

**結論：附條件通過**。必須修正 8 項皆已併入第 2 版：
1. R5 不可停止上週訂閱（上週 `WeekSettler` 只能在週一執行）→ 改為只隱藏顯示，訂閱與結算不動。Architect 舉例的「週一建立後補同步週日」在 01C 下片段固定記為週日 23:59:59、早於建立而不入帳，故本週建立的隊伍上週必為 0；仍依其建議加上「上週合計為 0 且無正式結果」才隱藏的防禦條件（因此不需產品負責人再裁決邊界）。
2. R5 判斷式明定為 `teamCreatedBefore`（含格式驗證，失敗退回顯示）。
3. R1 判斷寫進 `render()` 並與 `input` 事件共用；提示用新元素 `#${day}-steps-hint`。
4. R1 `canSubmitSteps` 解析規則明定（空字串、小數、科學記號、上限），非法輸入顯示範圍提示。
5. Mutation 入口：`ValidateSet` 與 `package.json` 指令。
6. MemberNames 世代防護與名稱回來後重繪（含交接對話框）。
7. 失敗不在每個快照重讀（同一 `rosterKey` 期間）。
8. R6 用 `var(--yx-surface)`；在 FSD-UI01 偏離表登記。

建議併入：Rules 插入位置與標記、雜湊自動核對、Rules 與單元測試補案例、MemberNames 驗證細節。Info：XSS 處理正確；自己那列用 `session.member.displayName`，兩表不一致會出現兩個名字，發布清單已要求一致。

## 實作紀錄（2026-10-03）

- **Rules**：`memberProfiles` 區塊插在 `membersByUid` 之後，以 `// ===== FSD-AC1 >>>`／`<<<` 包住；拿掉區塊（含前方空行）後 SHA-256 為已發布的 `6f5c1e4c…5882`，由 Rules 測試自動核對。
- **R1**：`canSubmitSteps`（`daily-state.ts`）；`main.ts` 的 `updateSubmit()` 由 `render()` 與 `input` 事件共用，提示寫入 `#${day}-steps-hint`（`views.ts`）。
- **R3**：`src/identity/member-names.ts`（`parseProfile`、`MemberNames`：單飛、世代、同名單失敗不重讀）；`main.ts` 以 `getDocFromServer` 讀取、`stopSharedSubscriptions` 呼叫 `clear()`；`team-panel.ts` 的 `nameOf`（自己用 `session.member.displayName`），名稱到達時 `render()`＋`renderDialog()`；`teamView` 新增 `nameOf` 參數（預設回傳 memberId）、交接選單 `choices` 增加 `label`、`transferConfirmCopy` 參數改為顯示名稱。
- **R4**：`views.ts` 文字；既有測試 `本週 —` 改為 `本週計入 —`。
- **R5**：`teamCreatedBefore`、`showPreviousWeek`（`contrib-state.ts`）；`team-panel.ts` 的 `previousWeekInput` 只影響顯示，`weekIds` 與訂閱、結算不動。
- **R6**：`.coupon-card input { border-color: var(--yx-action-navy); background: var(--yx-surface); }`；FSD-UI01 偏離表已登記。
- **預覽**：`ui-preview.ts` 共享頁顯示名稱、交接選單附 `label`。

**驗證**
- `npm test` 118/118（新增 `tests/acceptance-fixes.test.mjs` 7 條）；`npm run test:rules` 111/111（新增 AC1 2 條）；tsc、build 通過。
- **Mutation**（`npm run test:rules:mutation:profiles`）：6 項，**6 項被抓到、0 等價、0 意外存活**（基準與 canary 通過）。依核定規則，其他積木未重跑。
- 預覽（Vite dev）：共享頁隊員顯示「預覽成員・隊長」「成員小美」與「今日原始／今日有效」；車資輸入框常駐 `rgb(11,31,56)` 外框、白底；無 console 錯誤。R1 按鈕需 Firebase，以單元測試與人工驗收覆蓋。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `850e594c4c09dda4405d553e5d49e463e680f42a34a74a0d05f0ff012c3252e6` |
| `tests/firestore-rules.test.mjs` | `7dfd3e77251656e21c2fd6e7f506c08624eb08b0193d21c976d23a28899a5bdc` |
| `tests/acceptance-fixes.test.mjs` | `1a612a09e70256c58cf28f200c40745b07ccc60458d7325815dcaeebcd8fff59` |
| `tests/contrib-state.test.mjs` | `ff763ed19b3a3fddca46cd3dbdc25d960090e19e9b12e845fa488009fc80dfc4` |
| `scripts/mutate-member-profiles-rules.mjs` | `7d741145e7eea8f65f412bc8833c5e5a106b1b5da546cc7695b995365f965fdc` |
| `scripts/test-firestore-rules.ps1` | `c16c3810d1ae940bab8472224b0e71135f4593c2000dee4245ed4e0ac43c9f59` |
| `package.json` | `f3c2442f8eea4cf19064529cbb4511c18b8791da012a5ad2df246e35b38a4675` |
| `src/identity/member-names.ts` | `b0d7d00939d0ed30edde6f6ae0bd60a965859eca849335944e424f3c8df666f7` |
| `src/daily/daily-state.ts` | `fba47b5434cc501408f4445511c9894379ab80479ce21f619869ba3273d19c66` |
| `src/team/contrib-state.ts` | `cf167c459a37914fa8382bc1e72209c59476a5567620c36e1007d19307b7ec92` |
| `src/team/team-panel.ts` | `973726e50a6110d2864db2859c77913c5ae1c29f1886ba759965fa8b324f547c` |
| `src/team/team-state.ts` | `ef20ee63b423bf1823a20e93ce38aea9dfdd410b55af465334ec939c9d75cfd9` |
| `src/main.ts` | `aa59052a67cb5c9defb8efe145f22f44c7b4cbf927080f20dfd378a7e32845cc` |
| `src/ui/views.ts` | `c6a2b2fd87b839e9674147e73811f1a531669710e9bfc9a7f45ef80d4625bedd` |
| `src/style.css` | `366491928a9b80f47c7296e737b1d0f61407a742a7218a25b49eca09b5c1bebd` |
| `src/ui-preview.ts` | `cb1cf652b0bd4fa7320ba5f8e3c2b5f6fbe1f0ed6a0864bac7f6972da93aff85` |
| `FSD/FSD_UI01_基礎樣式_設計規格1.24.0.md` | `688f5a7dd8cb31dba4e986d9c2a7b09c8dab1317466083386a8b84d17bb5ff2f` |

## QA／Security 審查與修正（2026-10-03）

- **QA（Sonnet）：無阻擋**。應修正 1：名稱晚到時交接確認步驟的焦點仍在「轉讓給…」→ `onNames` 改為 `renderDialog(true)`（焦點移到左側按鈕；選人步驟的 radio 本無 id，重繪後原本即回到左側按鈕）。次要：`onChange` 拋錯會成為 unhandled rejection → 以 try/catch 包住；`transferConfirmCopy` 名稱跳脫缺專測 → 已補；R1 DOM 行為以人工驗收覆蓋（多測：輸入框有焦點時別台推高步數、送出中、昨日無文件輸入 0）；`rosterKey` 只隨隊員名單變動（已確認）。QA 因 8088 被占用未能獨立跑 `test:rules`。
- **Security（Opus）：通過**，無 Critical／High／Medium。於暫存副本（127.0.0.1:8098）跑 `test:rules` 111/111、n01–n06 全數被抓到，另加 7 項 mutation（read 取代 get、拿掉 active、管理者可寫、改集合名、任何登入者可讀）皆被抓到；`{memberId=**}` 存活（只多開放無寫入管道的子集合）。自行驗證拿掉區塊後雜湊為 `6f5c1e4c…`。Low L1：`perform` 用 `Number(input.value)`，`""`／`1e3` 可繞過字串規則（按鈕停用時無影響）→ 送出前改套用 `canSubmitSteps`。Info 1 → 新增「讀子集合被拒」測試與 mutation n07（路徑 `{memberId=**}`）。
- **修正後驗證**：tsc、build 通過；`npm test` 118/118（views 測試加 `transferConfirmCopy` 跳脫斷言）；`npm run test:rules` 111/111；**mutation 7 項全數被抓到**（基準與 canary 通過）。8088 曾被審查時遺留的 Emulator 占用，由產品負責人停止後重跑。Rules 自實作後未再變動（`850e594c…`）。發布清單：`發布與驗收清單_AC1.md`。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `850e594c4c09dda4405d553e5d49e463e680f42a34a74a0d05f0ff012c3252e6` |
| `tests/firestore-rules.test.mjs` | `8c4352752ead97c697cec261f8b50a1648fa7ba7a32076c1d754b7c453aac85e` |
| `tests/acceptance-fixes.test.mjs` | `bca72c87c3815b971b19aaf0e266cd04eaea59865372e527bf24bb5e61068a50` |
| `tests/contrib-state.test.mjs` | `ff763ed19b3a3fddca46cd3dbdc25d960090e19e9b12e845fa488009fc80dfc4` |
| `scripts/mutate-member-profiles-rules.mjs` | `29d734fa2560f5fbceed691a39f58a01f12820e18cd4c286e15271da48215531` |
| `scripts/test-firestore-rules.ps1` | `c16c3810d1ae940bab8472224b0e71135f4593c2000dee4245ed4e0ac43c9f59` |
| `package.json` | `f3c2442f8eea4cf19064529cbb4511c18b8791da012a5ad2df246e35b38a4675` |
| `src/identity/member-names.ts` | `1689f3de548745a6e73cea2652caa8b33ce310e2094b267845a05e8c1a395f9a` |
| `src/daily/daily-state.ts` | `fba47b5434cc501408f4445511c9894379ab80479ce21f619869ba3273d19c66` |
| `src/team/contrib-state.ts` | `cf167c459a37914fa8382bc1e72209c59476a5567620c36e1007d19307b7ec92` |
| `src/team/team-panel.ts` | `6ffc8711a7c47f6b9560592706d00a329cda39ed19d7fe4fdb7bb5007407f0a5` |
| `src/team/team-state.ts` | `ef20ee63b423bf1823a20e93ce38aea9dfdd410b55af465334ec939c9d75cfd9` |
| `src/main.ts` | `60c0d8e482a2e79d29beab2e1708c1c28ae70e082f7dd296e27f8e0e3e32a550` |
| `src/ui/views.ts` | `c6a2b2fd87b839e9674147e73811f1a531669710e9bfc9a7f45ef80d4625bedd` |
| `src/style.css` | `366491928a9b80f47c7296e737b1d0f61407a742a7218a25b49eca09b5c1bebd` |
| `src/ui-preview.ts` | `cb1cf652b0bd4fa7320ba5f8e3c2b5f6fbe1f0ed6a0864bac7f6972da93aff85` |
| `FSD/FSD_UI01_基礎樣式_設計規格1.24.0.md` | `688f5a7dd8cb31dba4e986d9c2a7b09c8dab1317466083386a8b84d17bb5ff2f` |
| `發布與驗收清單_AC1.md` | `129ce2cf2385e48a944e6a71674ac3aa9ba290c5dd5d6c7745deadf1a9e7e734` |
