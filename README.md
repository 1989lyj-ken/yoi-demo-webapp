# yoi 遊移遊戲

> 走得到就走，需要時 yoxi 接你。

yoi 是一個整合在 yoxi 叫車旅程裡的**步數遊戲化 web app**：每天走路領點、和朋友組隊衝團隊步數、達標開寶箱、連續七天全勤換乘車券。目標是讓使用者從「要叫車才打開 yoxi」，變成「今天怎麼移動？先打開 yoxi」。

本專案是 MVP 展示版：步數、乘車與點數為模擬資料，但**跨帳號的團隊共享、權限與防重複領獎是真實運作的功能**，由 Firestore Security Rules 在伺服器端把關。

## 立即體驗

| 版本 | 網址 | 說明 |
|---|---|---|
| 公開測試版 | https://yoi-public-demo.web.app | 免登入，手機開啟即可玩。資料只存在你的瀏覽器，搭配模擬隊友與「快轉時間」工具，幾分鐘就能體驗完整一週；含 AI 夥伴 Yoika 對話 |
| 內部展示版 | https://yoxi-yoi-demo.web.app | 團隊成員以各自帳號登入，多支手機即時共享同一支隊伍（需展示帳號） |

公開測試版內建「功能體驗清單」，引導你依序試過每日領點、乘車加成、組隊、寶箱、七日全勤與推薦新戶。

## 主要功能

- **今日步數與領點**：依步數里程碑分段領點，次日 24:00 前可補同步、補領。
- **乘車加成**：當天搭乘 yoxi 後，步數套用加成係數，鼓勵「走一段、搭一段」。
- **團隊共享**：以邀請碼組隊（2–5 人），隊友步數即時同步；支援退團、週鎖定與隊長交接。
- **團隊寶箱**：團隊週步數達標即可開箱，開箱結果與點數入帳防重複。
- **七日全勤與乘車券**：一週七天每天達標，換得乘車券。
- **推薦新戶**：用推薦碼邀請新朋友，完成模擬任務後雙方都能獲得乘車券獎勵。
- **定位天氣**：依所在位置顯示天氣與走路提示。
- **Yoika 對話**（公開版）：以 Gemini 驅動的 AI 夥伴，回答玩法問題；模型忙碌時改用標示清楚的系統回覆。

## 技術架構

- **前端**：Vite + TypeScript + Tailwind CSS v4，無框架，直接操作 DOM。
- **共享端**：Firebase Authentication（電子郵件／密碼）＋ Cloud Firestore 即時訂閱；Firebase Hosting 部署。
- **權限與一致性**：所有跨帳號規則都寫在 [`firestore.rules`](firestore.rules)，包含身分對應、時鐘版本、不可下修、領點依序、跨文件原子交易驗證（`getAfter`／`existsAfter`）。前端只負責 UX，畫面只把伺服器確認的快照當成已同步。
- **公開測試版**：建置時以 Vite alias 把 `firebase/app|auth|firestore` 換成本機替身（[`src/local/`](src/local)），同一套服務與畫面不經修改即可離線運作，完全不連 Firebase 專案。
- **AI**：Yoika 使用 Firebase AI Logic（Gemini Developer API），並以 App Check（reCAPTCHA Enterprise）防止濫用。

```
src/
  identity/   登入與身分（Firebase Auth UID → 展示成員）
  daily/      今日步數、乘車加成、領點
  team/       組隊、邀請碼、退團、隊長交接、團隊週貢獻
  weekly/     七日全勤與乘車券
  rewards/    團隊寶箱與點數總帳
  referral/   推薦新戶
  weather/    定位天氣
  admin/      管理者工具（情境時間推進、場次重設）
  public/     公開測試版專屬（模擬隊友、體驗清單、Yoika）
  local/      公開測試版的 Firebase 本機替身
firestore.rules   共享端權限規則
tests/            單元測試與 Firestore Rules 測試
scripts/          Rules mutation 測試與 Emulator 執行腳本
```

## 品質驗證

- **單元測試**：`npm test`，233 個測試，涵蓋步數狀態、週結算、寶箱、推薦、公開版模擬與 Yoika。
- **Rules 測試**：在本機 Firestore Emulator 跑 [`tests/firestore-rules.test.mjs`](tests/firestore-rules.test.mjs)，驗證跨帳號讀寫、竄改、並發與防重複。
- **Mutation 測試**：[`scripts/`](scripts) 會自動把 Rules 的條件一一改壞，確認每個突變都被測試抓到，用來檢驗 Rules 測試本身有沒有漏洞。
- **CI**：每次 push 由 GitHub Actions 跑型別檢查、單元測試、兩個版本的建置與 Emulator Rules 測試（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。部署只能手動觸發，而且只部署前端，不會動到 Rules。

## 本機開發

需要 Node.js 24。

```bash
npm ci
npm run dev           # 內部展示版 http://localhost:5173/
npm run dev:public    # 公開測試版 http://localhost:5174/
npx tsc --noEmit      # 型別檢查
npm test              # 單元測試
npm run build         # 建置內部展示版 → dist/
npm run build:public  # 建置公開測試版 → dist-public/
```

Rules 測試需要 Java 與 Firestore Emulator，CI 的作法見 [`scripts/test-firestore-rules-ci.sh`](scripts/test-firestore-rules-ci.sh)。

## AI 協作開發方式

這個專案由一位產品負責人搭配多個 AI 代理完成，採「積木式」流程：

1. 每個功能先寫成一份**積木契約**（FSD）：責任、輸入輸出、資料擁有者、讀寫權限、錯誤處理與驗收案例。
2. 由不同角色的 AI 代理分工：架構審查先審契約 → 開發實作 → QA 與資安審查同一版本 → 開發集中修正。
3. 會影響獎勵、週期、權限或範圍的決策，一律回到產品負責人裁決，並記錄在契約裡。
4. 上線後由 AI 代理依驗收指令實際操作網站，人工再做最終確認。

協作規範見 [`AGENTS.md`](AGENTS.md) 與 [`CLAUDE.md`](CLAUDE.md)，開發歷程見 [`HANDOFF.md`](HANDOFF.md)。

## 文件導覽

| 位置 | 內容 |
|---|---|
| [`PRD/智行遊移_PRD_v0.1.md`](PRD/智行遊移_PRD_v0.1.md) | 產品需求文件（以文件內版本為準；「智行遊移」為舊稱） |
| [`PRD/yoxi智行遊移需求規格計畫書_RFP_1.2.md`](PRD/yoxi智行遊移需求規格計畫書_RFP_1.2.md) | 原始需求規格計畫書（PRD 的轉換基準） |
| [`FSD/`](FSD) | 各功能的積木契約，含審查紀錄與產品負責人裁決 |
| [`UI-design/`](UI-design) | 設計交付包，從 [`00_先讀我.md`](UI-design/00_先讀我.md) 開始 |
| [`報告/`](報告) | 開發進度報告 |
| [`驗收紀錄.md`](驗收紀錄.md)、`發布與驗收清單_*.md` | 人工驗收紀錄與發布清單 |

## 範圍說明

- 本專案是概念展示，不是正式 yoxi App，不接真實訂單、支付、健康資料或正式會員。首頁的 yoxi 畫面是示意圖。
- AI 情境推薦屬後續版本規劃，首版不開發。
- 第三方授權聲明見 [`public/third-party-licenses.txt`](public/third-party-licenses.txt)。
