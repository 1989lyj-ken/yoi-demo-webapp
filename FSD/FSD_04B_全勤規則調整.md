# FSD-04B 全勤規則調整：七天達標即全勤（取消「週日第三點」條件）

**狀態**：契約第 2 版（2026-10-05）。產品負責人裁決（見下）；Architect 附條件通過，阻擋 B1–B3 與條件 1–8 已併入（見文末）；產品負責人已確認 2 項（Rules 不加發券期限、發布時上週補發，2026-10-05），可交 Developer。**需修改 Rules（`rideCoupons` 發券條件）、不需重設場次**；與 FSD-03E 合併為同一次 Rules 審查與發布。

## 產品負責人裁決（2026-10-05）

> 領點是攸關有沒有拿到點數，跟有沒有全勤應該分開看。只要一週（週一到週日）七天都有達到 6,000 步就算全勤。

- 全勤＝該週週一至週日七天的**任務有效步數**都 ≥ 6,000（PRD §5.2 的「達標紀錄與點數領取分開」貫徹到底）。
- **取消**「領取週日第三點」條件；其他天、週日的點數領不領都不影響全勤與發券。
- 不變：週一到週日為一輪（不跨週合併）、券面額 NT$50、效期自入帳情境時間 30 天、最低車資 NT$150、每人每週一張、防重複。

## 影響與設計

### Rules（`firestore.rules` `rideCoupons` 區塊）
- 刪除發券條件中的 `couponDay(sessionId, memberId, monday, 6).claimed == 3`（現第 705 行）與相關註解（第 660 行「plus Sunday's third point」）；七份每日文件 `effectiveSteps >= 6000` 的驗證不變。
- 讀取份數仍是 9 份（`membersByUid`、`demo/current`、七份每日文件）。
- 補同步昨日（週一補週日）使週日達標時，仍可在週一發上週的券（01C D+1 規則不變）。

### 前端
- `perfect-week-state.ts` `weekVerdict`：`eligible = confirmed && achievedCount === 7`；`sundayClaimed` 不再參與判斷（可保留欄位供相容或移除）；`closed` 只看是否有 `missed`（不再有「週日第三點補領截止」）。
- 發券時機：第七天（含週一補同步週日）達標並經伺服器確認後，任一裝置的 settler 即發券（`perfect-week-settler.ts` 的觸發條件跟隨 `weekVerdict`）。
- 恭喜提示：仍在券入帳後第一次看到時顯示（觸發不再綁「領第三點」）。
- 文字：步數頁規則句改為「週一到週日每天任務有效步數都達 6,000，即可獲得 NT$50 乘車獎勵券。」；遊玩指南「七日全勤拿乘車券」同步；PRD §5.2、P10、P21、P22 與 04A 契約加註本次修訂（產品負責人確認後由主 Agent 修訂文件）。

### 相容
- 已發出的券不受影響。前端只結算本週與上週（上週在本週任一天都可能由 settler 補發）；更早的週，前端不發券。Rules 依 04A 設計不設發券期限，因此本場次內更早、七天已達標的週，在 Rules 層仍可被補發（展示版接受，與 04A 前提 3 一致；待產品負責人確認）。
- 舊前端在新 Rules 下：仍要求第三點才發券（較嚴，不會出錯）；新前端在舊 Rules 下：第三點未領時發券被拒，重讀後顯示「乘車券待發」；之後重新載入或資料變動時會再試一次（fail-closed，不會出錯，但不是完全不送）。因此**先發布 Rules、再部署前端**。回復：先回前端，再回 Rules 到 70acb267 快照（同時撤掉 03E 與 04B）；已用新規則發出的券保留且顯示不受影響。舊前端分頁跨越部署時可能把上週顯示成「已無法達成」，重新載入即修正。

## 測試
- Rules Emulator：七天 ≥ 6,000、週日 `claimed` 0／1／2 皆可發券；任一天 < 6,000 拒；他人、他場次、重複、欄位竄改照舊拒。更新原本「週日第三點未領應拒」的案例為「應通過」。
- mutation：重跑 coupon 區塊（`npm run test:rules:mutation:coupon`），更新變異清單（移除第三點相關變異）。
- 單元：`weekVerdict`（第三點未領也 eligible；某天未達 closed）、settler 觸發、文字。
- 移除 03E 與 04B 變更後應回到 `70acb267…`（04B 是修改既有區塊，需另存「04B 前」快照比對方式，由 Architect 指定）。

## 驗收
1. 某週七天有效步數都達 6,000，但週日（或任何一天）沒領第三點 → 仍取得 NT$50 乘車獎勵券並出現恭喜提示。
2. 某天未達 6,000 → 本週全勤顯示「本週全勤未達成，點數照常累積」（2026-10-06 文字調整）。
3. 週一補同步週日使七天達標 → 上週的券發出。
4. 規則句與遊玩指南文字已更新。

## 第 2 版修訂：Architect 審查（2026-10-05，Opus）附條件通過，已併入

### 阻擋項修訂
- **B1 雜湊核對（與 03E 共用）**：實作第 0 步把目前 `firestore.rules`（CRLF）轉 LF 存成 `tests/fixtures/published-rules-70acb267.rules`，測試驗 SHA-256＝`70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327`。新增測試「04B/03E：目前 Rules ＝ 70acb267 ＋ 04B 修改 ＋ 03E 區塊」：(1) 剝掉 `// ===== FSD-03E >>>`…`<<<`；(2) 對快照套用 04B 替換表：04A 區塊標頭註解（約第 659–660 行）舊句換新句、`>= 6000\n        && couponDay(sessionId, memberId, monday, 6).claimed == 3;` 換成 `>= 6000;`；(3) 每條替換斷言在快照中剛好出現一次；(4) 斷言完全相等。既有第 233 行測試改為對 70acb267 快照剝 AC1／06A／07A 後與 `6f5c1e4c`（去 gasSpike）比對。
- **B2 mutation**：`scripts/mutate-perfect-week-rules.mjs` 刪除 p27；p25（週日 6,000）拿掉 equivalent、必須被「週日 5,999」案例抓到；新增回歸變異「重新加回週日 claimed==3」須被「週日 claimed 0 也能發券」正向案例抓到；新案例名稱含 `04A`（或 pattern 改 `04A|04B`），`expectedTests` 同步更新。
- **B3 舊週追溯**：見上方「相容」修訂（前端只結算本週與上週；Rules 不設期限，更早的週在 Rules 層仍可補發，展示版接受）。

### 條件項
1. Rules 正反向測試（保留 `04A` 前綴）：`seedPerfectWeek` 預設週日 `claimed: 0`；週日 claimed 0／1／2／3 都能發券；七天逐日 5,999 各拒一次（含週日 5,999 且 `claimed: 3`）；週四缺文件、週日缺文件都拒；原「週日第三點未領→拒」翻轉為通過；測試標題更新；讀取份數仍 9 份。
2. `closed = !eligible && days.some(missed)`：週一週日為 syncable 不 closed、週二起週日未達才 missed。更新 `tests/perfect-week-state.test.mjs:46-49`、`tests/perfect-week-settler.test.mjs:37-43`，新增週一／週二案例。
3. 自 `WeekVerdict` 與 `PerfectWeekCard` 移除 `sundayClaimed`／`claimDeadline`，連帶改 `views.ts`、`perfect-week-panel.ts`、`ui-preview.ts`（含「週日第三點未領」標題）、`tests/app-layout.test.mjs`。
4. 文字：`PERFECT_WEEK_RULE` 與遊玩指南改為「週一到週日每天任務有效步數都達 6,000，即可獲得 NT$50 乘車獎勵券。」；鈴鐺通知不改。
5. 純展示模式 `src/showcase/app.ts`（發券條件與「完成七日全勤並領取第 3 點後自動獲得」文案）一併改。
6. 驗收補：「在模擬步數視窗內讓週日達標 → 關閉視窗後才出現恭喜提示，不與視窗重疊」。
7. 發布與回復：見「相容」修訂。
8. 文件修訂（產品負責人確認後由主 Agent 修訂）：PRD §5.2 第 121、127、129、133 行與 P21、P22；`FSD_04A` 前提 1、3、7 與相關行；`發布與驗收清單_AC1_06A_07A.md`、`FSD_08A-3`、`FSD_08A-6` 提到第三點處加註「04B 起不適用」。

### 建議項（採納）
- 測試計畫列出 PRD 驗收編號（P10、P21、P22）。

### 待產品負責人裁決
1. **舊週追溯**：Rules 要不要加發券期限（只能在當週或下週發）？Architect 建議**不加**（04A 刻意不設期限；s6 從 2026-10-05 開始，受影響舊週很少）。
2. **發布當下的上週**：發布時「上週七天達標、但沒領週日第三點」的人，會在本週任一天補發上週的券。建議**接受**。

### 產品負責人裁決（2026-10-05）
- 1. 舊週追溯：**不加** Rules 發券期限（展示版接受）。
- 2. 發布當下的上週：**接受**補發。

## 實作紀錄（2026-10-05，QA 附條件通過、Security 通過，建議項已修）

- **Rules**：刪除 `couponDay(sessionId, memberId, monday, 6).claimed == 3` 與註解「plus Sunday's third point」；與 03E 合併候選雜湊 `ffc851d07d033003a2c12f4b65a07f3bd5295bc2acc332892c0509cb661b1b90`。測試以替換表（每條斷言在快照出現一次）核對 70acb267＋04B＋03E。
- **Rules 測試**：`seedPerfectWeek` 預設不領點；週日 claimed 0／1／2／3 都能發券；七天逐日 5,999 各拒（週日 5,999 且 claimed 3）；週四、週日缺文件拒；原「週日第三點未領→拒」已移除並改為正向案例。
- **mutation**（`npm run test:rules:mutation:coupon`，pattern `^04A`、8 個測試）：38 個變異 33 殺、5 等價、0 意外；p25（週日 6,000）已改為必殺並被抓到；新增 p39（加回週日 claimed==3）被抓到；p27 刪除。
- **前端**：`weekVerdict` 改 `eligible = confirmed && achievedCount === 7`、`closed = !eligible && 有 missed`；`WeekVerdict`／`PerfectWeekCard` 移除 `sundayClaimed`／`claimDeadline`；規則句與遊玩指南改為「週一到週日每天任務有效步數都達 6,000，即可獲得 NT$50 乘車獎勵券。」；純展示模式改為七天達標即入帳（步數更新時也會顯示恭喜）。
- **驗證**：`npm test` 177/177、`npm run test:rules` 121/121。
