# FSD-08A-4 主畫面圖示、模擬步數視窗與今日卡片合併

**狀態**：契約第 3 版（2026-10-04）。產品負責人已裁決 D1–D4；Architect 兩輪附條件通過並併入（見文末）；Developer 實作完成；Security 通過、QA 文件阻擋已修，審查完成，待部署與驗收。**不改 Rules、不重設場次**；上線只需部署前端。接在 08A-3（已部署）之後。

## 緣由

1. iPhone「加入主畫面」的捷徑顯示字母「Y」：網站未提供 `apple-touch-icon`，iOS 以標題首字母自動產生。
2. 模擬步數輸入在今日任務卡內；按下儲存時畫面已捲離地圖，看不到大步數的滾動動畫（08A-3 B1）。
3. 今日「步數點數」與「今日里程碑」是兩張卡，產品負責人希望合併。

## 產品負責人裁決（2026-10-04）

| # | 裁決 |
|---|---|
| D1 | 主畫面圖示改為 yoi 魷魚；主畫面名稱為「**yoi**」 |
| D2 | 模擬步數改由地圖右下角的小按鈕（鉛筆圖示＋「模擬」小字）開啟由下方滑出的小視窗輸入；儲存成功後視窗自動關閉，使用者直接看到地圖大步數滾動；失敗時視窗不關、訊息留在視窗內。今日任務卡內的輸入框移除。昨日補同步維持在昨日卡片，不搬動 |
| D3 | 今日兩張卡合併為一張，由上而下：① 腳步進度條 ② 乘車模擬（乘車加成、揭露、「模擬完成一趟 yoxi」）③ 步數達成與領點（里程碑、全部領取） |
| D4 | 「模擬完成一趟 yoxi」改為小按鈕，放在「乘車加成：尚未模擬搭乘」文字的右邊（同一列）。按鈕文字縮短為「模擬一趟」，`aria-label` 保留完整「模擬完成一趟 yoxi」；ID `#today-simulate-ride` 與停用規則不變（未確認或已乘車時停用）。已乘車後狀態文字「已生效（1.5 倍）」，按鈕保持停用 |

## 不變（硬性條件）

- 不改服務、狀態純函式、Rules（`70acb267…5327`）、讀寫路徑與訂閱次數。
- AC1 R1（步數只增不減、按鈕只在步數增加時可按、提示文字、Enter 不送出不合格值）與 fail-closed（未確認時停用、結果未確認時重讀、不自動重送）完全沿用。
- 每日控制器依賴的元素 ID 全部保留（08A-3 C1）：`today-steps-form`、`today-steps-input`、`today-steps-hint` 搬進視窗但 ID 不變；表單內仍只有一個按鈕。
- 08A-3 的動畫規則（B1）、地圖定位隱私、覆蓋層互斥、鈴鐺錨點不變。

## 設計

### 1. 主畫面圖示（D1）

- 由 `UI-design/yoi LOGO_去背.png` 的魷魚區域（x 200–485、y 135–470）裁切，白底置中、四周留約 12% 邊，輸出 `public/apple-touch-icon.png`（180×180）與 `public/favicon-32.png`（32×32）。原始檔不改。
- `index.html` 加：`<link rel="apple-touch-icon" href="/apple-touch-icon.png">`、`<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`、`<meta name="apple-mobile-web-app-title" content="yoi">`。不加 `apple-mobile-web-app-capable`（不改變開啟方式）。
- 使用者須**刪除舊捷徑後重新「加入主畫面」**（iOS 快取舊圖示）。

### 2. 模擬步數視窗（D2）

- **開啟按鈕** `#steps-sheet-open`：在地圖下緣右側、大步數卡旁（`.app-map-bottom` 同一列），鉛筆圖示＋「模擬」，觸控區 ≥ 44 px，不遮 OSM 署名與定位點。`aria-haspopup="dialog"`、`aria-controls="steps-sheet"`。
- **視窗** `#steps-sheet`（掛在外殼內、平時 `hidden`）：`role="dialog"`、`aria-modal="true"`、標題「模擬今日步數」；內容＝原 `#today-steps-form`（輸入框、「儲存步數」、`#today-steps-hint`）＋視窗訊息列 `#steps-sheet-msg`（`role="status"`）＋「關閉」按鈕。Tab 鎖在視窗內、Esc 與點遮罩關閉、關閉後焦點回到開啟按鈕。
- **開啟條件**：其他覆蓋層（過期提示、昨日補領提示、全勤恭喜、團隊確認、開箱、漢堡選單、通知面板）開著時不開啟；視窗開著時，上述提示延後（併入各面板的 `otherDialogOpen` 與外殼的 `overlayOpen`），漢堡選單與鈴鐺不開；過期提示仍最上層並關閉視窗。關閉後依既有順序重新評估延後的提示（昨日提示 → 全勤恭喜）。
- **與每日控制器的介接**（小幅）：`mountDailyPanel` 新增選用回呼 `onStepsResult(result)`，只在「儲存步數」這個命令結束時呼叫：
  - 寫入完成且伺服器已回傳（`寫入完成…` 或「沒有變更」）→ 外殼關閉視窗。
  - 失敗或結果未確認 → 視窗不關，`#steps-sheet-msg` 顯示與 `#today-error`／`#today-status` 相同的文字（不另寫規則）。
  - 同步中、未確認時：視窗內輸入框與按鈕依既有規則停用，`#steps-sheet-msg` 顯示「同步中，暫時無法儲存。」
- 開啟視窗時，輸入框帶入目前已確認的原始步數並聚焦；離開步數頁、登出、過期時關閉視窗。
- 視窗關閉後地圖大步數依 B1 滾動（視窗為覆蓋層，不影響 `setVisible`）。

### 3. 今日卡片合併（D3）

單一卡片 `.yo-panel`（`data-day="today"` 仍在外層）：
1. 標頭：kicker `#today-date`（「YYYY-MM-DD 個人任務」）、標題 `#today-title`「步數點數」（`tabindex="-1"`）、右側 `#today-points`「N／3 點」；說明「每 2,000 有效步數解鎖 1 點，必須依序領取。」
2. ① 腳步進度條 `#today-trip`＋「原始 N 步・有效 N 步｜最多 3 點／日」。
3. ② 乘車模擬（D4）：一列「乘車加成：`#today-ride-state`」＋右側小按鈕 `#today-simulate-ride`（compact 樣式，觸控區 ≥ 44 px）；下方一行 N1 揭露。
4. ③ 里程碑 `#today-milestones`（`tabindex="-1"`）、`#today-claim-all`、`#today-status`、`#today-error`。

`#today-card-title` 移除；鈴鐺錨點 `#today-milestones` 不變。診斷畫面（`sharedShellView`）沒有地圖：今日步數表單在診斷畫面維持在卡片內（不用視窗），由 `dailyPanelView("today", { stepsInSheet })` 參數決定。

## 測試與驗證

- 單元測試：外殼含 `#steps-sheet-open`、`#steps-sheet`（`hidden`、`role="dialog"`）且 `#today-steps-form` 在視窗內、全頁 ID 唯一；診斷畫面表單在卡內；合併卡片內三區塊順序（trip → ride → milestones）；`index.html` 含三個圖示／名稱標籤且檔案存在、尺寸正確（180、32）。
- `npx tsc --noEmit`、`npm test`、`npm run build`；`test:rules` 確認雜湊不變（不跑 mutation）。
- 預覽 360 px：地圖右下按鈕不重疊、視窗開關、無橫向捲動；以開發伺服器掛載驗證「儲存成功 → 視窗關閉 → 大步數滾動」（以假服務或手動呼叫回呼）。
- 審查：Architect → Developer → QA／Security → 修正 → 產品負責人。

## 驗收

1. 刪除舊捷徑、從 Safari 重新加入主畫面：圖示為魷魚、名稱「yoi」。
2. 步數頁地圖右下有鉛筆「模擬」按鈕；點開由下方滑出視窗，輸入大於目前的步數按「儲存步數」→ 視窗關閉，地圖大步數由舊值滾動到新值。
3. 視窗內 AC1 R1 規則照舊（小於目前、空白、小數、超過 1,000,000 皆反灰並提示；Enter 不送出）。
4. 視窗開著時不會跳出昨日補領、全勤恭喜、開箱；漢堡選單與鈴鐺打不開；Esc／點遮罩可關閉。
5. 今日只剩一張卡，由上而下：腳步進度條 → 乘車模擬 → 里程碑與全部領取。
6. 昨日補同步仍在昨日卡片內，行為不變。

## 發布

- 只部署前端（`npm.cmd run build` → `npx.cmd firebase deploy --only hosting`）；回復用 Hosting 版本記錄。

## 第 2 版修訂：Architect 審查（2026-10-04，Opus）附條件通過，已併入

### 阻擋項修訂

- **B1 視窗位置**：`#steps-sheet` 為 `appShellView` 靜態輸出，放在 `.app-shell` 之後、同在 `#app` 內（兄弟節點；每日面板掛載時已存在）。開啟時 `.app-shell.inert = true`（比照抽屜），關閉時還原；不放在 map-hero 會重寫的 `.yo-step-overlay`、`#map-note`、`#map-actions` 內。z-index 介於抽屜（30）與過期提示（50）之間。
- **B2 視窗開著時不播動畫**：外殼在視窗開啟期間暫存 `setTodaySteps` 的最新值、不傳給地圖；視窗完全隱藏後才以最新值呼叫一次 `map.setSteps`（起點仍為上一個確認值）。不用 `setVisible(false)` 代替。
- **B3 `onStepsResult`**：只在 today 且 `command.type === "steps"` 時回呼；try 成功（含「沒有變更」）＝`confirmed`、`DailyUnconfirmedError`（重讀成敗皆同）＝`unconfirmed`、其他錯誤＝`failed`；在 finally 的 `render()` 之後、`onChange(false)` 之前呼叫，訊息直接讀 `#today-status`／`#today-error`。`unconfirmed` 一律不關視窗。經 `PanelHost.onStepsResult` 以 `shell?.` 延遲呼叫，診斷畫面 no-op。`perform` 開頭的提前 return（數值不合規、與目前相同）在送出前已被 `canSubmitSteps` 擋下（不可達），仍補回呼 `failed` 以防萬一。另加 `saving` 開始訊號（C5）。
- **B4 團隊對話框守衛**：選擇器加 `#steps-sheet:not([hidden])`。

### 條件項

- **C1** `trapKeys` 可聚焦元素改為 `button:not([disabled]), input:not([disabled])`。
- **C2** 外殼互斥：`overlayOpen` 含視窗；`openDrawer`／`openPanel` 在視窗開著時 return；`isDrawerOpen()` 視窗開著也回 true（各面板與昨日提示自動延後）；開關時呼叫 `hooks.onDrawerChanged(true/false)`；開啟前檢查 `overlayOpen()` 與 `isStale()`；`stop()` 靜默關閉視窗並清暫存。
- **C3** `#steps-sheet-msg` 優先順序：失敗／未確認訊息 ＞ 訂閱錯誤（`#today-error` 可見時其文字）＞「同步中，暫時無法儲存。」（`onToday(null)`）＞ 空白；失敗訊息保留到使用者再輸入或重開視窗。
- **C4** 開啟時帶入已確認原始步數後 `dispatchEvent(new Event("input"))`，讓 R1 按鈕與提示更新；輸入框停用時焦點落在「關閉」。
- **C5** 儲存中不可關閉（Esc、遮罩、「關閉」停用，比照團隊對話框）；失敗後焦點移到輸入框。
- **C6** 開啟按鈕在 `.app-map` 內絕對定位於右下（bottom ≥ `--yx-space-xl`，避開 OSM 署名），不放進 `.app-map-bottom`（不改 B2 band）；沿用 `.yo-map-move` 樣式；360 px 以 `1000000` 步實測不重疊。
- **C7** 表單 markup 抽成一個 helper、只輸出一處；`dailyPanelView("today", { stepsInSheet })` 參數必填（外殼 true、診斷 false）；全頁 ID 唯一測試涵蓋。
- **C8** iPhone 實機確認：自動聚焦叫出鍵盤後，關閉視窗時地圖在可視範圍、看得到滾動（列入人工驗收）。

### 建議項處理

- 圖示：`public/` 原樣輸出、Hosting 對 png 走預設快取；以讀 PNG IHDR 測尺寸；裁切以 PowerShell System.Drawing 完成（白底、上下各 12% 邊、魷魚區 x200–485、y135–470）。
- 測試補充：視窗開著時 hashchange 還原、抽屜與通知不開、`stop()` 關視窗、團隊守衛、`trapKeys` 含 input、暫存值關閉後才送地圖、結果分類三種。
- D4 於審查期間追加，360 px 同列配置由實作驗證。

## 第 3 版：Architect 補充審查（含 D4）併入

- **C9** 昨日乘車列不受 D4 影響：同列 flex 只套用今日列（`.yo-ride-line`），昨日 `<p class="yo-ride-row">` 維持 08A-3 樣式。
- **C6 改寫為實作做法**：開啟按鈕放在 `.app-map-bottom` 內、絕對定位於大步數卡**上方右側**（`bottom: calc(100% + xs)`）。絕對定位不佔版面，B2 band 與 `panBy` 不受影響；1,000,000 步時大步數卡幾乎與地圖同寬，同列放不下，故放在卡片上方。顯示「未允許定位」提示時按鈕隨之上移。待產品負責人以 360 px 截圖／實機確認。
- **大步數 7 位數**（實測發現）：1,000,000 時 56px 字的卡片寬過地圖（360 px），新增 `[延伸]` token `--yx-type-map-steps-long`（42px），7 位數時套用 `.long`（動畫中依位數切換）。
- **aria-label**（WCAG 2.5.3）：採 Architect 建議改為「模擬一趟（模擬完成一趟 yoxi）」，名稱包含可見文字，仍保留完整文字供 agent 以部分比對定位。
- **C10–C12** 測試與 360 px 同列確認見實作紀錄；**C11** 驗收文件在上線前同步更新（`發布與驗收清單_AC1_06A_07A.md` 第 21 項、`驗收指令_給agent.md` 第 21 項）。
- 契約狀態列改為 D1–D4、第 3 版。

## 實作紀錄（2026-10-04，Developer）

（服務、狀態純函式、Rules、讀寫路徑與訂閱次數皆未改；原檔備份 `.backup/08a4-2026-10-04/`）
- **D1** `public/apple-touch-icon.png`（180）、`public/favicon-32.png`（32）以 PowerShell System.Drawing 從 `UI-design/yoi LOGO_去背.png` 裁魷魚（x200–485、y135–470）、白底、上下 12% 邊；`index.html` 加 `apple-touch-icon`、`icon`、`apple-mobile-web-app-title="yoi"`。dist 已含兩張圖。
- **D2** `views.ts`：`stepsFormView` 抽出、只輸出一處；`stepsSheetView`（`#steps-sheet` 為 `.app-shell` 的兄弟節點，`role="dialog"`、`aria-modal`）；`mapHeroView` 新增 `#steps-sheet-open`（Phosphor Pencil Simple Fill，`aria-haspopup`／`aria-controls`）。`app-shell.ts`：開關、`.app-shell.inert`、Tab 迴圈含 input（C1）、Esc／遮罩（僅點外層）／關閉、儲存中不可關閉（C5）、失敗焦點回輸入框、訊息優先序（C3，純函式 `sheetMessage`）、開啟時帶入確認值並觸發 input（C4）、與抽屜／通知／hash 互斥（C2）、`isDrawerOpen` 含視窗（各提示自動延後）、`stop()` 靜默關閉；**B2** 視窗開著時暫存 `setTodaySteps`，關閉後才 `map.setSteps`。`main.ts`：`mountDailyPanel` 新增 `onStepsResult`（B3：saving／done＋confirmed｜unconfirmed｜failed，finally 內 `render()` 後、`onChange` 前；提前 return 亦回報 failed），經 `PanelHost.onStepsResult` 轉給外殼；只有 confirmed 關閉（純函式 `closesSheet`）。`team-panel.ts` 守衛加 `#steps-sheet:not([hidden])`（B4）。
- **D3／D4** 今日單一卡片：標頭（kicker、`#today-title`、N／3 點）→ 腳步進度條＋原始／有效 → 乘車列（狀態＋右側 compact「模擬一趟」）＋揭露 → 里程碑、全部領取、狀態、錯誤。`dailyPanelView(day, { stepsInSheet })` 參數必填（外殼 true、診斷 false）。
- 樣式：視窗（z-index 35）、按鈕定位、今日乘車列、7 位數字級；全部用 token。

**驗證**
- `npx tsc --noEmit` 通過；`npm test` **161/161**（`app-layout` 新增：C1 外殼／診斷各一處、合併卡片順序與 D4 按鈕、地圖按鈕位置、`closesSheet`／`sheetMessage`、圖示尺寸（PNG IHDR）與 `index.html` 標籤、外殼互斥與團隊守衛原始碼檢查）；`npm run build` 通過；Rules 未變（`70acb267…5327`）。
- 開發伺服器實際掛載外殼（假 hooks）：開啟後 `.app-shell` inert、焦點在輸入框並帶入 4000；視窗開著時抽屜打不開、hash 被還原；儲存中 Esc 無效、「關閉」停用；視窗開著時新步數 6100 不送地圖（仍 4000）；失敗訊息留在視窗、焦點回輸入框；confirmed 後視窗關閉、焦點回按鈕，地圖由 4000 滾動（4472→4834→5106→5332…）；點遮罩與 `stop()` 皆關閉。
- 360 px：1,000,000 步卡片（57–303）在地圖（25–335）內、按鈕在卡片上方右側不重疊；今日乘車列同列放得下（按鈕 231–319）；無橫向捲動。
- 未能本機實測：iPhone 主畫面圖示與名稱、鍵盤彈出時的視窗位置（C8）——列入人工驗收。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `index.html` | `ed66a9287275e13d204ad6043883e515c712ffd0c911da392bda0278a547de33` |
| `public/apple-touch-icon.png` | `4ecaae5beb9ac945018ba11312c0682cd5d813469a087380fef4a2473923a30d` |
| `public/favicon-32.png` | `ca2ddec403ea342ea82939367b4cfbf15d453eabc5ed305448e620e197ed5b25` |
| `src/ui/views.ts` | `11b972de2f0f6a2880a622d04bc3323181c9485c13f8447a83deb259c4885e61` |
| `src/ui/icons.ts` | `852ba037451be5012d1ba04fc42006d8e7947fcc46e5950cceafa0ef9f6c2817` |
| `src/ui/icons/phosphor/pencil-simple-fill.svg` | `b78e7b71cb19d43e235983a883d50ab78cf9227f9864106e1aa4f366ee317aa8` |
| `src/style.css` | `f229fd35f161c051d78f650bd28a0376649071f43d9f2abc531615b4b4b4ab8f` |
| `src/main.ts` | `07c213a95538e654c9796143f1615104d36ac89c1e427344659d1b87b11af8c2` |
| `src/app/app-shell.ts` | `5f89261d1a63262b34299e4001aa35f6cc15991715b04b4a0308a488027ef044` |
| `src/app/shell-state.ts` | `e7126d9c767ab8b043eb4ca362cd9a1b3ad617ca0214b0ac78adc52e92ef16b0` |
| `src/app/map-hero.ts` | `e818483d48c6a6c35e27ad982c757c8584f8a659c69f367ee74fed6f2ef3059e` |
| `src/team/team-panel.ts` | `102224955ba108fa4cc7258c804a7b61fec4f3571843a699322f193f22902761` |
| `tests/app-layout.test.mjs` | `6c9e664334713728536d1f5430352b1241e72b3b1e7c29dc97e761b808be0c13` |
| `firestore.rules` | `70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327` |

## QA／Security 審查與修正（2026-10-04）

- **Security：通過**。Low L1：儲存中不可關閉視窗（C5），若交易長時間不結束只能重新整理；Firestore 斷線多會在有限重試後拒絕，本版接受，列為已知（可選強化：逾約 30 秒允許以「結果未確認、請勿重送」關閉）。Info I2 已加註解（input 事件上不得掛寫入）。
- **QA：程式無阻擋；文件阻擋 Q-B1 已修**：`驗收指令_給agent.md` 畫面速查與第 1 項（改為開啟鉛筆「模擬」視窗操作、儲存後視窗關閉再開啟確認反灰、雙工作階段開著視窗輸入）；`發布與驗收清單_AC1_06A_07A.md` D 段第 1 項同步、F1 註明 08A-4 起合併為一張今日卡。
- 非阻擋建議處理：開啟按鈕的點擊委派改掛在 `#map-hero`（隨外殼替換，不在 `#app` 累積監聽）。其餘列為已知／後續：B2 與 outcome 順序以手動驗證為主（日後可加 DOM 層測試）；矮螢幕＋「未允許定位」時按鈕上移需實機確認；失敗後輸入值被重設為目前步數（既有行為）；儲存中視窗內無可聚焦元素（外殼 inert，影響小）。
- 修正後：tsc、`npm test` 161/161、build 通過；Rules 未變。**審查完成，待產品負責人部署前端並驗收（清單 G 段）。**

| 檔案 | SHA-256 |
|---|---|
| `src/app/app-shell.ts` | `68509c3da4a016007326b9ea4b121ba185ab48252e5d0ffb6f09460c5d68a5cb` |

## 部署（2026-10-04）

- 產品負責人明確指示由 Claude 部署前端、不碰 Rules。`npm test` 通過 → build → `firebase deploy --only hosting`（`firebase.json` 僅 hosting）→ Deploy complete。線上 `index.html` 引用 `index-fNGTDmfd.js`／`index-N6MtYpno.css` 與本機一致，含 apple-touch-icon 與 `apple-mobile-web-app-title=yoi`；`/apple-touch-icon.png`、`/favicon-32.png` 回 200。Rules 未發布（`70acb267…`）。

## 產品負責人追加裁決 D5（2026-10-04，部署後）：步數頁卡片順序

- 由上而下：（昨日提醒一行）→ **地圖卡**（只有地圖、大步數、鉛筆「模擬」與隱私說明）→ **今日卡**（腳步進度條、乘車、今日里程碑）→ **個人週任務卡**（七日全勤週曆，從地圖卡拆出，自成一張 `yo-walk-week-card app-week-card`）→ **昨日補同步與補領** → 展示說明。原 08A-3「地圖＋週曆同卡」改變。只調整 `appShellView` 的標記順序，元素 ID、控制器、Rules 皆不變。
- 驗證：`npm test` 162/162（新增 D5 順序測試：map < today < week < yesterday、地圖卡不含週曆）、tsc、build；預覽量測順序與週任務卡樣式（白底、邊框、內距 16px）正確。

| 檔案 | SHA-256 |
|---|---|
| `src/ui/views.ts` | `aa7ebc670165462cf5226a9b49d8b299e8d94075c585746adadaf0273cb12e65` |
| `tests/app-layout.test.mjs` | `3b87d9d618fac50533538429cea4b97655a9ce2b0a9b0086a21f893f0746b114` |

- **D5 QA 短版確認：通過**（162/162）。依非阻擋建議再修：地圖卡外層改為 `div`（避免兩層同名地標）、`.app-map-privacy` 補下方內距（地圖卡現在在此結束）、清單 F1 註明 D5 起拆成兩張。修正後 162/162、tsc、build 通過。`src/ui/views.ts` `69ba3419fa47237f…`、`src/style.css` `632ec06726108939…`。

- **D5 部署（2026-10-04）**：產品負責人指示由 Claude 只部署前端、不碰 Rules。`npm test` 通過 → build → `firebase deploy --only hosting`，Deploy complete；線上資產與本機一致、含 `app-week-card`。Rules 未發布。

## 產品負責人追加裁決 D6（2026-10-04）：模擬按鈕改用腳步圖示

- 地圖大步數卡右上的「模擬」按鈕圖示由鉛筆改為腳步（與進度條同一個 Phosphor Footprints），讓人一眼看出是步數的模擬按鈕；文字「模擬」與讀屏名稱「模擬今日步數」不變。`pencil` 圖示保留不刪。驗收文件中的「鉛筆『模擬』」改為「腳步『模擬』」。
- 驗證：`npm test` 163/163（新增 D6 測試：按鈕含腳步路徑、不含鉛筆）、tsc、build 通過；Rules 未變。`src/ui/views.ts` `5d8b223b200bf437…`。**尚未部署。**
