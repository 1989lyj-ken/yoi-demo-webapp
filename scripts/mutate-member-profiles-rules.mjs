// FSD-AC1 mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation:profiles
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const MUTATIONS = [
  ['n01 get: active member only', 'allow get: if activeMember();', 'allow get: if signedIn();'],
  ['n02 get: signed in', 'allow get: if activeMember();', 'allow get: if true;'],
  ['n03 list denied', 'allow list, create, update, delete: if false;', 'allow list: if activeMember();\n      allow create, update, delete: if false;'],
  ['n04 create denied', 'allow list, create, update, delete: if false;', 'allow create: if activeMember();\n      allow list, update, delete: if false;'],
  ['n05 update denied', 'allow list, create, update, delete: if false;', 'allow update: if activeMember();\n      allow list, create, delete: if false;'],
  ['n07 path: documents only', 'match /memberProfiles/{memberId} {', 'match /memberProfiles/{memberId=**} {'],
  ['n06 delete denied', 'allow list, create, update, delete: if false;', 'allow delete: if activeMember();\n      allow list, create, update: if false;'],
];

await runMutations({ marker: '// ===== FSD-AC1 >>>', testPattern: 'AC1 memberProfiles', expectedTests: 2, mutations: MUTATIONS });
