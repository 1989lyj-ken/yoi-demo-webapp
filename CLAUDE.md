# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 平台正式名稱：**yoi 遊移遊戲**（2026-10-04 起；文件中的「智行遊移」為舊稱，指同一產品）。

## 必讀來源與優先順序

- `AGENTS.md`：專案規範（產品邊界、積木流程、共用規則）。本檔不重複其內容，**動手前必讀**。
- `HANDOFF.md`：最新交接快照（目前實測狀態、進行中的 03B、建議接手順序）。接手時先讀，並以實際重跑結果為準。
- `PRD/智行遊移_PRD_v0.1.md`：產品規則來源（以文件內版本為準）。`PRD/` 下的 RFP 與 `_0924` 為舊版／參考，不要當成最新決策。
- `FSD/`：各積木契約。`FSD_03B` 已改為單一 canonical schema（含審查基準雜湊與產品負責人裁決紀錄）；`FSD_03A` 的 `teamCodes` 描述僅為歷史紀錄。
- `UI-design/`：設計交付包（從 `00_先讀我.md` 開始；參數總表在 `01_規則/1-1_PRD_規則總表.md` 第 4 章）。其中 `3-2_AI情境卡` 屬後續版本，首版不做。
- 本目錄**不是 Git repository**；不要為接手而重建、覆蓋或刪除既有檔案。

## 常用命令

```bash
npm run dev          # Vite 開發伺服器 http://localhost:5173/
npm run build        # vite build → dist/（單一 JS bundle >500 kB 警告非阻斷）
npx tsc --noEmit     # 型別檢查（tsconfig 只含 src/，noEmit、strict、noUnused*）
npm test             # tests/*.test.mjs 單元測試（不連雲端；gas-spike 已於 06A 移出）
npm run test:rules   # 本機 Firestore Emulator 跑 tests/firestore-rules.test.mjs
npm run test:all     # npm test + test:rules
```

單一測試（皆為 `node:test`）：

```bash
node --experimental-strip-types --test --test-name-pattern="ride event" tests/daily-state.test.mjs
```

- `tests/daily-state.test.mjs` 直接 import `src/**/*.ts`，因此需要 `--experimental-strip-types`。
- `test:rules` 由 `scripts/test-firestore-rules.ps1` 執行：要求 `%TEMP%\yoxi-firestore-emulator-runtime` 下已有本機 JRE 與釘選的 Firestore Emulator JAR（版本、大小、SHA-256 皆驗證，不會自動下載）、`firebase-tools` 15.32.0、Emulator 綁 `127.0.0.1:8088`、專案 ID `demo-yoxi-yoi-rules-test`（設定在 `firebase.rules-test.json`）。只影響本機，不會發布雲端規則。若要只跑某條 Rules 測試，需在同樣環境下以 `firebase emulators:exec` 包住 `node --test --test-name-pattern=... tests/firestore-rules.test.mjs`。
- TypeScript／build 通過不代表共享功能可用；涉及權限或跨帳號行為，必須以 `test:rules` 驗證。

## 架構概觀

Vite + TypeScript + Tailwind v4（無框架，直接操作 DOM 字串模板）。前端直接用 Firebase JS SDK 讀寫 Firestore；**跨帳號權限與防重複的真正保障在 `firestore.rules`**，前端只是 UX。

### 前端分層（`src/`）

- `main.ts`：組裝服務並渲染登入頁 → 登入後預設進 `showcase/app.ts`（純展示、本機模擬狀態），可切換到 `showSharedSession`（真實共享薄片：今日步數／乘車加成／領點 + 團隊共享）。
- `identity/`：FSD-02。`contracts.ts` 定義 `IdentityProvider`、`SharedContextStore`、`AuthenticatedSession` 等介面；`firebase-*`／`firestore-*` 為實作，`unconfigured-*` 為未設定時的 fail-closed 替身。`SessionService` 組合兩者：Firebase Auth UID → `membersByUid/{uid}` 對應展示成員 → `demo/current` 取得 `sessionId`、`clockVersion`、`scenarioNow`、`activityWeekId`。
- `daily/`：FSD-01。`DailyService` 以 transaction 寫 `dailySteps/{sessionId}/members/{memberId}/days/{taskDate}`，每次重新讀 `demo/current` 與成員對應並核對 `clockVersion`。`daily-state.ts` 的 `dailyStateDominates` 用於只接受「不比已確認狀態舊」的快照（步數／點數不可回退、乘車時間不可替換）。
- `team/`：FSD-03A/03B。`TeamService` 讀寫 `teams/{sessionId}/items/{teamId}`（邀請碼即 teamId）、`teamMembership/{sessionId}/members/{memberId}`、事件 `teams/.../events/{revision}`，並訂閱隊員的 `dailySteps`。`activity-week.ts` 由台北時間推算週 ID；`requireActivityWeek` 在 `demo/current.activityWeekId` 缺少時 fail closed。
- `firebase/config.ts`：公開的 Web App 設定（非機密，存取控制靠 Auth + Rules）。

### UI 狀態慣例

共享畫面只把**伺服器確認**的快照視為已同步：`fromCache`、`hasPendingWrites` 或文件不存在時停用操作並顯示「同步中／未確認」。寫入失敗時提示「不要盲目重送」。修改畫面時維持這個 fail-closed 行為。

### 共享端（`firestore.rules`）

- 各路徑規則：`membersByUid`、`memberProfiles`（AC1）、`demo/current`、`demoClockLog`、`dailySteps`（含 `events`）、`teams`、`teamMembership`、`teams/.../events`、`teamContrib`、`teamWeeks`、`chestAwards`、`rideCoupons`、`chestOpens`（06A），其餘一律拒絕（`gasSpike` 已於 06A 移除）。
- 寫入必須驗證 session／clockVersion 與身分對應、不可下修、領點依序且防重複，並跨文件用 `getAfter`/`existsAfter` 驗證原子交易。
- 已知限制：Firestore Rules 單次評估 1000-expression 上限（03B 因此改為單一 canonical schema）；Rules 語言的 list 不支援 `+` 串接。

### `gas-spike/`

FSD-05 的 Apps Script 共享端可行性試驗，**已停用**（2026-10-03 產品負責人決定不保留，雲端專案已移除；06A 移除 `gasSpike` Rules 並把 `Code.test.mjs` 移出 `npm test`）。檔案僅作紀錄保留，`gas-spike-test.html` 仍可由 Vite dev 開啟但已無雲端端點。詳見 `gas-spike/README.md`。

## 雲端操作邊界

Firebase 專案、Rules 發布、部署、雲端資料變更／重設、Apps Script 部署與帳號管理由產品負責人執行；只可在本機驗證後把待發布 Rules 與操作清單交給產品負責人。`PRD/YOI team member accounts.md` 可能含帳號資料，不要複製到其他檔案或輸出。
