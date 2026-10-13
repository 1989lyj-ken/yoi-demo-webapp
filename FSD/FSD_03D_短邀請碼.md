# FSD-03D 短邀請碼（備案，待產品負責人決定是否開發）

**狀態**：備案（2026-10-04 產品負責人要求列為獨立積木；是否開發之後再決定，不開發不影響其他積木）。尚未進行契約審查。

## 需求

團隊邀請碼目前是 16 碼十六進位（例如 `A1B2C3D4E5F60718`），產品負責人希望改成短碼（例如展示版的 `YOI-RKF5`），方便口頭或手動輸入。

## 現況限制

- 邀請碼就是隊伍文件 ID（`teams/{sessionId}/items/{teamId}`，`inviteCode == teamId`）。`firestore.rules` 第 248、625 行要求 `^[A-F0-9]{16}$`，團隊、`teamContrib`、`teamWeeks`、`chestAwards` 都依賴此格式；前端 `team-service.ts`（`randomCode`）、`team-state.ts`、`week-result-state.ts` 也驗證 16 碼。
- 03B 曾因 Rules 1000-expression 上限移除 `teamCodes` 索引；以對照表實作短碼需重新評估 Rules 預算。
- 知道邀請碼即可讀取未封存的隊伍（第 351 行）；碼越短越容易被猜，需評估（展示版僅 6 個帳號，風險低但要記錄）。

## 可能做法（待評估）

| 做法 | 影響 |
|---|---|
| A 縮短 teamId 本身（例如 6–8 碼） | 改 Rules 與前端格式驗證；需碰撞重試；`s6` 既有隊伍不符新格式，須重設場次 |
| B 新增短碼對照集合 | 既有隊伍可保留；但需加回索引與跨文件原子驗證，受 1000-expression 上限風險 |

## 若決定開發

需完整流程：Architect 契約審查 → 實作 → QA／Security 審查、`test:rules` 與團隊相關 mutation 重跑 → 產品負責人發布 Rules（做法 A 另需重設場次）。
