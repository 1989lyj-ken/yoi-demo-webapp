import type { AuthenticatedSession } from "../identity/contracts";
import type { MemberNames } from "../identity/member-names";
import { referralView } from "../ui/views";
import { isFirebaseError } from "../firebase/error-kind";
import type { ReferralFeed, ReferralService } from "./referral-service";
import { checkCode, ReferralFormatError } from "./referral-state";

export interface ReferralPanel { stop(): void }

interface Hooks {
  isStale(): boolean;
  /** A write found the clock or session changed: the page shows the reload overlay. */
  onStale(): void;
  /** A referral name arrived (the points record shows it too). */
  onNames(): void;
}

/**
 * FSD-07A in the shared screen: the own code, binding a code, the simulated first ride and the people
 * the viewer referred. Only server-confirmed snapshots count; refusals are explained after a server reread.
 * Names come from a MemberNames of its own (Architect M6), so the team block's roster key never interferes.
 */
export function mountReferralPanel(session: AuthenticatedSession, service: ReferralService, feed: ReferralFeed,
  names: MemberNames, hooks: Hooks): ReferralPanel {
  const content = document.querySelector<HTMLElement>("#referral-content")!;
  const status = document.querySelector<HTMLElement>("#referral-status")!;
  const errorBox = document.querySelector<HTMLElement>("#referral-error")!;
  const self = session.member.memberId;
  let busy = false;
  let stopped = false;
  /** FSD-08A-6: the binding form's own error, shown under the field. */
  let formError: string | null = null;

  const showError = (message: string) => { errorBox.textContent = message; errorBox.hidden = false; };
  const clearError = () => { errorBox.hidden = true; };

  function render() {
    if (stopped || hooks.isStale()) return;
    const snap = feed.snapshot();
    if (snap.error) {
      showError(snap.error instanceof ReferralFormatError ? snap.error.message
        : isFirebaseError(snap.error) ? "無法讀取推薦狀態；請確認連線或重新載入。" : snap.error.message);
    }
    const ok = !snap.error;
    const ids = [...(snap.own ? [snap.own.referrerId] : []), ...(snap.mine ?? []).map((r) => r.refereeId)];
    names.request(ids, ids.join(","), () => { render(); hooks.onNames(); });
    const html = referralView({
      myCode: self,
      own: !ok || snap.own === undefined ? undefined : snap.own === null ? null
        : { referrerName: names.label(snap.own.referrerId), boundAt: snap.own.boundAt, firstRideAt: snap.own.firstRideAt },
      mine: !ok || snap.mine === undefined ? undefined : snap.mine.map((r) => ({ name: names.label(r.refereeId), firstRide: r.firstRideAt !== null }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
      busy,
      formError,
    });
    // Keep a code being typed: re-render only when something shown changed, and carry the typed value across a re-render.
    if (content.dataset.html !== html) {
      const typed = content.querySelector<HTMLInputElement>("#referral-input");
      const value = typed?.value ?? "";
      const focused = document.activeElement === typed;
      content.innerHTML = html; content.dataset.html = html;
      const again = content.querySelector<HTMLInputElement>("#referral-input");
      if (again && value) again.value = value;
      if (again && focused && !again.disabled) again.focus();
    }
  }

  async function run(action: () => Promise<{ ok: boolean; message?: string; stale?: boolean }>, done: string, inForm = false) {
    if (busy || stopped || hooks.isStale()) return;
    busy = true; clearError(); status.textContent = "處理中，請稍候…"; render();
    let result: { ok: boolean; message?: string; stale?: boolean };
    try { result = await action(); } catch { result = { ok: false, message: "展示身分已變更，請重新登入。" }; }
    busy = false;
    if (stopped) return;
    if (result.stale) { hooks.onStale(); return; }
    status.textContent = result.ok ? done : "";
    if (!result.ok) { if (inForm) formError = result.message ?? "未完成，請稍後再試。"; else showError(result.message ?? "未完成，請稍後再試。"); }
    else formError = null;
    render();
  }

  content.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = content.querySelector<HTMLInputElement>("#referral-input");
    const check = checkCode(input?.value ?? "", self);
    if (!check.ok) { formError = check.message; render(); return; }
    formError = null;
    void run(async () => {
      // Q1-A: the code must name a member (server read, not the cache); the Rules check it again.
      const exists = await service.codeExists(check.code);
      if (exists === false) return { ok: false, message: "找不到這個推薦碼。" };
      return service.bind(session, check.code);
    }, "推薦碼綁定完成，已獲得 NT$50 推薦獎勵券 ×2（模擬）。", true);
  });

  content.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    if (el.closest("#referral-ride")) void run(() => service.firstRide(session), "首乘已完成（模擬），推薦獎勵已發放給推薦人。");
    else if (el.closest("#referral-copy")) {
      const button = el.closest<HTMLButtonElement>("#referral-copy")!;
      if (!navigator.clipboard) { status.textContent = `請手動複製推薦碼：${self}`; return; }
      void navigator.clipboard.writeText(self).then(() => {
        status.textContent = "已複製推薦碼。";
        // Same feedback as the invite card's copy button: the button itself says so for a moment.
        button.textContent = "已複製";
        window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => { if (button.isConnected) button.textContent = "複製推薦碼"; }, 2500);
      }, () => { status.textContent = `請手動複製推薦碼：${self}`; });
    }
  });

  let copyTimer = 0;
  const unlisten = feed.listen(render);
  render();
  return { stop() { stopped = true; window.clearTimeout(copyTimer); unlisten(); } };
}
