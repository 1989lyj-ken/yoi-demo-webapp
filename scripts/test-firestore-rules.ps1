param(
  # Runs inside the emulator; the default is the full Rules suite (see scripts/mutate-contrib-rules.mjs for the other use).
  [ValidateSet('node --test tests/firestore-rules.test.mjs', 'node scripts/mutate-contrib-rules.mjs', 'node scripts/mutate-week-result-rules.mjs', 'node scripts/mutate-perfect-week-rules.mjs', 'node scripts/mutate-member-profiles-rules.mjs', 'node scripts/mutate-chest-rules.mjs', 'node scripts/mutate-referral-rules.mjs', 'node scripts/mutate-team-name-rules.mjs')]
  [string]$TestCommand = 'node --test tests/firestore-rules.test.mjs'
)
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expectedProjectId = 'demo-yoxi-yoi-rules-test'
$runtimeRoot = Join-Path $env:TEMP 'yoxi-firestore-emulator-runtime'
$emulatorCachePath = Join-Path $runtimeRoot 'emulator-cache'
$expectedFirebaseToolsVersion = '15.32.0'
$expectedFirestoreEmulatorVersion = '1.22.0'
$expectedFirestoreEmulatorSize = 136707194
$expectedFirestoreEmulatorSha256 = '9B6498B7F62714D67F48F59B3818883CD682DBCD46B9F59511DE81C97BB5166C'
$javaExe = Get-ChildItem -LiteralPath $runtimeRoot -Filter java.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$firebaseCli = Join-Path $projectRoot 'node_modules\.bin\firebase.cmd'
$firebaseToolsPackage = Join-Path $projectRoot 'node_modules\firebase-tools\package.json'
$emulatorInfoFile = Join-Path $projectRoot 'node_modules\firebase-tools\lib\emulator\downloadableEmulatorInfo.json'
$firestoreEmulatorJar = Join-Path $emulatorCachePath 'cloud-firestore-emulator-v1.22.0.jar'
$verifyJarScript = Join-Path $PSScriptRoot 'verify-firestore-emulator-jar.mjs'
$configFile = Join-Path $projectRoot 'firebase.rules-test.json'

if (-not $javaExe) {
  throw "Project-local test JRE was not found under $runtimeRoot. Set up the approved emulator runtime first."
}
$jdkRoot = Split-Path (Split-Path $javaExe -Parent) -Parent
if (-not (Test-Path -LiteralPath $firebaseCli)) {
  throw 'Local Firebase CLI is missing. Run npm install before the emulator test.'
}
$firebaseTools = Get-Content -LiteralPath $firebaseToolsPackage -Raw | ConvertFrom-Json
if ($firebaseTools.version -ne $expectedFirebaseToolsVersion) {
  throw "Refusing to start: expected firebase-tools $expectedFirebaseToolsVersion, found $($firebaseTools.version). Review and pin the emulator toolchain first."
}
$emulatorInfo = Get-Content -LiteralPath $emulatorInfoFile -Raw | ConvertFrom-Json
if ($emulatorInfo.firestore.version -ne $expectedFirestoreEmulatorVersion) {
  throw "Refusing to start: expected Firestore Emulator $expectedFirestoreEmulatorVersion, found $($emulatorInfo.firestore.version)."
}
if (-not (Test-Path -LiteralPath $firestoreEmulatorJar)) {
  throw "Refusing to start offline test: pinned Firestore Emulator JAR is missing at $firestoreEmulatorJar. No download will be attempted."
}
$jarItem = Get-Item -LiteralPath $firestoreEmulatorJar
$jarVerification = & node $verifyJarScript $firestoreEmulatorJar $expectedFirestoreEmulatorSize $expectedFirestoreEmulatorSha256
if ($LASTEXITCODE -ne 0) {
  throw "Refusing to start: cached Firestore Emulator JAR verification failed. $jarVerification"
}
Write-Output $jarVerification
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if ($config.emulators.firestore.host -ne '127.0.0.1' -or $config.emulators.firestore.port -ne 8088) {
  throw 'Refusing to start: Firestore Emulator must bind to 127.0.0.1:8088.'
}

$env:JAVA_HOME = $jdkRoot
$env:PATH = (Split-Path $javaExe -Parent) + ';' + $env:PATH
$env:APPDATA = Join-Path $runtimeRoot 'firebase-cli-profile'
$env:FIREBASE_EMULATORS_PATH = $emulatorCachePath
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
$env:FIREBASE_CLI_DISABLE_USAGE_REPORTING = '1'
$env:CI = '1'
# YOXI_RULES_FILE is only for the mutation script; the normal suite always tests the real firestore.rules.
if ($TestCommand -eq 'node --test tests/firestore-rules.test.mjs') { Remove-Item Env:YOXI_RULES_FILE -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $env:APPDATA -Force | Out-Null

Push-Location $projectRoot
try {
  & $firebaseCli emulators:exec --only firestore --project $expectedProjectId --config $configFile $TestCommand
  if ($LASTEXITCODE -ne 0) { throw "Firebase Emulator test command failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
