import test from 'node:test';
import assert from 'node:assert/strict';
import { isFirebaseError } from '../src/firebase/error-kind.ts';

// A FirebaseError from another copy of @firebase/util is not `instanceof` this app's FirestoreError;
// the name and a string code are what identify it (a verified failure under the Node build).
class ForeignFirebaseError extends Error {
  constructor(code, message) { super(message); this.name = 'FirebaseError'; this.code = code; }
}

test('isFirebaseError recognises an SDK error by name and code, whichever copy of the class threw it', () => {
  assert.equal(isFirebaseError(new ForeignFirebaseError('permission-denied', 'x')), true);
  assert.equal(isFirebaseError(new ForeignFirebaseError("unavailable", "x")), true);
  const plain = new Error('boom');
  plain.code = 'permission-denied';
  assert.equal(isFirebaseError(plain), false);
  assert.equal(isFirebaseError(new Error('我們自己丟的中文錯誤')), false);
  const noCode = new Error('x'); noCode.name = 'FirebaseError';
  assert.equal(isFirebaseError(noCode), false);
  assert.equal(isFirebaseError({ name: 'FirebaseError', code: 'aborted' }), false); // not an Error
  assert.equal(isFirebaseError(null), false);
  assert.equal(isFirebaseError('permission-denied'), false);
});
