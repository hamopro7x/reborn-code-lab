# deploy.ps1 - deploy latest updates to Fly.io
# Run from the project folder:  .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-LastCommandSucceeded([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE. Production was NOT updated."
    }
}

Write-Host "Pulling latest changes from Git..." -ForegroundColor Cyan
git pull origin main
Assert-LastCommandSucceeded "git pull"

# PowerShell يحمّل السكربت قبل تنفيذه؛ لو git pull حدّث هذا الملف فالتشغيل الحالي
# سيكمل بالنسخة القديمة. أعد تشغيله مرة واحدة لضمان تنفيذ أحدث تعليمات النشر.
if ($env:MAG_PRO_DEPLOY_RESTARTED -ne "1") {
    $env:MAG_PRO_DEPLOY_RESTARTED = "1"
    & $PSCommandPath
    exit $LASTEXITCODE
}

# امنع نشر أي نسخة أعادت مساري المنتجات القديمين بالخطأ، بدون الاعتماد على rg.
$legacyProductCode = Get-ChildItem src/routes,src/components -Recurse -File -Include *.ts,*.tsx |
    Select-String -Pattern 'from\(["'']products["'']\)\.(insert|update|delete)','products/\$\{Date\.now\(\)\}.*\.name'
if ($legacyProductCode) {
    $legacyProductCode | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Legacy client-side product write/upload path detected. Deployment stopped."
}

# اقرأ مفتاح الخدمة من ملف .env، وثبّت كل اتصال Fly على القاعدة الجديدة فقط
$envContent = Get-Content .env -Raw
$serviceRoleMatch = [regex]::Match($envContent, 'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"')
if ($serviceRoleMatch.Success) {
    $serviceRoleKey = $serviceRoleMatch.Groups[1].Value
    Write-Host "Setting the new database connection on Fly..." -ForegroundColor Cyan
    fly secrets set -a mag-pro1 `
      SUPABASE_URL="https://kcdsdaytrnzoiharmyxo.supabase.co" `
      SUPABASE_PROJECT_ID="kcdsdaytrnzoiharmyxo" `
      SUPABASE_PUBLISHABLE_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" `
      SUPABASE_ANON_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" `
      SUPABASE_SERVICE_ROLE_KEY="$serviceRoleKey"
    Assert-LastCommandSucceeded "fly secrets set"
} else {
    throw "SUPABASE_SERVICE_ROLE_KEY was not found in .env. Deployment stopped before replacing a working release."
}

Write-Host "Deploying to Fly.io..." -ForegroundColor Green
fly deploy -a mag-pro1 --config fly.toml --no-cache --strategy immediate `
  --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
  --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo
if ($LASTEXITCODE -ne 0) {
    Write-Warning "The default Fly builder failed. Retrying without Depot..."
    fly deploy -a mag-pro1 --config fly.toml --no-cache --strategy immediate --depot=false `
      --build-arg VITE_SUPABASE_URL=https://kcdsdaytrnzoiharmyxo.supabase.co `
      --build-arg VITE_SUPABASE_PROJECT_ID=kcdsdaytrnzoiharmyxo `
      --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo
}
Assert-LastCommandSucceeded "fly deploy (including the non-Depot retry)"

# لا تعتمد على رسالة Fly وحدها: انتظر حتى تستقر النسخة الجديدة وتصبح سليمة.
Write-Host "Waiting for the new Fly release to become healthy..." -ForegroundColor Cyan
fly status -a mag-pro1
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
            break
        }
    }
    if (-not $legacyLiveCode) {
        $verified = $true
        break
    }
    if ($attempt -lt 12) {
        Write-Warning "The domain still serves the old product code (attempt $attempt/12). Retrying in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}
if (-not $verified) {
    throw "Fly finished, but mag-pro1.com still serves the OLD product bundle. Do not test this release; deployment verification failed."
}

Write-Host "Deploy finished and the production product bundle was verified." -ForegroundColor Green
