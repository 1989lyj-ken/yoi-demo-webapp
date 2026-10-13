#!/usr/bin/env bash
# Linux (GitHub Actions) counterpart of test-firestore-rules.ps1: same pinned firebase-tools, emulator JAR
# (size + SHA-256), bind address and demo project. CI may download the JAR, but it must match the pin before any test runs.
set -euo pipefail

cd "$(dirname "$0")/.."

EXPECTED_PROJECT_ID='demo-yoxi-yoi-rules-test'
EXPECTED_FIREBASE_TOOLS='15.32.0'
EXPECTED_EMULATOR_VERSION='1.22.0'
EXPECTED_JAR_SIZE=136707194
EXPECTED_JAR_SHA256='9B6498B7F62714D67F48F59B3818883CD682DBCD46B9F59511DE81C97BB5166C'
CONFIG_FILE='firebase.rules-test.json'
TEST_COMMAND="${1:-node --test tests/firestore-rules.test.mjs}"

export FIREBASE_EMULATORS_PATH="${FIREBASE_EMULATORS_PATH:-$HOME/.cache/firebase/emulators}"
export FIREBASE_CLI_DISABLE_UPDATE_CHECK=1
export FIREBASE_CLI_DISABLE_USAGE_REPORTING=1
export CI=1
JAR="$FIREBASE_EMULATORS_PATH/cloud-firestore-emulator-v$EXPECTED_EMULATOR_VERSION.jar"

actual_tools=$(node -p "require('./node_modules/firebase-tools/package.json').version")
[ "$actual_tools" = "$EXPECTED_FIREBASE_TOOLS" ] || { echo "Expected firebase-tools $EXPECTED_FIREBASE_TOOLS, found $actual_tools" >&2; exit 1; }

actual_emulator=$(node -p "require('./node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json').firestore.version")
[ "$actual_emulator" = "$EXPECTED_EMULATOR_VERSION" ] || { echo "Expected Firestore Emulator $EXPECTED_EMULATOR_VERSION, found $actual_emulator" >&2; exit 1; }

node -e "const c=require('./$CONFIG_FILE').emulators.firestore; if (c.host!=='127.0.0.1'||c.port!==8088) { console.error('Emulator must bind to 127.0.0.1:8088'); process.exit(1); }"

if [ ! -f "$JAR" ]; then
  npx firebase setup:emulators:firestore
fi
node scripts/verify-firestore-emulator-jar.mjs "$JAR" "$EXPECTED_JAR_SIZE" "$EXPECTED_JAR_SHA256"

# YOXI_RULES_FILE is only for the mutation scripts; the normal suite always tests the real firestore.rules.
if [ "$TEST_COMMAND" = 'node --test tests/firestore-rules.test.mjs' ]; then unset YOXI_RULES_FILE; fi

npx firebase emulators:exec --only firestore --project "$EXPECTED_PROJECT_ID" --config "$CONFIG_FILE" "$TEST_COMMAND"
