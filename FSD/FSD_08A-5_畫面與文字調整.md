# FSD-08A-5 畫面與文字調整（13 項）

**狀態**：第 1 版（2026-10-05）。產品負責人裁決 13 項並確認 A、B、C；指示「直接實作、交 QA 審查、不另送 Architect，完成後直接部署」。**不改 Rules、不重設場次、不改服務與狀態純函式**；只部署前端。含 08A-4 之後本機已完成、尚未上線的兩項（模擬按鈕腳步圖示 D6、複製推薦碼「已複製」）。

## 產品負責人裁決（2026-10-05）

| # | 裁決 | 實作 |
|---|---|---|
| 1 | 推薦碼維持在「邀請」頁（台新 Richart Life 式），備註改為「新戶首次登入後 3 天內綁定即完成註冊任務，可得 NT$50 推薦獎勵券 ×2。」；不實際檢查 3 天 | `referralView` 備註文字 |
| 2 | 刪除 5 句：(1) 模擬乘車揭露 (2) 已從共享服務同步 (3) 隊伍及今日隊員狀態已由伺服器確認 (4) 隊員步數經伺服器確認後才顯示 (5) 「；車資試算不會實際核銷」 | 同步成功時狀態改空白（`.yo-status:empty` 隱藏）；同步中／儲存中／失敗／請勿重送等提示保留（fail-closed） |
| 3 | 「個人週任務」字級與今日卡「個人任務」相同 | 原因：`.yo-panel p` 把今日卡小標放大為 body-sm；週任務小標補同一字級 |
| 4 | 團隊頁「一起走更有趣」上方多一段空白 | 移除舊 `.team-panel` 上方間距（`.app-block.team-panel { margin-top: 0 }`） |
| 5 | 團隊頁刪除邀請碼與複製按鈕，邀請統一在「邀請」頁 | 橫幅只留狀態與隊名；移除 `#team-copy-code`、`#team-copy-status` 與面板複製邏輯 |
| 6 | 隊員卡「乘車加成已生效」移到下一行 | 獨立一行 `<small>` |
| 7 | 獎勵頁刪除車資試算 | 移除標題、輸入框、結果與面板輸入監聽；AC1 R6 隨之失效（純函式 `canUse` 保留未用） |
| 8 | 「我的乘車券」→「我的獎勵券」（A：連同「查看乘車券」→「查看獎勵券」、「還沒有乘車券」→「還沒有獎勵券」）；券名不變 | 文字 |
| 9 | 「已入帳」印章在推薦券與全勤券都移除；「已過期」印章也移除，過期的券直接不顯示（B） | `couponsView` 只列有效券、無印章；相關樣式移除 |
| 10 | 步數點數走滿三點時最右段改墨藍 | `progressTrip` 走滿段一律 `done`（墨藍）；偏離規格 8.11「第 3 段填 brand-red」，登記 UI01 |
| 11 | 漢堡選單圖示與 yoxi 官方首頁相同（C：墨藍實心圓、白色三條線、兩端紅色） | `menu` 圖示改為白條＋icon-red 端點；按鈕墨藍圓底 |
| 12 | 全勤券獲得後才出現在獎勵券 | 移除「尚未獲得」佔位卡與 `couponPlaceholderText` |
| 13 | 今日卡「個人任務」上方加「今日里程碑」，字級同「一起走更有趣」 | `.yo-kicker-tag`（type-tag 12px） |

## 驗證

- `npx tsc --noEmit` 通過；`npm test` **164/164**（更新 app-layout、perfect-week-state、referral-state 斷言；新增 08A-5 測試：備註、今日里程碑、選單紅端點、字級／間距／選單 CSS、移除的樣式、同步成功訊息移除但問題訊息保留、券只列有效且無印章與輸入、團隊無邀請碼與乘車加成獨立一行）；`npm run build` 通過；Rules 未變（`70acb267…5327`）。
- 預覽量測：今日卡小標 16px、週任務小標 16px、「今日里程碑」12px；團隊與獎勵頁標題距頁首皆 0px；選單按鈕墨藍圓底白色。
- 驗收：`發布與驗收清單_AC1_06A_07A.md` 新增 H 段（H1–H12），D 段第 6 項、F5、F6 標註不適用；`驗收指令_給agent.md` 第 6 項標註不適用、「我的乘車券」改「我的獎勵券」。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/ui/views.ts` | `9a7e451a22d7c7de293aefa63096f5f6869b5406b2e9b89b198e4e67f19b2ad9` |
| `src/ui/components.ts` | `de1eefe88228f3acdc093a5514798d8cb628ca33881858aca3a4b300b8f6d546` |
| `src/ui/icons.ts` | `7d1b0a0a6c3dd9ce09f93d0e44300044457b2a863bca512bcb1bf3ea87aa9881` |
| `src/style.css` | `83f73294803e4ef4b2e50cf231b5fe3134f34ee541bf9bff74e7a26c7992f969` |
| `src/main.ts` | `fde66aee4e3f33092d3966b93be76fa4e51e00d6619d9ff28fa13a7c42cabc5f` |
| `src/team/team-panel.ts` | `1b2f92aa18cf920429598360ce93b650287d4efabb89ed69dd378b74820b26fe` |
| `src/weekly/perfect-week-panel.ts` | `e781cfa90f312f03529ab70b9965d11440cfdb368a6e6455436445944d9462a4` |
| `src/referral/referral-panel.ts` | `138097b70996ec848a9e86a450170fb2d07a0d7f2deda6b4d034cc4f9e45da12` |
| `src/ui-preview.ts` | `d45cfe1b6dd96c6c3242b419d5c29b26c50afcde3d446bf56346a64eea0ecef0` |
| `tests/app-layout.test.mjs` | `36f808bc7cd7be70402ba5b1aa2dcb0da9f93e0642fb19ece30b338a175985e7` |
| `tests/perfect-week-state.test.mjs` | `53eb5e687319407de93ea16656dfccc1218855116bf39b3e135ef0be2940b458` |
| `tests/referral-state.test.mjs` | `f3af869888a7c99b49eeaa3f201eee5eecf79e1801759cf1c4c84eb49a0624b8` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |

## QA 審查與修正、部署（2026-10-05）

- **QA：程式無阻擋**（13 項落實、fail-closed 訊息保留、164/164）。**文件阻擋 3 項已修**：清單第 20 項改為「推薦獎勵券從我的獎勵券消失」；F4 移除「第 3 段轉紅」改註 H9；`驗收指令_給agent.md` 團隊組隊步驟改為到「邀請」頁複製邀請碼、按鈕名稱「加入」。`FSD_07A` 驗收第 4 項加註 08A-5 起過期券不顯示。
- 非阻擋處理：清單「查看乘車券」→「查看獎勵券」、F8 移除不驗的第 6 項；`views.ts` 移除舊印章註解，「正在讀取乘車券…」「點數、寶箱與乘車券都在這裡。」改為獎勵券；移除未用 `.yo-banner-button` 與 `.yo-team-banner :focus-visible`；預覽 `coupons-list` 移除車資欄位設定。修正後 tsc、164/164、build 通過。
- **部署**：依產品負責人指示（完成後直接部署、不碰 Rules），`firebase deploy --only hosting`，Deploy complete；線上資產與本機一致、含「我的獎勵券」與新推薦備註。Rules 未發布（`70acb267…`）。
- `src/ui/views.ts` `120ce6715f5f6cf0…`
- `src/style.css` `b92ae52ca25e0dad…`
- `src/ui-preview.ts` `32e387d096e8d588…`

## 追加（2026-10-05）：獎勵券文字

- 金額右邊的「（模擬）」刪除；推薦券的「（新戶）／（推薦人）」移到金額下一行（`.yo-coupon-role`）；「・可使用」刪除；「入帳」與「到期」分兩行。驗收清單新增 H13，清單第 16、18 項與 `驗收指令_給agent.md` 第 16、18 項的券名同步。`npm test` 164/164（更新券文字斷言）、tsc、build 通過；Rules 未變。到期後的「（情境時間）」也刪除（產品負責人 2026-10-05）。`src/ui/views.ts` `9cda2fc0268e1806…`。**已部署 Hosting（2026-10-05，產品負責人指示；Rules 未動）**，線上資產與本機一致。
