# FSD-02 Firebase 資料模型與 Rules 草稿

**用途**：將 FSD-02 登入與身分契約落到 Firebase Web SDK 與 Cloud Firestore。此文件及 `firestore.rules` 是本機開發草稿；尚未經 Firebase Emulator 驗證，也未貼入 Firebase Console 或部署。不得將本草稿視為雲端目前已套用的安全規則。

## 文件模型

### `membersByUid/{FirebaseAuthUid}`

由產品負責人透過受控管理方式預先建立；Web App 不提供建立、修改或列舉權限。

| 欄位 | 型別 | 規則 |
|---|---|---|
| `memberId` | string | 穩定且六人間唯一；不得使用 email 或顯示名稱 |
| `role` | string | 僅 `member` 或 `admin`；應用程式管理者不是 Firebase 專案管理員 |
| `displayName` | string | 非空顯示名稱 |
| `active` | boolean | 僅 `true` 可進入展示場次；停用時設為 `false` |

文件路徑直接以 Auth UID 尋址，登入者只能讀自己的 mapping。任何 client write/list 一律拒絕。

### `demo/current`

由管理者受控建立的唯一目前展示情境文件；本積木只讀取，client 不可寫。

| 欄位 | 型別 | 規則 |
|---|---|---|
| `sessionId` | string | 非空；重設場次時改用新 ID |
| `scenarioNow` | string | 含時區的 ISO 8601 日期時間，例如 `2026-09-29T12:00:00+08:00` |
| `clockVersion` | integer | 非負整數；情境時間或場次每次變更都必須遞增 |

登入解析時只接受有效 active member。讀取期間若 `sessionId`、`clockVersion` 或 `scenarioNow` 改變，重試一次；仍持續變動就拒絕載入，要求重新整理。

## 現行 Rules 邊界

- 未登入一律拒絕。
- 登入者只能 `get` 自己的 `membersByUid/{uid}`；不可列舉、建立、修改或刪除任何 mapping。
- 只有 active member 可 `get` `demo/current`；任何 client 寫入均拒絕。
- 其他所有集合／文件目前全拒絕，後續積木須逐份 Rules 審查後才開放。

## 建置與部署前驗證

1. 先用 Firebase Emulator 測試：未登入、未映射、inactive、讀自己／讀別人、list、任一 write 及其他集合皆應符合上述結果。
2. 產品負責人建立測試 Auth 帳號後，以 Auth UID 建立 mapping；確認六個 `memberId` 唯一。不得在 client 寫入這些文件。
3. 先初始化 `demo/current`，再由產品負責人審核並手動套用 Rules；套用前不得把資料庫設成公開或開放測試規則。
4. 用測試帳號完成登入、重整恢復、未映射拒絕、停用拒絕與 Firestore 讀取驗證。之後才開發身份下游的共享資料寫入規則。

**目前未完成**：Emulator 測試、Firebase Console 套用 Rules、測試 Auth UID／mapping／demo seed、真實登入及 Firestore 整合測試。產品正式展示信箱仍可後補。
