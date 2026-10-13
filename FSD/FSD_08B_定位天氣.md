# FSD-08B 定位天氣（地圖右上天氣圖示＋天氣視窗）

**狀態**：契約第 2 版（2026-10-05），Architect 附條件通過，條件已併入文末。**只改前端；不改 Rules、不碰 Firebase、不重設場次。**

## 產品負責人裁決（2026-10-05）
- 資料來源：**Open-Meteo**（免金鑰、瀏覽器直連、CC BY 4.0；免費方案限非商業，本展示屬內部非商業使用）。
- 視窗內容照四段建議（現在、接下來 6 小時、今天／明天、走路提示＋來源）。
- 隱私說明新文字同意（見「隱私」）。

## 需求
- 使用者同意定位且取得位置後，地圖右上方顯示目前位置的天氣圖示（四種：晴天、陰天、雨天、雷雨）。
- 點圖示開啟天氣視窗，顯示目前天氣概況與預測。
- 沒有定位、定位被拒、天氣讀取失敗或資料不完整：**不顯示圖示**（不跳錯誤），既有地圖與步數功能不受影響。

## 資料來源與請求
- 端點：`https://api.open-meteo.com/v1/forecast`，參數固定：
  - `latitude`、`longitude`：**四捨五入到小數 2 位**（約 1 公里）。
  - `current=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m`
  - `hourly=temperature_2m,precipitation_probability,weather_code`、`forecast_hours=7`
  - `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`、`forecast_days=2`
  - `timezone=Asia%2FTaipei`、`wind_speed_unit=kmh`
- `fetch` 使用 `credentials: "omit"`、`referrerPolicy: "no-referrer"`、`cache: "no-store"`；逾時 8 秒（`AbortController`）。不送任何身分、會員或場次資料。
- 頻率：取得第一次位置後請求一次；之後同一位置（四捨五入後相同、或移動 < 5 公里）15 分鐘內不重抓；頁面隱藏、離開步數頁、`stop()` 時不抓；同時只允許一個請求（single flight），舊請求結果在位置／世代變更後丟棄。
- 解析：純函式 `parseForecast(json)` 嚴格檢查型別與陣列長度（數值必須是有限數），不符就視為失敗；不把 API 文字放進 HTML（只用數值與代碼對照的固定中文）。

## 天氣代碼對照（WMO）
| 圖示 | 代碼 | 描述文字 |
|---|---|---|
| 晴天 | 0、1 | 晴／大致晴朗 |
| 陰天 | 2、3、45、48、71–77、85、86 | 多雲／陰天／有霧／下雪 |
| 雨天 | 51–57、61–67、80–82 | 毛毛雨／下雨／陣雨 |
| 雷雨 | 95、96、99 | 雷雨／雷雨伴冰雹 |
| 不明 | 其他 | 不顯示圖示 |

## 畫面
- **圖示**：地圖右上（不與「定位」「模擬」按鈕、大步數列重疊），44×44 觸控區，`aria-label="目前天氣：多雲 28°C，開啟天氣詳情"`。圖示依 UI 規範為雙色實心（墨藍主體＋圖示紅點綴），自繪 4 個（晴、陰、雨、雷雨），不使用 emoji。
- **天氣視窗**（`role="dialog"`、`aria-modal`、焦點圈在視窗內、Escape 與「關閉」按鈕關閉、關閉後焦點回圖示），併入既有覆蓋層互斥（外殼 `overlayOpen`、團隊對話框守衛、昨日提示與恭喜延後）：
  1. **現在**：圖示、描述、氣溫、體感溫度、降雨機率、風速（km/h）。
  2. **接下來 6 小時**：每小時一格（時間、圖示、氣溫、降雨機率），可橫向捲動。
  3. **今天／明天**：最高／最低溫、降雨機率。
  4. **走路提示**（一句，依序取第一個符合）：
     - 雷雨（現在或 6 小時內）→「可能有雷雨，建議在室內走走」
     - 降雨機率 ≥ 50% →「降雨機率 N%，出門記得帶傘」
     - 氣溫或體感 ≥ 32°C →「天氣炎熱，記得補水、避開正午」
     - 氣溫 ≤ 12°C →「天氣偏冷，出門注意保暖」
     - 其他 →「適合出門走走」
  - 底部：「天氣資料：Open-Meteo.com（CC BY 4.0）・更新 HH:MM」與「天氣為實際時間的資料，與展示用的情境時間無關。」
- 字型、顏色、圓角只用 `--yx-*` token；小螢幕 360 寬不破版。

## 隱私（產品負責人已同意文字）
- 地圖下方說明改為：「位置只在你的手機上顯示，不會存檔或傳給隊友；查天氣時會把約 1 公里範圍的位置送給 Open-Meteo。地圖圖片由 OpenStreetMap 提供，下載時會依地圖範圍向其伺服器取圖。」
- 經緯度不寫入 Firestore、localStorage、console 或錯誤訊息；天氣結果只存在記憶體。

## 程式結構
- `src/weather/weather-state.ts`（純函式）：`roundCoord`、`distanceKm`、`shouldFetch(last, now, coords)`、`weatherKind(code)`、`weatherText(code)`、`parseForecast(json)`、`walkTip(forecast)`。
- `src/weather/weather-service.ts`：`fetchForecast(lat, lon, signal)`（唯一的網路呼叫）。
- `src/app/map-hero.ts`：在 `placePosition` 後通知天氣控制器；`stop()`／隱藏時中止請求。
- `src/ui/views.ts`：`weatherButtonView(forecast)`、`weatherDialogView(forecast, updatedAt)`；`src/ui/icons.ts` 新增 4 個圖示。
- `src/app/app-shell.ts`：視窗開關與覆蓋層互斥。

## 測試
- 單元：代碼對照（每類邊界）、`parseForecast`（缺欄位、非數值、陣列長度不符、NaN 皆失敗）、`roundCoord`、`shouldFetch`（15 分鐘、5 公里、相同座標）、`walkTip` 優先序、視圖跳脫與無 emoji、`ui-tokens` 通過。
- 以假 `fetch` 測控制器：single flight、逾時、失敗不顯示圖示、位置變更丟棄舊結果、stop 後不更新。
- 瀏覽器：ui-preview 新增天氣圖示與視窗情境（四種天氣、手機寬）；本機實際定位一次確認請求參數（小數 2 位、無 cookie／referrer）。

## 驗收
1. 同意定位後，地圖右上出現天氣圖示，與當地實際天氣大致相符。
2. 點圖示 → 視窗顯示四段內容與資料來源；Escape／關閉可關，焦點回圖示。
3. 拒絕定位或關閉網路 → 不顯示圖示，其餘功能正常。
4. 隱私說明文字已更新。
5. 天氣視窗與其他視窗（模擬步數、昨日提示、恭喜、團隊對話框）不會同時出現。

## 發布
只部署前端（`firebase deploy --only hosting`），可與 03E＋04B 同批或之後；回復＝重新部署前一版。

## 第 2 版修訂：Architect 審查（2026-10-05，Opus）附條件通過，已併入

### 阻擋項修訂
- **B1 位置**：天氣按鈕放在 `mapHeroView` 的 `.yo-map-top` 內、`#map-actions` 旁的**兄弟容器 `#map-weather`**，只由天氣控制器寫入（`renderStatus` 會整段重寫 `#map-actions`，不可放那裡）。按鈕 `flex:none`，狀態膠囊在 360 寬以省略號截斷；重寫按鈕時若焦點在按鈕上要移回。
- **B2 覆蓋層互斥（完整清單）**：視窗 id 固定 `#weather-dialog`。(1) `app-shell` `overlayOpen()` 加天氣；(2) `isDrawerOpen()` 納入天氣（經由它，`main.ts` 的 `drawerOpen`、各 `otherDialogOpen`、昨日提示延後全部生效，恭喜與寶箱也會延後）；(3) `team-panel` 對話框守衛選擇器加 `#weather-dialog`；(4) 開天氣視窗前守衛 `stopped`／`isStale()`／`overlayOpen()`；(5) stale overlay、`#chest-overlay`、`#yesterday-prompt`、`#coupon-prompt` 出現時關閉天氣視窗，`main.ts` 離開共享畫面／登出的清理一併移除 `#weather-dialog`；(6) `stop()`、切到展示版或管理頁時關閉視窗並移除 keydown 監聽。
- **B3 生命週期**：天氣請求條件＝`shouldWatch` 條件且 `status === "located"`；轉為 denied／unsupported／stale 時中止請求、清空記憶體預報、移除圖示並關閉視窗；天氣專用世代在 `clearWatch()` 時遞增。通知放在 watch callback（不依賴地圖是否已建立）。頻率：15 分鐘內「四捨五入後同位置**或**距離 < 5 公里」不重抓，到期後同位置重抓；**失敗後退避 5 分鐘**。

### 條件
- **C1 參數**：`timezone=Asia/Taipei` 交給 `URLSearchParams` 編碼；`current.precipitation_probability` 可能為 null，則改用 hourly 第一格，不使整體失敗；「接下來 6 小時」取時間晚於現在的前 6 格（`forecast_hours` 起點需實測）；時間字串以正規式 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` 檢查，不用 `new Date()`；檢查 `utc_offset_seconds === 28800`。
- **C2**：無 CSP，不需改；日後加 CSP 要放行 `connect-src https://api.open-meteo.com`。CC BY 4.0 標示附連結（`rel="noopener noreferrer"`）。風險紀錄：**若轉為商業或公開營運，需改付費 API 或重新評估**。
- **C3 隱私**：`roundCoord` 非有限數不送，以 `toFixed(2)` 組 URL；失敗 `catch` 不記錄 error（URL 含座標）；改 `LOCATION_PRIVACY` 並同步更新斷言舊字串的測試。
- **C4 a11y**：`aria-label` 由對照表與整數氣溫組成；沿用 `app-shell` 焦點圈；Escape 排除 `isComposing`；6 小時區可鍵盤操作（`tabindex="0"`＋`aria-label`）。
- **C5**：圖示只用 `currentColor`／`var(--yx-*)`。
- **C6 走路提示邊界**：降雨取「現在與 6 小時內最大值」；雷雨看現在與 6 小時內（不看 daily）；炎熱看氣溫或體感 ≥ 32；偏冷只看現在氣溫 ≤ 12。

### 建議（採納）
- 獨立 `src/weather/weather-controller.ts`，注入 `fetch`／`now`／`setTimeout`；`map-hero` 只提供 `onFix`／`onLost`。
- 展示版（showcase）不啟動天氣（只在共享外殼）。

### 測試補充
denied／stale 清空；`stop()` 後完成的 fetch 不渲染；`renderStatus` 後天氣按鈕仍在；雙向互斥與 stale 時關閉；失敗退避；current null 改用 hourly；URL 參數與小數 2 位、fetch 選項；360 寬不重疊。

**狀態**：第 2 版，可交實作（與下一批畫面修改排序後進行）。

## 實作紀錄（2026-10-06）
- 檔案：`src/weather/weather-state.ts`（純函式）、`src/weather/weather-controller.ts`（注入 fetch／時鐘）、`src/app/map-hero.ts`（onFix／onLost／onPause）、`src/app/app-shell.ts`（`#map-weather`、`#weather-dialog`、互斥）、`src/ui/views.ts`、`src/ui/icons.ts`（晴／陰／雨／雷雨自繪）。
- Open-Meteo 實測（固定台北座標）：參數與欄位名稱正確，`forecast_hours=7` 從目前整點起，取晚於 current.time 的 6 格。
- 審查後修正：Security B1（隱私說明在顯示自己位置時也常駐）、Security B2（自動七天暫停監看後「返回」改為重新載入）、Security S1（請求最少間隔 30 秒，含被中止的請求）、QA B1（天氣視窗 Tab 循環含連結與 6 小時列表；Escape 排除組字）、QA B2（依本契約 B3：定位轉為「可能過時」即清除天氣，下一次定位再抓）、QA S1／S2（失去預報時焦點與延後提示；抽屜、通知、指南也檢查天氣視窗）。
- 已知事項：Open-Meteo 也會收到一般連線資訊（IP、User-Agent）；請求失敗時瀏覽器主控台可能自行顯示含（四捨五入）座標的網址，非 app 記錄。
