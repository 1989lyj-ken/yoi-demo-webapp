# FSD-05｜Apps Script 共享端可行性驗證（v0.1）

**目的**：在既有 `yoxi-yoi-demo` 專案，以隔離的 `gasSpike` 文件路徑驗證 GAS Web App、Firebase Authentication 與 Firestore REST 的整合；不實作正式步數／點數資料，不改動既有展示資料。依 PRD §3.2、§5.1、§8、P05/P16/P19/P26 與 FSD-01/02。此 Spike 不改變既定產品規則。

## 契約

| 項目 | 定義 |
|---|---|
| 範圍 | GAS `doPost` 僅接受 `bumpSteps`、`claimPoint` 兩種固定命令；只讀 `membersByUid/{authUid}`、`demo/current`，只寫 `gasSpike/{sessionId}/members/{memberId}`。不接受任意 collection、文件路徑、UID、memberId、role 或 sessionId 作為授權依據；任何額外欄位拒絕。 |
| 身分 | 請求 body 傳 Firebase ID token、`expectedSessionId`、`expectedClockVersion`。後兩者僅作新鮮度比對，不決定資料擁有者或寫入路徑。GAS 呼叫 Firebase Auth `accounts:lookup`，在成功後檢查唯一帳號、`disabled`、token `aud`／`iss`／`sub`／`exp`／`iat`／`auth_time`，並以秒檢查 `auth_time >= validSince`；再從 UID 對應取得 active member。失敗一律拒絕。Token 不進 URL、回應或日誌。 |
| Firestore 驗證 | GAS 以呼叫者原始 Firebase ID token 呼叫 Firestore REST，讓 Firestore Security Rules 繼續生效；不使用部署者 OAuth／服務帳戶，不繞過 Rules。所有 Firestore 讀寫在同一 REST transaction 中讀取 mapping、`demo/current` 與 spike state；須比較 `expectedSessionId/expectedClockVersion` 與交易讀到的最新情境，不符即拒絕。GET 使用 `/v1/projects/yoxi-yoi-demo/databases/(default)/documents/{document_path}?transaction={txn}`。 |
| Spike 狀態 | 單一 state 文件包含 `sessionId`、`clockVersion`、`rawSteps`（非負整數、只能不減）、`claimedMilestones`（合法狀態僅 `[]`、`[1]`、`[1,2]`、`[1,2,3]`）、`points`（必須等於已領里程碑數）。初始為目前場次／版本及 `0 / [] / 0`。本 Spike 僅測無乘車加成的 2,000／4,000／6,000 門檻。 |
| 規則 | Firestore Rules 僅放行 active 使用者對映射到自己的當前 `sessionId` spike state 執行 get/create/update；拒絕 list/delete 與其他寫入。Rules 驗證欄位 allowlist、同 UID/member mapping、當前場次、目前 `clockVersion`、步數不下修及點數一致。`sessionId` 與 owner 固定不可變；同一場次中 clockVersion 只可非遞減，且任何步數／領點更新後 state 的 clockVersion 必須等於交易讀到的 demo/current 版本。每次更新只能是：(a) `bumpSteps`：增加 `rawSteps`，`points/claimedMilestones` 不變；或 (b) `claimPoint`：步數不變，里程碑只能由 `[]→[1]→[1,2]→[1,2,3]` 單步前進，且分別達 2,000／4,000／6,000，points 僅同步加 1。兩種更新均可同步推進 state.clockVersion 至目前版本。create 僅允許初始 0／[]／0 並帶目前場次／版本。直接繞過 GAS 的 Firestore SDK/REST 請求仍須通過相同 Rules。 |
| 冪等／並行 | 同一 state 文件以 Firestore transaction 讀改寫；相同里程碑重送不得增加點數；衝突有限次重試並回傳最新共享狀態。步數更新與領點是分開命令，不得同筆合併。命令回應不包含 token 或 OAuth 憑證。 |
| 驗收 | 有效／偽造／過期／錯專案／停用／撤銷 token；偽造 UID、memberId、role、sessionId、命令及額外欄位；直接繞過 GAS 下修步數、跳點、超門檻前領點、改餘額、跨 UID／場次與 list/delete；雙裝置並發高低步數、重複領同一點；瀏覽器實測 GAS POST、redirect、CORS、回應與錯誤處理。所有負向請求均不得改變 spike 或正式功能資料。 |
| 風險／限制 | Firestore Rules 無法辨別同 UID 的請求是否經 GAS；本驗證證明的是「GAS 流程可與 Rules 保護的 Firebase 身分及 Firestore 交易共存」，不是 GAS 為唯一可信寫入入口。既有 `firestore.rules` 尚未放行 `gasSpike`；雲端發布前須產品負責人明確核可。GAS 端點公開可呼叫權限亦須在部署 UI 最後一步確認。 |

## 安全邊界

- 規則不得放寬既有 `membersByUid`、`demo/current` 或 catch-all deny；規則讀取次數須符合 Firestore 每次操作 10 次、每交易 20 次文件存取上限。
- 本 Spike 不連結產品 UI，不寫入正式功能集合，不清除測試文件；只允許自行帳號／當前場次的 `gasSpike` state。
- 服務端與 Rules 均固定資料路徑及欄位；前端傳來的識別欄位不可決定資料擁有者。
- 只在 Apps Script manifest 宣告必要的 `script.external_request` scope；不宣告 `datastore`、不建立服務帳戶金鑰。
