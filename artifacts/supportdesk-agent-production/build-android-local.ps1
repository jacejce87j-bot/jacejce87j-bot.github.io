param(
  [string]$KeystorePath = "",
  [string]$StorePassword = "",
  [string]$KeyAlias = "",
  [string]$KeyPassword = "",
  [string]$GradleTask = "bundleRelease"
)

# build-android-local.ps1
# Convenience script to prepare and build the Android binary locally for the supportdesk-agent-production app.
# Usage examples:
#   .\build-android-local.ps1 -KeystorePath "C:\secrets\my-release-key.jks" -StorePassword "storepass" -KeyAlias "mykey" -KeyPassword "keypass"
#   .\build-android-local.ps1 -GradleTask assembleRelease

function Write-err($msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
}
function Write-ok($msg) {
  Write-Host "OK: $msg" -ForegroundColor Green
}

Write-Host "Starting Android local build helper"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# 1) Check pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-err "pnpm not found in PATH. Install pnpm (https://pnpm.io/installation) and retry."
  exit 2
}

# 2) Check Java
if (-not $env:JAVA_HOME) {
  Write-err "JAVA_HOME is not set. Install JDK 11/17 and set JAVA_HOME environment variable."
  exit 3
} else {
  Write-Host "JAVA_HOME: $env:JAVA_HOME"
}

# 3) Check Android SDK
if (-not ($env:ANDROID_SDK_ROOT -or $env:ANDROID_HOME)) {
  Write-err "ANDROID_SDK_ROOT or ANDROID_HOME is not set. Install Android Studio and set the SDK env vars."
  exit 4
} else {
  Write-Host "ANDROID_SDK_ROOT: $env:ANDROID_SDK_ROOT" 2>$null
}

# 4) Install dependencies
Write-Host "Installing JS dependencies (pnpm install)"
pnpm install
if ($LASTEXITCODE -ne 0) { Write-err "pnpm install failed"; exit 5 }
Write-ok "Dependencies installed"

# 5) Ensure native project exists (expo prebuild)
if (-not (Test-Path "android")) {
  Write-Host "Android native project missing; running 'expo prebuild'"
  # Set CI env to avoid non-interactive flag warning
  $env:CI = "1"
  pnpm exec expo prebuild
  if ($LASTEXITCODE -ne 0) { Write-err "expo prebuild failed"; exit 6 }
  Write-ok "expo prebuild completed"
} else {
  Write-Host "android/ directory already exists; skipping prebuild"
}

# 6) Configure signing (if provided)
if ($KeystorePath -ne "") {
  if (-not (Test-Path $KeystorePath)) { Write-err "Keystore path not found: $KeystorePath"; exit 7 }
  Write-Host "Using provided keystore: $KeystorePath"
  # Write gradle.properties in android/ (user-level gradle.properties is preferred but this file is convenient for local testing)
  $gradlePropsPath = Join-Path -Path "android" -ChildPath "gradle.properties"
  Write-Host "Writing signing properties to: $gradlePropsPath"
  $content = @()
  $content += "MYAPP_UPLOAD_STORE_FILE=${KeystorePath}"
  $content += "MYAPP_UPLOAD_KEY_ALIAS=${KeyAlias}"
  $content += "MYAPP_UPLOAD_STORE_PASSWORD=${StorePassword}"
  $content += "MYAPP_UPLOAD_KEY_PASSWORD=${KeyPassword}"
  $content | Out-File -FilePath $gradlePropsPath -Encoding UTF8
  Write-ok "Wrote signing configuration (remove this file after build to keep secrets out of disk)"
} else {
  Write-Host "No keystore provided. Gradle may attempt an unsigned build or fail if signing is required."
}

# 7) Run Gradle build
Write-Host "Running Gradle task: $GradleTask"
Push-Location android
$gradlew = Join-Path -Path (Get-Location) -ChildPath "gradlew.bat"
if (-not (Test-Path $gradlew)) {
  Write-err "gradlew wrapper not found in android/. Did expo prebuild run successfully?"; Pop-Location; exit 8
}

& $gradlew $GradleTask
$exit = $LASTEXITCODE
Pop-Location
if ($exit -ne 0) { Write-err "Gradle build failed with exit code $exit"; exit 9 }

# 8) Locate outputs
$apkPath = Join-Path -Path "android\app\build\outputs\apk\release" -ChildPath "app-release.apk"
$aabPath = Join-Path -Path "android\app\build\outputs\bundle\release" -ChildPath "app-release.aab"
if (Test-Path $aabPath) { Write-ok "AAB produced: $aabPath" } elseif (Test-Path $apkPath) { Write-ok "APK produced: $apkPath" } else { Write-err "Build finished but could not find APK/AAB; check android/app/build/outputs"; exit 10 }

Write-Host "Android local build helper finished successfully"
Write-Host "Remember to remove gradle.properties if it contains secrets: android\gradle.properties" -ForegroundColor Yellow

exit 0
