# deploy.ps1 - deploy latest updates to Fly.io
# Run from the project folder:  .\deploy.ps1

param(
    [switch]$DeployLatest
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-LastCommandSucceeded([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE. Production was NOT updated."
    }
}

# PowerShell يحمّل السكربت كاملًا قبل تنفيذه. لذلك مرحلة السحب لا تنشر بنفس
# النسخة المحمّلة في الذاكرة، بل تبدأ نسخة جديدة صراحةً من الملف المحدّث.
# نستخدم switch خاصًا بالاستدعاء بدل متغير بيئة يبقى عالقًا في جلسة PowerShell.
if (-not $DeployLatest) {
    Write-Host "Pulling latest changes from Git..." -ForegroundColor Cyan
    git pull origin main
    Assert-LastCommandSucceeded "git pull"
    & $PSCommandPath -DeployLatest
    exit $LASTEXITCODE
}

# امنع نشر أي نسخة أعادت مساري المنتجات القديمين بالخطأ، بدون الاعتماد على rg.
$legacyProductCode = Get-ChildItem src/routes,src/components -Recurse -File -Include *.ts,*.tsx |
    Select-String -Pattern 'from\(["'']products["'']\)\.(insert|update|delete)','products/\$\{Date\.now\(\)\}.*\.name'
if ($legacyProductCode) {
    $legacyProductCode | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Legacy client-side product write/upload path detected. Deployment stopped."
}

# احتفظ برقم النسخة الحية قبل النشر. بعد النشر يجب أن يعرض الموقع رقمًا
# مختلفًا، وإلا فمعنى ذلك أن Fly لم يستبدل النسخة التي تخدم الدومين.
$previousBuild = $null
try {
    $beforeDeploy = Invoke-RestMethod -Uri "https://mag-pro1.com/api/public/build-version?before=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ "Cache-Control" = "no-cache, no-store, max-age=0" }
    $previousBuild = $beforeDeploy.build
} catch {
    Write-Warning "Could not read the current production build number; deployment will continue."
}

# اقرأ مفتاح الخدمة من ملف .env إن وُجد. لو الملف غير موجود على هذا الجهاز،
# نكتفي بتثبيت روابط/مفاتيح القاعدة العامة ونترك مفتاح الخدمة المحفوظ في Fly كما هو.
$serviceRoleKey = $null
if (Test-Path .env) {
    $envContent = Get-Content .env -Raw
    $serviceRoleMatch = [regex]::Match($envContent, 'SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?')
    if ($serviceRoleMatch.Success) {
        $serviceRoleKey = $serviceRoleMatch.Groups[1].Value
    }
}

Write-Host "Setting the new database connection on Fly..." -ForegroundColor Cyan
$secretArgs = @(
    'SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co',
    'SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo',
    'SUPABASE_PUBLISHABLE_KEY=sb_publishable_RTmbXinMhCr9B3oNa6dqqg_iVsKBKG6',
    'SUPABASE_ANON_KEY=sb_publishable_RTmbXinMhCr9B3oNa6dqqg_iVsKBKG6'
)
if ($serviceRoleKey) {
    $secretArgs += "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey"
} else {
    Write-Warning "No local .env service key found; keeping the SUPABASE_SERVICE_ROLE_KEY already stored on Fly."
    $existingSecrets = fly secrets list -a m-hamo
    if (-not ($existingSecrets -match 'SUPABASE_SERVICE_ROLE_KEY')) {
        throw "SUPABASE_SERVICE_ROLE_KEY is missing both locally and on Fly. Deployment stopped."
    }
}
fly secrets set -a m-hamo @secretArgs
Assert-LastCommandSucceeded "fly secrets set"

Write-Host "Deploying to Fly.io..." -ForegroundColor Green
fly deploy -a m-hamo --config fly.toml --no-cache --strategy immediate `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_RTmbXinMhCr9B3oNa6dqqg_iVsKBKG6
if ($LASTEXITCODE -ne 0) {
    Write-Warning "The default Fly builder failed. Retrying without Depot..."
    fly deploy -a m-hamo --config fly.toml --no-cache --strategy immediate --depot=false `
      --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
      --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
      --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_RTmbXinMhCr9B3oNa6dqqg_iVsKBKG6
}
Assert-LastCommandSucceeded "fly deploy (including the non-Depot retry)"

# لا تعتمد على رسالة Fly وحدها: انتظر حتى تستقر النسخة الجديدة وتصبح سليمة.
Write-Host "Waiting for the new Fly release to become healthy..." -ForegroundColor Cyan
fly status -a m-hamo
Assert-LastCommandSucceeded "fly status"

Write-Host "Verifying the production bundle..." -ForegroundColor Cyan
$verified = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
    $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $headers = @{ "Cache-Control" = "no-cache, no-store, max-age=0"; "Pragma" = "no-cache" }
    $html = (Invoke-WebRequest -UseBasicParsing -Uri "https://mag-pro1.com/admin?panel=products&deploy=$cacheBust" -Headers $headers).Content
    $assetMatches = [regex]::Matches($html, '(?:src|href)="([^"]+\.js[^"]*)"')
    $legacyLiveCode = $false
    foreach ($match in $assetMatches) {
        $assetPath = $match.Groups[1].Value
        $assetUrl = if ($assetPath.StartsWith("/")) { "https://mag-pro1.com$assetPath" } else { $assetPath }
        $separator = if ($assetUrl.Contains("?")) { "&" } else { "?" }
        $asset = (Invoke-WebRequest -UseBasicParsing -Uri "$assetUrl${separator}deploy=$cacheBust" -Headers $headers).Content
        # افحص النصوص الفعلية التي ظهرت في الحزمة القديمة بعد التصغير، بما فيها backticks.
        if (
            $asset.Contains('products/${Date.now()}-${e.name}') -or
            $asset -match 'products/\$\{Date\.now\(\)\}[^`"'']*\.name' -or
            $asset -match '\.from\([`"'']products[`"'']\)\.(insert|update|delete)'
        ) {
            $legacyLiveCode = $true
        }
    }

    $liveBuild = $null
    try {
        $buildResponse = Invoke-RestMethod -Uri "https://mag-pro1.com/api/public/build-version?deploy=$cacheBust" -Headers $headers
        $liveBuild = $buildResponse.build
    } catch {
        Write-Warning "Could not read the production build number on attempt $attempt."
    }

    # قسم المنتجات حُذف، لذلك لا نبحث عن علامته القديمة. نجاح النشر يعني أن
    # رقم النسخة تغيّر فعلًا وأن الملفات الحية لا تحتوي مسار المنتجات القديم.
    $newBuildIsLive = $liveBuild -and (($null -eq $previousBuild) -or ($liveBuild -ne $previousBuild))
    if (-not $legacyLiveCode -and $newBuildIsLive) {
        $verified = $true
        break
    }
    if ($attempt -lt 12) {
        Write-Warning "Production has not switched to the new build yet (attempt $attempt/12). Retrying in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}
if (-not $verified) {
    throw "Fly finished, but mag-pro1.com did not switch to the new verified build. Production was NOT verified."
}

Write-Host "Deploy finished and mag-pro1.com is serving the new build." -ForegroundColor Green
