import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase/config";
import { FirestoreSharedContextStore } from "./identity/firestore-shared-context";
import type { DemoContext, MemberIdentity } from "./identity/contracts";
import "./gas-spike-test.css";

// Deliberately separate from the product UI and Vite's production entry point.
const endpoint = "https://script.google.com/macros/s/AKfycbzSQOv_TtX9L_Z4gbeOOTI5xFF4sdtG1lD-CCnJ8piOlAZCCwZXSSx8pVzKk2RQypGOGw/exec";
const contextStore = new FirestoreSharedContextStore(firebaseAuth, firestore, true);
const root = document.querySelector<HTMLDivElement>("#gas-spike-app");
if (!root) throw new Error("Missing test page root");

root.innerHTML = `
  <main class="spike-shell">
    <h1>GAS 隔離測試頁</h1>
    <p>僅供本機開發測試；這不是智行遊移正式功能。操作只會透過 GAS 寫入目前場次下自己的 <code>gasSpike</code> 測試資料。</p>
    <p id="auth-status" role="status">正在確認登入狀態…</p>
    <p>尚未登入？請先到 <a href="/">展示登入頁</a> 使用自己的測試帳號登入，再回到此頁。此頁每次操作前都從伺服器讀取最新身分及場次；離線時不可操作。</p>
    <section aria-labelledby="context-title">
      <h2 id="context-title">目前身分與情境（唯讀）</h2>
      <dl id="context-details"><dt>狀態</dt><dd>等待載入</dd></dl>
      <button id="refresh-context" type="button" disabled>重新讀取身分與情境</button>
    </section>
    <section aria-labelledby="state-title">
      <h2 id="state-title">自己的隔離測試狀態（唯讀）</h2>
      <p>若 POST 遇到跨來源、重新導向或網路錯誤，結果可能未知；先按下方按鈕從 Firestore 伺服器查詢，勿直接重送。</p>
      <button id="read-state" type="button" disabled>從伺服器讀取我的測試狀態</button>
      <p id="state-status" role="status" aria-live="polite">尚未讀取。</p>
      <pre id="state-result">—</pre>
    </section>
    <section aria-labelledby="steps-title">
      <h2 id="steps-title">模擬步數</h2>
      <p>步數不可下修。每次按鈕都重新讀取最新場次與版本；「重送」用來觀察冪等或下修拒絕。</p>
      <div class="button-row">
        <button type="button" data-steps="2000" disabled>設為 2,000 步</button>
        <button type="button" data-steps="4000" disabled>設為 4,000 步</button>
        <button type="button" data-steps="6000" disabled>設為 6,000 步</button>
      </div>
      <form id="custom-steps-form">
        <label for="custom-steps">自訂步數（可用較低數值測試拒絕）</label>
        <input id="custom-steps" type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" required disabled />
        <button type="submit" disabled>送出步數</button>
      </form>
    </section>
    <section aria-labelledby="points-title">
      <h2 id="points-title">依序領點</h2>
      <p>達標後依序點第 1、2、3 點；重按已領點可測試重送不重複發點。</p>
      <div class="button-row">
        <button type="button" data-milestone="1" disabled>領第 1 點</button>
        <button type="button" data-milestone="2" disabled>領第 2 點</button>
        <button type="button" data-milestone="3" disabled>領第 3 點</button>
      </div>
    </section>
    <section aria-labelledby="result-title">
      <h2 id="result-title">最近一次結果</h2>
      <p id="operation-status" role="status" aria-live="polite">尚未送出請求。</p>
      <pre id="operation-result">—</pre>
    </section>
  </main>
`;

const status = document.querySelector<HTMLParagraphElement>("#auth-status")!;
const details = document.querySelector<HTMLDListElement>("#context-details")!;
const operationStatus = document.querySelector<HTMLParagraphElement>("#operation-status")!;
const operationResult = document.querySelector<HTMLPreElement>("#operation-result")!;
const customStepsForm = document.querySelector<HTMLFormElement>("#custom-steps-form")!;
const customStepsInput = document.querySelector<HTMLInputElement>("#custom-steps")!;
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-steps], [data-milestone]"));
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-context")!;
const readStateButton = document.querySelector<HTMLButtonElement>("#read-state")!;
const stateStatus = document.querySelector<HTMLParagraphElement>("#state-status")!;
const stateResult = document.querySelector<HTMLPreElement>("#state-result")!;
let currentUser: User | null = null;
let busy = false;
let ready = false;
let authEpoch = 0;

function setEnabled(): void {
  const enabled = ready && !busy;
  actionButtons.forEach((button) => { button.disabled = !enabled; });
  customStepsInput.disabled = !enabled;
  customStepsForm.querySelector<HTMLButtonElement>("button")!.disabled = !enabled;
  refreshButton.disabled = !currentUser || busy;
  readStateButton.disabled = !currentUser || busy;
}

function showContext(member: MemberIdentity, context: DemoContext): void {
  details.replaceChildren();
  const rows = [
    ["展示成員", `${member.displayName}（${member.memberId}）`],
    ["權限", member.role === "admin" ? "管理者" : "團隊成員"],
    ["目前場次", context.sessionId],
    ["情境時間", context.scenarioNow],
    ["時鐘版本", String(context.clockVersion)],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    details.append(dt, dd);
  }
}

function assertCurrent(user: User, epoch: number): void {
  if (authEpoch !== epoch || currentUser !== user || firebaseAuth.currentUser?.uid !== user.uid) {
    throw new Error("登入帳號已變更，請重新整理測試頁。");
  }
}

async function freshContext(user: User, epoch: number): Promise<{ member: MemberIdentity; context: DemoContext }> {
  assertCurrent(user, epoch);
  const resolved = await contextStore.resolveAuthorizedContext();
  assertCurrent(user, epoch);
  showContext(resolved.member, resolved.context);
  return { member: resolved.member, context: resolved.context };
}

async function refreshContext(): Promise<void> {
  const user = currentUser;
  if (!user) return;
  const epoch = authEpoch;
  busy = true;
  setEnabled();
  try {
    await freshContext(user, epoch);
    if (authEpoch !== epoch) return;
    ready = true;
    status.textContent = "已從伺服器讀取目前展示身分及場次。";
  } catch (error) {
    if (authEpoch !== epoch) return;
    ready = false;
    status.textContent = error instanceof Error ? error.message : "無法從伺服器讀取目前情境；請檢查連線。";
  } finally {
    if (authEpoch === epoch) {
      busy = false;
      setEnabled();
    }
  }
}

async function readOwnState(): Promise<void> {
  const user = currentUser;
  if (!user || busy) return;
  const epoch = authEpoch;
  busy = true;
  setEnabled();
  stateStatus.textContent = "正在從伺服器讀取最新測試狀態…";
  stateResult.textContent = "—";
  try {
    const { member, context } = await freshContext(user, epoch);
    const stateRef = doc(firestore, "gasSpike", context.sessionId, "members", member.memberId);
    const snapshot = await getDocFromServer(stateRef);
    assertCurrent(user, epoch);
    if (!snapshot.exists()) {
      stateStatus.textContent = "目前場次尚無此帳號的測試狀態；首次成功命令才會建立。";
      return;
    }
    const data = snapshot.data();
    if (data.sessionId !== context.sessionId || data.memberId !== member.memberId) {
      throw new Error("測試狀態與目前身分或場次不一致，請停止操作並檢查。");
    }
    stateStatus.textContent = "已從 Firestore 伺服器讀取。";
    stateResult.textContent = JSON.stringify({
      sessionId: data.sessionId,
      memberId: data.memberId,
      clockVersion: data.clockVersion,
      rawSteps: data.rawSteps,
      claimedMilestones: data.claimedMilestones,
      points: data.points,
    }, null, 2);
  } catch (error) {
    if (authEpoch !== epoch) return;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    stateStatus.textContent = code === "permission-denied"
      ? "沒有讀取此測試狀態的權限，請檢查帳號與 Firestore Rules。"
      : error instanceof Error && error.message.startsWith("登入帳號已變更")
        ? error.message
        : "無法從 Firestore 伺服器讀取測試狀態。請檢查網路及登入狀態；不可用快取推定結果。";
  } finally {
    if (authEpoch === epoch) {
      busy = false;
      setEnabled();
    }
  }
}

type Command = { command: "bumpSteps"; rawSteps: number } | { command: "claimPoint"; milestone: number };

async function sendCommand(command: Command): Promise<void> {
  if (busy || !ready || !currentUser) return;
  const user = currentUser;
  const epoch = authEpoch;
  busy = true;
  setEnabled();
  operationStatus.textContent = "正在讀取最新情境並送出請求…";
  operationResult.textContent = "—";
  let sent = false;
  try {
    const { context } = await freshContext(user, epoch);
    // The ID token exists only in this request's memory; never render or log it.
    const idToken = await user.getIdToken();
    assertCurrent(user, epoch);
    const payload = {
      ...command,
      idToken,
      expectedSessionId: context.sessionId,
      expectedClockVersion: context.clockVersion,
    };
    sent = true;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
    });
    if (authEpoch !== epoch) return;
    if (!response.ok) throw new Error(`端點回應 HTTP ${response.status}；請檢查部署與存取設定。`);
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null || !("ok" in parsed) || typeof parsed.ok !== "boolean") {
      throw new Error("端點未回傳預期格式；請檢查 GAS 版本或重新部署狀態。");
    }
    const result = parsed as { ok: boolean; error?: unknown; state?: unknown };
    if (result.ok) {
      const state = result.state;
      if (typeof state !== "object" || state === null) throw new Error("端點成功回應缺少狀態資料。");
      const data = state as Record<string, unknown>;
      operationStatus.textContent = "端點回應成功。";
      operationResult.textContent = JSON.stringify({
        sessionId: data.sessionId,
        memberId: data.memberId,
        clockVersion: data.clockVersion,
        rawSteps: data.rawSteps,
        claimedMilestones: data.claimedMilestones,
        points: data.points,
      }, null, 2);
    } else {
      operationStatus.textContent = "端點明確拒絕本次操作；測試資料是否變更仍以共享端狀態為準。";
      operationResult.textContent = typeof result.error === "string" ? result.error : "REQUEST_FAILED";
    }
  } catch (error) {
    if (authEpoch !== epoch) return;
    const message = error instanceof TypeError
      ? "瀏覽器無法讀取 GAS 回應，可能是跨來源限制、重新導向或網路問題。"
      : error instanceof Error ? error.message : "請求失敗。";
    operationStatus.textContent = sent
      ? `${message} 請求可能已送達並寫入；結果未知，先確認測試狀態，勿盲目重送。`
      : message;
    operationResult.textContent = "未取得可確認的端點回應。";
  } finally {
    if (authEpoch === epoch) {
      busy = false;
      setEnabled();
    }
  }
}

onAuthStateChanged(firebaseAuth, (user) => {
  authEpoch += 1;
  currentUser = user;
  ready = false;
  busy = false;
  setEnabled();
  operationStatus.textContent = "登入狀態已更新；請重新確認目前帳號。";
  operationResult.textContent = "—";
  stateStatus.textContent = "登入狀態已更新；尚未讀取測試狀態。";
  stateResult.textContent = "—";
  if (!user) {
    status.textContent = "尚未登入。請先至展示登入頁登入。";
    details.replaceChildren();
    return;
  }
  void refreshContext();
}, () => {
  status.textContent = "無法確認登入狀態，請檢查網路後重新整理。";
});

refreshButton.addEventListener("click", () => { void refreshContext(); });
readStateButton.addEventListener("click", () => { void readOwnState(); });
actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.steps) void sendCommand({ command: "bumpSteps", rawSteps: Number(button.dataset.steps) });
    else if (button.dataset.milestone) void sendCommand({ command: "claimPoint", milestone: Number(button.dataset.milestone) });
  });
});
customStepsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const rawSteps = Number(customStepsInput.value);
  if (!Number.isSafeInteger(rawSteps) || rawSteps < 0) {
    operationStatus.textContent = "請輸入非負且不超過 JavaScript 安全整數範圍的步數。";
    return;
  }
  void sendCommand({ command: "bumpSteps", rawSteps });
});
