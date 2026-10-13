# FSD-01A｜Firebase 今日步數與領點最小共享流程

> **已被取代（2026-10-01）**：資料格式與 Rules 由 [FSD-01C](FSD_01C_每日步數規則收斂與昨日補同步補領.md) 取代（新場次單一格式，不遷移）。本文僅保留為歷史紀錄。

狀態：本機實作／規則模擬器通過；**未發布雲端 Rules，未驗證真實 Firebase 多裝置**。依 PRD v0.13 §5.1 與 P03–P05、P19、P26 的今日無乘車加成部分。此為加速展示的薄片，不取代 FSD-01 全契約。

| 契約 | 本薄片 |
|---|---|
| 責任 | 登入後讀取當前場次、今日任務日、本人的模擬原始步數；步數單調增加；依 2,000／4,000／6,000 門檻逐點或全部領取。 |
| 輸入 | Firebase Auth UID → `membersByUid/{uid}` 固定 memberId；`demo/current` 的 sessionId、scenarioNow、clockVersion；本人步數或領點命令。 |
| 資料擁有者 | `dailySteps/{sessionId}/members/{memberId}/days/{taskDate}`；七欄精確形狀：sessionId、memberId、taskDate、clockVersion、rawSteps、claimedMilestones、points。初始零文件；points 僅是本日已領點數，非完整餘額或帳本。 |
| 讀寫與防重 | Firestore Rules 限當前場次、當前 +08:00 任務日及 UID 對應 memberId；禁止 list／刪除／跨帳號、下修與混合步數領點；交易並發重試，重複領點不增加 points。「全部領取」一次交易到當前最高已解鎖點，保持連續序列。 |
| 輸出 | onSnapshot 含 metadata changes；僅 `!fromCache && !hasPendingWrites` 且文件存在時開放操作。初始化查詢強制伺服器讀取；離線快取不算成功。交易已確認的新數值不會被較舊快照覆蓋。介面分開標示原始／有效步數；此薄片有效＝原始，明示尚無乘車加成。 |
| 失敗與重試 | 錯誤顯示未確認，未從伺服器確認前不宣稱入帳；斷線停用操作；情境場次或時間變更後提示重載。 |
| 依賴 | Auth、既有 `membersByUid`、`demo/current`。上線需產品負責人審核並發布 Rules；不得把本機通過視為雲端可用。 |

未涵蓋：乘車加成、步數片段／發生時間、昨日補同步／補領、站內通知、全勤券、團隊與邀請、寶箱、獎勵總帳、跨帳號讀取。後續加上步數片段與帳本時應保留或遷移此薄片資料，不能直接把本欄位當完整 Points 餘額。
