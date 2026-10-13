# FSD-UI01｜基礎樣式：套用設計規格 1.24.0

**狀態**：Security 與 QA 確認通過（2026-10-01），待產品負責人部署與實機確認。QA 阻擋項修正後的雜湊：`style.css` 68cd831f…、`icons.ts` 80434431…。契約已納入 Architect 兩輪審查阻擋項與產品負責人 6 項裁決（含獎勵圖示改 Phosphor `gift`）。驗證：`tests/ui-tokens.test.mjs` 9/9（Developer 逐條注入違規確認各檢查會失敗）；預覽頁 24 種狀態在 360 與 440 寬實測無水平溢出、無低於 44 px 的按鈕、無小於 12 px 的字、無 emoji；`tsc`、`npm test` 26/26、Rules 47/47、`build` 通過，`dist/` 不含預覽頁且保留 Phosphor MIT 聲明。原檔備份於 `.backup/ui01-2026-10-01/`。尚未部署；上線後需產品負責人實機確認。

**審查基準版本（SHA-256）**

| 檔案 | SHA-256 |
|---|---|
| `src/style.css` | `accbabfd3840d879153409cc4ed94decd428c121afe7f9336a0779d1b56acbd6` |
| `src/showcase/app.ts` | `c103b9eb4319308059b97d941effc901e459ca8cb6613a2b0c5a3fe1b0d55567` |
| `src/main.ts` | `cfcfdee84ed1398d4715bad56ba0f99a0a0b9778f2db2a5b397cebaa71a2a0e8` |
| `src/admin/admin-panel.ts` | `dc260c75d92b390738a3d6b47f34e8f38d316724c196ade625ecb414a9e5891c` |
| `src/ui/html.ts` | `c7eddba4df1ce55a27a2f9e340076786fac7be4dcc65961d72ea91b38dbc01e9` |
| `src/ui/icons.ts` | `33504a29c1a6cccb05a8a2921229ecb613178b7c0a285dfa2efe41618d8824fd` |
| `src/ui/components.ts` | `a9d4e4721a34570be25b0a95ef2779d709d31facda487f88c81d3b051b99218b` |
| `src/ui/views.ts` | `63246f552e475d025899b76b004d0a955f1aa7e41504d57595f01677240dd176` |
| `src/ui-preview.ts` | `1023b10e2889d803dbe1c8a37ba6d223d8266f05d886ee5f2ec80b4f816f7332` |
| `ui-preview.html` | `eaa8907d24d5b92c3ede8acb987224c82ee503424bc6a326bd4ad58253eeb23d` |
| `tests/ui-tokens.test.mjs` | `4887dd6ff0a8f29b5104bc5f5dec7ecec9c12f977d912884b5c506ed7ac23f6d` |
| `src/ui/icons/phosphor/`（9 SVG＋LICENSE） | LICENSE `b5b1f1da…bb2`；各 SVG 雜湊見 Security 審查紀錄 |唯一依據為 `UI-design/02_設計規格/2-1_DESIGN_設計規格.md`（1.24.0，以下稱「規格」）。對應 PRD P16（360 px／桌機）；功能、資料與 Rules 不變。

## 產品負責人裁決（2026-10-01）

1. 圖示本積木就做雙色（墨藍主體＋`icon-red` 副件），不延後。
2. 圖示來源：(b) 只把用到的 Phosphor Fill SVG 複製進專案並附 MIT 授權全文（同意從 Phosphor 官方 GitHub 下載）；(c) 規格招牌細節沿用 `UI-design/03_畫面稿` 中設計師已畫好的雙色 symbol。
3. 7 格週曆、各處模擬說明、品牌方塊「y」先維持原樣（留待逐頁細修；模擬說明屬 AGENTS.md 要求的揭露，開發端不得移除）；頁面最寬 440 置中、兩側灰底在本積木實作。
4. 規格沒有的元件標 `[延伸]`，只記錄在本契約附錄，不修改設計交付包。
5. `text-muted` 依規格（#778AA4，對白底約 3.5:1）只用在 13px 以上的非必要輔助說明；狀態、錯誤、即時區域（`role=status`／`alert`）、模擬與展示邊界聲明、操作後果說明一律用 `text-primary`（墨藍）。

## 責任

- 負責「基礎層」：導入規格第 12 章 token；共用元件與全域規則只引用 token；以雙色圖示取代 emoji 與符號；開發專用預覽頁；自動檢查。
- 不負責（逐頁細修，屬最後的「展示模式整合」）：各畫面版面重排、7 格週曆與模擬說明的去留、品牌標誌、深色漸層卡改為規格元件、插畫與寶箱圖、大字好讀切換介面（本積木只導入其 token 覆寫區塊）、任何文案、功能、資料或 Rules。

## 偏差與處理（基礎層 = 本積木；細修 = 最後整合）

| 項目 | 規格 | 現況 | 本積木處理 | 歸屬 |
|---|---|---|---|---|
| token | 第 12 章；元件只引用 token（8.0） | 7 個變數，其餘寫死；Tailwind `@theme` 寫死色值 | 導入 `--yx-*` 全部 token（含大字好讀覆寫）；移除 `@theme` 與舊變數 `--brand-red`、`--navy`、`--muted`、`--border`（本積木結束時清零） | 基礎層 |
| 主要動作 | `Button/Primary`：墨藍、高 54、`radius/xs`、`type/button`（2.7、8.2） | 紅底、高 43–50、圓角 8–12 | `.primary-button`、`.yo-primary` 改為 Primary；紅色不做實心按鈕 | 基礎層 |
| 次要動作 | `Button/Secondary`：白底＋1pt 墨藍框、高 54 | 灰框、高 43 | `.secondary-button`、`.yo-secondary` 改為 Secondary | 基礎層 |
| 頁首小按鈕 | 規格無（`Button/Text-Link` 是查看更多用） | `.text-button`、`.yo-settings-toggle` | `[延伸]` 頁首按鈕：白底 1pt `border` 框、`radius/xs`、高 44、`type/tab` | 基礎層 |
| 查看更多 | `Button/Text-Link`：連結藍字＋紅方塊箭頭、點擊區 44 | `.yo-link`、`.yo-demo-shortcut` 紅字、`›` | 改為 Text-Link（`i-fwd`） | 基礎層 |
| 輸入框＋按鈕並排 | `Button/Inline`：與欄位等高貼齊、墨藍、直角（8.2） | 步數更新、加入隊伍用一般按鈕 | 改為 Inline | 基礎層 |
| 小按鈕 | 最小觸控 44（4.5） | 領點、券按鈕約 30 高、字 10 | `[延伸]` 精簡按鈕：Primary 樣式、高 44、`type/tab` | 基礎層 |
| 按下 | 墨藍→`navy-deep`、紅→`red-deep`、白／灰→`pressed-light`（8.1） | 無；hover 變深紅 | 以 `:active` 實作；不做 hover 樣式 | 基礎層 |
| 停用 | 矩形按鈕 `disabled` 底白字（8.1） | opacity 降低 | 改為 `disabled` 底白字 | 基礎層 |
| 焦點 | 2pt `link-blue`、間距 2（8.1） | 紅、墨藍、淺藍三種，3px | 統一 2pt `link-blue`；墨藍等深色底上改 `[延伸]` 白色焦點框（`link-blue` 對墨藍僅約 2:1） | 基礎層 |
| 錯誤 | 文字墨藍＋`icon-red` 驚嘆號；欄位 1pt `error` 框（2.5、8.1） | 紅字 `#b42318` | `.error-message` 改墨藍字加驚嘆號圖示 | 基礎層 |
| 成功 | 沒有綠色；淡杏方磚＋紅墨藍勾號（2.5） | 綠字、綠色完成態 | 成功與達標改用淡杏底＋雙色勾號，或墨藍填色選取態 | 基礎層 |
| Field | 高 56、`surface-grey` 底、無框、`radius/none`、內距 16、`type/body`（8.5） | 白底、1px 框、圓角 10、高 48 | 改為 Field；`accent-color: var(--yx-icon-red)` | 基礎層 |
| 欄位小標 | `type/label` 13、`text-muted`、距欄位 8（8.5） | 14／600 墨藍、部分 12 | 改為 label 規格 | 基礎層 |
| 卡片 | `surface` 底、1pt `border`、無陰影（8.8） | 多處陰影、圓角 14–22 | 共用面板（`.login-card`、`.yo-panel`、`.yo-note` 等）改為 Card 基礎，`radius/md`；移除陰影 | 基礎層 |
| 說明灰板 | `surface-grey`（2.3 任務說明灰板） | `.demo-notice`、`.yo-note` | 改 `surface-grey`；文字依裁決 5 用墨藍 | 基礎層 |
| Tag | `Tag/Status`：高 24、`link-blue` 底白字、`radius/sm`、`type/tag`（8.3） | 橘色 `.yo-demo-tag` | 改為 Tag/Status | 基礎層 |
| 數值 | 紅數字＋墨藍單位，`number-md` 以上；`tabular-nums`（2.7、3.3） | 綠色大步數、11px 紅色點數膠囊 | 步數、點數、計數改「紅數字＋墨藍單位」並加 `tabular-nums` | 基礎層 |
| 紅色小字 | 紅字只用在大字（2.8） | kicker／eyebrow 11–13px 紅字 | 改 `type/tag` 連結藍 | 基礎層 |
| 進度條 | `Progress/Trip`：5pt `disabled` 軌道＋`icon-red` 小車；今日點數 3 段（8.11、8.12） | 紅色漸層填滿 | 新增 Progress/Trip 元件（`i-car-red`），取代今日點數進度條 | 基礎層 |
| Toast | `slate` 底、膠囊、高 36、無陰影、距底部約 1/3（8.10） | 墨藍底、圓角 12、陰影 | 改為規格 Toast | 基礎層 |
| 遮罩 | `scrim-soft／strong／darkest`（2.6） | 70%、72% | 寶箱覆蓋層 `scrim-strong`；過期覆蓋層（阻斷式）`scrim-darkest` | 基礎層 |
| 底部導覽 | 規格無；11.3 提到最多 4 個、圖示下加字 | 紅字淡紅底選取、字 9px | `[延伸]` 底部導覽：4 項、圖示 24＋`type/caption`；選取態用規格的填色型（墨藍底白字） | 基礎層 |
| 字級 | 第 3.2 節階層；caption／label 最小 13，只有 tag 可 12 | 9–12px 大量 | `font`／`font-size` 只引用 `--yx-type-*`；新增 `[延伸]` 圖示尺寸 token | 基礎層 |
| 字距 | 一律 0（3.3） | `.04em` 等 | 全部改 0 | 基礎層 |
| 頁面邊距 | 內容區 24（4.3） | 14、20 | 改為 `--yx-page-content` | 基礎層 |
| 最大寬度 | 最寬 440 置中、兩側 `#E9EDF2`（8.12 展示規則） | 680／720／540 | 實作（裁決 3）；灰底以 `[延伸]` token `--yx-prototype-backdrop` 定義 | 基礎層 |
| 滿版高度 | `100dvh`（4.6） | `100vh` | 改為 `100dvh` | 基礎層 |
| 字型 | `type/display` 900、`type/slogan` 900 italic | 只載入至 700 | Google Fonts 補 Montserrat 900／900 italic 與 Noto Sans TC 900 | 基礎層 |
| Tailwind | 規格外 | markup 上 `rounded-*`、`bg-white`、`font-bold` | 移除 markup 上的 Tailwind 樣式 class，元件自行設定 radius 與背景 | 基礎層 |
| 地圖示意圖 | `--yx-map-*` 示意 token；現在位置 `icon-red`、出發點墨藍（12、8.12） | 飽和綠與多種寫死色 | 改用 `--yx-map-*` token 與規格標記色 | 基礎層 |
| 深色漸層卡、寶箱動畫黃橘色 | App 無深色卡（8.12） | `.yo-team-banner`、`.yo-step-card`、寶箱動畫 | 本積木只把色值換成 token（漸層改單色表面）；改為規格元件留細修 | 換 token：基礎層；改元件：細修 |
| 7 格週曆、模擬說明、品牌「y」 | 規格不建議 | 現有 | 維持原樣，只換 token 與字級（裁決 3） | 細修 |

## 圖示

| 用途 | 來源 | 圖示 |
|---|---|---|
| 查看更多、地圖移動（取代 `›`、`↗`） | 畫面稿 | `.sq-arrow` 組合：`i-fwd` 箭頭（`stroke` 改 `currentColor`）＋ 8×5 `icon-red` 小方塊，間距 3（畫面稿 L165–166、L547） |
| 今日點數進度 | 畫面稿 | `i-car-red`（例外：主體為 `icon-red`、副件墨藍，輪轂挖空色） |
| 步數（取代 👟） | 畫面稿 | `i-shoe`（鞋帶線為 `surface-apricot`） |
| 團隊、空隊伍（取代 ♧、👥） | 畫面稿 | `i-team` |
| 獎勵、寶箱可開（取代 🎁） | Phosphor Fill | `gift` 加雙色（產品負責人裁決：畫面稿 `i-gift` 實為「人＋紅色愛心」，語意不符，不採用） |
| 寶箱動畫閃光（取代 ✨） | 畫面稿 | `i-spark`（單色 `link-blue`，裝飾用，`[延伸]` 例外於雙色規則） |
| 定位（取代 ⌖） | Phosphor Fill | `map-pin`（畫面稿 `i-pin` 為 84px 插畫，縮小後失真，不採用） |
| 寶箱鎖定（取代 🔒） | Phosphor Fill | `lock` |
| 寶箱已開（取代 🎉） | Phosphor Fill | `confetti` |
| 邀請（導覽，取代 ＋） | Phosphor Fill | `user-plus` |
| 新增隊員（按鈕內，取代 ＋） | Phosphor Fill | `plus` |
| 設定（取代 ⚙） | Phosphor Fill | `gear` |
| 乘車券（取代 🎟） | Phosphor Fill | `ticket` |
| 已領、已達標（取代 ✓） | Phosphor Fill | `check` |
| 地圖標記中心點（取代 ●） | 無圖示 | 以 CSS 圓點呈現 |

- 新增 `src/ui/icons.ts`：每個圖示輸出行內 SVG，主體用 `currentColor`（預設墨藍），副件以 class 指向 `var(--yx-icon-red)`；尺寸只用 16／20／24／28；裝飾性圖示 `aria-hidden="true"`，獨立的圖示按鈕必附朗讀文字。
- 畫面稿 symbol 的色值對照：墨藍 → `currentColor`（預設 `--yx-action-navy`）；紅 → `var(--yx-icon-red)`；`#fff` 挖空 → `var(--yx-white)`；`#F3EBE4` → `var(--yx-surface-apricot)`；`#0C4C80` → `var(--yx-link-blue)`。在有色底上改白色單色時，主體與副件都用 `--yx-text-on-color`，挖空處改為底色 token。
- Phosphor 原檔（9 個：lock、confetti、user-plus、plus、gear、ticket、check、map-pin、gift，`assets/fill/*-fill.svg`）與其 MIT 授權全文放在 `src/ui/icons/phosphor/`；雙色化時手動把副件拆成獨立 path（每個圖示至少一個 `icon-red` 副件，位置於實作時決定，以預覽頁截圖確認）。產物中以 `/*! … */` 保留 MIT 聲明。
- 在墨藍按鈕等有色底上的圖示改用白色單色（`text-on-color`），這是 `[延伸]`。
- 尺寸以型別 `IconSize = 16 | 20 | 24 | 28` 限定，由 `tsc` 檢查。
- 不新增 npm 依賴；不使用 `import.meta.glob`。`escapeHtml` 移到共用工具 `src/ui/html.ts`，`main.ts`、`views.ts`、預覽頁共用。

## 預覽頁

- 抽出純畫面模組 `src/ui/views.ts`：登入頁、共享模式靜態外框（含今日任務、團隊區塊在已知狀態下的畫面）與過期覆蓋層的 markup，改為只接受資料、回傳字串的純函式；`main.ts` 與預覽頁共用同一份，避免漂移。
- 開發專用入口 `ui-preview.html` + `src/ui-preview.ts`：以假 session（`sessionId: "ui-preview"`、`role: "admin"`）渲染純展示模式各頁、管理畫面、共享模式靜態畫面與過期覆蓋層；預先寫入純展示模式的 localStorage（含 `runKey`，避開非安全來源下 `crypto.randomUUID` 不可用）以切換狀態：步數 0／4,000／6,000、點數部分已領、無隊／1 人／5 人、寶箱鎖定／可開／已開、券已領、設定面板展開、Toast、管理確認區、錯誤、忙碌、寶箱動畫固定顯示。加 `<meta name="robots" content="noindex">`。
- **禁止匯入**：`src/main.ts`、`src/firebase/config.ts`、`src/identity/firebase-identity-provider.ts`、`src/identity/firestore-shared-context.ts`、`src/daily/daily-service.ts`、`src/team/team-service.ts`。`showAdminPanel` 的 service 參數型別改為 `Pick<AdminService, "apply">`，預覽頁傳入不連線的假物件。
- 不進正式建置：`vite.config.ts` 維持只以 `index.html` 為入口；建置後檢查 `dist/` 不含 `ui-preview`。

## 自動檢查（`tests/ui-tokens.test.mjs`，併入 `npm test`）

- 範圍：`src/**/*.css`、`src/**/*.ts`、`ui-preview.html`、`index.html`。**排除** FSD-05 的開發專用試驗頁 `gas-spike-test.html`、`src/gas-spike-test.*`（不屬於產品畫面，去留待 Apps Script 試驗結束時決定）。token 定義區塊（`:root` 與 `[data-mode="large-text"]`）不受第 1、2 條限制。
1. 色值：只在色值位置比對——CSS 宣告值，以及 SVG／markup 的 `fill`、`stroke`、`stop-color`、`color` 屬性——不得出現 `#hex`、`rgb()`／`rgba()`／`hsl()`／`hwb()`／`oklch()`／`color()` 與具名色。放行 `currentColor`、`transparent`、`inherit`、`none`、`var(--…)`。識別字（如 `--yx-brand-red`、`i-car-red`）與 `href="#…"` 片段不屬色值位置，不比對。inline `style` 只允許設定 CSS 自訂屬性。
2. 字級：比對屬性名 `(?<![-\w])font(-size)?\s*:`，值只能引用 `--yx-type-*` 或 `[延伸]` token；放行 `font: inherit`；`clamp()` 的最小值同樣檢查。
3. 字距：`letter-spacing` 只能為 0。
4. 陰影：`box-shadow` 只能為 `none` 或 `var(--yx-shadow-float)`，且只能出現在 selector 白名單（地圖浮動物件：定位膠囊、移動按鈕、地圖標記）。
5. 圓角：`border-radius` 只能引用 `--yx-radius-*`（圓點與地圖標記用 `--yx-radius-full`，不寫 `50%`）。
6. 圖示字元：以明確清單（🎁👟✨⚙♧🔒👥🎟🎉✓⌖●↗＋›，含變體選擇符 U+FE0F）加 `\p{Extended_Pictographic}` 掃描 `src/`；白名單：管理確認區敘述中的 `→`。
7. Tailwind：markup 的 `class` 不得出現 `rounded-*`、`shadow-*`、`font-(thin|light|normal|medium|semibold|bold|extrabold|black)`、`text-(xs|sm|base|lg|xl|[2-9]xl)`、`text-<色名>-*`、`bg-*`、`tracking-*`；`style.css` 不得有 `@theme` 色值。
8. 舊變數 `--brand-red`、`--navy`、`--muted`、`--border` 不得出現。
9. 預覽頁依賴圖不得包含禁止匯入清單中的檔案。
- 例外集中在 `style.css` 一個標記區塊，每條寫明檔案、selector、值、理由與規格章節。目前預計：`index.html` 的 `theme-color`（瀏覽器 UI 色，值同 `--yx-brand-red`）、圖示尺寸 `[延伸]` token、地圖大步數字級。

## 回復策略

專案不是 git repo。實作前把將修改的原檔（`src/style.css`、`src/showcase/app.ts`、`src/main.ts`、`src/admin/admin-panel.ts`、`index.html`）複製到 `.backup/ui01-2026-10-01/`（Hosting 只發布 `dist/`，此目錄不會被部署）。要回復時將該目錄的檔案複製回原位。

## 依賴

- 規格 1.24.0 第 2–8、11、12 章；`UI-design/03_畫面稿/3-0_主要畫面.html` 的 symbol 定義。
- Phosphor Icons（MIT）7 個 Fill SVG，從官方 GitHub 取得。
- Google Fonts（外部載入；和「單一 HTML 離線」的落差不在本積木處理）。
- 不影響 FSD-01B、03A／03B、02B 的邏輯與 Rules。

## 風險

- 360 px 擠版：頁首（品牌、模擬標籤、管理、設定、登出）、步數輸入列、加入隊伍列、7 格週曆、底部導覽字級放大。允許規格 4.6 的最小修正（並排改上下、文字換行），不重排版面。
- `text-muted` 變淡：依裁決 5 限縮用途。
- 樣式變更不得移除焦點框；按下態只換色。
- 共享模式的即時狀態以 `views.ts` 靜態渲染預覽，連線行為仍需上線後實機確認。

## 驗收

| 驗收 | 方法 |
|---|---|
| 只引用 token、無綠色、無陰影（地圖浮動物件除外）、字級與字距符合規格、無 emoji、無 Tailwind 樣式 class、舊變數清零 | `tests/ui-tokens.test.mjs` 全數通過 |
| 主要動作墨藍 54 高、觸控至少 44、焦點與停用符合 8.1 | 預覽頁截圖＋開發者工具量測 |
| 雙色圖示正確呈現、朗讀文字完整 | 預覽頁截圖＋無障礙樹檢查 |
| P16：360×640、375×667、414×896、440×956 與桌機不破版 | 預覽頁逐頁截圖 |
| 預覽頁不連 Firebase、不進正式建置 | 依賴圖檢查；建置後 `dist/` 不含 `ui-preview` |
| 功能不變 | `tsc`、`npm test`、`npm run test:rules` 全數通過；上線後產品負責人實機確認 |

## 審查方式

Architect 確認本契約後實作；QA 以預覽頁截圖與自動檢查審同一版本；Security 只審下載的 SVG（來源、授權、內容無腳本）、預覽頁不連 Firebase 與不進正式建置。注意：預覽頁經 `admin-panel.ts` → `admin-service.ts` 會載入 Firebase SDK 模組（不初始化、不連線），審查時須確認未載入 `src/firebase/config.ts`。

## 附錄：`[延伸]` 元件

| `[延伸]` | 定義 |
|---|---|
| 頁首按鈕（`.text-button`、`.yo-settings-toggle`） | 白底、1pt `border` 框、`radius/xs`、高 44、`type/tab`；按下 `pressed-light` |
| 精簡按鈕（`.yx-btn-compact`、里程碑列按鈕） | Primary 樣式、高 44、最小寬 88、`type/tab`；停用 `disabled` 底白字 |
| 深色底焦點框 | `--yx-focus-on-dark`（白色），用於純展示橫幅、隊伍卡等墨藍底 |
| 底部導覽 | 4 項、圖示 24＋`type/caption`、最小高 56；選取態為填色型（墨藍底白字、白色單色圖示），`aria-current="page"` |
| 有色底上的圖示 | `mono`：主體與副件皆 `currentColor`，挖空處透明 |
| 圖示尺寸 | 型別 `IconSize = 16 | 20 | 24 | 28`；寶箱動畫中的禮物圖示以 CSS 放大到 64 |
| 版面 token | `--yx-prototype-backdrop`（`#E9EDF2`）、`--yx-prototype-width`（440） |
| 地圖大步數 | `--yx-type-map-steps`（700 56px/1），紅數字＋墨藍單位 |
| 欄位小標顏色 | 規格 8.5 為 `text-muted`；依裁決 5（重要資訊用墨藍）改為 `text-primary` |
| 錯誤訊息圖示 | 以 CSS 繪製 16 px `icon-red` 圓形驚嘆號（`.error-message::before`） |
| Progress/Trip 小車 | `i-car-red` 以 CSS 設為 28×18，`left` 夾在兩端 14 px 內 |
| 推薦進度步驟號 | 以 `data-step` 由 CSS 繪製，完成態為墨藍填色 |
| 乘車券車資欄位（`.coupon-card input`） | 偏離 8.5（Field 無框、灰底）：常駐 1px `action-navy` 框、`surface` 底。依 FSD-AC1 R6 產品負責人裁決（2026-10-03）；僅此欄位，全域 Field 不變。`style.css`、`main.ts`、`views.ts` 以 FSD-AC1 文末雜湊為新基準 |
| Progress/Trip 標記（FSD-08A-3） | 偏離 8.11／8.12「車子停在終點」：改為 Phosphor Footprints（Fill，鞋底墨藍、鞋跟 icon-red），20×20，`left` 夾在兩端 11 px 內。依 FSD-08A-3 D6、Q1 產品負責人裁決（2026-10-04），步數點數與團隊本週進度一致；`car` 圖示保留不刪 |
| Progress/Trip 連續填色（FSD-08A-3 D12） | 偏離 8.11 逐段填色：進行中的段依比例以墨藍填到腳步標記下方（`--fill`），已完成段整段墨藍、第 3 段存滿轉 brand-red 不變。依 D12 裁決（2026-10-04） |
| Progress/Trip 走滿顏色（FSD-08A-5 10） | 偏離 8.11「第 3 段（存滿）填 brand-red」：走滿時三段皆墨藍。乘車券印章（08A-3 D5）已於 08A-5 移除；AC1 R6 車資欄位隨車資試算移除而失效 |
| 地圖大步數底板（FSD-08A-3） | 偏離第 62、354 行「平面為主」：大步數卡移到地圖下緣，底色 `--yx-map-veil`（白 60%）＋`--yx-map-veil-blur`（6px 背景模糊），不支援時退回不透明 `surface`。依 D9 裁決 |
| 乘車券印章（FSD-08A-3） | 偏離 8.8 Card/Coupon 右上 Tag/Ribbon：改為斜放印章「已入帳」（brand-red 框與字）／「已過期」（灰）；過期券改灰階 token 降階，取消 `opacity`（規格 2-1 第 149 行）。依 D5、N2 裁決 |
| 七格週曆（FSD-04A／08A-3） | 偏離決策 #71「不新增 7 格打卡」：沿用展示版週曆。達標格墨藍底白字，今天以白色 border＋墨藍 outline 標示（不用 box-shadow），選取日下方 4px 墨藍短線。依 D4 裁決 |
| 步數頁原始步數重複（FSD-08A-3） | 偏離 2-1 第 641 行「同一數字一畫面只出現一次」：地圖大步數與任務卡「原始 N 步」同時顯示（展示版原樣），依 D1／Q3 裁決 |

沿用現有結構、只換 token 的元件：純展示橫幅、地圖疊加元件（大步數、定位膠囊、移動按鈕）、週曆日期鈕與達標態、里程碑列、推薦進度、邀請碼框、分隔線、`.session-details` 定義列、管理確認區、設定面板、登入頁、寶箱開啟覆蓋層、過期覆蓋層。
