import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const sandbox = {
  Date, JSON, Math, Object, Number, String, Array, isFinite,
  PropertiesService: {}, UrlFetchApp: {}, ContentService: {}, Utilities: {},
  CacheService: {}, LockService: {}
};
runInNewContext(source, sandbox);

const epoch = Math.floor(Date.now() / 1000);
function tokenFor(overrides = {}) {
  const claims = { aud: 'yoxi-yoi-demo', iss: 'https://securetoken.google.com/yoxi-yoi-demo', sub: 'uid-member-01',
    exp: epoch + 3600, iat: epoch - 10, auth_time: epoch - 100, ...overrides };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.fabricated-signature`;
}
function response(code, body) {
  return { getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) };
}
function firestoreDoc(path, fields, updateTime = '2026-09-30T00:00:00.000001Z') {
  return { name: `projects/yoxi-yoi-demo/databases/(default)/documents/${path}`, fields, updateTime };
}
function storedState(rawSteps = 0, claimed = []) {
  return firestoreDoc('gasSpike/session_1/members/YOI-M01', {
    sessionId: { stringValue: 'session_1' }, memberId: { stringValue: 'YOI-M01' }, clockVersion: { integerValue: '4' },
    rawSteps: { integerValue: String(rawSteps) }, points: { integerValue: String(claimed.length) },
    claimedMilestones: { arrayValue: { values: claimed.map((n) => ({ integerValue: String(n) })) } }
  });
}

const validBump = { command: 'bumpSteps', idToken: tokenFor(), expectedSessionId: 'session_1', expectedClockVersion: 4, rawSteps: 6000 };
const pureState = (rawSteps = 0, claimedMilestones = []) => ({ sessionId: 'session_1', memberId: 'YOI-M01', clockVersion: 3, rawSteps, points: claimedMilestones.length, claimedMilestones });
const demo = { sessionId: 'session_1', clockVersion: 4 };

test('validates fixed command schemas, rejects extra fields, and enforces safe integer boundaries', () => {
  assert.equal(sandbox.gasSpikeValidateInput_(validBump).rawSteps, 6000);
  assert.throws(() => sandbox.gasSpikeValidateInput_({ ...validBump, memberId: 'YOI-ADMIN' }), /INVALID_REQUEST/);
  assert.throws(() => sandbox.gasSpikeValidateInput_({ ...validBump, command: 'deleteEverything' }), /INVALID_REQUEST/);
  assert.throws(() => sandbox.gasSpikeValidateInput_({ ...validBump, rawSteps: Number.MAX_SAFE_INTEGER + 1 }), /INVALID_STEPS/);
});

test('claims require the next milestone and threshold; repeated target is handled as a no-op by transaction orchestration', () => {
  assert.throws(() => sandbox.gasSpikeApplyCommand_({ command: 'claimPoint', milestone: 1 }, pureState(1999), demo), /MILESTONE_LOCKED/);
  assert.throws(() => sandbox.gasSpikeApplyCommand_({ command: 'claimPoint', milestone: 2 }, pureState(6000), demo), /MILESTONE_ORDER/);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.gasSpikeApplyCommand_({ command: 'claimPoint', milestone: 1 }, pureState(6000), demo))), {
    sessionId: 'session_1', memberId: 'YOI-M01', clockVersion: 4, rawSteps: 6000, points: 1, claimedMilestones: [1]
  });
});

test('step changes are monotonic, same-value safe, and keep points/claims unchanged', () => {
  assert.throws(() => sandbox.gasSpikeApplyCommand_({ command: 'bumpSteps', rawSteps: 99 }, pureState(100), demo), /STEP_REGRESSION/);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.gasSpikeApplyCommand_({ command: 'bumpSteps', rawSteps: 2500 }, pureState(2000, [1]), demo))).claimedMilestones, [1]);
  assert.equal(sandbox.gasSpikeIsNonNegativeInt_(Number.MAX_SAFE_INTEGER), true);
});

test('stored state validates ownership shape consistency and fixed collection path', () => {
  assert.throws(() => sandbox.gasSpikeValidateStoredState_({ ...pureState(6000, [1]), points: 0 }, demo, 'YOI-M01'), /INVALID_STATE/);
  assert.throws(() => sandbox.gasSpikeStatePath_('../other', 'YOI-M01'), /INVALID_STATE_PATH/);
  assert.equal(sandbox.gasSpikeStatePath_('session_1', 'YOI-M01'), 'gasSpike/session_1/members/YOI-M01');
});

test('Auth lookup requires valid project claims, enabled account and auth_time not older than validSince', () => {
  installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) } });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.gasSpikeVerifyIdentity_(tokenFor(), 'fake-api-key'))), { uid: 'uid-member-01' });
  assert.throws(() => sandbox.gasSpikeVerifyIdentity_(tokenFor({ aud: 'other-project' }), 'fake-api-key'), /INVALID_TOKEN/);
  installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: true, validSince: String(epoch - 200) } });
  assert.throws(() => sandbox.gasSpikeVerifyIdentity_(tokenFor(), 'fake-api-key'), /INVALID_TOKEN/);
  installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 50) } });
  assert.throws(() => sandbox.gasSpikeVerifyIdentity_(tokenFor(), 'fake-api-key'), /INVALID_TOKEN/);
  installAppsScriptMocks({ authStatus: 400 });
  assert.throws(() => sandbox.gasSpikeVerifyIdentity_(tokenFor(), 'fake-api-key'), /INVALID_TOKEN/);
});

test('Firestore REST flow maps caller token, reads mapping/context/state transactionally and creates zero state before applying bump', () => {
  const mock = installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) } });
  sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => 'fake-api-key' });
  const result = sandbox.gasSpikeHandle(validBump);
  assert.equal(result.state.rawSteps, 6000);
  assert.equal(result.state.points, 0);
  assert.equal(mock.requests.filter((r) => r.url.includes(':beginTransaction')).length, 2);
  assert.equal(mock.requests.filter((r) => r.url.includes('membersByUid/uid-member-01?transaction=')).length, 2);
  assert.equal(mock.requests.filter((r) => r.url.includes('demo/current?transaction=')).length, 2);
  assert.equal(mock.requests.filter((r) => r.url.includes('gasSpike/session_1/members/YOI-M01?transaction=')).length, 2);
  const commits = mock.requests.filter((r) => r.url.endsWith(':commit'));
  assert.equal(commits.length, 2);
  assert.match(commits[0].options.headers.Authorization, /^Bearer header\./);
  assert.equal(commits[0].body.writes[0].update.fields.rawSteps.integerValue, '0');
  assert.equal(commits[1].body.writes[0].update.fields.rawSteps.integerValue, '6000');
  const authRequest = mock.requests.find((r) => r.url.startsWith(sandbox.GAS_SPIKE.authLookupUrl));
  assert.equal(authRequest.body.idToken, validBump.idToken);
  assert.equal(mock.requests.filter((r) => r.url.includes('?transaction=')).every((r) => r.options.headers.Authorization === `Bearer ${validBump.idToken}`), true);
  assert.equal(mock.writes.every((path) => path.startsWith('gasSpike/')), true);
});

test('same-step retry after a successful commit is a no-op and returns latest shared state', () => {
  const mock = installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) }, initialState: storedState(7000, [1]) });
  sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => 'fake-api-key' });
  const writesBefore = mock.requests.filter((r) => r.url.endsWith(':commit')).length;
  const result = sandbox.gasSpikeHandle({ ...validBump, rawSteps: 7000 });
  assert.equal(result.state.rawSteps, 7000);
  assert.equal(mock.requests.filter((r) => r.url.endsWith(':commit')).length, writesBefore);
});

test('ABORTED transaction retries by re-reading authorization and state', () => {
  const mock = installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) }, initialState: storedState(0), abortNextCommit: true });
  sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => 'fake-api-key' });
  const result = sandbox.gasSpikeHandle({ ...validBump, rawSteps: 4000 });
  assert.equal(result.state.rawSteps, 4000);
  assert.equal(mock.requests.filter((r) => r.url.includes(':beginTransaction')).length, 2);
  assert.equal(mock.requests.filter((r) => r.url.includes('demo/current?transaction=')).length, 2);
});

test('payload guard and best-effort per-UID rate cap reject before Firestore writes', () => {
  installAppsScriptMocks({ user: { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) } });
  sandbox.ContentService.createTextOutput = (text) => ({ text, setMimeType() { return this; } });
  sandbox.ContentService.MimeType = { JSON: 'application/json' };
  const oversized = sandbox.doPost({ postData: { contents: 'x'.repeat(sandbox.GAS_SPIKE.maxBodyChars + 1) } });
  assert.equal(JSON.parse(oversized.text).error, 'PAYLOAD_TOO_LARGE');
  const cache = new Map([['gasSpike_rl_uid-member-01', '30']]);
  sandbox.CacheService.getScriptCache = () => ({ get: (key) => cache.get(key) || null, put: (key, value) => cache.set(key, value) });
  sandbox.LockService.getScriptLock = () => ({ tryLock: () => true, releaseLock() {} });
  assert.throws(() => sandbox.gasSpikeEnforceRateLimit_('uid-member-01'), /RATE_LIMITED/);
});

test('Rules source includes the owner-scoped spike path and fail-closed feature default (emulator not run)', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/gasSpike\/\{sessionId\}\/members\/\{memberId\}/);
  assert.match(rules, /allow list, delete: if false/);
  assert.match(rules, /d\.rawSteps > old\.rawSteps/);
  assert.match(rules, /old\.rawSteps >= 6000/);
  assert.match(rules, /allow read, write: if false/);
});

function installAppsScriptMocks(config = {}) {
  const user = config.user || { localId: 'uid-member-01', disabled: false, validSince: String(epoch - 200) };
  const requests = [];
  const writes = [];
  const documents = new Map([
    ['membersByUid/uid-member-01', firestoreDoc('membersByUid/uid-member-01', { active: { booleanValue: true }, memberId: { stringValue: 'YOI-M01' } })],
    ['demo/current', firestoreDoc('demo/current', { sessionId: { stringValue: 'session_1' }, clockVersion: { integerValue: '4' }, scenarioNow: { stringValue: '2026-09-30T12:00:00+08:00' } })]
  ]);
  if (config.initialState) documents.set('gasSpike/session_1/members/YOI-M01', config.initialState);
  let transaction = 0;
  let abortNextCommit = config.abortNextCommit === true;
  sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => 'fake-api-key' });
  sandbox.Utilities.base64DecodeWebSafe = (text) => Buffer.from(text, 'base64url');
  sandbox.Utilities.newBlob = (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') });
  sandbox.UrlFetchApp.fetch = (url, options = {}) => {
    requests.push({ url, options, body: options.payload ? JSON.parse(options.payload) : null });
    if (url.startsWith(sandbox.GAS_SPIKE.authLookupUrl)) {
      return config.authStatus && config.authStatus !== 200 ? response(config.authStatus, {}) : response(200, { users: [user] });
    }
    if (url.endsWith(':beginTransaction')) return response(200, { transaction: `txn-${++transaction}` });
    if (url.endsWith(':commit')) {
      if (abortNextCommit) { abortNextCommit = false; return response(409, { error: { status: 'ABORTED' } }); }
      for (const write of requests.at(-1).body.writes) {
        const path = write.update.name.split('/documents/')[1];
        writes.push(path);
        documents.set(path, { ...write.update, updateTime: `2026-09-30T00:00:00.00000${transaction}Z` });
      }
      return response(200, { writeResults: [{}] });
    }
    const withoutQuery = url.split('?')[0];
    const path = withoutQuery.slice((sandbox.GAS_SPIKE.firestoreBase + '/').length);
    assert.match(url, /\?transaction=txn-\d+$/);
    const doc = documents.get(path);
    return doc ? response(200, doc) : response(404, { error: { status: 'NOT_FOUND' } });
  };
  sandbox.CacheService.getScriptCache = () => ({ get: () => null, put() {} });
  sandbox.LockService.getScriptLock = () => ({ tryLock: () => true, releaseLock() {} });
  return { requests, documents, writes };
}
