# GitHub Actions 設定步驟（給產品負責人，2026-10-13）

已準備好的檔案：

| 檔案 | 用途 |
|---|---|
| `.gitignore` | 排除帳號資料、`node_modules`、`dist*`、`.backup/`、`.wav`（超過 GitHub 100 MB 上限）等 |
| `.github/workflows/ci.yml` | 階段一＋二：每次 push 自動跑型別檢查、單元測試、兩版建置、Firestore Rules 測試（Emulator，不連雲端） |
| `scripts/test-firestore-rules-ci.sh` | Rules 測試的 Linux 版（與 `test-firestore-rules.ps1` 同樣釘選版本並驗證 JAR 雜湊） |
| `.github/workflows/deploy-hosting.yml` | 階段三：手動觸發部署 Hosting（只部署前端，不動 Rules），需要核准與 Secrets |

---

## 階段一＋二：建立 repo 並推上去

1. 在 GitHub 建立新 repository，**務必選 Private**（含 PRD、FSD 與內部文件）。不要勾選「Add README／.gitignore／license」。
2. 在專案資料夾執行（PowerShell）：
   ```
   git init -b main
   git add .
   git status
   ```
3. **推送前檢查**：`git status` 的清單中**不可以**出現 `YOI team member accounts.md`、`node_modules`、`.backup`、`.wav`。若出現，先停下來告訴 Claude。
4. 提交並推送（把網址換成您的 repo）：
   ```
   git commit -m "Initial import"
   git remote add origin https://github.com/<帳號>/<repo>.git
   git push -u origin main
   ```
5. 到 GitHub 的 **Actions** 頁籤，會看到「CI」自動開始跑，兩個工作：`check`（約 2–3 分鐘）、`rules`（第一次要下載 Emulator，約 5 分鐘）。全部綠勾即完成。失敗時把紅色那一步的訊息貼給 Claude。

## 階段三：手動部署（等階段一＋二綠勾後再做）

1. **建立服務帳戶**（Google Cloud Console，分別對 `yoxi-yoi-demo` 與 `yoi-public-demo` 各做一次）：
   IAM 與管理 → 服務帳戶 → 建立 → 角色選 **Firebase 託管管理員**（Firebase Hosting 管理員；不是「Firebase 管理員」或「App Hosting 管理員」）（只給這個角色，不要給擁有者或 Rules 相關權限）→ 金鑰 → 新增 JSON 金鑰，下載。
2. **設定 Secrets**（GitHub repo → Settings → Secrets and variables → Actions → New repository secret）：
   - `FIREBASE_SA_INTERNAL`：貼上 `yoxi-yoi-demo` 的 JSON 全文
   - `FIREBASE_SA_PUBLIC`：貼上 `yoi-public-demo` 的 JSON 全文
   - 貼完後把下載的 JSON 檔刪除，不要放進專案資料夾。
3. **限制分支**（Settings → Environments）：建立 `internal-demo` 與 `public-demo` 兩個環境，各自把「Deployment branches and tags」設為 **Selected branches and tags**，只加 `main`。（免費方案的私人 repo 沒有 Required reviewers；部署只能由 repo 寫入者手動觸發，目前只有產品負責人。）
4. **部署**：Actions → Deploy Hosting → Run workflow → 選 `internal`（內部展示版）或 `public`（公開測試版）→ 完成後重新整理網站確認。

> 服務帳戶只有 Hosting 權限，即使工作流程被改動也無法發布 Firestore Rules。Rules 發布維持由產品負責人在 Console 手動執行。
