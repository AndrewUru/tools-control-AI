# Uso: scripts/build-android.ps1 [-Edicion demo|cliente|nube] [-Servidor https://dominio]
param([ValidateSet('demo', 'cliente', 'nube')][string]$Edicion = 'demo', [string]$Servidor = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME/bin/java.exe")) {
    $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
}
$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path $androidSdk)) { throw 'No se encuentra el SDK de Android. Configura ANDROID_HOME.' }
Set-Content android/local.properties ('sdk.dir=' + $androidSdk.Replace('\', '/'))
$env:EDICION = $Edicion
$env:SERVIDOR = $Servidor
node scripts/build-android-assets.js
if ($LASTEXITCODE -ne 0) { throw 'No se han generado los recursos Android.' }
& ./android/gradlew.bat -p android assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw 'La compilación Android ha fallado.' }
New-Item -ItemType Directory -Force dist/android | Out-Null
$apk = @{ demo = 'herramientas-mvp.apk'; cliente = 'herramientas-cliente.apk'; nube = 'herramientas.apk' }[$Edicion]
Copy-Item android/app/build/outputs/apk/debug/app-debug.apk "dist/android/$apk"
Write-Host "APK listo: $projectRoot\dist\android\$apk"
