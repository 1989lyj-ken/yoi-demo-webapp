# `gasSpike` Firestore Rules Playground matrix

Manual cases for the Firebase Console Rules Playground before any cloud publish. These are **test instructions, not test results**. Use isolated test records only; never use production paths for negative writes.

## Fixture assumptions

- Signed-in Auth UID `uid-test-1` maps to `{memberId: "YOI-M01", active: true}`.
- `demo/current` is `{sessionId: "spike-session-1", clockVersion: 4}`.
- Target document: `gasSpike/spike-session-1/members/YOI-M01`.
- A second active UID maps to `YOI-M02`; an inactive UID has `active: false`.
- For update cases, seed a state matching the listed old fields. Every state has exactly `sessionId`, `memberId`, `clockVersion`, `rawSteps`, `points`, `claimedMilestones`.

| # | Auth / operation | Old state → requested state | Expected |
|---|---|---|---|
| 1 | `uid-test-1`, get own target | — | Allow |
| 2 | `uid-test-1`, get `.../YOI-M02` | — | Deny |
| 3 | `uid-test-1`, list `gasSpike/spike-session-1/members` | — | Deny |
| 4 | active `uid-test-1`, create own target | current S1/v4, raw 0, points 0, claims `[]` | Allow |
| 5 | active `uid-test-1`, create own target | raw 1 or points 1 / claims `[1]` | Deny |
| 6 | active `uid-test-1`, create under a non-current session | valid zero state but path session differs from demo | Deny |
| 7 | `uid-test-1`, update own target | raw 100 → 200, all other fields unchanged, clock 4 | Allow |
| 8 | `uid-test-1`, update own target | raw 200 → 199 | Deny |
| 9 | `uid-test-1`, update own target | raw 200 → 300 and points 0 → 1 / claims `[]` → `[1]` | Deny (mixed update) |
| 10 | `uid-test-1`, update own target | raw 2,000, points 0 / `[]` → points 1 / `[1]` | Allow |
| 11 | `uid-test-1`, update own target | raw 6,000, points 0 / `[]` → points 2 / `[1,2]` | Deny (skipped point) |
| 12 | `uid-test-1`, update own target | raw 2,000, points 0 / `[]` → points 1 / `[2]` | Deny (wrong milestone) |
| 13 | `uid-test-1`, update own target | raw 1,999, points 0 / `[]` → points 1 / `[1]` | Deny (below threshold) |
| 14 | `uid-test-1`, update own target | valid step/claim transition but extra `role` field | Deny |
| 15 | `uid-test-1`, update own target | valid step/claim transition but change memberId or sessionId | Deny |
| 16 | `uid-test-1`, update own target | valid transition but clockVersion differs from current v4 or decreases | Deny |
| 17 | inactive or unmapped UID, get/create/update own-looking path | any | Deny |
| 18 | `uid-test-1`, delete own target | — | Deny |

After Rules Playground checks, the Firestore Emulator suite remains required before publication. Playground and source-text inspection alone do not establish concurrency, REST transaction behavior, or full Rules correctness.
