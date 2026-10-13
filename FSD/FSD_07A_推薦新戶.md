# FSD-07A 推薦新戶（模擬）

**狀態**：契約第 2 版（2026-10-03）。產品負責人已裁決 Q1–Q7 與 M3-(a)；Architect 附條件通過並併入；本機實作完成；**QA 通過、Security 附條件通過**，條件與建議已修正並重新驗證（見文末）。**本機完成，待產品負責人依 `發布與驗收清單_AC1_06A_07A.md` 與 AC1、06A 一起發布並人工驗收**。

**發布**：Rules 疊在 AC1＋06A 之上（本機 `fd6002a6…`），產品負責人決定**三個積木一起發布**。

## 產品負責人裁決（2026-10-03）

| # | 裁決 |
|---|---|
| Q1 | A：推薦碼＝推薦人的 `memberId`，以 `memberProfiles` 判斷有效 |
| Q2 | 每人每場次最多被推薦一次、不可改；推薦人數不限；禁止自薦與互推 |
| Q3 | 獎勵以 PRD §6.3 為準（UI 設計包 `I1` 不採用） |
| Q4 | 推薦獎勵券放入「我的乘車券」（無最低車資、60 天）；活動加碼 50 Points（和泰 Points，與每日點數、寶箱點數同一種）計入 06A 餘額，**到期後不計入**，紀錄保留並標示「已到期」 |
| Q5 | 被推薦人綁定後才有「模擬完成首次派遣（信用卡付款）」，只能一次；與 01C 乘車加成分開 |
| Q6 | 共享模式「團隊共享」下方「推薦新戶（模擬）」三段 |
| Q7 | 錯誤訊息照建議；Rules 拒絕時重讀伺服器後說明 |

## PRD 已定的規則（不需再裁決）

- 「邀請入隊」與「推薦新戶」分開呈現；單純入隊不等於完成首乘獎勵。
- 被推薦人完成「推薦碼註冊」模擬任務 → 被推薦人得 **NT$50 乘車券 ×2**。
- 被推薦人完成「首次 App 派遣且信用卡付款」模擬任務（＝**首乘**）→ 推薦人得 **NT$100 乘車券 ×1 ＋ 活動加碼 50 Points**。
- 歸戶後 **60 天**有效；乘車券每趟一張、不與其他券併用。
- 由六個預建帳號輪流扮演推薦人與被推薦人；**不建立新登入帳號、不提供公開註冊入口**。
- 同一場次須阻止：**無效碼、自薦、重複綁定、重複首乘領獎**；狀態跨裝置一致。
- 換角色演示 ＝ 管理者重設場次（新 `sessionId`），不改帳號身分。

## 待裁決

### Q1 推薦碼長什麼樣子

| 做法 | 內容 | 影響 |
|---|---|---|
| **A（建議）用成員編號當推薦碼** | 每人的推薦碼就是自己的 `memberId`（例如 `YOI-M01`），畫面顯示「我的推薦碼 YOI-M01」並可複製。Rules 以 AC1 的 `memberProfiles/{推薦碼}` 是否存在判斷「有效碼」 | 不需新資料；你在 Console 不用多建東西 |
| B 另建推薦碼表 | 在 Console 建 `referralCodes/{碼}` 對應到成員（例如 `WALK2026`） | 推薦碼比較像真的；但你要多建 6 份文件，Rules 多一次讀取 |

### Q2 誰可以被推薦

**建議**：同一場次內，**每人最多被推薦一次**（綁定後不能改），任何人都可以當推薦人、推薦人數不限。禁止：
- 自己推薦自己（自薦）；
- **互相推薦**（A 推薦了 B，B 就不能再填 A 的碼）——PRD 沒寫，但互推等於兩人互發獎勵，建議擋下。

不另設「新戶資格名單」：PRD 的「場次起始時可設定尚未完成推薦的模擬資格」，以「重設場次後每人都回到未被推薦」實現。

### Q3 獎勵內容以哪份文件為準

PRD 與 UI 設計包寫法不同：

| 來源 | 被推薦人 | 推薦人 |
|---|---|---|
| **PRD §6.3（建議）** | 輸入推薦碼後 NT$50 券 ×2 | 被推薦人首乘後 NT$100 券 ×1 ＋ 50 Points |
| UI 設計包 `I1` | 雙邊各 NT$50 券 ×4 ＋ 50 點，被邀請即發 | 同左 |

**建議以 PRD 為準**（專案規定 PRD 為規則來源；UI 設計包的 `I1` 是未來正式版的組隊邀請構想）。

### Q4 獎勵怎麼呈現、到期怎麼算

**建議**：
- **乘車券**放進既有「我的乘車券」清單，標示「推薦獎勵券」與面額；到期 ＝ 取得時的情境時間 ＋ 60 天（同 04A 的寫法：入帳、到期都寫絕對時間）；可做車資試算（**沒有最低車資**，PRD 未規定）；過期顯示「已過期」。
- **50 Points** 進 06A 的點數總餘額與點數紀錄（「推薦新戶首乘加碼 +50 點」）；**到期後不再計入餘額**，紀錄保留並標示「已到期」。
- 取得時間：被推薦人的券＝綁定推薦碼當下；推薦人的券與點數＝被推薦人首乘當下。

### Q5 「首乘」怎麼模擬

**建議**：被推薦人綁定推薦碼後，畫面出現「模擬完成首次派遣（信用卡付款）」按鈕，按一次即完成首乘，**只能一次**。
- 與 01C 的「模擬完成一趟 yoxi」（步數 1.5 倍加成）**分開**，互不影響（PRD：推薦首乘條件不與步數加成混用）。
- 未綁定推薦碼的人看不到這個按鈕（沒有推薦關係，首乘不發推薦獎勵）。

### Q6 畫面放哪裡

**建議**：共享模式「團隊共享」下方新增「**推薦新戶（模擬）**」區塊，三段：
1. **我的推薦碼**：顯示碼與「複製」按鈕，說明「朋友填你的碼並完成首乘，你得 NT$100 券＋50 點」。
2. **填寫推薦碼**（尚未被推薦時）：輸入框＋「綁定推薦碼」；綁定後改為進度三步驟「輸入推薦碼 → 完成註冊 → 完成首乘」（前兩步同時完成，沿用純展示模式的步驟樣式）與「模擬完成首次派遣」按鈕。
3. **我推薦的人**：列出被推薦人名稱（AC1 名稱表）與狀態「已註冊／已首乘」。

### Q7 錯誤訊息

**建議**：無效碼「找不到這個推薦碼」；自薦「不能填自己的推薦碼」；互推「對方已由你推薦，不能互相推薦」；已綁定「你已經綁定推薦碼，不能更改」；首乘已完成「首乘已完成，推薦獎勵已發放」。前端先擋，Rules 為最終保證；Rules 拒絕時一律重讀伺服器後再說明（不依錯誤碼推論）。

## 資料格式（以 Q1-A、Q2 建議為前提）

### 推薦關係 `referrals/{sessionId}/referees/{refereeId}`（每位被推薦人一份）

| 欄位 | 規則 |
|---|---|
| `sessionId`、`refereeId` | 與路徑相同 |
| `referrerId` | 推薦人的 `memberId`；`!= refereeId`；`memberProfiles/{referrerId}` 存在 |
| `boundAt` | 等於目前情境時間（建立時） |
| `firstRideAt` | 建立時 `null`；首乘時改為當時情境時間，之後不可再改 |
| `clockVersion`、`recordedAt` | 建立：目前 `clockVersion`、`request.time` |
| `firstRideRecordedAt` | 建立時 `null`；首乘時為 `request.time` |

- **建立**：本人（`refereeId == actorMemberId()`）、目前場次、帳號有效；文件不存在（只能綁一次）；欄位剛好 8 個（`sessionId`、`refereeId`、`referrerId`、`boundAt`、`firstRideAt: null`、`clockVersion`、`recordedAt`、`firstRideRecordedAt: null`）；**互推檢查**：`!exists(referrals/{s}/referees/{referrerId}) || get(...).referrerId != refereeId`。
- **首乘（更新）**：本人；只改 `firstRideAt`（`null` → 目前情境時間）與 `firstRideRecordedAt`（→ `request.time`）；其他欄位不變；`clockVersion` 不變（保留綁定時的版本）。
- **讀取**：被推薦人本人 `get`；推薦人 `get`／`list`（`resource.data.referrerId == actorMemberId()`，查詢需帶 `where('referrerId','==',自己)`）。
- **刪除**：一律拒絕。
- **Rules 預算**：建立＝`membersByUid`、`demo/current`、`memberProfiles/{referrerId}`、推薦人自己的推薦關係（互推檢查）＝ 4 份文件；更新＝ 2 份。

### 獎勵（不另存，由推薦關係推導）

- 被推薦人：推薦關係存在 → NT$50 券 ×2，取得＝`boundAt`，到期＝`boundAt` ＋ 60 天。
- 推薦人：每份 `firstRideAt != null` 的推薦關係 → NT$100 券 ×1 ＋ 50 Points，取得＝`firstRideAt`，到期＝＋ 60 天。
- 「重複首乘不發獎」由「`firstRideAt` 只能設定一次」保證；「每人只被推薦一次」由「一人一份推薦關係」保證。

## 前端（`src/referral/`）

- `referral-state.ts`（純函式）：`checkCode(code, selfId, myReferral, codesKnown)`、`parseReferral`、`refereeRewards(referral, now)`、`referrerRewards(referrals, now)`、`referralSteps`。
- `referral-service.ts`：訂閱本人推薦關係（`get`）、本人推薦的人（`where referrerId == 自己`）；`bind(code)`、`firstRide()` 交易（重讀 `demo/current`、身分，失敗一律以伺服器重讀判斷）。
- `referral-panel.ts`：區塊、錯誤訊息、fail-closed（只用伺服器確認的快照）。
- **與 04A／06A 整合**：「我的乘車券」加入推薦獎勵券（獨立卡片類型，無最低車資）；06A 點數總餘額與紀錄加入推薦加碼點（到期後不計入）。

## 測試

- **Rules**：綁定成功；無效碼、自薦、互推、重複綁定、他人代綁、舊場次、停用帳號、欄位錯誤皆拒；首乘一次成功、第二次拒、他人代按拒、改其他欄位拒；推薦人可列自己的被推薦人、不能列別人的；被推薦人可讀自己的；刪除拒；雜湊快照核對加入 07A 標記區塊。
- **Mutation**：07A 區塊全條件（約 25 項）。
- **單元**：到期計算（跨月、跨年）、獎勵推導、錯誤訊息、views 跳脫。
- 全套 `npm test`、`npm run test:rules`、tsc、build、預覽 360／440 px。

## 不做

- 真實註冊、新帳號、推播、分享連結；推薦獎勵券的實際核銷；純展示模式（留給「展示模式改接共享資料」）；鈴鐺通知。

## 人工驗收（摘要）

1. A 看到自己的推薦碼；B 填 A 的碼 → 綁定成功，B 的乘車券多 2 張 NT$50（到期＝今天＋60 天）。
2. B 再填別人的碼 → 「已綁定，不能更改」；C 填自己的碼 → 「不能填自己的」；填不存在的碼 → 「找不到」；A 填 B 的碼 → 「不能互相推薦」。
3. B 按「模擬完成首次派遣」→ A 的乘車券多 1 張 NT$100、點數餘額 +50；A 的「我推薦的人」顯示 B「已首乘」。B 再按 → 「已完成」，A 不再增加。
4. 兩台裝置狀態一致；推進 61 天後券顯示已過期、50 點不再計入餘額。（08A-5 起：過期券不再顯示於「我的獎勵券」。）
5. 重設場次後，每人回到未被推薦、可重新演示。

## 第 2 版修訂：Architect 審查（2026-10-03，Opus）附條件通過

**M1 互推檢查寫法**：`!exists(referees/$(referrerId)) || get(referees/$(referrerId)).data.referrerId != refereeId`（依賴 `||` 短路：不存在時不執行 `get`）。組路徑前先要求 `referrerId is string && referrerId.matches('^[A-Za-z0-9-]{1,40}$')`，避免含 `/` 的值組出別的路徑。

**M2 讀取規則**：`allow get: if activeMember() && currentSession(sessionId) && (refereeId == actorMemberId() || resource == null || resource.data.referrerId == actorMemberId())`（本人條件放第一個：本人可訂閱自己尚未建立的文件；不存在的文件任何有效成員可讀。**這會透露其他成員本場次是否已被推薦**（看不到推薦人是誰）——Security L2 指出，六人展示版接受，綁定流程也依賴這一點）。`list`：`activeMember() && currentSession && resource.data.referrerId == actorMemberId()`，查詢必帶 `where('referrerId','==',自己)`。
- 前端綁定交易：讀本人文件（須不存在）、讀推薦人的推薦關係 `referees/{referrerId}`：不存在 → 交易附上「不存在」前提；被拒（存在且推薦人不是自己）→ 不可能構成互推，改用不讀它的交易。拒絕後的錯誤說明只依伺服器重讀結果判斷。

**M3 互推競態（產品負責人裁決 (a)：列為已知限制，2026-10-03）**：正常前端兩人同時互填，雙方交易都讀過對方「不存在」，後提交者前提失效，**最多一筆成功**。但自寫客戶端不讀對方文件直接寫入時，Rules 無法跨文件序列化，兩筆可能都成功。選項：(a) **列為已知限制**（建議；與步數自報、寶箱自選同一信任模型，後果只是兩人互得模擬獎勵）；(b) 成對鎖 `referralPairs/{s}/pairs/{小ID_大ID}`（只能建立，與推薦關係同批，以 `existsAfter`／`getAfter` 互核；多 1 份讀取、約 8 項 mutation）。無論哪個，都加 Emulator 並發測試：兩個前端交易同時互填，最多一筆成功。

**M4 乘車券清單型別**：`CouponCard` 改為 `{ key, kind: 'weeklyPerfect' | 'referralWelcome' | 'referralReward', faceValue, minFare: number | null, issuedAt, expiresAt, active }`；key 例：`week-{weekId}`、`ref-{refereeId}-1`／`-2`、`refbonus-{refereeId}`；DOM 改用 `data-coupon-key`（`CSS.escape`）；`canUse` 支援 `minFare === null`；排序 `issuedAt` 新到舊、同時間以 key。**推薦券不跳「恭喜」提示**（`promptPlan` 只看全勤券）。

**M5 餘額與紀錄**：`balance`／`ledgerRows` 加入推薦加碼與情境時間 `now`：只計入 `now < expiresAt` 的 50 點；`LedgerRow.kind` 增加 `'referral'` 與 `expired`；已到期列顯示「已到期」且不加總。推薦清單未經伺服器確認 → 餘額與紀錄顯示「—／同步中」。單元測試含到期當下時刻的邊界。

**M6 名稱快取**：推薦區塊另建一個 `MemberNames`（避免與團隊區塊不同 `rosterKey` 交替而反覆重讀失敗名稱）；登出時一併 `clear()`。

**建議（已採納）**
1. 到期：`plusDays(at, 60)`（保留時刻與 `+08:00`）；判斷 `now < expiresAt`（字串比較，同 04A）。時鐘推進由既有過期覆蓋層要求重新載入，不另設計時器。測試含跨月、跨年、閏年 2/29。
2. **共用訂閱**：`referral-service` 統一訂閱本人推薦關係與「我推薦的人」，推薦區塊、乘車券、點數三處共用同一份狀態（已確認狀態一致）。
3. Rules 測試：list 不帶 where 被拒、帶別人的 id 被拒；本人讀自己不存在的文件可行；推薦人代按首乘被拒；舊場次文件無法更新；停用帳號被拒；**管理者（role admin）可當推薦人與被推薦人**（各一個測試）。
4. 首乘更新：`diff().affectedKeys().hasOnly(['firstRideAt','firstRideRecordedAt']) && hasAll(...)`；`resource.data.firstRideAt == null`；新值 `== currentScenarioNow()`；`firstRideRecordedAt == request.time`；只有被推薦人本人。
5. 發布清單：`memberProfiles` 必須剛好 6 份、文件 ID 與 `membersByUid.memberId` 完全一致（少建一份，該成員的碼會「找不到」）；前端預檢以 `getDocFromServer` 讀名稱文件；輸入只去頭尾空白、不改大小寫。
6. Mutation 至少涵蓋：本人、場次、`memberProfiles` 存在、自薦、互推、只能建立、8 欄位、`boundAt`、`firstRideAt` 原值為 null、diff 只改兩欄、get 的 `resource == null` 分支、list 的推薦人條件、刪除拒絕。

**Info**：Rules 預算建立 4 份、更新 2 份、list 2 份文件；07A 區塊接在 06A `<<<` 之後，標記 `// ===== FSD-07A >>>`／`<<<`，函式不與既有同名；雜湊快照核對多切 07A 一段（基準仍 `6f5c1e4c`），AC1／06A 契約與發布清單的最終雜湊要同步更新，其 mutation 不重跑；**不需重設場次**，但必須先發布 Rules 再部署前端；推薦區塊無覆蓋層；`firstRideAt >= boundAt` 由時間不可倒退自然成立。

## 實作紀錄（2026-10-03）

- **Rules**：`// ===== FSD-07A >>>` 區塊接在 06A 之後：`referralPath`、`referralCreate`（8 欄、路徑欄、推薦碼格式、非自薦、`boundAt`／`clockVersion`／`recordedAt`、首乘欄為 null、`memberProfiles` 存在、互推短路檢查）、`referralFirstRide`（原值 null、diff 只改且必改兩欄、時間）、`referrals` match（get 含 `resource == null` 分支、list 限推薦人、create／update 限本人、delete 拒絕）。雜湊快照核對多剝 07A 區塊。
- **前端** `src/referral/`：`referral-state.ts`（`parseReferral`、`checkCode`、`bindRefusal`、`expiryOf`＝`plusDays(at, 60)`、`referralStep`、`referralCoupons`、`referralBonuses`）；`referral-service.ts`（`feed()` 單一訂閱本人推薦關係與「我推薦的人」供三處共用；`bind`／`firstRide` 交易，拒絕後以伺服器重讀說明；推薦人文件不可讀時改用不讀它的交易）；`referral-panel.ts`（區塊、複製推薦碼、獨立 `MemberNames`）。
- **04A 整合（M4）**：`CouponCard` 改為 `key`／`kind`／`minFare: number | null`；`couponsView` 依 key 排序與 `data-coupon-key`；`canUse`、`couponActive` 改為結構型別並支援無最低車資；`perfect-week-panel` 以 `hooks.extraCoupons()` 併入推薦券（未確認時整份清單顯示同步中），推薦券不跳恭喜提示。
- **06A 整合（M5）**：`balance`／`ledgerRows` 接受 `PointBonus`（到期後不計入餘額、紀錄標示「已到期（不計入餘額）」）；`rewards-panel` 以 `hooks.bonuses()` 取得，未確認時餘額與紀錄顯示「—」。
- **main.ts**：`referralFeed` 建立後，乘車券、點數、推薦區塊共用；feed 變動時刷新乘車券與點數；`stopSharedSubscriptions` 停止 feed 與面板並清空推薦名稱快取。
- **預覽**：新增 `referral-new`、`referral-bound`；`coupons-list` 加入推薦券樣本。

**驗證**
- `npm test` 123/123（新增 `tests/referral-state.test.mjs` 7 條；`perfect-week-state` 的 `couponsView` 改用新型別）；`npm run test:rules` 114/114（新增 07A 5 條：綁定與拒絕、欄位、首乘只能一次（含時間推進後再按）、讀取與 list、兩人同時互填最多一筆成功）；tsc、build 通過。
- **Mutation**（`npm run test:rules:mutation:referral`）：28 項，24 被抓到、4 等價（r01／r02 互保；r05 推薦碼格式為縱深防禦；r17 `hasAll` 由「原值 null＋新值為時間」保證必改），0 意外存活。首輪 r15 存活（第二次首乘原被 `hasAll` 擋下而未測到本條件），已補「時間推進後再按首乘」測試。依核定規則，其他積木的 mutation 未重跑。
- 預覽 360 px：推薦區塊（已綁定、進度、首乘按鈕、我推薦的人）、乘車券混合清單正常，無橫向捲動。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |
| `tests/firestore-rules.test.mjs` | `ffa84beeec4012a0bb90e926518132c55847dcf55971c0d3386fa4fc9c314520` |
| `tests/referral-state.test.mjs` | `e13a627ce71deb2cad317f03b40d2ddf51ca38ac04ce71404bf1d2f3518940dc` |
| `tests/perfect-week-state.test.mjs` | `e785e83e87fcccba38e3c7814cbc10dde6af61631d80bbc36af193608300daf1` |
| `scripts/mutate-referral-rules.mjs` | `62227aa6ce85765ca795882efb190202a23d22ee00b6fffb366f31e7cc008e00` |
| `scripts/test-firestore-rules.ps1` | `a51eba582db7147341fe96cdc77a9f342126594ad3cf4e67e49f0c75270dd767` |
| `package.json` | `18cfd283a65e5cd9161c5109bd22e092b110bde694089f08c2b1563144a96e0a` |
| `src/referral/referral-state.ts` | `54cb259070d70a7811e7c8f4723b4d5ef4599775b1dbaef6145aace0e5d7731e` |
| `src/referral/referral-service.ts` | `8bc6ed863e1d72c99ea87076458d447dd2709561e93e763728c3d569c2d8fe7b` |
| `src/referral/referral-panel.ts` | `7a1b6f5b36fb379acc0cfdf06b466b5ff51f349b3cc6c4b6fe4d92bf34667dcf` |
| `src/rewards/chest-state.ts` | `1de18fefef9aa32a8eec84d6f4685ea03a28ac49aff9eae1d56a589ebdbd2a04` |
| `src/rewards/rewards-panel.ts` | `2551f7d3eb7e06fd12051d8e4d37729911d12d93c2a7ace6fff85f37c0d7793b` |
| `src/weekly/perfect-week-state.ts` | `01974b4b9473dd08a8a6c422f0a7c3e6a057912cb3a0f8726e2fc5fee13ccfe3` |
| `src/weekly/perfect-week-panel.ts` | `fe03b13b2080dffbec3aa0ec1aec271c47652a51680c277088ed735d3acc34a1` |
| `src/main.ts` | `a9c91888eb1845ed4a5339e8d08efb65b23e3b33bf0c12d0cd6b361f6169a12e` |
| `src/ui/views.ts` | `4a1328da62f6c97732214453888572c9108760c147f137a76ff32306d4b709e1` |
| `src/style.css` | `9074d4ae9f737858f7203825e0d8eb505ab3b7350fc12c62c29ce181ca5bb718` |
| `src/ui-preview.ts` | `e1111318cb99b908ee1edb3c093c85811e6f1434b5a237abba13abf9d1fffbd4` |

## QA／Security 審查與修正（2026-10-03）

- **QA（Sonnet）：通過**（`npm test`、tsc、build、`test:rules` 114/114 自行通過；契約 Q1–Q7、M1–M6 逐項符合；04A／06A 無回歸）。次要 1：推薦人名稱晚到時點數紀錄不會更新 → 推薦區塊名稱到達時也刷新點數區塊（`hooks.onNames`）。次要 2：另一台裝置已綁定同一碼時顯示成錯誤 → 改為成功。
- **Security（Opus）：附條件通過**，無 Critical／High；Rules 無可利用缺陷，快照核對、等價判定（r01／r02、r05、r17）自行驗證成立。
  - **M1**：並發互填測試在交易內另建 Firestore 實例，兩筆皆因「不同實例」失敗而假通過 → 改為同一實例；斷言改為**剛好一筆成功**、另一筆為 permission-denied 或 mutual；加單人綁定正向對照。（Security 於複本實測：一筆成功、另一筆被 Rules 拒絕。）
  - **M2**：發布清單仍為 AC1＋06A → 合併為 `發布與驗收清單_AC1_06A_07A.md`（舊檔刪除）：最終雜湊、D-07A 7 項、`memberProfiles` 必須剛好 6 份且 ID 正確的說明、回復時推薦關係留著無害。
  - **L1**：補「推薦人列舊場次被拒」「停用帳號按自己的首乘被拒」測試與 mutation r29、r30。
  - **L2**：契約 M2 改寫為「會透露其他成員本場次是否已被推薦（看不到推薦人）」。
  - **L3**：`ReferralService.bind`／`codeExists` 自行檢查推薦碼格式（縱深防禦）。
- **修正後驗證**：tsc、build 通過；`npm test` 123/123；`npm run test:rules` 114/114；**mutation 30 項：26 被抓到、4 等價、0 意外存活**。Rules 本身未變（`70acb267…`）。

**最終基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |
| `tests/firestore-rules.test.mjs` | `9c2ebd51df1310e7fd97f31d109acb5020d39d4ff6e5b6e5ec347502494cca9e` |
| `tests/referral-state.test.mjs` | `e13a627ce71deb2cad317f03b40d2ddf51ca38ac04ce71404bf1d2f3518940dc` |
| `tests/perfect-week-state.test.mjs` | `e785e83e87fcccba38e3c7814cbc10dde6af61631d80bbc36af193608300daf1` |
| `scripts/mutate-referral-rules.mjs` | `18ca023c987012a6ef85c95f89bfc405bec26a450874b09f5ef02142bf47ad11` |
| `scripts/test-firestore-rules.ps1` | `a51eba582db7147341fe96cdc77a9f342126594ad3cf4e67e49f0c75270dd767` |
| `package.json` | `18cfd283a65e5cd9161c5109bd22e092b110bde694089f08c2b1563144a96e0a` |
| `src/referral/referral-state.ts` | `54cb259070d70a7811e7c8f4723b4d5ef4599775b1dbaef6145aace0e5d7731e` |
| `src/referral/referral-service.ts` | `345174a7015c8beedb54c498669dbaa6af7fef9d272e4d2bda153ec16238534f` |
| `src/referral/referral-panel.ts` | `261a1068422765a1840acc9832e55366b2b76a728bdd91f0538feba289ad8159` |
| `src/rewards/chest-state.ts` | `1de18fefef9aa32a8eec84d6f4685ea03a28ac49aff9eae1d56a589ebdbd2a04` |
| `src/rewards/rewards-panel.ts` | `2551f7d3eb7e06fd12051d8e4d37729911d12d93c2a7ace6fff85f37c0d7793b` |
| `src/weekly/perfect-week-state.ts` | `01974b4b9473dd08a8a6c422f0a7c3e6a057912cb3a0f8726e2fc5fee13ccfe3` |
| `src/weekly/perfect-week-panel.ts` | `fe03b13b2080dffbec3aa0ec1aec271c47652a51680c277088ed735d3acc34a1` |
| `src/main.ts` | `b111d853343802b041705969ca4ecc9be487f2390ea7128407e0b8b88127fb09` |
| `src/ui/views.ts` | `4a1328da62f6c97732214453888572c9108760c147f137a76ff32306d4b709e1` |
| `src/style.css` | `9074d4ae9f737858f7203825e0d8eb505ab3b7350fc12c62c29ce181ca5bb718` |
| `src/ui-preview.ts` | `e1111318cb99b908ee1edb3c093c85811e6f1434b5a237abba13abf9d1fffbd4` |
| `發布與驗收清單_AC1_06A_07A.md` | `0d1f4e4cd422e7ce58b8135ff50f02933ee825bc148d8b40c7b7ee0ce510cf27` |
