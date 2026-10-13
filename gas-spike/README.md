# FSD-05 Apps Script isolated spike

> **已停用（2026-10-03）**：產品負責人決定不保留 Apps Script 試驗，雲端專案已移除。本資料夾僅作紀錄保留，請勿再部署；產品不使用此路徑。

This isolated web app is intended to test Firebase Auth identity lookup and Firestore REST transactions on `gasSpike/{sessionId}/members/{memberId}` only. It does not connect to the product UI and does not write formal feature collections. It rejects request bodies over 16 KiB and applies a best-effort in-memory 30 requests / UID / minute cap; this is not protection against distributed abuse. The deployment should be temporary and removed after the spike by the project owner.

## Local validation

Run `npm test` from the repository root. Tests use fabricated state and tokens and do not call Firebase or Apps Script.

Run `npm run test:rules` to start only the Firestore Emulator bound to `127.0.0.1:8088` under fixed project ID `demo-yoxi-yoi-rules-test`; all test fixtures and writes stay inside that local emulator.

## Current owner-controlled cloud state (2026-09-30)

The owner created the standalone Apps Script project, configured the existing Firebase Web API key as Script Property `YOXI_FIREBASE_API_KEY`, and deployed Web App version 1. The deployment executes as the owner and is accessible to **any signed-in Google account**, not only the six demonstration members. The narrow `gasSpike` Firestore Rules were published after owner confirmation; earlier local Emulator validation and Rules Playground smoke checks do not establish a successful end-to-end POST. The deployment uses the caller's Firebase ID token for Auth and Firestore REST requests and does not use a service-account key or OAuth datastore scope. The deployed code/version must be checked before treating later local source changes as live.

Browser POST, Apps Script ContentService redirect/CORS handling, live Firebase Auth lookup, live Firestore REST transaction/Rules behavior, revocation handling, and quotas are **not yet verified**. This is not proof of PRD P19/P26 or product-ready sharing. Never paste a real token into logs or tests. Deactivation/removal of the broad-access deployment remains an owner action after the spike.

## Request contract

`bumpSteps`: `{command, idToken, expectedSessionId, expectedClockVersion, rawSteps}`. `rawSteps` is limited only to JavaScript's exact safe-integer range so the Firestore integer value round-trips exactly.

`claimPoint`: `{command, idToken, expectedSessionId, expectedClockVersion, milestone}` where `milestone` is 1, 2, or 3. Naming the target milestone makes transport retries idempotent: replaying an already-applied claim returns the current state without incrementing points again.

No caller-supplied UID/memberId/role/path is accepted. The first command for an identity creates the prescribed zero state in a separate create-only transaction, then applies the command in a fresh transaction that re-reads mapping, context and state.

See `RULES_PLAYGROUND.md` for an explicit manual case matrix. Source inspection and local mocks are not a Rules execution test; Firebase Emulator validation is a publish gate.

For browser probing, send the JSON string as `text/plain` to avoid an unnecessary JSON CORS preflight; this does not guarantee that Apps Script's redirect/CORS behavior will work and must be tested in the deployed browser flow.

## Local browser test page

Run `npm run dev` at the repository root. Log in at `http://localhost:5173/` with an existing test account, then open `http://localhost:5173/gas-spike-test.html` in the same browser profile. The page is a separate Vite development entry, is not linked from the product UI, and is not part of the production build. It reads the signed-in account's member mapping and current demo context through the existing Firebase SDK. Each action re-reads `demo/current`, obtains the Firebase ID token in memory, and sends exactly one `text/plain` JSON POST to the deployed GAS `/exec` URL. The page itself does not separately store or display the token; the Firebase SDK may retain its own auth session according to its configuration.

Buttons set 2,000, 4,000 or 6,000 raw steps and claim milestones 1–3. The custom nonnegative integer input permits replay or lower-step negative tests. Do not paste a token, password, or UID into the page. Only explicit command-button submissions can write to `gasSpike`; no test state is reset automatically. Identity mapping and `demo/current` are fetched from the Firestore server on each action, not from the local cache. A separate read-only button derives the user's own spike path from that trusted mapping/context and uses a server-only Firestore read; it also reports when no state document exists. A direct GAS ContentService redirect or CORS failure can leave the POST outcome **unknown**—use the read-state button before retrying. If that server read also fails, do not infer success/failure from cache. The page does not bypass CORS with `no-cors` and does not prove browser feasibility until tested against the deployed GAS endpoint.
