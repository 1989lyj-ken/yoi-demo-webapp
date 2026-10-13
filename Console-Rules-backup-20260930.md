rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function activeMember() {
      return signedIn()
        && exists(/databases/$(database)/documents/membersByUid/$(request.auth.uid))
        && get(/databases/$(database)/documents/membersByUid/$(request.auth.uid)).data.active == true;
    }

    match /membersByUid/{authUid} {
      allow get: if signedIn() && request.auth.uid == authUid;
      allow list, create, update, delete: if false;
    }

    match /demo/current {
      allow get: if activeMember();
      allow list, create, update, delete: if false;
    }

    function currentSession(sessionId) {
      return get(/databases/$(database)/documents/demo/current).data.sessionId == sessionId;
    }

    function currentClockVersion() {
      return get(/databases/$(database)/documents/demo/current).data.clockVersion;
    }

    function ownsSpikeState(sessionId, memberId) {
      return activeMember()
        && currentSession(sessionId)
        && get(/databases/$(database)/documents/membersByUid/$(request.auth.uid)).data.memberId == memberId;
    }

    function validSpikeShape(data) {
      return data.keys().hasAll(['sessionId', 'memberId', 'clockVersion', 'rawSteps', 'points', 'claimedMilestones'])
        && data.keys().hasOnly(['sessionId', 'memberId', 'clockVersion', 'rawSteps', 'points', 'claimedMilestones'])
        && data.sessionId is string
        && data.memberId is string
        && data.clockVersion is int
        && data.clockVersion >= 0
        && data.clockVersion <= 9007199254740991
        && data.rawSteps is int
        && data.rawSteps >= 0
        && data.rawSteps <= 9007199254740991
        && data.points is int
        && data.points >= 0
        && data.points <= 3
        && data.claimedMilestones is list
        && (data.claimedMilestones == []
          || data.claimedMilestones == [1]
          || data.claimedMilestones == [1, 2]
          || data.claimedMilestones == [1, 2, 3])
        && data.points == data.claimedMilestones.size();
    }

    function validSpikeCreate(sessionId, memberId) {
      let d = request.resource.data;
      return ownsSpikeState(sessionId, memberId)
        && validSpikeShape(d)
        && d.sessionId == sessionId
        && d.memberId == memberId
        && d.clockVersion == currentClockVersion()
        && d.rawSteps == 0
        && d.points == 0
        && d.claimedMilestones == [];
    }

    function validSpikeUpdate(sessionId, memberId) {
      let old = resource.data;
      let d = request.resource.data;
      let isStepOnly = d.rawSteps > old.rawSteps
        && d.points == old.points
        && d.claimedMilestones == old.claimedMilestones;
      let isNextClaim = (old.claimedMilestones == [] && d.claimedMilestones == [1] && old.rawSteps >= 2000)
        || (old.claimedMilestones == [1] && d.claimedMilestones == [1, 2] && old.rawSteps >= 4000)
        || (old.claimedMilestones == [1, 2] && d.claimedMilestones == [1, 2, 3] && old.rawSteps >= 6000);
      let isClaimOnly = d.rawSteps == old.rawSteps
        && isNextClaim
        && d.points == old.points + 1;
      return ownsSpikeState(sessionId, memberId)
        && validSpikeShape(old)
        && validSpikeShape(d)
        && old.sessionId == sessionId
        && old.memberId == memberId
        && d.sessionId == old.sessionId
        && d.memberId == old.memberId
        && d.clockVersion >= old.clockVersion
        && d.clockVersion == currentClockVersion()
        && (isStepOnly || isClaimOnly);
    }

    match /gasSpike/{sessionId}/members/{memberId} {
      allow get: if ownsSpikeState(sessionId, memberId);
      allow create: if validSpikeCreate(sessionId, memberId);
      allow update: if validSpikeUpdate(sessionId, memberId);
      allow list, delete: if false;
    }

    // All feature data remains closed until each FSD's access rules are reviewed.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
