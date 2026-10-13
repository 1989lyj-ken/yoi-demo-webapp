/*
 * FSD-05 isolated feasibility spike. Deploy only after reviewing appsscript.json
 * and setting YOXI_FIREBASE_API_KEY in Script Properties. No secrets are logged.
 */
var GAS_SPIKE = {
  projectId: 'yoxi-yoi-demo',
  authLookupUrl: 'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
  firestoreBase: 'https://firestore.googleapis.com/v1/projects/yoxi-yoi-demo/databases/(default)/documents',
  maxBodyChars: 16384,
  requestsPerUidPerMinute: 30,
  allowedCommands: ['bumpSteps', 'claimPoint'],
  stateFields: ['sessionId', 'memberId', 'clockVersion', 'rawSteps', 'points', 'claimedMilestones']
};

function doPost(e) {
  try {
    var contents = (e && e.postData && e.postData.contents) || '{}';
    if (contents.length > GAS_SPIKE.maxBodyChars) throw new Error('PAYLOAD_TOO_LARGE');
    var body = JSON.parse(contents);
    var result = gasSpikeHandle(body);
    return gasSpikeJson_(result);
  } catch (err) {
    return gasSpikeJson_({ ok: false, error: gasSpikePublicError_(err) });
  }
}

function gasSpikeHandle(body) {
  var input = gasSpikeValidateInput_(body);
  var apiKey = PropertiesService.getScriptProperties().getProperty('YOXI_FIREBASE_API_KEY');
  if (!apiKey) throw new Error('CONFIG_MISSING');

  var identity = gasSpikeVerifyIdentity_(input.idToken, apiKey);
  gasSpikeEnforceRateLimit_(identity.uid);
  var state = gasSpikeRunCommand_(input, identity.uid);
  return { ok: true, state: state };
}

function gasSpikeValidateInput_(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_REQUEST');
  var command = body.command;
  var expected = command === 'bumpSteps'
    ? ['command', 'idToken', 'expectedSessionId', 'expectedClockVersion', 'rawSteps']
    : ['command', 'idToken', 'expectedSessionId', 'expectedClockVersion', 'milestone'];
  if (GAS_SPIKE.allowedCommands.indexOf(command) < 0 || !gasSpikeExactKeys_(body, expected)) throw new Error('INVALID_REQUEST');
  if (typeof body.idToken !== 'string' || body.idToken.length < 20 || body.idToken.length > 10000) throw new Error('INVALID_TOKEN');
  if (typeof body.expectedSessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.expectedSessionId)) throw new Error('INVALID_REQUEST');
  if (!gasSpikeIsNonNegativeInt_(body.expectedClockVersion)) throw new Error('INVALID_REQUEST');
  if (command === 'bumpSteps' && !gasSpikeIsNonNegativeInt_(body.rawSteps)) throw new Error('INVALID_STEPS');
  if (command === 'claimPoint' && (!gasSpikeIsNonNegativeInt_(body.milestone) || body.milestone < 1 || body.milestone > 3)) throw new Error('INVALID_REQUEST');
  return body;
}

function gasSpikeExactKeys_(obj, keys) {
  var actual = Object.keys(obj).sort();
  var expected = keys.slice().sort();
  return actual.length === expected.length && actual.every(function (key, i) { return key === expected[i]; });
}

function gasSpikeVerifyIdentity_(idToken, apiKey) {
  var claims = gasSpikeDecodeJwt_(idToken);
  var now = Math.floor(Date.now() / 1000);
  if (claims.aud !== GAS_SPIKE.projectId || claims.iss !== 'https://securetoken.google.com/' + GAS_SPIKE.projectId ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !gasSpikeIsNonNegativeInt_(claims.exp) || claims.exp <= now ||
      !gasSpikeIsNonNegativeInt_(claims.iat) || claims.iat > now + 60 ||
      !gasSpikeIsNonNegativeInt_(claims.auth_time) || claims.auth_time > now + 60 ||
      claims.auth_time > claims.iat || claims.iat >= claims.exp) throw new Error('INVALID_TOKEN');

  // accounts:lookup validates the supplied Firebase ID token server-side and
  // returns the canonical UID plus validSince for revocation-time checking.
  var response = UrlFetchApp.fetch(GAS_SPIKE.authLookupUrl + '?key=' + encodeURIComponent(apiKey), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('INVALID_TOKEN');
  var data = JSON.parse(response.getContentText());
  if (!data.users || data.users.length !== 1 || data.users[0].localId !== claims.sub || data.users[0].disabled === true) throw new Error('INVALID_TOKEN');
  if (typeof data.users[0].validSince !== 'string' || data.users[0].validSince === '') throw new Error('INVALID_TOKEN');
  var validSince = Number(data.users[0].validSince);
  if (!isFinite(validSince) || Math.floor(claims.auth_time) < Math.floor(validSince)) throw new Error('INVALID_TOKEN');
  return { uid: claims.sub };
}

function gasSpikeEnforceRateLimit_(uid) {
  // Best-effort per-account burst cap only. CacheService is not a durable or
  // distributed abuse defense; the endpoint must remain a time-limited spike.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('RATE_LIMITED');
  try {
    var cache = CacheService.getScriptCache();
    var key = 'gasSpike_rl_' + uid.replace(/[^A-Za-z0-9_-]/g, '_');
    var count = Number(cache.get(key) || '0');
    if (count >= GAS_SPIKE.requestsPerUidPerMinute) throw new Error('RATE_LIMITED');
    cache.put(key, String(count + 1), 60);
  } finally {
    lock.releaseLock();
  }
}

function gasSpikeDecodeJwt_(token) {
  var pieces = token.split('.');
  if (pieces.length !== 3) throw new Error('INVALID_TOKEN');
  try {
    var bytes = Utilities.base64DecodeWebSafe(pieces[1]);
    return JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  } catch (_) { throw new Error('INVALID_TOKEN'); }
}

function gasSpikeRunCommand_(input, uid) {
  // The first-use initializer can only create the prescribed zero state. It is
  // deliberately a separate transaction because Firestore permits one write
  // per document in a transaction commit. The requested command then runs in
  // a fresh transaction and re-reads all authorization/context documents.
  var attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    try {
      var tx = gasSpikeBeginTransaction_(input.idToken);
      var docs = gasSpikeReadAuthorizationAndState_(tx, input.idToken, uid);
      gasSpikeAssertFresh_(input, docs.demo);
      var memberId = docs.member.memberId;
      if (typeof memberId !== 'string' || !memberId) throw new Error('NOT_AUTHORIZED');
      if (!docs.state) {
        gasSpikeCommit_(input.idToken, tx, [{
          update: gasSpikeDocument_(gasSpikeStatePath_(docs.demo.sessionId, memberId), gasSpikeInitialState_(docs.demo, memberId)),
          currentDocument: { exists: false }
        }]);
        continue;
      }
      gasSpikeValidateStoredState_(docs.state, docs.demo, memberId);
      if (input.command === 'claimPoint' && input.milestone <= docs.state.claimedMilestones.length) return docs.state;
      if (input.command === 'bumpSteps' && input.rawSteps === docs.state.rawSteps) return docs.state;
      var next = gasSpikeApplyCommand_(input, docs.state, docs.demo);
      var write = { update: gasSpikeDocument_(gasSpikeStatePath_(docs.demo.sessionId, memberId), next),
        updateMask: { fieldPaths: GAS_SPIKE.stateFields }, currentDocument: { updateTime: docs.state._updateTime } };
      gasSpikeCommit_(input.idToken, tx, [write]);
      return next;
    } catch (err) {
      if (err && err.message === 'STATE_CONFLICT') continue;
      throw err;
    }
  }
  throw new Error('STATE_CONFLICT');
}

function gasSpikeReadAuthorizationAndState_(transaction, token, uid) {
  var mapping = gasSpikeGetDocument_('membersByUid/' + uid, transaction, token);
  var demo = gasSpikeGetDocument_('demo/current', transaction, token);
  if (!mapping || !demo || mapping.fields.active.booleanValue !== true) throw new Error('NOT_AUTHORIZED');
  var memberId = mapping.fields.memberId.stringValue;
  var state = gasSpikeGetDocument_(gasSpikeStatePath_(demo.fields.sessionId.stringValue, memberId), transaction, token);
  return { member: gasSpikeDecodeFields_(mapping), demo: gasSpikeDecodeFields_(demo), state: state && gasSpikeDecodeFields_(state) };
}

function gasSpikeGetDocument_(path, transaction, token) {
  var url = GAS_SPIKE.firestoreBase + '/' + path + '?transaction=' + encodeURIComponent(transaction);
  var response = UrlFetchApp.fetch(url, { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) throw new Error('FIRESTORE_READ_FAILED');
  var doc = JSON.parse(response.getContentText());
  doc._updateTime = doc.updateTime;
  return doc;
}

function gasSpikeBeginTransaction_(token) {
  var response = UrlFetchApp.fetch(GAS_SPIKE.firestoreBase + ':beginTransaction', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ options: { readWrite: {} } }), muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('FIRESTORE_TRANSACTION_FAILED');
  return JSON.parse(response.getContentText()).transaction;
}

function gasSpikeCommit_(token, transaction, writes) {
  var response = UrlFetchApp.fetch(GAS_SPIKE.firestoreBase + ':commit', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ transaction: transaction, writes: writes }), muteHttpExceptions: true
  });
  if (response.getResponseCode() === 409 || response.getContentText().indexOf('ABORTED') >= 0) throw new Error('STATE_CONFLICT');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('FIRESTORE_COMMIT_FAILED');
}

function gasSpikeAssertFresh_(input, demo) {
  if (!demo || demo.sessionId !== input.expectedSessionId || demo.clockVersion !== input.expectedClockVersion) throw new Error('STALE_CONTEXT');
}

function gasSpikeInitialState_(demo, memberId) {
  return { sessionId: demo.sessionId, memberId: memberId, clockVersion: demo.clockVersion, rawSteps: 0, points: 0, claimedMilestones: [] };
}

function gasSpikeValidateStoredState_(state, demo, memberId) {
  if (!state || state.sessionId !== demo.sessionId || state.memberId !== memberId ||
      !gasSpikeIsNonNegativeInt_(state.clockVersion) || state.clockVersion > demo.clockVersion ||
      !gasSpikeIsNonNegativeInt_(state.rawSteps) || !gasSpikeIsNonNegativeInt_(state.points) ||
      !gasSpikeValidMilestones_(state.claimedMilestones) || state.points !== state.claimedMilestones.length) throw new Error('INVALID_STATE');
}

function gasSpikeApplyCommand_(input, old, demo) {
  var next = { sessionId: old.sessionId, memberId: old.memberId, clockVersion: demo.clockVersion,
    rawSteps: old.rawSteps, points: old.points, claimedMilestones: old.claimedMilestones.slice() };
  if (input.command === 'bumpSteps') {
    if (input.rawSteps < old.rawSteps) throw new Error('STEP_REGRESSION');
    next.rawSteps = input.rawSteps;
  } else {
    var nextMilestone = old.claimedMilestones.length + 1;
    if (input.milestone !== nextMilestone) throw new Error('MILESTONE_ORDER');
    var threshold = input.milestone * 2000;
    if (nextMilestone > 3 || old.rawSteps < threshold) throw new Error('MILESTONE_LOCKED');
    next.claimedMilestones.push(nextMilestone);
    next.points += 1;
  }
  return next;
}

function gasSpikeStatePath_(sessionId, memberId) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId) || !/^[A-Za-z0-9_-]{1,100}$/.test(memberId)) throw new Error('INVALID_STATE_PATH');
  return 'gasSpike/' + sessionId + '/members/' + memberId;
}

function gasSpikeDocument_(path, state) {
  var fields = {
    sessionId: { stringValue: state.sessionId }, memberId: { stringValue: state.memberId },
    clockVersion: { integerValue: String(state.clockVersion) }, rawSteps: { integerValue: String(state.rawSteps) },
    points: { integerValue: String(state.points) },
    claimedMilestones: { arrayValue: { values: state.claimedMilestones.map(function (n) { return { integerValue: String(n) }; }) } }
  };
  return { name: 'projects/' + GAS_SPIKE.projectId + '/databases/(default)/documents/' + path, fields: fields };
}

function gasSpikeDecodeFields_(doc) {
  var f = doc.fields || {};
  return {
    sessionId: f.sessionId && f.sessionId.stringValue,
    memberId: f.memberId && f.memberId.stringValue,
    active: f.active && f.active.booleanValue,
    clockVersion: f.clockVersion && Number(f.clockVersion.integerValue),
    rawSteps: f.rawSteps && Number(f.rawSteps.integerValue),
    points: f.points && Number(f.points.integerValue),
    claimedMilestones: f.claimedMilestones && (f.claimedMilestones.arrayValue.values || []).map(function (v) { return Number(v.integerValue); }),
    scenarioNow: f.scenarioNow && f.scenarioNow.stringValue
  };
}

function gasSpikeValidMilestones_(items) {
  if (!Array.isArray(items) || items.length > 3) return false;
  return items.every(function (n, i) { return n === i + 1; });
}
function gasSpikeIsNonNegativeInt_(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0 && n <= 9007199254740991; }

function gasSpikePublicError_(err) {
  var allowed = ['INVALID_REQUEST', 'INVALID_TOKEN', 'CONFIG_MISSING', 'NOT_AUTHORIZED', 'STALE_CONTEXT', 'INVALID_STEPS',
    'STEP_REGRESSION', 'MILESTONE_ORDER', 'MILESTONE_LOCKED', 'STATE_CONFLICT', 'INVALID_STATE', 'INVALID_STATE_PATH',
    'PAYLOAD_TOO_LARGE', 'RATE_LIMITED'];
  return err && allowed.indexOf(err.message) >= 0 ? err.message : 'REQUEST_FAILED';
}

function gasSpikeJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
